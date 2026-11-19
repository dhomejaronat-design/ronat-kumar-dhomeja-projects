// Physics behaviour tests: each one checks the simulation against a result
// you can work out on paper.
#include <gtest/gtest.h>

#include <cmath>

#include "impulse/world.hpp"
#include "scenes.hpp"

using namespace impulse;

namespace {

WorldConfig quietConfig() {
    WorldConfig c;
    c.linearDamping = 0.0f;
    c.angularDamping = 0.0f;
    c.enableSleeping = false;
    return c;
}

}  // namespace

TEST(World, FreeFallMatchesKinematics) {
    World world(quietConfig());
    const BodyId id = world.addSphere({0, 100, 0}, 0.5f);
    const int steps = 60;  // 1 second
    for (int i = 0; i < steps; ++i) {
        world.step();
    }
    // Semi-implicit Euler: v = g t exactly, y = y0 + g dt^2 * n(n+1)/2.
    const float dt = world.config().fixedDt;
    const float expectedY = 100.0f - 9.81f * dt * dt * steps * (steps + 1) / 2.0f;
    EXPECT_NEAR(world.body(id).velocity.y, -9.81f, 1e-3f);
    EXPECT_NEAR(world.body(id).position.y, expectedY, 1e-3f);
}

TEST(World, EqualMassElasticCollisionSwapsVelocities) {
    WorldConfig cfg = quietConfig();
    cfg.gravity = {};
    World world(cfg);
    const Material bouncy{1.0f, 0.0f};
    const BodyId a = world.addSphere({-2, 0, 0}, 0.5f, 1000.0f, bouncy);
    const BodyId b = world.addSphere({2, 0, 0}, 0.5f, 1000.0f, bouncy);
    world.setVelocity(a, {3, 0, 0});
    world.setVelocity(b, {-1, 0, 0});
    const Vec3 p0 = world.linearMomentum();

    for (int i = 0; i < 120; ++i) {
        world.step();
    }
    EXPECT_NEAR(world.body(a).velocity.x, -1.0f, 0.05f);
    EXPECT_NEAR(world.body(b).velocity.x, 3.0f, 0.05f);
    EXPECT_NEAR(world.linearMomentum().x, p0.x, 1e-2f * std::abs(p0.x));
}

TEST(World, MomentumIsConservedInAPileWithoutGravity) {
    WorldConfig cfg = quietConfig();
    cfg.gravity = {};
    World world(cfg);
    for (int i = 0; i < 64; ++i) {
        const float x = static_cast<float>(i % 4);
        const float y = static_cast<float>((i / 4) % 4);
        const float z = static_cast<float>(i / 16);
        const BodyId id = world.addSphere({x * 0.9f, y * 0.9f, z * 0.9f}, 0.5f);
        world.setVelocity(id, {std::sin(x + y), std::cos(y + z), std::sin(z - x)});
    }
    const Vec3 p0 = world.linearMomentum();
    for (int i = 0; i < 120; ++i) {
        world.step();
    }
    const Vec3 p1 = world.linearMomentum();
    const float scale = 1e-3f * (length(p0) + 1000.0f);
    EXPECT_NEAR(p1.x, p0.x, scale);
    EXPECT_NEAR(p1.y, p0.y, scale);
    EXPECT_NEAR(p1.z, p0.z, scale);
}

TEST(World, BounceHeightFollowsRestitution) {
    World world(quietConfig());
    world.addPlane({0, 1, 0}, 0.0f, {0.5f, 0.0f});
    const BodyId id = world.addSphere({0, 5.5f, 0}, 0.5f, 1000.0f, {0.5f, 0.0f});

    // Fall 5 m, then track the peak of the first bounce.
    bool bounced = false;
    float peak = 0.0f;
    for (int i = 0; i < 400; ++i) {
        world.step();
        const Body& b = world.body(id);
        if (!bounced && b.velocity.y > 0.0f) {
            bounced = true;
        }
        if (bounced) {
            peak = std::max(peak, b.position.y - b.radius);
            if (b.velocity.y < 0.0f) {
                break;
            }
        }
    }
    // Rebound height = e^2 * drop height = 0.25 * 5 m.
    EXPECT_NEAR(peak, 1.25f, 0.15f);
}

TEST(World, SphereComesToRestOnTheFloor) {
    WorldConfig cfg;
    World world(cfg);
    world.addPlane({0, 1, 0}, 0.0f);
    const BodyId id = world.addSphere({0, 2, 0}, 0.5f);
    for (int i = 0; i < 240; ++i) {
        world.step();
    }
    const Body& b = world.body(id);
    EXPECT_NEAR(b.position.y, 0.5f, 0.02f);
    EXPECT_LT(length(b.velocity), 0.05f);
    EXPECT_TRUE(b.sleeping);
}

