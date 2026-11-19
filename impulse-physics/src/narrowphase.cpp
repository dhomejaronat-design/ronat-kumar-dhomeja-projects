#include "impulse/narrowphase.hpp"

#include <cmath>

namespace impulse {

float mixFriction(float a, float b) { return std::sqrt(a * b); }

bool collideSphereSphere(const Body& A, std::uint32_t a, const Body& B, std::uint32_t b,
                         Contact& out) {
    const Vec3 d = A.position - B.position;
    const float r = A.radius + B.radius;
    const float distSq = lengthSq(d);
    if (distSq >= r * r) {
        return false;
    }
    const float dist = std::sqrt(distSq);
    out = Contact{};
    out.a = a;
    out.b = static_cast<std::int32_t>(b);
    out.normal = dist > 1e-6f ? d / dist : Vec3{0.0f, 1.0f, 0.0f};  // coincident centres
    out.penetration = r - dist;
    out.point = B.position + out.normal * (B.radius - 0.5f * out.penetration);
    out.restitution = mixRestitution(A.material.restitution, B.material.restitution);
    out.friction = mixFriction(A.material.friction, B.material.friction);
    out.rolling = mixRolling(A.material.rolling, B.material.rolling);
    return true;
}

bool collideSpherePlane(const Body& A, std::uint32_t a, const Plane& plane, Contact& out) {
    const float s = dot(plane.normal, A.position) - plane.offset;  // signed distance
    if (s >= A.radius) {
        return false;
    }
    out = Contact{};
    out.a = a;
    out.b = kStatic;
    out.normal = plane.normal;
    out.penetration = A.radius - s;
    out.point = A.position - plane.normal * s;  // centre projected onto the plane
    out.restitution = mixRestitution(A.material.restitution, plane.material.restitution);
    out.friction = mixFriction(A.material.friction, plane.material.friction);
    out.rolling = mixRolling(A.material.rolling, plane.material.rolling);
    return true;
}

bool collideSphereBox(const Body& A, std::uint32_t a, const StaticBox& box, Contact& out) {
    const Vec3& p = A.position;
    const Vec3 closest = clamp(p, box.min, box.max);
    const Vec3 d = p - closest;
    const float distSq = lengthSq(d);

    Vec3 normal;
    float penetration = 0.0f;

    if (distSq > 1e-12f) {
        // Centre outside the box.
        if (distSq >= A.radius * A.radius) {
            return false;
        }
        const float dist = std::sqrt(distSq);
        normal = d / dist;
        penetration = A.radius - dist;
    } else {
        // Centre inside the box: push out through the nearest face.
        const float faces[6] = {p.x - box.min.x, box.max.x - p.x, p.y - box.min.y,
                                box.max.y - p.y, p.z - box.min.z, box.max.z - p.z};
        const Vec3 normals[6] = {{-1, 0, 0}, {1, 0, 0}, {0, -1, 0}, {0, 1, 0}, {0, 0, -1}, {0, 0, 1}};
        int best = 0;
        for (int i = 1; i < 6; ++i) {
            if (faces[i] < faces[best]) {
                best = i;
            }
        }
        normal = normals[best];
        penetration = A.radius + faces[best];
    }

    out = Contact{};
    out.a = a;
    out.b = kStatic;
    out.normal = normal;
    out.penetration = penetration;
    out.point = closest;
    out.restitution = mixRestitution(A.material.restitution, box.material.restitution);
    out.friction = mixFriction(A.material.friction, box.material.friction);
    out.rolling = mixRolling(A.material.rolling, box.material.rolling);
    return true;
}

}  // namespace impulse
