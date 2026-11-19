#include "impulse/broadphase.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>

#include "impulse/job_system.hpp"

namespace impulse {

const char* toString(BroadphaseType type) {
    switch (type) {
        case BroadphaseType::BruteForce: return "brute-force";
        case BroadphaseType::UniformGrid: return "uniform-grid";
        case BroadphaseType::SweepAndPrune: return "sweep-and-prune";
    }
    return "unknown";
}

namespace {

bool eitherAwake(const Body& a, const Body& b) { return !(a.sleeping && b.sleeping); }

// Per-thread output buffers, merged and sorted at the end so the result does
// not depend on how work was split between threads.
struct ThreadLocalPairs {
    std::vector<std::vector<BodyPair>> pairs;
    std::vector<std::uint64_t> tests;

    void reset(unsigned threads) {
        pairs.resize(threads);
        tests.assign(threads, 0);
        for (auto& p : pairs) {
            p.clear();
        }
    }

    std::uint64_t merge(std::vector<BodyPair>& out) const {
        std::size_t total = 0;
        for (const auto& p : pairs) {
            total += p.size();
        }
        out.clear();
        out.reserve(total);
        for (const auto& p : pairs) {
            out.insert(out.end(), p.begin(), p.end());
        }
        std::sort(out.begin(), out.end());
        return std::accumulate(tests.begin(), tests.end(), std::uint64_t{0});
    }
};

// ---------------------------------------------------------------------------
// Brute force: every pair, O(n^2). Baseline for correctness and speed.
// ---------------------------------------------------------------------------
class BruteForceBroadphase final : public Broadphase {
public:
    BroadphaseType type() const override { return BroadphaseType::BruteForce; }

    void findPairs(const std::vector<Body>& bodies, float margin, JobSystem& jobs,
                   std::vector<BodyPair>& out) override {
        const std::size_t n = bodies.size();
        local_.reset(jobs.threadCount());
        jobs.parallelFor(n, 32, [&](std::size_t begin, std::size_t end, unsigned t) {
            auto& buf = local_.pairs[t];
            std::uint64_t tests = 0;
            for (std::size_t i = begin; i < end; ++i) {
                const Aabb boxI = bodies[i].bounds(margin);
                for (std::size_t j = i + 1; j < n; ++j) {
                    if (!eitherAwake(bodies[i], bodies[j])) {
                        continue;
                    }
                    ++tests;
                    if (overlaps(boxI, bodies[j].bounds(margin))) {
                        buf.push_back({static_cast<std::uint32_t>(i), static_cast<std::uint32_t>(j)});
                    }
                }
            }
            local_.tests[t] += tests;
        });
        lastTestCount_ = local_.merge(out);
    }

private:
    ThreadLocalPairs local_;
};

// ---------------------------------------------------------------------------
// Uniform grid (spatial hash). Cell size >= the largest AABB, so two
// overlapping AABBs always sit in the same or a neighbouring cell.
// Loop over occupied cells and test each cell against itself and its 13
// "forward" neighbours, so every pair of cells is visited exactly once.
// ---------------------------------------------------------------------------
class UniformGridBroadphase final : public Broadphase {
public:
    BroadphaseType type() const override { return BroadphaseType::UniformGrid; }