TEST(World, SlidingSphereStartsRollingAtFiveSevenths) {
    // Classic result: a sphere launched sliding on a rough floor ends up
    // rolling without slipping at v = 5/7 v0.
    World world(quietConfig());
    const Material rough{0.0f, 0.5f, 0.0f};  // no rolling resistance for this test
    world.addPlane({0, 1, 0}, 0.0f, rough);
    const BodyId id = world.addSphere({0, 0.5f, 0}, 0.5f, 1000.0f, rough);
    world.setVelocity(id, {7, 0, 0});
    for (int i = 0; i < 180; ++i) {
        world.step();
    }
    const Body& b = world.body(id);
    EXPECT_NEAR(b.velocity.x, 5.0f, 0.15f);
    // Rolling without slipping: v = w x r  ->  v_x = -w_z * r.
    EXPECT_NEAR(b.velocity.x, -b.angularVelocity.z * b.radius, 0.05f);
}

TEST(World, PileStaysInsideTheBoxWithSmallPenetration) {
    WorldConfig cfg;
    cfg.threads = 4;
    World world(cfg);
    scenes::spherePile(world, 600);
    const float half = scenes::pileHalfExtent(600);
    float worstPenetration = 0.0f;
    for (int i = 0; i < 600; ++i) {  // 10 seconds
        world.step();
        if (i > 300) {
            worstPenetration = std::max(worstPenetration, world.stats().maxPenetration);
        }
    }
    for (const Body& b : world.bodies()) {
        ASSERT_GT(b.position.y, 0.0f);
        ASSERT_LT(std::abs(b.position.x), half);
        ASSERT_LT(std::abs(b.position.z), half);
    }
    EXPECT_LT(worstPenetration, 0.05f);  // < 5 cm once settled
}

TEST(World, PileFallsAsleep) {
    World world;
    scenes::spherePile(world, 200);
    for (int i = 0; i < 1200; ++i) {  // 20 s
        world.step();
    }
    EXPECT_LT(world.stats().awakeBodies, world.bodies().size() / 10);
}

TEST(World, SleepingBodyWakesWhenHit) {
    World world;
    world.addPlane({0, 1, 0}, 0.0f);
    const BodyId resting = world.addSphere({0, 0.5f, 0}, 0.5f);
    for (int i = 0; i < 120; ++i) {
        world.step();
    }
    ASSERT_TRUE(world.body(resting).sleeping);

    const BodyId ball = world.addSphere({-3, 0.5f, 0}, 0.5f);
    world.setVelocity(ball, {6, 0, 0});
    for (int i = 0; i < 60; ++i) {
        world.step();
    }
    EXPECT_GT(world.body(resting).position.x, 0.5f);  // it was knocked away
}

TEST(World, DeterministicForAnyThreadCountAndBroadphase) {
    const auto simulate = [](unsigned threads, BroadphaseType bp) {
        WorldConfig cfg;
        cfg.threads = threads;
        cfg.broadphase = bp;
        World world(cfg);
        scenes::spherePile(world, 300);
        for (int i = 0; i < 180; ++i) {
            world.step();
        }
        return world.bodies();
    };
    const auto reference = simulate(1, BroadphaseType::BruteForce);
    for (unsigned threads : {1u, 2u, 4u, 7u}) {
        for (auto bp : {BroadphaseType::UniformGrid, BroadphaseType::SweepAndPrune, BroadphaseType::BruteForce}) {
            const auto result = simulate(threads, bp);
            ASSERT_EQ(result.size(), reference.size());
            for (std::size_t i = 0; i < result.size(); ++i) {
                ASSERT_EQ(result[i].position, reference[i].position)
                    << "body " << i << " threads=" << threads << " " << toString(bp);
            }
        }
    }
}

TEST(World, FixedTimestepAccumulator) {
    World world;
    world.addSphere({0, 10, 0}, 0.5f);
    // Just over 3 fixed steps of time -> exactly 3 steps.
    world.update(3.0f * world.config().fixedDt + 0.001f);
    EXPECT_EQ(world.stepCount(), 3u);
    // A huge hitch is capped by maxSubSteps.
    world.update(10.0f);
    EXPECT_EQ(world.stepCount(), 3u + static_cast<unsigned>(world.config().maxSubSteps));
}
