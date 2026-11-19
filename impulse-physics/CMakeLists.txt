cmake_minimum_required(VERSION 3.20)
project(impulse VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

option(IMPULSE_BUILD_TESTS "Build unit tests (GoogleTest)" ON)
option(IMPULSE_BUILD_BENCH "Build the benchmark tool" ON)
option(IMPULSE_BUILD_VIEWER "Build the raylib viewer (needs a desktop)" OFF)
option(IMPULSE_SANITIZE "Build with AddressSanitizer + UBSan" OFF)

find_package(Threads REQUIRED)
include(FetchContent)

add_library(impulse
  src/broadphase.cpp
  src/job_system.cpp
  src/narrowphase.cpp
  src/world.cpp)
target_include_directories(impulse PUBLIC include)
target_link_libraries(impulse PUBLIC Threads::Threads)

if(MSVC)
  target_compile_options(impulse PRIVATE /W4 /permissive-)
else()
  target_compile_options(impulse PRIVATE -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
endif()

if(IMPULSE_SANITIZE AND NOT MSVC)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
  target_compile_options(impulse PUBLIC -fsanitize=address,undefined -fno-omit-frame-pointer)
  target_link_options(impulse PUBLIC -fsanitize=address,undefined)
endif()

if(IMPULSE_BUILD_TESTS)
  enable_testing()
  FetchContent_Declare(googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0)
  set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
  set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
  FetchContent_MakeAvailable(googletest)

  add_executable(impulse_tests
    tests/test_math.cpp
    tests/test_job_system.cpp
    tests/test_broadphase.cpp
    tests/test_narrowphase.cpp
    tests/test_world.cpp
    bench/scenes.cpp)
  target_include_directories(impulse_tests PRIVATE bench)
  target_link_libraries(impulse_tests PRIVATE impulse GTest::gtest_main)
  include(GoogleTest)
  gtest_discover_tests(impulse_tests)
endif()

if(IMPULSE_BUILD_BENCH)
  add_executable(impulse_bench bench/bench.cpp bench/scenes.cpp)
  target_include_directories(impulse_bench PRIVATE bench)
  target_link_libraries(impulse_bench PRIVATE impulse)
endif()

if(IMPULSE_BUILD_VIEWER)
  FetchContent_Declare(raylib
    GIT_REPOSITORY https://github.com/raysan5/raylib.git
    GIT_TAG 5.0
    GIT_SHALLOW TRUE)
  set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
  FetchContent_MakeAvailable(raylib)

  add_executable(impulse_viewer viewer/main.cpp bench/scenes.cpp)
  target_include_directories(impulse_viewer PRIVATE bench)
  target_link_libraries(impulse_viewer PRIVATE impulse raylib)
endif()
