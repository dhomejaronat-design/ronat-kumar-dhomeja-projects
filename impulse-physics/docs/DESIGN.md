# Impulse: design notes

## 1. Broad phase

**Goal:** cut the n² body pairs down to the few that might touch, using cheap AABB tests.

### Uniform grid (spatial hash)
- **Cell size** is `2 × (max radius + margin)`. Each body lives in the cell that holds its centre. Any two overlapping AABBs then have centres at most one cell apart on every axis, so neighbouring cells are enough.
- **Build:**
  1. Compute `(cellKey, body)` for every body in parallel.
  2. Sort, so each cell's bodies form a contiguous **run**.
  3. Put the runs in an **open-addressing hash table** (power-of-two size, linear probing, splitmix64 hash).
- **Query:** for every occupied cell, test it against itself and its **13 forward neighbours** (offsets lexicographically after (0,0,0)). Each pair of cells, and so each pair of bodies, is visited exactly once, with no de-duplication step.
- **Keys** pack three 21-bit coordinates into a `uint64`, offset so negative cells work.
- **Cost:** O(n log n) for the sort plus about O(n) for the sweep. Weakness: very mixed body sizes (one huge body forces large cells). A hierarchical grid or BVH would fix that.

### Sweep and prune
- Bodies are sorted by AABB `min.x`. Each body scans forward until `min.x > its max.x`.
- The order is **kept between frames** and fixed with insertion sort, which is close to O(n) when bodies move only a little per frame (temporal coherence).
- **Weakness:** if many bodies line up on x (a pile is wide in x), the scan gets long. In the benchmark SAP does 11× more AABB tests than the grid at 4,000 bodies.

### Brute force
O(n²) baseline. It is kept for correctness testing and to show the speedups.

### Determinism
Each thread writes into its own buffer. The buffers are concatenated and **sorted**, so the pair list is identical whatever the strategy or thread count.

## 2. Narrow phase

- Sphere–sphere and sphere–plane are closed-form.
- Sphere–box clamps the centre to the box. If the centre is **inside** the box, it is pushed out through the nearest face.
- Contacts are written to a fixed slot per pair (or per body–collider), then compacted in order. That keeps determinism without locks.

## 3. Solver: sequential impulses (projected Gauss-Seidel)

For each contact, solved for a fixed number of iterations:

1. **Friction.** Find the tangential velocity at the contact. Apply the impulse that cancels it, but clamp the **accumulated** tangential impulse to the Coulomb cone `|Pt| ≤ μ·Pn`.
2. **Rolling resistance.** Oppose relative spin, clamped to `rolling · Pn · r`. Without it, spheres on a flat floor roll forever and never sleep.
3. **Normal.** `λ = m_eff · (bias − vn)`. Clamp the **accumulated** normal impulse to ≥ 0 so contacts can push but never pull.

**Why clamp the accumulated impulse, not each delta?** It lets later iterations correct earlier overshoot. Clamping each delta makes the solver jittery and slow to converge.

**Bias:** `max(restitution bounce, Baumgarte push)`.
- **Restitution** only applies above a closing speed of 1 m/s, so resting objects don't vibrate.
- **Baumgarte** removes `β/dt × (penetration − slop)` per step.

**Effective mass:** `1 / (1/mA + 1/mB + (rA×n)ᵀ I⁻¹ (rA×n) + …)`. For spheres the inertia is a scalar `2/5·m·r²`.

## 4. Integration and timestep

- **Semi-implicit (symplectic) Euler:** update velocity first, then position with the new velocity. It is stable for games, and its free-fall error has a closed form that the tests check.
- **Orientation:** `q += ½·dt·(0, ω)·q`, then normalise.
- **`update(frameDt)`** uses an accumulator for fixed 60 Hz steps, capped at `maxSubSteps`. This avoids the "spiral of death", where slow frames cause more steps that cause slower frames.

## 5. Threading

- **`JobSystem`** is a fixed pool of threads. `parallelFor` hands out chunks through an atomic counter (simple work distribution), and **the calling thread also does work**. `JobSystem(1)` runs inline with zero overhead.
- **Parallel phases:** force integration, all broad phases, narrow phase and position integration. Each writes only to its own index or per-thread buffer, so there are **no locks in the hot loops**.
- **Serial phase:** the solver, because Gauss-Seidel updates bodies that are shared between contacts.

## 6. Future work

1. **Graph-coloured parallel solver.** Colour contacts so no two in the same colour share a body, then solve each colour in parallel. It needs a lower-overhead barrier than a condition variable, since there are colours × iterations sync points per step.
2. **Warm starting.** Cache impulses per contact between frames (matched by body pair). Deep stacks converge in fewer iterations with less penetration.
3. **Contact islands** for sleeping. Use union-find over contacts and sleep or wake whole islands.
4. **More shapes.** Capsules (segment–segment closest points), then boxes with SAT and contact manifolds.
5. **SIMD** (SSE/NEON) for AABB tests and integration, and structure-of-arrays body storage.
6. **Continuous collision detection** for fast, small bodies (tunnelling).
