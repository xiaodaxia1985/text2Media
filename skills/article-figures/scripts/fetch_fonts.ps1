# fetch_fonts.ps1 — pull the five font packages this pipeline inlines.
#
# Fonts are ~120 MB unpacked and never belong in git, so the repo carries this
# script instead. Everything comes from the npmmirror registry; no GitHub,
# no proxy needed.
#
#   powershell -ExecutionPolicy Bypass -File scripts/fetch_fonts.ps1
#
# Result: ../fonts/<package>/… which fontkit.py finds automatically.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$fonts = Join-Path $root "fonts"

New-Item -ItemType Directory -Force -Path $fonts | Out-Null
$env:npm_config_registry = "https://registry.npmmirror.com/"

$packages = @(
  "@fontsource-variable/noto-serif-sc",
  "@fontsource-variable/noto-sans-sc",
  "lxgw-wenkai-screen-webfont",
  "@fontsource/eb-garamond",
  "@fontpkg/huiwen-mincho",
  "@fontpkg/king-hwa-old-song"
)

foreach ($pkg in $packages) {
  Write-Host "== $pkg"
  Push-Location $fonts
  try {
    $tgz = (npm pack $pkg --silent).Trim()
    if (-not $tgz) { throw "npm pack returned nothing for $pkg" }
    $dir = [IO.Path]::GetFileNameWithoutExtension($tgz)
    $target = Join-Path $fonts $dir
    if (-not (Test-Path -LiteralPath $target)) {
      New-Item -ItemType Directory -Path $target | Out-Null
      tar -xzf $tgz -C $target
    }
    Write-Host "   -> $dir"
  }
  finally { Pop-Location }
}

Write-Host ""
Write-Host "fonts are in $fonts"
Write-Host "note: 京華老宋体 is fetched for comparing only — its metadata says 'All rights reserved',"
Write-Host "      so do not embed it into anything you publish. 汇文明朝体 is Public Domain."
Write-Host ""
Write-Host "next: python scripts/doctor.py"
