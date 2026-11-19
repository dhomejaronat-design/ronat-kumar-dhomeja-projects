// Small, header-only vector / quaternion / AABB math used by the engine.
#pragma once

#include <algorithm>
#include <cmath>

namespace impulse {

struct Vec3 {
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;

    constexpr Vec3() = default;
    constexpr Vec3(float x_, float y_, float z_) : x(x_), y(y_), z(z_) {}

    constexpr Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    constexpr Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    constexpr Vec3 operator-() const { return {-x, -y, -z}; }
    constexpr Vec3 operator*(float s) const { return {x * s, y * s, z * s}; }
    constexpr Vec3 operator/(float s) const { return {x / s, y / s, z / s}; }

    constexpr Vec3& operator+=(const Vec3& o) {
        x += o.x;
        y += o.y;
        z += o.z;
        return *this;
    }
    constexpr Vec3& operator-=(const Vec3& o) {
        x -= o.x;
        y -= o.y;
        z -= o.z;
        return *this;
    }
    constexpr Vec3& operator*=(float s) {
        x *= s;
        y *= s;
        z *= s;
        return *this;
    }

    constexpr bool operator==(const Vec3&) const = default;
};

constexpr Vec3 operator*(float s, const Vec3& v) { return v * s; }

constexpr float dot(const Vec3& a, const Vec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

constexpr Vec3 cross(const Vec3& a, const Vec3& b) {
    return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

constexpr float lengthSq(const Vec3& v) { return dot(v, v); }
inline float length(const Vec3& v) { return std::sqrt(lengthSq(v)); }

// Returns v / |v|, or `fallback` when v is (almost) zero.
inline Vec3 normalizeOr(const Vec3& v, const Vec3& fallback) {
    const float len = length(v);
    return len > 1e-8f ? v / len : fallback;
}

constexpr Vec3 vmin(const Vec3& a, const Vec3& b) {
    return {std::min(a.x, b.x), std::min(a.y, b.y), std::min(a.z, b.z)};
}
constexpr Vec3 vmax(const Vec3& a, const Vec3& b) {
    return {std::max(a.x, b.x), std::max(a.y, b.y), std::max(a.z, b.z)};
}
constexpr Vec3 clamp(const Vec3& v, const Vec3& lo, const Vec3& hi) { return vmin(vmax(v, lo), hi); }

// Unit quaternion (w + xi + yj + zk) used for body orientation.
struct Quat {
    float w = 1.0f;
    float x = 0.0f;
    float y = 0.0f;
    float z = 0.0f;

    constexpr Quat() = default;
    constexpr Quat(float w_, float x_, float y_, float z_) : w(w_), x(x_), y(y_), z(z_) {}

    constexpr Quat operator*(const Quat& q) const {
        return {w * q.w - x * q.x - y * q.y - z * q.z,
                w * q.x + x * q.w + y * q.z - z * q.y,
                w * q.y - x * q.z + y * q.w + z * q.x,
                w * q.z + x * q.y - y * q.x + z * q.w};
    }
};

inline Quat normalize(const Quat& q) {
    const float n = std::sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    if (n < 1e-8f) {
        return {};
    }
    return {q.w / n, q.x / n, q.y / n, q.z / n};
}

// q' = q + dt/2 * (0, w) * q, then renormalise (first-order integration).
inline Quat integrate(const Quat& q, const Vec3& angularVelocity, float dt) {
    const Quat spin{0.0f, angularVelocity.x, angularVelocity.y, angularVelocity.z};
    const Quat dq = spin * q;
    const float h = 0.5f * dt;
    return normalize({q.w + h * dq.w, q.x + h * dq.x, q.y + h * dq.y, q.z + h * dq.z});
}

// Rotates v by the unit quaternion q.
inline Vec3 rotate(const Quat& q, const Vec3& v) {
    const Vec3 u{q.x, q.y, q.z};
    const float s = q.w;
    return u * (2.0f * dot(u, v)) + v * (s * s - dot(u, u)) + cross(u, v) * (2.0f * s);
}

struct Aabb {
    Vec3 min;
    Vec3 max;
};

constexpr bool overlaps(const Aabb& a, const Aabb& b) {
    return a.min.x <= b.max.x && a.max.x >= b.min.x &&  //
           a.min.y <= b.max.y && a.max.y >= b.min.y &&  //
           a.min.z <= b.max.z && a.max.z >= b.min.z;
}

}  // namespace impulse
