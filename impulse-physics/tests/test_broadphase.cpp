#include <gtest/gtest.h>

#include <random>
#include <vector>

#include "impulse/broadphase.hpp"
#include "impulse/job_system.hpp"

using namespace impulse;

namespace {

std::vector<Body> randomBodies(int count, float extent, std::uint32_t seed) {
    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> pos(-extent, extent);
    std::uniform_real_distribution<float> rad(0.05f, 0.5f);
    std::bernoulli_distribution asleep(0.3);
    std::vector<Body> bodies(static_cast<std::size_t>(count));
    for (Body& b : bodies) {
        b.position = {pos(rng), pos(rng), pos(rng)};
        b.radius = rad(rng);
        b.sleeping = asleep(rng);
    }
    return bodies;
}

std::vector<BodyPair> pairsFor(BroadphaseType type, const std::vector<Body>& bodies, unsigned threads) {
    JobSystem jobs(threads);
    auto bp = makeBroadphase(type);
    std::vector<BodyPair> out;
    bp->findPairs(bodies, 0.02f, jobs, out);
    return out;
}

}  // namespace

// The key correctness property: every strategy finds exactly the same pairs
// as brute force, for any thread count.
TEST(Broadphase, AllStrategiesMatchBruteForce) {
    for (std::uint32_t seed = 1; seed <= 20; ++seed) {
        const int count = 50 + static_cast<int>(seed) * 40;
        const auto bodies = randomBodies(count, 6.0f, seed);
        const auto expected = pairsFor(BroadphaseType::BruteForce, bodies, 1);
        ASSERT_FALSE(expected.empty());
        for (BroadphaseType type : {BroadphaseType::UniformGrid, BroadphaseType::SweepAndPrune}) {
            for (unsigned threads : {1u, 3u, 8u}) {
                EXPECT_EQ(pairsFor(type, bodies, threads), expected)
                    << toString(type) << " seed=" << seed << " threads=" << threads;
            }
        }
    }
}

TEST(Broadphase, HandlesNegativeCoordinatesAndFarApartBodies) {
    std::vector<Body> bodies(4);
    bodies[0].position = {-1000.0f, -1000.0f, -1000.0f};
    bodies[1].position = {-1000.5f, -1000.0f, -1000.0f};  // overlaps body 0
    bodies[2].position = {500.0f, 0.0f, 0.0f};
    bodies[3].position = {500.0f, 0.9f, 0.0f};            // overlaps body 2
    for (auto type : {BroadphaseType::BruteForce, BroadphaseType::UniformGrid, BroadphaseType::SweepAndPrune}) {
        const auto pairs = pairsFor(type, bodies, 2);
        ASSERT_EQ(pairs.size(), 2u) << toString(type);
        EXPECT_EQ(pairs[0], (BodyPair{0, 1}));
        EXPECT_EQ(pairs[1], (BodyPair{2, 3}));
    }
}

TEST(Broadphase, SkipsPairsWhereBothBodiesSleep) {
    std::vector<Body> bodies(2);
    bodies[1].position = {0.5f, 0, 0};
    bodies[0].sleeping = bodies[1].sleeping = true;
    for (auto type : {BroadphaseType::BruteForce, BroadphaseType::UniformGrid, BroadphaseType::SweepAndPrune}) {
        EXPECT_TRUE(pairsFor(type, bodies, 1).empty()) << toString(type);
    }
}

TEST(Broadphase, GridDoesFarFewerTestsThanBruteForce) {
    const auto bodies = randomBodies(3000, 30.0f, 99);
    JobSystem jobs(1);
    auto brute = makeBroadphase(BroadphaseType::BruteForce);
    auto grid = makeBroadphase(BroadphaseType::UniformGrid);
    std::vector<BodyPair> a, b;
    brute->findPairs(bodies, 0.02f, jobs, a);
    grid->findPairs(bodies, 0.02f, jobs, b);
    EXPECT_EQ(a, b);
    EXPECT_LT(grid->lastTestCount() * 50, brute->lastTestCount());
}

TEST(Broadphase, SweepAndPruneStaysCorrectAsBodiesMove) {
    auto bodies = randomBodies(400, 5.0f, 5);
    JobSystem jobs(2);
    auto sap = makeBroadphase(BroadphaseType::SweepAndPrune);
    auto brute = makeBroadphase(BroadphaseType::BruteForce);
    std::mt19937 rng(3);
    std::uniform_real_distribution<float> step(-0.1f, 0.1f);
    for (int frame = 0; frame < 30; ++frame) {
        for (Body& b : bodies) {
            b.position += Vec3{step(rng), step(rng), step(rng)};
        }
        std::vector<BodyPair> a, b;
        sap->findPairs(bodies, 0.02f, jobs, a);
        brute->findPairs(bodies, 0.02f, jobs, b);
        ASSERT_EQ(a, b) << "frame " << frame;
    }
}
