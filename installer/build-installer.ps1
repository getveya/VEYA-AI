<#
  VEYA-AI - Build the installer
  Creates installer\dist\VEYA-AI-Setup-<version>.exe (a single .exe, no admin needed).

  Steps:
    1. Build VEYA (Vencord build)              ->  dist\
    2. Pack build + examples into installer    ->  installer\payload\
    3. Build installer with electron-builder   ->  installer\dist\

  Examples:
    .\build-installer.ps1
    .\build-installer.ps1 -Remote "getveya/VEYA-AI"           # Default: repo for updates & source code link
    .\build-installer.ps1 -CertFile .\cert.pfx -CertPassword "..." # signed (no SmartScreen warning)
    .\build-installer.ps1 -Dir                                   # quick test build without .exe
    .\build-installer.ps1 -Dev                                   # private developer build (with src\userplugins\veyaDev)
#>

param(
    [switch]$Dir,
    [switch]$Dev,
    [string]$Remote = "getveya/VEYA-AI",
    [string]$CertFile = "",
    [string]$CertPassword = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$installer = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $installer

function Step($n, $text) { Write-Host "`n[$n/5] $text" -ForegroundColor Yellow }
function Ok($text) { Write-Host "      $text" -ForegroundColor Green }
function Fail($text) { Write-Host "      ERROR: $text" -ForegroundColor Red; exit 1 }

Write-Host "VEYA-AI - Installer-Build" -ForegroundColor Cyan

# 1 - Tools
Step 1 "Checking tools"
try { $nodeVer = node --version } catch { Fail "Node.js is missing (https://nodejs.org, version 20+)." }
Ok "Node.js $nodeVer"
# Provide pnpm without admin rights: existing one first, then npm (user folder), then corepack
$npmBin = Join-Path $env:APPDATA "npm"
if ($env:Path -notlike "*$npmBin*") { $env:Path = "$npmBin;$env:Path" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "      Installing pnpm (npm install -g pnpm@11.9.0)..."
    npm install -g pnpm@11.9.0 | Out-Host
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "      Trying corepack..."
    try { corepack enable | Out-Host } catch { }
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Fail "Could not install pnpm. Run 'npm install -g pnpm' once and restart the script."
}
Ok "pnpm $(pnpm --version)"

# 2 - Build VEYA
Step 2 "Building VEYA (Vencord build with VEYA plugin)"
Push-Location $root
# The private developer plugin never goes into a public build: hide it during the build
$devPlugin = Join-Path $root "src\userplugins\veyaDev"
$devHidden = Join-Path $root "src\userplugins\.veyaDev"
if (Test-Path $devHidden) {
    if (Test-Path $devPlugin) { Remove-Item $devHidden -Recurse -Force } else { Rename-Item $devHidden "veyaDev" }
}
$hidDev = $false
if ((Test-Path $devPlugin) -and -not $Dev) { Rename-Item $devPlugin ".veyaDev"; $hidDev = $true; Ok "Public build - developer tools left out" }
elseif ($Dev) { if (Test-Path $devPlugin) { Ok "DEVELOPER build - only for your own PC, never upload it" } else { Fail "-Dev: src\userplugins\veyaDev is missing" } }
try {
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Fail "pnpm install failed" }
    node scripts/syncIcons.mjs
    if ($Remote) { $env:VENCORD_REMOTE = $Remote; Ok "Update source: github.com/$Remote" }
    if (-not (Test-Path "$root\.git")) {
        $env:VENCORD_HASH = "veya-" + (Get-Date -Format "yyyyMMddHHmm")
        Ok "No git folder - build ID $($env:VENCORD_HASH)"
    }
    pnpm buildStandalone
    if ($LASTEXITCODE -ne 0) { Fail "Build failed" }
    if (-not (Test-Path "dist\patcher.js")) { Fail "dist\patcher.js is missing after the build" }
} finally {
    if ($hidDev -and (Test-Path $devHidden)) { Rename-Item $devHidden "veyaDev" }
    Pop-Location
}
Ok "Build done"

