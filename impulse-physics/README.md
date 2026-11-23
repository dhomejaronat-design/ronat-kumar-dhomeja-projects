# Impulse: C++20 Rigid-Body Physics Engine

**Impulse** is a small, readable **C++20 rigid-body physics engine**. It has three interchangeable broad phases, an impulse-based contact solver with friction and rolling resistance, sleeping, a multithreaded job system, and deterministic results for any thread count.

It ships with 30 unit tests (including physics checks against textbook results), a benchmark tool and an interactive raylib viewer.

```
16,000 spheres  →  10.7 ms per step (single thread, uniform grid)  →  fits a 60 FPS frame
4,000 spheres   →  broad phase 16.5× faster than brute force, with 527× fewer AABB tests
```

## Features

| Area | What's implemented |
|---|---|
| **Broad phase** | Brute force O(n²) baseline · **uniform grid** (spatial hash, open-addressing table, 13-neighbour cell sweep) · **sweep-and-prune** (temporal coherence via insertion sort). All three return identical sorted pair lists. |
| **Narrow phase** | Sphere–sphere, sphere–plane, sphere–box (including centre-inside-box) |
| **Solver** | Sequential impulses (projected Gauss-Seidel) with accumulated-impulse clamping, restitution with a velocity threshold, Baumgarte stabilisation with slop, **Coulomb friction cone**, **rolling resistance** |
| **Integration** | Semi-implicit Euler, quaternion orientation, fixed timestep with accumulator and spiral-of-death cap |
| **Performance** | Thread-pool `parallelFor` (calling thread participates, atomic chunk dispatch) used for integration, all broad phases and the narrow phase; per-thread buffers, no locks in hot loops; per-phase profiler |
| **Sleeping** | Bodies at rest sleep after 0.5 s and wake when hit |
| **Determinism** | Bit-identical results for 1, 2, 4 or 7 threads and for every broad phase (tested) |
| **Quality** | 30 GoogleTest tests · ASan/UBSan and TSan clean · CI on Linux (GCC/Clang), macOS and Windows (MSVC) |

## Pipeline (one fixed step)

```
integrate forces ─► broad phase ─► narrow phase ─► wake-up ─► velocity solver ─► integrate positions
   (parallel)        (parallel)      (parallel)                (Gauss-Seidel)       (parallel, sleep)
```

## Build

Requires CMake 3.20+ and a C++20 compiler. GoogleTest and raylib are downloaded automatically.

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure      # 30 tests
./build/impulse_bench                            # benchmark table
```

Viewer (needs a desktop):

```bash
cmake -S . -B build -DIMPULSE_BUILD_VIEWER=ON
cmake --build build --parallel
./build/impulse_viewer
```

Viewer controls: **right-drag** orbit · **wheel** zoom · **Space** drop 100 spheres · **left-click** shoot a heavy ball · **B** cycle broad phase · **T** cycle threads · **1/2** pile or ramp scene · **R** reset · **P/N** pause and step · **H** HUD.

Sanitizers: `-DIMPULSE_SANITIZE=ON` (ASan + UBSan).

## Benchmarks

Sphere-pile scene (bodies dropped into a box sized to keep density constant), 60 warm-up steps and 300 measured steps at 60 Hz. Measured on a **2-vCPU cloud VM (Intel Xeon @ 2.1 GHz)**; run `impulse_bench` to get numbers for your machine. Full results are in [`bench/results_2vcpu.csv`](bench/results_2vcpu.csv).

| Bodies | Broad phase | Threads | ms/step | Broad-phase ms | AABB tests/step |
|---:|---|---:|---:|---:|---:|
| 4,000 | brute force | 1 | 19.03 | 17.56 | 5,445,148 |
| 4,000 | brute force | 2 | 10.11 | 8.59 | 5,445,148 |
| 4,000 | sweep-and-prune | 1 | 2.64 | 1.11 | 113,251 |
| 4,000 | uniform grid | 1 | **2.52** | **1.06** | **10,326** |
| 16,000 | sweep-and-prune | 1 | 13.12 | 6.97 | 890,654 |
| 16,000 | uniform grid | 1 | **10.73** | **4.52** | **41,678** |
| 16,000 | uniform grid | 2 | 10.42 | 3.59 | 41,678 |

What the numbers show:
- **The grid scales linearly.** AABB tests grow about 4× for 4× the bodies. Brute force grows about 16×.
- **Threads cut the parallel phases.** At 4,000 bodies, brute-force broad phase goes from 17.6 → 8.6 ms on 2 threads (2.04×).
- **Amdahl's law.** With a fast broad phase, the serial Gauss-Seidel solver becomes about half the step, which caps whole-step speedup. A graph-coloured parallel solver is the next step (see [docs/DESIGN.md](docs/DESIGN.md)).

## Tests

`ctest` runs 30 tests, including:

- **Broad-phase equivalence:** grid and SAP match brute force exactly on 20 random scenes × 3 thread counts, and stay correct over 30 frames of motion.
- **Free fall** matches the closed-form semi-implicit Euler result.
- **Elastic collision** of equal masses swaps velocities; **momentum** is conserved in a 64-body pile without gravity.
- **Bounce height** equals e² × drop height.
- **A sliding sphere starts rolling at 5/7 of its initial speed**, the classic rigid-body result.
- **A 600-body pile** stays inside its box with penetration under 5 cm; a 200-body pile falls fully asleep.
- **Determinism:** identical positions for every thread count and broad phase.
- **Job system:** every index is visited exactly once for 1–8 threads.

## Layout

```
include/impulse/   public headers (math, body, contact, broadphase, narrowphase, job_system, world)
src/               engine implementation
tests/             GoogleTest suites
bench/             benchmark CLI + shared demo scenes
viewer/            raylib viewer
docs/              design notes
```

## Limitations (on purpose, to keep it readable)

- Dynamic bodies are spheres only; boxes and planes are static.
- Sleeping has no contact islands, so a sleeping body is not woken when its support moves away.
- The solver is serial and has no warm starting, so deep stacks settle with around 2 cm of penetration at 10 iterations.

## License

MIT © 2026 Ronat Kumar Dhomeja