    void findPairs(const std::vector<Body>& bodies, float margin, JobSystem& jobs,
                   std::vector<BodyPair>& out) override {
        const std::size_t n = bodies.size();
        out.clear();
        lastTestCount_ = 0;
        if (n < 2) {
            return;
        }

        float maxRadius = 0.0f;
        for (const Body& b : bodies) {
            maxRadius = std::max(maxRadius, b.radius);
        }
        const float cellSize = 2.0f * (maxRadius + margin);
        const float invCell = 1.0f / cellSize;

        // 1. Bounds and cell key for every body.
        bounds_.resize(n);
        entries_.resize(n);
        jobs.parallelFor(n, 512, [&](std::size_t begin, std::size_t end, unsigned) {
            for (std::size_t i = begin; i < end; ++i) {
                const Vec3& p = bodies[i].position;
                bounds_[i] = bodies[i].bounds(margin);
                const Cell c{static_cast<int>(std::floor(p.x * invCell)),
                             static_cast<int>(std::floor(p.y * invCell)),
                             static_cast<int>(std::floor(p.z * invCell))};
                entries_[i] = {packKey(c), static_cast<std::uint32_t>(i), c};
            }
        });

        // 2. Sort so each cell's bodies are contiguous ("runs"), then index
        //    the runs in an open-addressing hash table: key -> run.
        std::sort(entries_.begin(), entries_.end());
        buildRuns();

        // 3. Each occupied cell vs itself and its 13 forward neighbours.
        local_.reset(jobs.threadCount());
        jobs.parallelFor(runs_.size(), 32, [&](std::size_t begin, std::size_t end, unsigned t) {
            auto& buf = local_.pairs[t];
            std::uint64_t tests = 0;
            const auto test = [&](std::uint32_t i, std::uint32_t j) {
                if (!eitherAwake(bodies[i], bodies[j])) {
                    return;
                }
                ++tests;
                if (overlaps(bounds_[i], bounds_[j])) {
                    buf.push_back({std::min(i, j), std::max(i, j)});
                }
            };
            for (std::size_t r = begin; r < end; ++r) {
                const Run& run = runs_[r];
                const std::uint32_t runEnd = run.start + run.count;
                for (std::uint32_t p = run.start; p < runEnd; ++p) {
                    for (std::uint32_t q = p + 1; q < runEnd; ++q) {
                        test(entries_[p].body, entries_[q].body);
                    }
                }
                for (const Cell& off : kForward) {
                    const Run* other = find(packKey({run.cell.x + off.x, run.cell.y + off.y, run.cell.z + off.z}));
                    if (other == nullptr) {
                        continue;
                    }
                    for (std::uint32_t p = run.start; p < runEnd; ++p) {
                        for (std::uint32_t q = other->start; q < other->start + other->count; ++q) {
                            test(entries_[p].body, entries_[q].body);
                        }
                    }
                }
            }
            local_.tests[t] += tests;
        });
        lastTestCount_ = local_.merge(out);
    }

private:
    struct Cell {
        int x, y, z;
    };
    struct Entry {
        std::uint64_t key;
        std::uint32_t body;
        Cell cell;
        bool operator<(const Entry& o) const { return key != o.key ? key < o.key : body < o.body; }
    };
    struct Run {
        std::uint64_t key;
        std::uint32_t start;
        std::uint32_t count;
        Cell cell;
    };
    static constexpr std::uint32_t kNoRun = ~std::uint32_t{0};

    // The 13 neighbour offsets that come "after" (0,0,0) in lexicographic
    // order. Cell A tests B only if B is a forward neighbour of A, so each
    // unordered pair of neighbouring cells is handled once.
    static constexpr Cell kForward[13] = {
        {0, 0, 1},  {0, 1, -1},  {0, 1, 0},  {0, 1, 1},  {1, -1, -1}, {1, -1, 0}, {1, -1, 1},
        {1, 0, -1}, {1, 0, 0},   {1, 0, 1},  {1, 1, -1}, {1, 1, 0},   {1, 1, 1}};

    // 21 bits per axis, offset so negative cells work (+-1M cells per axis).
    static std::uint64_t packKey(const Cell& c) {
        constexpr std::int64_t kOffset = 1 << 20;
        constexpr std::uint64_t kMask = (1u << 21) - 1;
        const auto ux = static_cast<std::uint64_t>(c.x + kOffset) & kMask;
        const auto uy = static_cast<std::uint64_t>(c.y + kOffset) & kMask;
        const auto uz = static_cast<std::uint64_t>(c.z + kOffset) & kMask;
        return (ux << 42) | (uy << 21) | uz;
    }

    static std::uint64_t hash(std::uint64_t k) {  // splitmix64 finaliser
        k ^= k >> 30;
        k *= 0xbf58476d1ce4e5b9ULL;
        k ^= k >> 27;
        k *= 0x94d049bb133111ebULL;
        k ^= k >> 31;
        return k;
    }

