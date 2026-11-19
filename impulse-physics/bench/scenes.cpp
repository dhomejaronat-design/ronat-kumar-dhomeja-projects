#include "scenes.hpp"

#include <algorithm>
#include <cmath>
#include <random>

namespace impulse::scenes {

float pileHalfExtent(int count) {
    // ~0.5 m^2 of floor per 6 bodies keeps the pile a few layers deep.
    return std::max(2.0f, 0.5f * std::sqrt(static_cast<float>(count) / 1.5f));
}

void spherePile(World& world, int count, std::uint32_t seed) {
    const float half = pileHalfExtent(count);
    const Material wall{0.2f, 0.4f};
    world.addPlane({0, 1, 0}, 0.0f, wall);      // floor
    world.addPlane({1, 0, 0}, -half, wall);     // x >= -half
    world.addPlane({-1, 0, 0}, -half, wall);    // x <= half
    world.addPlane({0, 0, 1}, -half, wall);     // z >= -half
    world.addPlane({0, 0, -1}, -half, wall);    // z <= half

    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> radius(0.15f, 0.35f);
    std::uniform_real_distribution<float> jitter(-0.05f, 0.05f);
    std::uniform_real_distribution<float> speed(-1.0f, 1.0f);
    std::uniform_real_distribution<float> bounce(0.1f, 0.5f);

    // Spawn on a loose lattice so nothing starts overlapping.
    const float spacing = 0.75f;
    const int perRow = std::max(1, static_cast<int>((2.0f * half - spacing) / spacing));
    for (int i = 0; i < count; ++i) {
        const int layer = i / (perRow * perRow);
        const int inLayer = i % (perRow * perRow);
        const float x = -half + spacing + static_cast<float>(inLayer % perRow) * spacing + jitter(rng);
        const float z = -half + spacing + static_cast<float>(inLayer / perRow) * spacing + jitter(rng);
        const float y = 1.0f + static_cast<float>(layer) * spacing;
        const BodyId id = world.addSphere({x, y, z}, radius(rng), 1000.0f, {bounce(rng), 0.5f});
        world.setVelocity(id, {speed(rng), 0.0f, speed(rng)});
    }
}

void ramp(World& world, int count, std::uint32_t seed) {
    const Material ground{0.1f, 0.6f};
    world.addPlane({0, 1, 0}, 0.0f, ground);
    world.addPlane({1, 0, 0}, -8.0f, ground);
    world.addPlane({-1, 0, 0}, -8.0f, ground);
    world.addPlane({0, 0, 1}, -4.0f, ground);
    world.addPlane({0, 0, -1}, -4.0f, ground);

    // A staircase "ramp" of static boxes.
    for (int s = 0; s < 8; ++s) {
        const float x0 = -7.0f + static_cast<float>(s) * 1.0f;
        const float h = 4.0f - static_cast<float>(s) * 0.5f;
        world.addBox({x0, 0.0f, -2.0f}, {x0 + 1.0f, h, 2.0f}, ground);
    }

    std::mt19937 rng(seed);
    std::uniform_real_distribution<float> radius(0.15f, 0.3f);
    std::uniform_real_distribution<float> offset(-1.5f, 1.5f);
    for (int i = 0; i < count; ++i) {
        const float y = 5.0f + static_cast<float>(i / 20) * 0.7f;
        world.addSphere({-6.5f + offset(rng) * 0.3f, y, offset(rng)}, radius(rng), 1000.0f, {0.3f, 0.5f});
    }
}

}  // namespace impulse::scenes
