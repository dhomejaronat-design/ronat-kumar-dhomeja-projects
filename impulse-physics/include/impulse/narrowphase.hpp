// Narrow phase: exact contact generation for candidate pairs.
#pragma once

#include <cstdint>

#include "impulse/body.hpp"
#include "impulse/contact.hpp"

namespace impulse {

// Each function returns true and fills `out` when the shapes overlap.
bool collideSphereSphere(const Body& A, std::uint32_t a, const Body& B, std::uint32_t b,
                         Contact& out);
bool collideSpherePlane(const Body& A, std::uint32_t a, const Plane& plane, Contact& out);
bool collideSphereBox(const Body& A, std::uint32_t a, const StaticBox& box, Contact& out);

// Material mixing rules (a common convention).
inline float mixRestitution(float a, float b) { return a > b ? a : b; }
float mixFriction(float a, float b);
inline float mixRolling(float a, float b) { return 0.5f * (a + b); }

}  // namespace impulse
