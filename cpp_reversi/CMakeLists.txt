cmake_minimum_required(VERSION 3.15...3.27)
project(reversi_bitboard LANGUAGES CXX)

find_package(Python 3.8 COMPONENTS Interpreter Development REQUIRED)
find_package(pybind11 CONFIG REQUIRED)



pybind11_add_module(reversi_bitboard_cpp MODULE py_reversi.cpp reversi_bitboard.cpp)
target_link_libraries(reversi_bitboard_cpp PRIVATE pybind11::embed Python::Python)
target_include_directories(reversi_bitboard_cpp PRIVATE ${Python_INCLUDE_DIRS})
target_compile_options(reversi_bitboard_cpp PRIVATE -O3 -Wall -Wextra -pedantic)
