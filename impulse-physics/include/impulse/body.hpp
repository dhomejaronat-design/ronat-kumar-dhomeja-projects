// Rigid bodies and static colliders.
#pragma once

#include <cstdint>

#include "impulse/math.hpp"

namespace impulse {

using BodyId = std::uint32_t;

struct Material {
    float restitution = 0.3f;  // 0 = no bounce, 1 = perfectly elastic
    float friction = 0.5f;     // Coulomb friction coefficient
    float rolling = 0.01f;     // rolling resistance (stops spheres rolling forever)
};

// A dynamic rigid sphere. Spheres keep the narrow phase simple so the
// interesting parts (broad phase, solver, threading) stay readable.
struct Body {
    Vec3 position;
    Vec3 velocity;
    Vec3 angularVelocity;
    Quat orientation;

    float radius = 0.5f;
    float invMass = 1.0f;
    float invInertia = 1.0f;  // solid sphere: I = 2/5 * m * r^2 (scalar, isotropic)

    Material material;

    bool sleeping = false;
    float sleepTimer = 0.0f;

    Aabb bounds(float margin = 0.0f) const {
        const float e = radius + margin;
        return {position - Vec3{e, e, e}, position + Vec3{e, e, e}};
    }

    float mass() const { return invMass > 0.0f ? 1.0f / invMass : 0.0f; }
};

// Infinite static plane: all points x with dot(normal, x) == offset.
// Bodies are pushed to the side the normal points to.
struct Plane {
    Vec3 normal{0.0f, 1.0f, 0.0f};
    float offset = 0.0f;
    Material material;
};

// Static axis-aligned box (obstacles, ramps' supports, walls).
struct StaticBox {
    Vec3 min;
    Vec3 max;
    Material material;
};

}  // namespace impulse
