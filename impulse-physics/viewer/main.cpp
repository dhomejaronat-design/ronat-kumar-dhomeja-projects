// Interactive 3D viewer (raylib). Build with -DIMPULSE_BUILD_VIEWER=ON.
//
// Controls
//   Right mouse drag  orbit camera        Mouse wheel   zoom
//   Space             drop 100 spheres    Left click    shoot a sphere
//   B                 cycle broad phase   T             cycle thread count
//   1 / 2             pile / ramp scene   R             reset
//   P                 pause               N             single step (paused)
//   H                 toggle HUD
#include <raylib.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>
#include <random>
#include <thread>

#include "impulse/world.hpp"
#include "scenes.hpp"

using namespace impulse;

namespace {

Vector3 toRay(const Vec3& v) { return {v.x, v.y, v.z}; }

Color speedColor(const Body& b) {
    if (b.sleeping) {
        return Color{120, 120, 130, 255};
    }
    const float t = std::min(1.0f, length(b.velocity) / 6.0f);
    return ColorFromHSV(210.0f - 210.0f * t, 0.75f, 0.95f);  // blue (slow) -> red (fast)
}

struct App {
    WorldConfig config;
    std::unique_ptr<World> world;
    int scene = 1;
    int bodies = 1500;
    bool paused = false;
    bool hud = true;
    std::mt19937 rng{1234};

    void reset() {
        world = std::make_unique<World>(config);
        if (scene == 1) {
            scenes::spherePile(*world, bodies);
        } else {
            scenes::ramp(*world, bodies / 3);
        }
    }

    void dropSpheres(int count) {
        const float half = scene == 1 ? scenes::pileHalfExtent(bodies) - 0.5f : 1.5f;
        std::uniform_real_distribution<float> xz(-half, half);
        std::uniform_real_distribution<float> r(0.15f, 0.35f);
        const float x0 = scene == 1 ? 0.0f : -6.5f;
        for (int i = 0; i < count; ++i) {
            world->addSphere({x0 + (scene == 1 ? xz(rng) : 0.3f * xz(rng)), 12.0f + static_cast<float>(i) * 0.05f,
                              xz(rng)},
                             r(rng), 1000.0f, {0.3f, 0.5f});
        }
    }
};

}  // namespace

