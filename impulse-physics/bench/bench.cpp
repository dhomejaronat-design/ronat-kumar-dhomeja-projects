// Benchmark: runs the sphere-pile scene for every combination of body count,
// broad phase and thread count, and prints a Markdown table.
//
//   impulse_bench --bodies 1000,4000 --threads 1,4 --steps 300
//   impulse_bench --broadphase grid --bodies 10000 --csv results.csv
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <numeric>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "impulse/world.hpp"
#include "scenes.hpp"

using namespace impulse;

namespace {

struct Options {
    std::vector<int> bodies{500, 1000, 2000, 4000};
    std::vector<unsigned> threads{1, std::max(1u, std::thread::hardware_concurrency())};
    std::vector<BroadphaseType> broadphases{BroadphaseType::BruteForce, BroadphaseType::SweepAndPrune,
                                            BroadphaseType::UniformGrid};
    int warmup = 60;
    int steps = 300;
    int bruteForceLimit = 4000;  // O(n^2) gets slow; skip it above this
    std::string csv;
};

std::vector<std::string> split(const std::string& s) {
    std::vector<std::string> out;
    std::stringstream ss(s);
    std::string item;
    while (std::getline(ss, item, ',')) {
        if (!item.empty()) {
            out.push_back(item);
        }
    }
    return out;
}

BroadphaseType parseBroadphase(const std::string& s) {
    if (s == "brute" || s == "brute-force") return BroadphaseType::BruteForce;
    if (s == "sap" || s == "sweep-and-prune") return BroadphaseType::SweepAndPrune;
    if (s == "grid" || s == "uniform-grid") return BroadphaseType::UniformGrid;
    std::fprintf(stderr, "unknown broadphase '%s' (use brute, sap or grid)\n", s.c_str());
    std::exit(2);
}

Options parse(int argc, char** argv) {
    Options o;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        const auto next = [&]() -> std::string {
            if (i + 1 >= argc) {
                std::fprintf(stderr, "missing value for %s\n", arg.c_str());
                std::exit(2);
            }
            return argv[++i];
        };
        if (arg == "--bodies") {
            o.bodies.clear();
            for (const auto& v : split(next())) o.bodies.push_back(std::stoi(v));
        } else if (arg == "--threads") {
            o.threads.clear();
            for (const auto& v : split(next())) o.threads.push_back(static_cast<unsigned>(std::stoul(v)));
        } else if (arg == "--broadphase") {
            o.broadphases.clear();
            for (const auto& v : split(next())) o.broadphases.push_back(parseBroadphase(v));
        } else if (arg == "--steps") {
            o.steps = std::stoi(next());
        } else if (arg == "--warmup") {
            o.warmup = std::stoi(next());
        } else if (arg == "--brute-limit") {
            o.bruteForceLimit = std::stoi(next());
        } else if (arg == "--csv") {
            o.csv = next();
        } else {
            std::printf(
                "usage: impulse_bench [--bodies 500,1000] [--threads 1,4] [--broadphase brute,sap,grid]\n"
                "                     [--steps 300] [--warmup 60] [--brute-limit 4000] [--csv out.csv]\n");
            std::exit(arg == "--help" || arg == "-h" ? 0 : 2);
        }
    }
    std::sort(o.threads.begin(), o.threads.end());
    o.threads.erase(std::unique(o.threads.begin(), o.threads.end()), o.threads.end());
    return o;
}

struct Result {
    int bodies;
    BroadphaseType broadphase;
    unsigned threads;
    double stepMs, p95Ms, broadMs, narrowMs, solveMs, integrateMs;
    double tests, pairs, contacts, awake, maxPen;
};

Result run(int bodies, BroadphaseType bp, unsigned threads, const Options& o) {
    WorldConfig cfg;
    cfg.broadphase = bp;
    cfg.threads = threads;
    World world(cfg);
    scenes::spherePile(world, bodies);

    for (int i = 0; i < o.warmup; ++i) {
        world.step();
    }

    std::vector<double> times;
    times.reserve(static_cast<std::size_t>(o.steps));
    Result r{bodies, bp, threads, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    for (int i = 0; i < o.steps; ++i) {
        world.step();
        const StepStats& s = world.stats();
        times.push_back(s.totalMs);
        r.broadMs += s.broadphaseMs;
        r.narrowMs += s.narrowphaseMs;
        r.solveMs += s.solverMs;
        r.integrateMs += s.integrateMs;
        r.tests += static_cast<double>(s.broadphaseTests);
        r.pairs += static_cast<double>(s.pairs);
        r.contacts += static_cast<double>(s.contacts);
        r.awake += static_cast<double>(s.awakeBodies);
        r.maxPen = std::max(r.maxPen, static_cast<double>(s.maxPenetration));
    }
    const double n = static_cast<double>(o.steps);
    r.stepMs = std::accumulate(times.begin(), times.end(), 0.0) / n;
    std::sort(times.begin(), times.end());
    r.p95Ms = times[static_cast<std::size_t>(0.95 * (n - 1))];
    r.broadMs /= n;
    r.narrowMs /= n;
    r.solveMs /= n;
    r.integrateMs /= n;
    r.tests /= n;
    r.pairs /= n;
    r.contacts /= n;
    r.awake /= n;
    return r;
}

}  // namespace

int main(int argc, char** argv) {
    const Options o = parse(argc, argv);
    std::printf("impulse_bench: sphere pile, %d warm-up + %d measured steps at 60 Hz, %u hardware threads\n\n",
                o.warmup, o.steps, std::thread::hardware_concurrency());
    std::printf("| bodies | broad phase | threads | ms/step | p95 ms | broad ms | narrow ms | solve ms | "
                "AABB tests/step | pairs | contacts | awake | max pen (mm) |\n");
    std::printf("|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n");

    std::vector<Result> results;
    for (int bodies : o.bodies) {
        for (BroadphaseType bp : o.broadphases) {
            if (bp == BroadphaseType::BruteForce && bodies > o.bruteForceLimit) {
                continue;
            }
            for (unsigned t : o.threads) {
                const Result r = run(bodies, bp, t, o);
                results.push_back(r);
                std::printf("| %d | %s | %u | %.3f | %.3f | %.3f | %.3f | %.3f | %.0f | %.0f | %.0f | %.0f | %.2f |\n",
                            r.bodies, toString(r.broadphase), r.threads, r.stepMs, r.p95Ms, r.broadMs, r.narrowMs,
                            r.solveMs, r.tests, r.pairs, r.contacts, r.awake, r.maxPen * 1000.0);
                std::fflush(stdout);
            }
        }
    }

    if (!o.csv.empty()) {
        std::ofstream f(o.csv);
        f << "bodies,broadphase,threads,step_ms,p95_ms,broad_ms,narrow_ms,solve_ms,integrate_ms,"
             "aabb_tests,pairs,contacts,awake,max_penetration_m\n";
        for (const Result& r : results) {
            f << r.bodies << ',' << toString(r.broadphase) << ',' << r.threads << ',' << r.stepMs << ','
              << r.p95Ms << ',' << r.broadMs << ',' << r.narrowMs << ',' << r.solveMs << ',' << r.integrateMs
              << ',' << r.tests << ',' << r.pairs << ',' << r.contacts << ',' << r.awake << ',' << r.maxPen
              << '\n';
        }
        std::printf("\nwrote %s\n", o.csv.c_str());
    }
    return 0;
}
