cmake_minimum_required(VERSION 3.21)
project(pepe_browser)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED CEF_ROOT)
  set(CEF_ROOT "${CMAKE_SOURCE_DIR}/third_party/cef" CACHE PATH "CEF binary distribution")
endif()

if(NOT EXISTS "${CEF_ROOT}/CMakeLists.txt")
  message(FATAL_ERROR "CEF not found at ${CEF_ROOT}. Run scripts/download_cef.ps1")
endif()

set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)

add_subdirectory(${CEF_LIBCEF_DLL_WRAPPER_PATH} libcef_dll_wrapper)

set(PEPE_BROWSER_SRCS
  src/pepe_browser_win.cc
  src/pepe_app.cc
  src/pepe_handler.cc
  src/pepe_window_win.cc
)

set(CEF_TARGET pepe_browser)
ADD_LOGICAL_TARGET("libcef_lib" "${CEF_LIB_RELEASE}" "${CEF_LIB_DEBUG}")
ADD_EXECUTABLE(pepe_browser WIN32 ${PEPE_BROWSER_SRCS})
SET_EXECUTABLE_TARGET_PROPERTIES(pepe_browser)
add_dependencies(pepe_browser libcef_dll_wrapper)
target_link_libraries(pepe_browser libcef_dll_wrapper libcef_lib ${CEF_STANDARD_LIBS})
target_include_directories(pepe_browser PRIVATE "${CMAKE_SOURCE_DIR}/src" "${CEF_ROOT}")

COPY_FILES("${CEF_TARGET}" "${CEF_BINARY_FILES}" "${CEF_BINARY_DIR}" "${CEF_TARGET_OUT_DIR}")
COPY_FILES("${CEF_TARGET}" "${CEF_RESOURCE_FILES}" "${CEF_RESOURCE_DIR}" "${CEF_TARGET_OUT_DIR}")

add_custom_command(
  TARGET pepe_browser
  POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:pepe_browser>/resources"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_SOURCE_DIR}/resources/home.html"
          "$<TARGET_FILE_DIR:pepe_browser>/resources/home.html"
)