# 3 - Assemble payload
Step 3 "Packing build into the installer"
$payload = Join-Path $installer "payload"
if (Test-Path $payload) { Remove-Item $payload -Recurse -Force }
New-Item -ItemType Directory -Path "$payload\dist", "$payload\examples" | Out-Null
Copy-Item "$root\dist\*" "$payload\dist" -Recurse
Copy-Item "$root\examples\*.veya.json" "$payload\examples"
$version = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).version
[IO.File]::WriteAllText("$payload\version.json", (@{ version = $version; builtAt = (Get-Date).ToString("o") } | ConvertTo-Json))
New-Item -ItemType Directory -Path "$installer\assets" -Force | Out-Null
Copy-Item "$root\assets\veya-logo.ico", "$root\assets\veya-logo.png", "$root\assets\veya-logo.svg" "$installer\assets" -Force
Ok "Version $version"

# 4 - Signing (optional)
Step 4 "Code signing"
if ($CertFile) {
    if (-not (Test-Path $CertFile)) { Fail "Certificate $CertFile not found" }
    $env:CSC_LINK = (Resolve-Path $CertFile).Path
    $env:CSC_KEY_PASSWORD = $CertPassword
    Ok "Signing with $CertFile"
} elseif ($env:CSC_LINK) {
    Ok "Signing (CSC_LINK is set)"
} else {
    Write-Host "      No certificate - Windows SmartScreen will show a warning on first launch." -ForegroundColor DarkYellow
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
}

# 5 - Build installer
Step 5 "Building installer"
Push-Location $installer
try {
    npm install
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
    # the .exe gets the same version as VEYA itself (root package.json) - needed for auto-updates
    npm pkg set "version=$version" | Out-Null

    # On first run electron-builder extracts a helper package containing macOS symlinks.
    # Without admin/developer mode that fails on Windows, so extract it ourselves first (without the macOS part).
    $wcs = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
    if (-not (Test-Path (Join-Path $wcs "rcedit-x64.exe"))) {
        Write-Host "      Preparing Windows tools for electron-builder..."
        $tmp = Join-Path $env:TEMP "winCodeSign-2.6.0.7z"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -OutFile $tmp "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
        $sevenZip = Join-Path $installer "node_modules\7zip-bin\win\x64\7za.exe"
        if (-not (Test-Path $sevenZip)) { Fail "7za.exe not found ($sevenZip)" }
        New-Item -ItemType Directory -Force -Path $wcs | Out-Null
        & $sevenZip x $tmp "-o$wcs" "-xr!darwin" -y | Out-Null
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        Ok "Tools ready"
    }

    $log = Join-Path $installer "build.log"
    $target = if ($Dir) { "build:dir" } else { "build" }
    cmd /c "npm run $target 2>&1" | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) { Fail "electron-builder failed - details in installer\build.log" }
} finally { Pop-Location }

$exe = Get-ChildItem "$installer\dist" -Filter "*.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($exe -and $Dev -and -not $Dir) {
    $devName = $exe.Name -replace '\.exe$', '-DEV.exe'
    Move-Item $exe.FullName (Join-Path $exe.DirectoryName $devName) -Force
    $exe = Get-Item (Join-Path $exe.DirectoryName $devName)
    Write-Host "  DEVELOPER build - keep it on your PC, never upload it as a release." -ForegroundColor Magenta
}
Write-Host ""
if ($exe -and -not $Dir) {
    Write-Host "  Done: $($exe.FullName)" -ForegroundColor Cyan
    Write-Host "  Size:  $([math]::Round($exe.Length / 1MB, 1)) MB" -ForegroundColor Gray
} else {
    Write-Host "  Done: $installer\dist\win-unpacked\VEYA-AI.exe" -ForegroundColor Cyan
}
