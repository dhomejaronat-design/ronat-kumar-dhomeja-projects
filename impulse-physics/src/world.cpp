#include "impulse/world.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <numbers>

#include "impulse/narrowphase.hpp"

namespace impulse {

namespace {

using Clock = std::chrono::steady_clock;

double msSince(Clock::time_point start) {
    return std::chrono::duration<double, std::milli>(Clock::now() - start).count();
}

}  // namespace

World::World(const WorldConfig& config)
    : config_(config),
      broadphase_(makeBroadphase(config.broadphase)),
      jobs_(std::make_unique<JobSystem>(config.threads)) {}

BodyId World::addSphere(const Vec3& position, float radius, float density,
                        const Material& material) {
    Body b;
    b.position = position;
    b.radius = radius;
    b.material = material;
    const float mass = density * (4.0f / 3.0f) * std::numbers::pi_v<float> * radius * radius * radius;
    b.invMass = mass > 0.0f ? 1.0f / mass : 0.0f;
    const float inertia = 0.4f * mass * radius * radius;  // solid sphere
    b.invInertia = inertia > 0.0f ? 1.0f / inertia : 0.0f;
    bodies_.push_back(b);
    return static_cast<BodyId>(bodies_.size() - 1);
}

void World::addPlane(const Vec3& normal, float offset, const Material& material) {
    planes_.push_back({normalizeOr(normal, {0.0f, 1.0f, 0.0f}), offset, material});
}

void World::addBox(const Vec3& min, const Vec3& max, const Material& material) {
    boxes_.push_back({vmin(min, max), vmax(min, max), material});
}

void World::applyImpulse(BodyId id, const Vec3& impulse) {
    Body& b = bodies_[id];
    b.velocity += impulse * b.invMass;
    wake(id);
}

void World::setVelocity(BodyId id, const Vec3& velocity) {
    bodies_[id].velocity = velocity;
    wake(id);
}

void World::wake(BodyId id) {
    bodies_[id].sleeping = false;
    bodies_[id].sleepTimer = 0.0f;
}

void World::setBroadphase(BroadphaseType type) {
    config_.broadphase = type;
    broadphase_ = makeBroadphase(type);
}

void World::setThreadCount(unsigned threads) {
    config_.threads = std::max(1u, threads);
    jobs_ = std::make_unique<JobSystem>(config_.threads);
}

float World::update(float frameDt) {
    accumulator_ += std::max(0.0f, frameDt);
    int steps = 0;
    while (accumulator_ >= config_.fixedDt && steps < config_.maxSubSteps) {
        step();
        accumulator_ -= config_.fixedDt;
        ++steps;
    }
    if (steps == config_.maxSubSteps) {
        accumulator_ = std::min(accumulator_, config_.fixedDt);  // drop the backlog
    }
    return accumulator_ / config_.fixedDt;
}

void World::step() {
    const float dt = config_.fixedDt;
    const auto start = Clock::now();
    stats_ = StepStats{};

    auto t = Clock::now();
    integrateForces(dt);
    stats_.integrateMs = msSince(t);

    t = Clock::now();
    broadphase_->findPairs(bodies_, config_.contactMargin, *jobs_, pairs_);
    stats_.broadphaseMs = msSince(t);
    stats_.broadphaseTests = broadphase_->lastTestCount();
    stats_.pairs = pairs_.size();

    t = Clock::now();
    findContacts();
    stats_.narrowphaseMs = msSince(t);
    stats_.contacts = contacts_.size();

    t = Clock::now();
    solveVelocities(dt);
    stats_.solverMs = msSince(t);

    t = Clock::now();
    integratePositions(dt);
    stats_.integrateMs += msSince(t);

    stats_.totalMs = msSince(start);
    ++stepCount_;
}

void World::integrateForces(float dt) {
    const Vec3 g = config_.gravity;
    const float linear = 1.0f / (1.0f + dt * config_.linearDamping);
    const float angular = 1.0f / (1.0f + dt * config_.angularDamping);
    jobs_->parallelFor(bodies_.size(), 1024, [&](std::size_t begin, std::size_t end, unsigned) {
        for (std::size_t i = begin; i < end; ++i) {
            Body& b = bodies_[i];
            if (b.sleeping || b.invMass == 0.0f) {
                continue;
            }
            b.velocity += g * dt;
            b.velocity *= linear;
            b.angularVelocity *= angular;
        }
    });
}

void World::findContacts() {
    // Body-body contacts: one slot per pair, filled in parallel, then
    // compacted in pair order so the result is deterministic.
    const std::size_t pairCount = pairs_.size();
    pairContacts_.resize(pairCount);
    pairHit_.assign(pairCount, 0);
    jobs_->parallelFor(pairCount, 256, [&](std::size_t begin, std::size_t end, unsigned) {
        for (std::size_t k = begin; k < end; ++k) {
            const BodyPair& p = pairs_[k];
            pairHit_[k] = collideSphereSphere(bodies_[p.a], p.a, bodies_[p.b], p.b, pairContacts_[k]) ? 1 : 0;
        }
    });

    contacts_.clear();
    for (std::size_t k = 0; k < pairCount; ++k) {
        if (pairHit_[k]) {
            contacts_.push_back(pairContacts_[k]);
        }
    }

    // Wake before static contacts, so a woken body also gets its floor/wall
    // contacts this step.
    wakeTouchedBodies();

    // Body-static contacts: fixed slots per (body, collider).
    const std::size_t n = bodies_.size();
    const std::size_t statics = planes_.size() + boxes_.size();
    staticContacts_.resize(n * statics);
    staticHit_.assign(n * statics, 0);
    if (statics > 0) {
        jobs_->parallelFor(n, 256, [&](std::size_t begin, std::size_t end, unsigned) {
            for (std::size_t i = begin; i < end; ++i) {
                const Body& b = bodies_[i];
                if (b.sleeping) {
                    continue;
                }
                const auto id = static_cast<std::uint32_t>(i);
                std::size_t slot = i * statics;
                for (const Plane& plane : planes_) {
                    staticHit_[slot] = collideSpherePlane(b, id, plane, staticContacts_[slot]) ? 1 : 0;
                    ++slot;
                }
                for (const StaticBox& box : boxes_) {
                    staticHit_[slot] = collideSphereBox(b, id, box, staticContacts_[slot]) ? 1 : 0;
                    ++slot;
                }
            }
        });
    }

    for (std::size_t k = 0; k < staticHit_.size(); ++k) {
        if (staticHit_[k]) {
            contacts_.push_back(staticContacts_[k]);
        }
    }

    float maxPen = 0.0f;
    for (const Contact& c : contacts_) {
        maxPen = std::max(maxPen, c.penetration);
    }
    stats_.maxPenetration = maxPen;
}

void World::wakeTouchedBodies() {
    if (!config_.enableSleeping) {
        return;
    }
    // A sleeping body touched by something moving fast enough wakes up.
    // (Simplified: no contact islands, see docs/DESIGN.md.)
    const float wakeSq = 4.0f * config_.sleepLinearSpeed * config_.sleepLinearSpeed;
    // Gravity was already added this step; a body resting on a sleeper would
    // otherwise always look like it is moving at g*dt and wake it.
    const Vec3 gravityStep = config_.gravity * config_.fixedDt;
    for (const Contact& c : contacts_) {
        if (c.b == kStatic) {
            continue;
        }
        Body& A = bodies_[c.a];
        Body& B = bodies_[static_cast<std::size_t>(c.b)];
        if (A.sleeping != B.sleeping) {
            Body& sleeper = A.sleeping ? A : B;
            const Body& mover = A.sleeping ? B : A;
            if (lengthSq(mover.velocity - gravityStep) > wakeSq || lengthSq(mover.angularVelocity) > wakeSq) {
                sleeper.sleeping = false;
                sleeper.sleepTimer = 0.0f;
            }
        }
    }
}

void World::solveVelocities(float dt) {
    // Pre-step: lever arms, effective masses and target velocities.
    // Sleeping bodies act as static (infinite mass) this step.
    const float invDt = 1.0f / dt;
    for (Contact& c : contacts_) {
        const Body& A = bodies_[c.a];
        c.invMassA = A.sleeping ? 0.0f : A.invMass;
        c.invInertiaA = A.sleeping ? 0.0f : A.invInertia;
        c.rA = c.point - A.position;
        Vec3 vB{};
        Vec3 wB{};
        if (c.b != kStatic) {
            const Body& B = bodies_[static_cast<std::size_t>(c.b)];
            c.invMassB = B.sleeping ? 0.0f : B.invMass;
            c.invInertiaB = B.sleeping ? 0.0f : B.invInertia;
            c.rB = c.point - B.position;
            vB = B.velocity;
            wB = B.angularVelocity;
        } else {
            c.invMassB = 0.0f;
            c.invInertiaB = 0.0f;
            c.rB = {};
        }

        const Vec3 rnA = cross(c.rA, c.normal);
        const Vec3 rnB = cross(c.rB, c.normal);
        const float k = c.invMassA + c.invMassB + c.invInertiaA * dot(rnA, rnA) + c.invInertiaB * dot(rnB, rnB);
        c.normalMass = k > 0.0f ? 1.0f / k : 0.0f;

        const Vec3 vRel = (A.velocity + cross(A.angularVelocity, c.rA)) - (vB + cross(wB, c.rB));
        const float vn = dot(vRel, c.normal);
        const float bounce = vn < -config_.restitutionThreshold ? -c.restitution * vn : 0.0f;
        const float push = config_.baumgarte * invDt * std::max(c.penetration - config_.slop, 0.0f);
        c.bias = std::max(bounce, push);

        c.normalImpulse = 0.0f;
        c.tangentImpulse = {};
        c.rollingImpulse = {};
        c.rollingRadius = length(c.rA);
    }

    const auto relativeVelocity = [&](const Contact& c) {
        const Body& A = bodies_[c.a];
        Vec3 v = A.velocity + cross(A.angularVelocity, c.rA);
        if (c.b != kStatic) {
            const Body& B = bodies_[static_cast<std::size_t>(c.b)];
            v -= B.velocity + cross(B.angularVelocity, c.rB);
        }
        return v;
    };

    const auto applyImpulse = [&](const Contact& c, const Vec3& P) {
        Body& A = bodies_[c.a];
        A.velocity += P * c.invMassA;
        A.angularVelocity += cross(c.rA, P) * c.invInertiaA;
        if (c.b != kStatic) {
            Body& B = bodies_[static_cast<std::size_t>(c.b)];
            B.velocity -= P * c.invMassB;
            B.angularVelocity -= cross(c.rB, P) * c.invInertiaB;
        }
    };

    // Sequential impulses (projected Gauss-Seidel). Accumulated impulses are
    // clamped, not the per-iteration deltas, which is what makes it converge.
    for (int it = 0; it < config_.velocityIterations; ++it) {
        for (Contact& c : contacts_) {
            if (c.normalMass == 0.0f) {
                continue;
            }

            // Friction: drive tangential velocity to zero, limited by the
            // Coulomb cone |Pt| <= mu * Pn.
            {
                const Vec3 v = relativeVelocity(c);
                const Vec3 vt = v - c.normal * dot(v, c.normal);
                const float vtLen = length(vt);
                if (vtLen > 1e-6f) {
                    const Vec3 t = vt / vtLen;
                    const Vec3 rtA = cross(c.rA, t);
                    const Vec3 rtB = cross(c.rB, t);
                    const float kt = c.invMassA + c.invMassB + c.invInertiaA * dot(rtA, rtA) +
                                     c.invInertiaB * dot(rtB, rtB);
                    if (kt > 0.0f) {
                        const Vec3 desired = c.tangentImpulse - t * (vtLen / kt);
                        const float maxFriction = c.friction * c.normalImpulse;
                        const float desiredLen = length(desired);
                        const Vec3 clamped = desiredLen > maxFriction && desiredLen > 0.0f
                                                 ? desired * (maxFriction / desiredLen)
                                                 : desired;
                        const Vec3 delta = clamped - c.tangentImpulse;
                        c.tangentImpulse = clamped;
                        applyImpulse(c, delta);
                    }
                }
            }

            // Rolling resistance: oppose relative spin, limited by
            // rolling * Pn * r (a torque proportional to the normal force).
            if (c.rolling > 0.0f) {
                const float kr = c.invInertiaA + c.invInertiaB;
                if (kr > 0.0f) {
                    Vec3 wRel = bodies_[c.a].angularVelocity;
                    if (c.b != kStatic) {
                        wRel -= bodies_[static_cast<std::size_t>(c.b)].angularVelocity;
                    }
                    const Vec3 desired = c.rollingImpulse - wRel / kr;
                    const float maxRolling = c.rolling * c.normalImpulse * c.rollingRadius;
                    const float desiredLen = length(desired);
                    const Vec3 clamped = desiredLen > maxRolling && desiredLen > 0.0f
                                             ? desired * (maxRolling / desiredLen)
                                             : desired;
                    const Vec3 delta = clamped - c.rollingImpulse;
                    c.rollingImpulse = clamped;
                    bodies_[c.a].angularVelocity += delta * c.invInertiaA;
                    if (c.b != kStatic) {
                        bodies_[static_cast<std::size_t>(c.b)].angularVelocity -= delta * c.invInertiaB;
                    }
                }
            }

            // Normal: non-penetration, impulse can only push (>= 0).
            {
                const float vn = dot(relativeVelocity(c), c.normal);
                const float lambda = c.normalMass * (c.bias - vn);
                const float old = c.normalImpulse;
                c.normalImpulse = std::max(old + lambda, 0.0f);
                applyImpulse(c, c.normal * (c.normalImpulse - old));
            }
        }
    }
}

void World::integratePositions(float dt) {
    const bool sleeping = config_.enableSleeping;
    const float linSq = config_.sleepLinearSpeed * config_.sleepLinearSpeed;
    const float angSq = config_.sleepAngularSpeed * config_.sleepAngularSpeed;
    const float timeToSleep = config_.timeToSleep;

    jobs_->parallelFor(bodies_.size(), 1024, [&](std::size_t begin, std::size_t end, unsigned) {
        for (std::size_t i = begin; i < end; ++i) {
            Body& b = bodies_[i];
            if (b.sleeping || b.invMass == 0.0f) {
                continue;
            }
            b.position += b.velocity * dt;
            b.orientation = integrate(b.orientation, b.angularVelocity, dt);

            if (sleeping) {
                if (lengthSq(b.velocity) < linSq && lengthSq(b.angularVelocity) < angSq) {
                    b.sleepTimer += dt;
                    if (b.sleepTimer >= timeToSleep) {
                        b.sleeping = true;
                        b.velocity = {};
                        b.angularVelocity = {};
                    }
                } else {
                    b.sleepTimer = 0.0f;
                }
            }
        }
    });

    std::size_t awake = 0;
    for (const Body& b : bodies_) {
        awake += b.sleeping ? 0 : 1;
    }
    stats_.awakeBodies = awake;
}

float World::kineticEnergy() const {
    float e = 0.0f;
    for (const Body& b : bodies_) {
        if (b.invMass == 0.0f) {
            continue;
        }
        const float m = 1.0f / b.invMass;
        const float inertia = b.invInertia > 0.0f ? 1.0f / b.invInertia : 0.0f;
        e += 0.5f * m * lengthSq(b.velocity) + 0.5f * inertia * lengthSq(b.angularVelocity);
    }
    return e;
}

Vec3 World::linearMomentum() const {
    Vec3 p;
    for (const Body& b : bodies_) {
        if (b.invMass > 0.0f) {
            p += b.velocity / b.invMass;
        }
    }
    return p;
}

}  // namespace impulse
