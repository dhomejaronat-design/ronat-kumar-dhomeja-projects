// A small fixed-size thread pool with a blocking parallel-for.
//
// The calling thread always takes part in the work, so JobSystem(1) runs
// everything inline with zero threading overhead. Work is handed out in
// chunks through an atomic counter, so uneven loops still balance.
#pragma once

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

namespace impulse {

class JobSystem {
public:
    // Task signature: (begin, end, workerIndex). workerIndex is in
    // [0, threadCount()) and can index per-thread scratch buffers.
    using Task = std::function<void(std::size_t, std::size_t, unsigned)>;

    explicit JobSystem(unsigned threadCount = 1);
    ~JobSystem();

    JobSystem(const JobSystem&) = delete;
    JobSystem& operator=(const JobSystem&) = delete;

    unsigned threadCount() const { return threadCount_; }

    // Runs task over [0, count) in chunks of at least minChunk and returns
    // when every chunk has finished.
    void parallelFor(std::size_t count, std::size_t minChunk, const Task& task);

private:
    void workerLoop(unsigned workerIndex);
    void runChunks(unsigned workerIndex);

    unsigned threadCount_ = 1;
    std::vector<std::thread> workers_;

    std::mutex mutex_;
    std::condition_variable wakeCv_;
    std::condition_variable doneCv_;
    std::uint64_t generation_ = 0;
    unsigned pending_ = 0;
    bool stop_ = false;

    const Task* task_ = nullptr;
    std::size_t count_ = 0;
    std::size_t chunk_ = 1;
    std::atomic<std::size_t> next_{0};
};

}  // namespace impulse
