// Broad phase: finds pairs of bodies whose (fattened) AABBs overlap.
//
// Three interchangeable strategies so they can be compared on the same scene:
//   BruteForce     - test every pair, O(n^2). The correctness baseline.
//   UniformGrid    - spatial hash of cells, only neighbouring cells tested.
//   SweepAndPrune  - sort on the x axis and sweep; reuses last frame's order
//                    (insertion sort), which is near O(n) for coherent motion.
//
// Every strategy returns the same sorted, de-duplicated pair list, which keeps
// the simulation deterministic regardless of the strategy or thread count.
#pragma once

#include <compare>
#include <cstdint>
#include <memory>
#include <vector>

#include "impulse/body.hpp"

namespace impulse {

class JobSystem;

struct BodyPair {
    std::uint32_t a = 0;  // always a < b
    std::uint32_t b = 0;
    auto operator<=>(const BodyPair&) const = default;
};

enum class BroadphaseType : std::uint8_t { BruteForce, UniformGrid, SweepAndPrune };

const char* toString(BroadphaseType type);

class Broadphase {
public:
    virtual ~Broadphase() = default;

    virtual BroadphaseType type() const = 0;

    // Writes every pair (a < b) whose AABBs, grown by `margin`, overlap and
    // where at least one body is awake. Output is sorted ascending.
    virtual void findPairs(const std::vector<Body>& bodies, float margin, JobSystem& jobs,
                           std::vector<BodyPair>& out) = 0;

    // Number of AABB-vs-AABB tests done by the last findPairs call.
    std::uint64_t lastTestCount() const { return lastTestCount_; }

protected:
    std::uint64_t lastTestCount_ = 0;
};

std::unique_ptr<Broadphase> makeBroadphase(BroadphaseType type);

}  // namespace impulse
