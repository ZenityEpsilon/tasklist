param(
  [string]$AppDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

function Write-Info($Message) {
  Write-Host "[update] $Message"
}

function Read-JsonFile($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Write-Info "Cannot read $Path, skipping config file."
    return $null
  }
}

function Get-ConfigValue($Config, $Name, $DefaultValue = $null) {
  if ($null -ne $Config -and $Config.PSObject.Properties.Name -contains $Name) {
    return $Config.$Name
  }

  return $DefaultValue
}

function Normalize-Version($Version) {
  if ([string]::IsNullOrWhiteSpace($Version)) {
    return ''
  }

  return $Version.Trim().TrimStart('v', 'V')
}

function New-AuthHeaders($Token) {
  $headers = @{
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent' = 'NBK-List-Updater'
  }

  if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $headers.Authorization = "Bearer $Token"
  }

  return $headers
}

function Copy-UpdateFiles($SourceDir, $TargetDir) {
  $sourceRoot = Get-Item -LiteralPath $SourceDir
  $targetRoot = Get-Item -LiteralPath $TargetDir
  $excludedNames = @(
    'sync-state.json',
    'update-config.local.json',
    'update-token.txt'
  )

  Get-ChildItem -LiteralPath $sourceRoot.FullName -Force -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourceRoot.FullName.Length).TrimStart('\', '/')
    $firstSegment = ($relativePath -split '[\\/]')[0]

    if ($excludedNames -contains $firstSegment) {
      return
    }

    $targetPath = Join-Path $targetRoot.FullName $relativePath

    if ($_.PSIsContainer) {
      if (-not (Test-Path -LiteralPath $targetPath)) {
        New-Item -ItemType Directory -Path $targetPath | Out-Null
      }
      return
    }

    $targetParent = Split-Path -Parent $targetPath
    if (-not (Test-Path -LiteralPath $targetParent)) {
      New-Item -ItemType Directory -Path $targetParent | Out-Null
    }

    Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Force
  }
}

try {
  $resolvedAppDir = (Resolve-Path -LiteralPath $AppDir).Path
  $localConfig = Read-JsonFile (Join-Path $resolvedAppDir 'update-config.local.json')
  $repo = $env:NBK_GITHUB_REPO

  if ([string]::IsNullOrWhiteSpace($repo)) {
    $repo = Get-ConfigValue $localConfig 'repo'
  }

  if ([string]::IsNullOrWhiteSpace($repo)) {
    $repo = $env:GITHUB_REPOSITORY
  }

  if ([string]::IsNullOrWhiteSpace($repo) -or $repo -eq 'owner/private-repo') {
    Write-Info 'GitHub repo is not configured. Skipping update check.'
    exit 0
  }

  $assetPattern = Get-ConfigValue $localConfig 'assetPattern' '*.zip'
  $token = $env:NBK_GITHUB_TOKEN

  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = $env:GITHUB_TOKEN
  }

  if ([string]::IsNullOrWhiteSpace($token)) {
    $tokenPath = Join-Path $resolvedAppDir 'update-token.txt'
    if (Test-Path -LiteralPath $tokenPath) {
      $token = (Get-Content -LiteralPath $tokenPath -Raw -Encoding UTF8).Trim()
    }
  }

  $headers = New-AuthHeaders $token
  $latestUrl = "https://api.github.com/repos/$repo/releases/latest"

  Write-Info "Checking latest release for $repo..."
  $release = Invoke-RestMethod -Uri $latestUrl -Headers $headers -Method Get
  $latestVersion = Normalize-Version $release.tag_name
  $versionPath = Join-Path $resolvedAppDir 'VERSION'
  $currentVersion = ''

  if (Test-Path -LiteralPath $versionPath) {
    $currentVersion = Normalize-Version (Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8)
  }

  if (-not [string]::IsNullOrWhiteSpace($currentVersion) -and $currentVersion -eq $latestVersion) {
    Write-Info "Already up to date ($currentVersion)."
    exit 0
  }

  $asset = $release.assets | Where-Object { $_.name -like $assetPattern } | Select-Object -First 1
  if ($null -eq $asset) {
    Write-Info "Release $($release.tag_name) has no asset matching '$assetPattern'. Skipping update."
    exit 0
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('nbk-list-update-' + [guid]::NewGuid().ToString('N'))
  $archivePath = Join-Path $tempRoot $asset.name
  $extractPath = Join-Path $tempRoot 'extract'

  New-Item -ItemType Directory -Path $tempRoot, $extractPath | Out-Null

  try {
    Write-Info "Downloading $($asset.name) from $($release.tag_name)..."
    $downloadHeaders = $headers.Clone()
    $downloadHeaders.Accept = 'application/octet-stream'
    Invoke-WebRequest -Uri $asset.url -Headers $downloadHeaders -OutFile $archivePath

    Write-Info 'Applying update...'
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force

    $payloadDir = $extractPath
    $children = Get-ChildItem -LiteralPath $extractPath -Force
    if ($children.Count -eq 1 -and $children[0].PSIsContainer) {
      $payloadDir = $children[0].FullName
    }

    Copy-UpdateFiles $payloadDir $resolvedAppDir
    Set-Content -LiteralPath $versionPath -Value $latestVersion -Encoding UTF8
    Write-Info "Updated to $latestVersion."
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
} catch {
  Write-Info "Update check failed: $($_.Exception.Message)"
  exit 0
}
