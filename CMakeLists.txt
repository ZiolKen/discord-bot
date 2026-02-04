cmake_minimum_required(VERSION 3.22)
project(discord_utils_bot LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

include(FetchContent)

FetchContent_Declare(
  dpp
  GIT_REPOSITORY https://github.com/brainboxdotcc/DPP.git
  GIT_TAG v10.1.4
)
FetchContent_MakeAvailable(dpp)

FetchContent_Declare(
  json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

FetchContent_Declare(
  httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.15.3
)
FetchContent_MakeAvailable(httplib)

add_executable(bot src/main.cpp)
target_link_libraries(bot PRIVATE dpp nlohmann_json::nlohmann_json)

find_package(Threads REQUIRED)
target_link_libraries(bot PRIVATE Threads::Threads)

target_compile_options(bot PRIVATE -O2 -pipe -Wall -Wextra -Wpedantic)