    void buildRuns() {
        runs_.clear();
        std::size_t i = 0;
        while (i < entries_.size()) {
            std::size_t j = i;
            while (j < entries_.size() && entries_[j].key == entries_[i].key) {
                ++j;
            }
            runs_.push_back({entries_[i].key, static_cast<std::uint32_t>(i), static_cast<std::uint32_t>(j - i),
                             entries_[i].cell});
            i = j;
        }

        std::size_t capacity = 16;
        while (capacity < runs_.size() * 2) {
            capacity <<= 1;
        }
        table_.assign(capacity, kNoRun);
        mask_ = capacity - 1;
        for (std::uint32_t r = 0; r < runs_.size(); ++r) {
            std::size_t s = hash(runs_[r].key) & mask_;
            while (table_[s] != kNoRun) {
                s = (s + 1) & mask_;
            }
            table_[s] = r;
        }
    }

    const Run* find(std::uint64_t key) const {
        std::size_t s = hash(key) & mask_;
        while (table_[s] != kNoRun) {
            if (runs_[table_[s]].key == key) {
                return &runs_[table_[s]];
            }
            s = (s + 1) & mask_;
        }
        return nullptr;
    }

    std::vector<Aabb> bounds_;
    std::vector<Entry> entries_;
    std::vector<Run> runs_;
    std::vector<std::uint32_t> table_;
    std::size_t mask_ = 0;
    ThreadLocalPairs local_;
};

// ---------------------------------------------------------------------------
// Sweep and prune on the x axis. The sorted order is kept between steps and
// repaired with insertion sort, which is close to O(n) when bodies move a
// little each frame (temporal coherence).
// ---------------------------------------------------------------------------
class SweepAndPruneBroadphase final : public Broadphase {
public:
    BroadphaseType type() const override { return BroadphaseType::SweepAndPrune; }

    void findPairs(const std::vector<Body>& bodies, float margin, JobSystem& jobs,
                   std::vector<BodyPair>& out) override {
        const std::size_t n = bodies.size();
        bounds_.resize(n);
        for (std::size_t i = 0; i < n; ++i) {
            bounds_[i] = bodies[i].bounds(margin);
        }

        const auto byMinX = [&](std::uint32_t a, std::uint32_t b) {
            return bounds_[a].min.x != bounds_[b].min.x ? bounds_[a].min.x < bounds_[b].min.x : a < b;
        };

        if (order_.size() != n) {
            // New bodies were added: rebuild from scratch.
            order_.resize(n);
            std::iota(order_.begin(), order_.end(), 0u);
            std::sort(order_.begin(), order_.end(), byMinX);
        } else {
            insertionSort(byMinX);
        }

        local_.reset(jobs.threadCount());
        jobs.parallelFor(n, 128, [&](std::size_t begin, std::size_t end, unsigned t) {
            auto& buf = local_.pairs[t];
            std::uint64_t tests = 0;
            for (std::size_t p = begin; p < end; ++p) {
                const std::uint32_t i = order_[p];
                const Aabb& boxI = bounds_[i];
                for (std::size_t q = p + 1; q < n; ++q) {
                    const std::uint32_t j = order_[q];
                    if (bounds_[j].min.x > boxI.max.x) {
                        break;  // everything after starts further right
                    }
                    if (!eitherAwake(bodies[i], bodies[j])) {
                        continue;
                    }
                    ++tests;
                    if (overlaps(boxI, bounds_[j])) {
                        buf.push_back({std::min(i, j), std::max(i, j)});
                    }
                }
            }
            local_.tests[t] += tests;
        });
        lastTestCount_ = local_.merge(out);
    }

private:
    template <class Less>
    void insertionSort(const Less& less) {
        for (std::size_t i = 1; i < order_.size(); ++i) {
            const std::uint32_t v = order_[i];
            std::size_t j = i;
            while (j > 0 && less(v, order_[j - 1])) {
                order_[j] = order_[j - 1];
                --j;
            }
            order_[j] = v;
        }
    }

    std::vector<Aabb> bounds_;
    std::vector<std::uint32_t> order_;
    ThreadLocalPairs local_;
};

}  // namespace

std::unique_ptr<Broadphase> makeBroadphase(BroadphaseType type) {
    switch (type) {
        case BroadphaseType::BruteForce: return std::make_unique<BruteForceBroadphase>();
        case BroadphaseType::UniformGrid: return std::make_unique<UniformGridBroadphase>();
        case BroadphaseType::SweepAndPrune: return std::make_unique<SweepAndPruneBroadphase>();
    }
    return std::make_unique<UniformGridBroadphase>();
}

}  // namespace impulse
