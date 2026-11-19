// Shared demo scenes for the benchmark and the viewer.
#pragma once

#include <cstdint>

#include "impulse/world.hpp"

namespace impulse::scenes {

// N spheres (radius 0.15 - 0.35 m) dropped into an open box. The box grows
// with N so density stays similar and benchmarks compare like with like.
void spherePile(World& world, int count, std::uint32_t seed = 42);

// Spheres rolling down a ramp of static boxes into a pit.
void ramp(World& world, int count, std::uint32_t seed = 7);

// Half-width of the pile's box for `count` bodies (used to place the camera).
float pileHalfExtent(int count);

}  // namespace impulse::scenes
