#include <gtest/gtest.h>

#include <numbers>

#include "impulse/math.hpp"

using namespace impulse;

TEST(Math, DotAndCross) {
    const Vec3 x{1, 0, 0};
    const Vec3 y{0, 1, 0};
    EXPECT_FLOAT_EQ(dot(x, y), 0.0f);
    EXPECT_EQ(cross(x, y), (Vec3{0, 0, 1}));
    EXPECT_EQ(cross(y, x), (Vec3{0, 0, -1}));
}

TEST(Math, NormalizeFallsBackOnZero) {
    EXPECT_EQ(normalizeOr({0, 0, 0}, {0, 1, 0}), (Vec3{0, 1, 0}));
    EXPECT_NEAR(length(normalizeOr({3, 4, 0}, {})), 1.0f, 1e-6f);
}

TEST(Math, ClampAndMinMax) {
    EXPECT_EQ(clamp({5, -5, 0.5f}, {0, 0, 0}, {1, 1, 1}), (Vec3{1, 0, 0.5f}));
    EXPECT_EQ(vmin({1, 5, 3}, {2, 4, 3}), (Vec3{1, 4, 3}));
}

TEST(Math, QuaternionRotatesVector) {
    // 90 degrees about +z maps +x to +y.
    const float h = std::numbers::pi_v<float> / 4.0f;
    const Quat q{std::cos(h), 0, 0, std::sin(h)};
    const Vec3 v = rotate(q, {1, 0, 0});
    EXPECT_NEAR(v.x, 0.0f, 1e-6f);
    EXPECT_NEAR(v.y, 1.0f, 1e-6f);
    EXPECT_NEAR(v.z, 0.0f, 1e-6f);
}

TEST(Math, QuaternionIntegrationMatchesAngle) {
    // Spin at pi rad/s about y for 1 s in small steps: +x should end at -x.
    Quat q;
    const Vec3 w{0, std::numbers::pi_v<float>, 0};
    for (int i = 0; i < 1000; ++i) {
        q = integrate(q, w, 0.001f);
    }
    const Vec3 v = rotate(q, {1, 0, 0});
    EXPECT_NEAR(v.x, -1.0f, 1e-3f);
    EXPECT_NEAR(v.z, 0.0f, 1e-2f);
}

TEST(Math, AabbOverlap) {
    const Aabb a{{0, 0, 0}, {1, 1, 1}};
    EXPECT_TRUE(overlaps(a, {{0.5f, 0.5f, 0.5f}, {2, 2, 2}}));
    EXPECT_TRUE(overlaps(a, {{1, 1, 1}, {2, 2, 2}}));  // touching counts
    EXPECT_FALSE(overlaps(a, {{1.01f, 0, 0}, {2, 1, 1}}));
}
