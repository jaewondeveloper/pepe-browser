# Configure and build Pepe Browser (requires CMake 3.21+ and Visual Studio 2022).
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$CefRoot = Join-Path $Root "third_party\cef"

if (-not (Test-Path (Join-Path $CefRoot "CMakeLists.txt"))) {
    Write-Host "CEF not found. Run .\scripts\download_cef.ps1 first."
    exit 1
}

$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $cmake) {
    Write-Host "CMake not in PATH. Install from https://cmake.org/download/ and reopen the terminal."
    exit 1
}

$BuildDir = Join-Path $Root "build"
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
Set-Location $BuildDir

$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
    $env:PYTHON_EXECUTABLE = (py -3 -c "import sys; print(sys.executable)")
}

cmake -G "Visual Studio 17 2022" -A x64 -DCEF_ROOT="$CefRoot" ..
cmake --build . --config Release --target pepe_browser

Write-Host ""
Write-Host "Binary: $BuildDir\Release\pepe_browser.exe"
Write-Host "Run from Release folder so libcef.dll and Resources are found."
