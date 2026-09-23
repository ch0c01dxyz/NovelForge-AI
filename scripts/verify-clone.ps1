# NovelForge clean-clone verification — Windows (PowerShell 7+).
# Fresh clone from the local repo HEAD -> pnpm install -> lint -> typecheck
# -> test -> build all apps -> docker compose config. Exits 0 only if every
# step passes. Usage: scripts\verify-clone.ps1 [-Source <repo-path>] [-KeepDir]
param(
  [string]$Source = (Split-Path -Parent $PSScriptRoot),
  [switch]$KeepDir
)

$ErrorActionPreference = "Stop"
$workDir = Join-Path ([System.IO.Path]::GetTempPath()) ("novelforge-verify-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$cloneDir = Join-Path $workDir "NovelForge-AI"

function Step([string]$name, [scriptblock]$block) {
  Write-Host "== $name ==" -ForegroundColor Cyan
  & $block
  if ($LASTEXITCODE -ne 0) { throw "step '$name' failed with exit code $LASTEXITCODE" }
  Write-Host "-- $name OK" -ForegroundColor Green
}

try {
  Write-Host "Source repo : $Source"
  Write-Host "Clone target: $cloneDir"

  Step "git clone" { git clone --quiet $Source $cloneDir }
  Push-Location $cloneDir
  try {
    Step "pnpm install" { pnpm install --frozen-lockfile }
    Step "lint" { pnpm lint }
    Step "typecheck" { pnpm typecheck }
    Step "test" { pnpm test }
    Step "build apps" { pnpm -r --filter "./apps/*" build }
    Step "docker compose config" { docker compose config --quiet }
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "CLEAN-CLONE VERIFICATION PASSED (Windows)" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "CLEAN-CLONE VERIFICATION FAILED: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if ($KeepDir) {
    Write-Host "Work dir kept at: $workDir"
  } else {
    Remove-Item -Recurse -Force $workDir -ErrorAction SilentlyContinue
  }
}
