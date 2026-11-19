#include <gtest/gtest.h>

#include "impulse/narrowphase.hpp"

using namespace impulse;

namespace {
Body sphere(Vec3 p, float r) {
    Body b;
    b.position = p;
    b.radius = r;
    return b;
}
}  // namespace

TEST(Narrowphase, SphereSphereOverlap) {
    Contact c;
    ASSERT_TRUE(collideSphereSphere(sphere({0, 1.5f, 0}, 1), 0, sphere({0, 0, 0}, 1), 1, c));
    EXPECT_NEAR(c.penetration, 0.5f, 1e-6f);
    EXPECT_NEAR(c.normal.y, 1.0f, 1e-6f);  // from B (below) into A (above)
    EXPECT_EQ(c.b, 1);
    EXPECT_FALSE(collideSphereSphere(sphere({0, 2.01f, 0}, 1), 0, sphere({0, 0, 0}, 1), 1, c));
}

TEST(Narrowphase, CoincidentSpheresGetAValidNormal) {
    Contact c;
    ASSERT_TRUE(collideSphereSphere(sphere({0, 0, 0}, 1), 0, sphere({0, 0, 0}, 1), 1, c));
    EXPECT_NEAR(length(c.normal), 1.0f, 1e-6f);
    EXPECT_NEAR(c.penetration, 2.0f, 1e-6f);
}

TEST(Narrowphase, SpherePlane) {
    Contact c;
    const Plane floor{{0, 1, 0}, 0.0f, {}};
    ASSERT_TRUE(collideSpherePlane(sphere({0, 0.4f, 0}, 0.5f), 0, floor, c));
    EXPECT_NEAR(c.penetration, 0.1f, 1e-6f);
    EXPECT_EQ(c.b, kStatic);
    EXPECT_NEAR(c.point.y, 0.0f, 1e-6f);
    EXPECT_FALSE(collideSpherePlane(sphere({0, 0.6f, 0}, 0.5f), 0, floor, c));
}

TEST(Narrowphase, SphereBoxFaceEdgeAndInside) {
    const StaticBox box{{-1, -1, -1}, {1, 1, 1}, {}};
    Contact c;

    // Above the top face.
    ASSERT_TRUE(collideSphereBox(sphere({0, 1.3f, 0}, 0.5f), 0, box, c));
    EXPECT_NEAR(c.normal.y, 1.0f, 1e-6f);
    EXPECT_NEAR(c.penetration, 0.2f, 1e-5f);

    // Near an edge: normal points diagonally.
    ASSERT_TRUE(collideSphereBox(sphere({1.2f, 1.2f, 0}, 0.5f), 0, box, c));
    EXPECT_NEAR(c.normal.x, c.normal.y, 1e-5f);

    // Centre inside: pushed out through the closest face (+x here).
    ASSERT_TRUE(collideSphereBox(sphere({0.9f, 0, 0}, 0.25f), 0, box, c));
    EXPECT_NEAR(c.normal.x, 1.0f, 1e-6f);
    EXPECT_NEAR(c.penetration, 0.35f, 1e-5f);

    EXPECT_FALSE(collideSphereBox(sphere({0, 2.0f, 0}, 0.5f), 0, box, c));
}

TEST(Narrowphase, MaterialMixing) {
    EXPECT_FLOAT_EQ(mixRestitution(0.2f, 0.8f), 0.8f);
    EXPECT_FLOAT_EQ(mixFriction(0.25f, 1.0f), 0.5f);
}