int main() {
    SetConfigFlags(FLAG_MSAA_4X_HINT | FLAG_WINDOW_RESIZABLE | FLAG_VSYNC_HINT);
    InitWindow(1280, 800, "Impulse: C++20 Rigid-Body Physics Engine");

    App app;
    app.config.threads = std::max(1u, std::thread::hardware_concurrency());
    app.reset();

    Camera3D camera{};
    camera.target = {0.0f, 1.5f, 0.0f};
    camera.up = {0.0f, 1.0f, 0.0f};
    camera.fovy = 50.0f;
    camera.projection = CAMERA_PERSPECTIVE;
    float yaw = 0.8f;
    float pitch = 0.45f;
    float distance = 22.0f;

    const unsigned threadChoices[] = {1, 2, 4, 8};
    int threadIndex = 0;
    while (threadIndex < 3 && threadChoices[threadIndex] < app.config.threads) {
        ++threadIndex;
    }

    while (!WindowShouldClose()) {
        // --- input ---------------------------------------------------------
        if (IsMouseButtonDown(MOUSE_BUTTON_RIGHT)) {
            const Vector2 d = GetMouseDelta();
            yaw -= d.x * 0.005f;
            pitch = std::clamp(pitch + d.y * 0.005f, 0.05f, 1.5f);
        }
        distance = std::clamp(distance - GetMouseWheelMove() * 1.5f, 4.0f, 80.0f);
        camera.position = {camera.target.x + distance * std::cos(pitch) * std::sin(yaw),
                           camera.target.y + distance * std::sin(pitch),
                           camera.target.z + distance * std::cos(pitch) * std::cos(yaw)};

        if (IsKeyPressed(KEY_SPACE)) app.dropSpheres(100);
        if (IsKeyPressed(KEY_P)) app.paused = !app.paused;
        if (IsKeyPressed(KEY_H)) app.hud = !app.hud;
        if (IsKeyPressed(KEY_R)) app.reset();
        if (IsKeyPressed(KEY_ONE)) { app.scene = 1; app.reset(); }
        if (IsKeyPressed(KEY_TWO)) { app.scene = 2; app.reset(); }
        if (IsKeyPressed(KEY_B)) {
            const int next = (static_cast<int>(app.world->config().broadphase) + 1) % 3;
            app.config.broadphase = static_cast<BroadphaseType>(next);
            app.world->setBroadphase(app.config.broadphase);
        }
        if (IsKeyPressed(KEY_T)) {
            threadIndex = (threadIndex + 1) % 4;
            app.config.threads = threadChoices[threadIndex];
            app.world->setThreadCount(app.config.threads);
        }
        if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
            const Ray ray = GetMouseRay(GetMousePosition(), camera);
            const Vec3 origin{ray.position.x, ray.position.y, ray.position.z};
            const Vec3 dir{ray.direction.x, ray.direction.y, ray.direction.z};
            const BodyId id = app.world->addSphere(origin + dir * 2.0f, 0.5f, 3000.0f, {0.2f, 0.5f});
            app.world->setVelocity(id, dir * 25.0f);
        }

        // --- simulate ------------------------------------------------------
        if (!app.paused) {
            app.world->update(GetFrameTime());
        } else if (IsKeyPressed(KEY_N)) {
            app.world->step();
        }

        // --- draw ----------------------------------------------------------
        BeginDrawing();
        ClearBackground(Color{24, 26, 32, 255});
        BeginMode3D(camera);
        DrawGrid(40, 1.0f);
        for (const StaticBox& box : app.world->boxes()) {
            const Vec3 c = (box.min + box.max) * 0.5f;
            const Vec3 s = box.max - box.min;
            DrawCube(toRay(c), s.x, s.y, s.z, Color{70, 74, 88, 255});
            DrawCubeWires(toRay(c), s.x, s.y, s.z, Color{110, 115, 130, 255});
        }
        for (const Body& b : app.world->bodies()) {
            DrawSphereEx(toRay(b.position), b.radius, 8, 10, speedColor(b));
        }
        EndMode3D();

        if (app.hud) {
            const StepStats& s = app.world->stats();
            DrawRectangle(10, 10, 360, 200, Fade(BLACK, 0.55f));
            DrawText(TextFormat("FPS %d   bodies %d   awake %d", GetFPS(),
                                static_cast<int>(app.world->bodies().size()), static_cast<int>(s.awakeBodies)),
                     20, 20, 18, RAYWHITE);
            DrawText(TextFormat("broad phase: %s  [B]", toString(app.world->config().broadphase)), 20, 46, 18,
                     RAYWHITE);
            DrawText(TextFormat("threads: %u  [T]", app.world->config().threads), 20, 70, 18, RAYWHITE);
            DrawText(TextFormat("step %.2f ms  (broad %.2f / narrow %.2f / solve %.2f)", s.totalMs, s.broadphaseMs,
                                s.narrowphaseMs, s.solverMs),
                     20, 96, 16, LIGHTGRAY);
            DrawText(TextFormat("pairs %d   contacts %d   AABB tests %llu", static_cast<int>(s.pairs),
                                static_cast<int>(s.contacts), static_cast<unsigned long long>(s.broadphaseTests)),
                     20, 120, 16, LIGHTGRAY);
            DrawText(TextFormat("max penetration %.1f mm", s.maxPenetration * 1000.0f), 20, 144, 16, LIGHTGRAY);
            DrawText("SPACE drop  LMB shoot  1/2 scene  R reset  P pause", 20, 178, 14, GRAY);
        }
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
