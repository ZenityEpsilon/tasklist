$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$webDist = Join-Path $root 'dist-web'
$dist = Join-Path $root 'dist'
$nextDist = Join-Path $root 'dist-next'
$electronDist = Join-Path $root 'node_modules\electron\dist'
$appDist = Join-Path $nextDist 'resources\app'

if (-not (Test-Path $webDist)) {
  throw "Web build was not found: $webDist"
}

if (-not (Test-Path (Join-Path $electronDist 'electron.exe'))) {
  throw "Electron runtime was not found. Run npm install first."
}

if (Test-Path $nextDist) {
  Remove-Item -LiteralPath $nextDist -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $nextDist | Out-Null
Copy-Item -Path (Join-Path $electronDist '*') -Destination $nextDist -Recurse -Force

New-Item -ItemType Directory -Force -Path $appDist | Out-Null
Copy-Item -Path (Join-Path $webDist '*') -Destination $appDist -Recurse -Force

Move-Item -LiteralPath (Join-Path $nextDist 'electron.exe') -Destination (Join-Path $nextDist 'Tasklist.exe') -Force

$backupDist = Join-Path $root ("dist-old-{0:yyyyMMddHHmmss}" -f (Get-Date))

try {
  if (Test-Path $dist) {
    Move-Item -LiteralPath $dist -Destination $backupDist -Force
  }

  Move-Item -LiteralPath $nextDist -Destination $dist -Force
} catch {
  if ((-not (Test-Path $dist)) -and (Test-Path $backupDist)) {
    Move-Item -LiteralPath $backupDist -Destination $dist -Force
  }

  Write-Warning "Current app build could not be replaced. Close Tasklist.exe and run the build again."
  Write-Warning "Prepared build is available at: $nextDist"
  return
}

if (Test-Path $backupDist) {
  try {
    Remove-Item -LiteralPath $backupDist -Recurse -Force
  } catch {
    Write-Warning "Previous build could not be removed: $backupDist"
  }
}

Write-Host "Portable Electron build created: $dist"
Write-Host "Run: $dist\Tasklist.exe"
