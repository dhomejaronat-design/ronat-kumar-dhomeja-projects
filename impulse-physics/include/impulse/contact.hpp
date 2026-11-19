// Contact data produced by the narrow phase and consumed by the solver.
#pragma once

#include <cstdint>

#include "impulse/math.hpp"

namespace impulse {

inline constexpr std::int32_t kStatic = -1;

struct Contact {
    std::uint32_t a = 0;        // dynamic body
    std::int32_t b = kStatic;   // dynamic body index, or kStatic for planes / boxes
    Vec3 normal;                // unit normal pointing from B into A
    Vec3 point;                 // world-space contact point
    float penetration = 0.0f;   // overlap depth (>= 0)
    float restitution = 0.0f;   // combined material values
    float friction = 0.0f;
    float rolling = 0.0f;

    // Filled in by the solver's pre-step.
    Vec3 rA;
    Vec3 rB;
    float invMassA = 0.0f;
    float invMassB = 0.0f;
    float invInertiaA = 0.0f;
    float invInertiaB = 0.0f;
    float normalMass = 0.0f;  // 1 / effective mass along the normal
    float bias = 0.0f;        // target separating velocity (restitution / Baumgarte)

    // Accumulated impulses (clamped across iterations).
    float normalImpulse = 0.0f;
    Vec3 tangentImpulse;
    Vec3 rollingImpulse;  // angular impulse
    float rollingRadius = 0.0f;
};

}  // namespace impulse
