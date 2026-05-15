$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$webDist = Join-Path $root 'dist-web'
$dist = Join-Path $root 'dist'
$electronDist = Join-Path $root 'node_modules\electron\dist'
$appDist = Join-Path $dist 'resources\app'

if (-not (Test-Path $webDist)) {
  throw "Web build was not found: $webDist"
}

if (-not (Test-Path (Join-Path $electronDist 'electron.exe'))) {
  throw "Electron runtime was not found. Run npm install first."
}

if (Test-Path $dist) {
  Remove-Item -LiteralPath $dist -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $dist | Out-Null
Copy-Item -Path (Join-Path $electronDist '*') -Destination $dist -Recurse -Force

New-Item -ItemType Directory -Force -Path $appDist | Out-Null
Copy-Item -Path (Join-Path $webDist '*') -Destination $appDist -Recurse -Force

Move-Item -LiteralPath (Join-Path $dist 'electron.exe') -Destination (Join-Path $dist 'Tasklist.exe') -Force

Write-Host "Portable Electron build created: $dist"
Write-Host "Run: $dist\Tasklist.exe"
