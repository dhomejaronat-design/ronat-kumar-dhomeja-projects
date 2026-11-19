#include <gtest/gtest.h>

#include <atomic>
#include <vector>

#include "impulse/job_system.hpp"

using impulse::JobSystem;

TEST(JobSystem, VisitsEveryIndexExactlyOnce) {
    for (unsigned threads : {1u, 2u, 4u, 8u}) {
        JobSystem jobs(threads);
        for (std::size_t count : {0u, 1u, 7u, 1000u, 12345u}) {
            std::vector<std::atomic<int>> hits(count);
            jobs.parallelFor(count, 16, [&](std::size_t begin, std::size_t end, unsigned worker) {
                ASSERT_LT(worker, threads);
                for (std::size_t i = begin; i < end; ++i) {
                    hits[i].fetch_add(1);
                }
            });
            for (std::size_t i = 0; i < count; ++i) {
                ASSERT_EQ(hits[i].load(), 1) << "threads=" << threads << " count=" << count << " i=" << i;
            }
        }
    }
}

TEST(JobSystem, ReusableAcrossManyCalls) {
    JobSystem jobs(4);
    std::atomic<long> sum{0};
    for (int round = 0; round < 500; ++round) {
        jobs.parallelFor(100, 1, [&](std::size_t begin, std::size_t end, unsigned) {
            for (std::size_t i = begin; i < end; ++i) {
                sum.fetch_add(static_cast<long>(i));
            }
        });
    }
    EXPECT_EQ(sum.load(), 500L * 4950L);
}

TEST(JobSystem, PerThreadBuffersNeedNoLocks) {
    JobSystem jobs(4);
    std::vector<long> partial(jobs.threadCount(), 0);
    jobs.parallelFor(100000, 64, [&](std::size_t begin, std::size_t end, unsigned worker) {
        for (std::size_t i = begin; i < end; ++i) {
            partial[worker] += 1;
        }
    });
    long total = 0;
    for (long p : partial) total += p;
    EXPECT_EQ(total, 100000);
}
