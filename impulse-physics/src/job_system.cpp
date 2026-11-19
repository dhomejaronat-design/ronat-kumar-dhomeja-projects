#include "impulse/job_system.hpp"

#include <algorithm>

namespace impulse {

JobSystem::JobSystem(unsigned threadCount) : threadCount_(std::max(1u, threadCount)) {
    workers_.reserve(threadCount_ - 1);
    for (unsigned i = 1; i < threadCount_; ++i) {
        workers_.emplace_back([this, i] { workerLoop(i); });
    }
}

JobSystem::~JobSystem() {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        stop_ = true;
    }
    wakeCv_.notify_all();
    for (std::thread& t : workers_) {
        t.join();
    }
}

void JobSystem::parallelFor(std::size_t count, std::size_t minChunk, const Task& task) {
    if (count == 0) {
        return;
    }
    minChunk = std::max<std::size_t>(1, minChunk);

    // Not worth waking other threads: run inline.
    if (workers_.empty() || count <= minChunk) {
        task(0, count, 0);
        return;
    }

    // Aim for ~4 chunks per thread so a slow chunk does not stall the rest.
    const std::size_t target = (count + threadCount_ * 4 - 1) / (threadCount_ * 4);
    {
        std::lock_guard<std::mutex> lock(mutex_);
        task_ = &task;
        count_ = count;
        chunk_ = std::max(minChunk, target);
        next_.store(0, std::memory_order_relaxed);
        pending_ = static_cast<unsigned>(workers_.size());
        ++generation_;
    }
    wakeCv_.notify_all();

    runChunks(0);  // the calling thread helps

    std::unique_lock<std::mutex> lock(mutex_);
    doneCv_.wait(lock, [this] { return pending_ == 0; });
    task_ = nullptr;
}

void JobSystem::runChunks(unsigned workerIndex) {
    for (;;) {
        const std::size_t begin = next_.fetch_add(chunk_, std::memory_order_relaxed);
        if (begin >= count_) {
            return;
        }
        (*task_)(begin, std::min(begin + chunk_, count_), workerIndex);
    }
}

void JobSystem::workerLoop(unsigned workerIndex) {
    std::uint64_t seen = 0;
    for (;;) {
        {
            std::unique_lock<std::mutex> lock(mutex_);
            wakeCv_.wait(lock, [&] { return stop_ || generation_ != seen; });
            if (stop_) {
                return;
            }
            seen = generation_;
        }

        runChunks(workerIndex);

        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (--pending_ == 0) {
                doneCv_.notify_one();
            }
        }
    }
}

}  // namespace impulse
