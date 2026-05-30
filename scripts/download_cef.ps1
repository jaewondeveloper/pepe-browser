# Downloads the CEF Standard distribution for Windows 64-bit.
# Run from repo root: .\scripts\download_cef.ps1
# Uses curl (fast + resume) or BITS; much faster than Invoke-WebRequest.

param(
    [switch]$ForceDownload,
    [ValidateSet("standard", "minimal")]
    [string]$Type = "standard"
)

$ErrorActionPreference = "Stop"

$CEF_VERSION = "144.0.6+g5f7e671+chromium-144.0.7559.59"
$PLATFORM = "windows64"
$ARCHIVE_NAME = "cef_binary_${CEF_VERSION}_${PLATFORM}.tar.bz2"
$ENCODED_VERSION = [uri]::EscapeDataString($CEF_VERSION)
$URL = "https://cef-builds.spotifycdn.com/cef_binary_${ENCODED_VERSION}_${PLATFORM}.tar.bz2"

if ($Type -eq "minimal") {
    $ARCHIVE_NAME = "cef_binary_${CEF_VERSION}_${PLATFORM}_minimal.tar.bz2"
    $URL = "https://cef-builds.spotifycdn.com/cef_binary_${ENCODED_VERSION}_${PLATFORM}_minimal.tar.bz2"
}

$Root = Split-Path -Parent $PSScriptRoot
$ThirdParty = Join-Path $Root "third_party"
$DownloadDir = Join-Path $ThirdParty "downloads"
$ArchivePath = Join-Path $DownloadDir $ARCHIVE_NAME
$CefRoot = Join-Path $ThirdParty "cef"
$ExtractedFolder = Join-Path $ThirdParty "cef_binary_${CEF_VERSION}_${PLATFORM}"
if ($Type -eq "minimal") {
    $ExtractedFolder = Join-Path $ThirdParty "cef_binary_${CEF_VERSION}_${PLATFORM}_minimal"
}

New-Item -ItemType Directory -Force -Path $DownloadDir | Out-Null

function Format-Megabytes([long]$Bytes) {
    return "{0:N1} MB" -f ($Bytes / 1MB)
}

function Test-ArchiveComplete {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    $size = (Get-Item $Path).Length
    # Standard ~250MB+, minimal ~120MB+; incomplete files are usually smaller and still growing.
    $minBytes = if ($Type -eq "minimal") { 100MB } else { 230MB }
    return $size -ge $minBytes
}

function Download-WithCurl {
    param([string]$Url, [string]$OutFile)
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { return $false }

    Write-Host "Downloading with curl (resume supported)..."
    $args = @(
        "-L", "--fail", "--retry", "5", "--retry-delay", "2",
        "-C", "-",
        "--connect-timeout", "30",
        "--speed-time", "60", "--speed-limit", "1024",
        "-o", $OutFile,
        "--progress-bar",
        $Url
    )
    & curl.exe @args
    if ($LASTEXITCODE -ne 0) {
        throw "curl failed with exit code $LASTEXITCODE"
    }
    return $true
}

function Download-WithBits {
    param([string]$Url, [string]$OutFile)
    Write-Host "Downloading with BITS (Windows background transfer)..."
    if (Test-Path $OutFile) { Remove-Item -Force $OutFile }
    Start-BitsTransfer -Source $Url -Destination $OutFile -Priority Foreground -DisplayName "CEF download"
    return $true
}

function Download-CefArchive {
    if ((Test-ArchiveComplete $ArchivePath) -and -not $ForceDownload) {
        Write-Host "Archive OK: $(Format-Megabytes (Get-Item $ArchivePath).Length) — skip download."
        return
    }

    if ($ForceDownload -and (Test-Path $ArchivePath)) {
        Remove-Item -Force $ArchivePath
    }

    Write-Host "Downloading CEF $Type ($CEF_VERSION)..."
    Write-Host $URL

    $started = Get-Date
    $ok = $false
    try {
        $ok = Download-WithCurl -Url $URL -OutFile $ArchivePath
    } catch {
        Write-Host "curl failed: $_"
    }

    if (-not $ok) {
        try {
            Download-WithBits -Url $URL -OutFile $ArchivePath | Out-Null
            $ok = $true
        } catch {
            Write-Host "BITS failed: $_ — falling back to Invoke-WebRequest."
            Invoke-WebRequest -Uri $URL -OutFile $ArchivePath -UseBasicParsing
            $ok = $true
        }
    }

    if (-not (Test-ArchiveComplete $ArchivePath)) {
        throw "Download looks incomplete. Re-run: .\scripts\download_cef.ps1 -ForceDownload"
    }

    $elapsed = (Get-Date) - $started
    Write-Host "Download done in $($elapsed.ToString('mm\:ss')) — $(Format-Megabytes (Get-Item $ArchivePath).Length)"
}

if (Test-Path (Join-Path $ExtractedFolder "CMakeLists.txt")) {
    Write-Host "CEF already extracted: $ExtractedFolder"
} else {
    Download-CefArchive

    Write-Host "Extracting (1–3 min)..."
    $extractStart = Get-Date
    if (Test-Path $ExtractedFolder) {
        Remove-Item -Recurse -Force $ExtractedFolder
    }

    $tar = Get-Command tar -ErrorAction SilentlyContinue
    if (-not $tar) {
        throw "tar not found. Enable Windows tar or install Git for Windows."
    }

    tar -xjf $ArchivePath -C $ThirdParty
    $elapsed = (Get-Date) - $extractStart
    Write-Host "Extract done in $($elapsed.ToString('mm\:ss'))."
}

if (Test-Path $CefRoot) {
    $item = Get-Item $CefRoot -Force
    if ($item.LinkType -eq "Junction") {
        $target = (Get-Item $CefRoot).Target
        if ($target -ne $ExtractedFolder) {
            cmd /c rmdir "$CefRoot" 2>$null
            cmd /c mklink /J "$CefRoot" "$ExtractedFolder" | Out-Null
        }
    }
} else {
    cmd /c mklink /J "$CefRoot" "$ExtractedFolder" | Out-Null
    Write-Host "Created junction: third_party\cef"
}

Write-Host ""
Write-Host "Done. CEF_ROOT = $CefRoot"
Write-Host "Tip: minimal build is smaller — .\scripts\download_cef.ps1 -Type minimal"
Write-Host "Next: .\scripts\build.ps1"
