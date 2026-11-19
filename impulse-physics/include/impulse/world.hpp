// The physics world: owns bodies and colliders and advances the simulation.
//
// One fixed step runs this pipeline:
//   1. integrate forces      (gravity, damping)              - parallel
//   2. broad phase           (candidate pairs)               - parallel
//   3. narrow phase          (contacts)                      - parallel
//   4. wake-up               (sleeping bodies hit by movers)
//   5. velocity solver       (sequential impulses + friction) - serial Gauss-Seidel
//   6. integrate positions   (+ orientation, sleep timers)   - parallel
#pragma once

#include <cstdint>
#include <memory>
#include <vector>

#include "impulse/body.hpp"
#include "impulse/broadphase.hpp"
#include "impulse/contact.hpp"
#include "impulse/job_system.hpp"

namespace impulse {

struct WorldConfig {
    Vec3 gravity{0.0f, -9.81f, 0.0f};
    float fixedDt = 1.0f / 60.0f;
    int maxSubSteps = 5;           // cap for update(), avoids the "spiral of death"
    int velocityIterations = 10;

    float baumgarte = 0.2f;        // fraction of penetration fixed per step
    float slop = 0.005f;           // allowed penetration before correction (m)
    float restitutionThreshold = 1.0f;  // no bounce below this closing speed (m/s)
    float contactMargin = 0.02f;   // broad-phase AABB fattening (m)

    float linearDamping = 0.01f;
    float angularDamping = 0.05f;

    bool enableSleeping = true;
    float sleepLinearSpeed = 0.05f;   // m/s
    float sleepAngularSpeed = 0.10f;  // rad/s
    float timeToSleep = 0.5f;         // s

    BroadphaseType broadphase = BroadphaseType::UniformGrid;
    unsigned threads = 1;
};

// Timings and counters for the most recent step.
struct StepStats {
    double integrateMs = 0.0;
    double broadphaseMs = 0.0;
    double narrowphaseMs = 0.0;
    double solverMs = 0.0;
    double totalMs = 0.0;
    std::uint64_t broadphaseTests = 0;
    std::size_t pairs = 0;
    std::size_t contacts = 0;
    std::size_t awakeBodies = 0;
    float maxPenetration = 0.0f;
};

class World {
public:
    explicit World(const WorldConfig& config = {});

    // Dynamic sphere with the given density (kg/m^3). Returns its id.
    BodyId addSphere(const Vec3& position, float radius, float density = 1000.0f,
                     const Material& material = {});
    void addPlane(const Vec3& normal, float offset, const Material& material = {});
    void addBox(const Vec3& min, const Vec3& max, const Material& material = {});

    // Advances exactly one fixed step.
    void step();

    // Variable frame time -> fixed steps (accumulator). Returns the
    // interpolation factor in [0, 1) for rendering between steps.
    float update(float frameDt);

    void applyImpulse(BodyId id, const Vec3& impulse);
    void setVelocity(BodyId id, const Vec3& velocity);
    void wake(BodyId id);

    void setBroadphase(BroadphaseType type);
    void setThreadCount(unsigned threads);

    const std::vector<Body>& bodies() const { return bodies_; }
    const Body& body(BodyId id) const { return bodies_[id]; }
    const std::vector<Plane>& planes() const { return planes_; }
    const std::vector<StaticBox>& boxes() const { return boxes_; }
    const std::vector<Contact>& contacts() const { return contacts_; }
    const WorldConfig& config() const { return config_; }
    const StepStats& stats() const { return stats_; }
    std::uint64_t stepCount() const { return stepCount_; }

    float kineticEnergy() const;
    Vec3 linearMomentum() const;

private:
    void integrateForces(float dt);
    void findContacts();
    void wakeTouchedBodies();
    void solveVelocities(float dt);
    void integratePositions(float dt);

    WorldConfig config_;
    std::vector<Body> bodies_;
    std::vector<Plane> planes_;
    std::vector<StaticBox> boxes_;

    std::unique_ptr<Broadphase> broadphase_;
    std::unique_ptr<JobSystem> jobs_;

    // Per-step scratch, kept between steps to avoid reallocations.
    std::vector<BodyPair> pairs_;
    std::vector<Contact> pairContacts_;
    std::vector<std::uint8_t> pairHit_;
    std::vector<Contact> staticContacts_;
    std::vector<std::uint8_t> staticHit_;
    std::vector<Contact> contacts_;

    StepStats stats_;
    float accumulator_ = 0.0f;
    std::uint64_t stepCount_ = 0;
};

}  // namespace impulse
