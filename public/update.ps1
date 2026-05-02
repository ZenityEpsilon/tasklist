param(
  [string]$AppDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$currentStep = 'starting'

function Write-Info($Message) {
  Write-Host "[update] $Message"
}

function Set-Step($Message) {
  $script:currentStep = $Message
}

function Format-Exception($ErrorRecord) {
  $exception = $ErrorRecord.Exception
  $line = $ErrorRecord.InvocationInfo.ScriptLineNumber
  $command = $ErrorRecord.InvocationInfo.Line
  $message = $exception.Message
  $type = $exception.GetType().FullName

  return "Step '$script:currentStep' failed at line ${line}: ${message} (${type}). Command: $command"
}

function Read-JsonFile($Path) {
  Set-Step "reading config file '$Path'"

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

function Normalize-GitHubRepo($Repo) {
  Set-Step 'normalizing GitHub repository'

  if ([string]::IsNullOrWhiteSpace($Repo)) {
    return ''
  }

  $value = $Repo.Trim().Trim('"', "'")

  if ($value -match '^git@github\.com:(?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$') {
    return "$($Matches.owner)/$($Matches.repo)"
  }

  if ($value -match '^https?://github\.com/(?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?/?$') {
    return "$($Matches.owner)/$($Matches.repo)"
  }

  if ($value -match '^(?<owner>[^/\s]+)/(?<repo>[^/\s]+?)(?:\.git)?$') {
    return "$($Matches.owner)/$($Matches.repo)"
  }

  throw "GitHub repo must be 'owner/repo', a GitHub HTTPS URL, or a git@github.com SSH URL."
}

function New-AuthHeaders($Token) {
  Set-Step 'creating GitHub request headers'

  $headers = @{
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent' = 'Tasklist-Updater'
  }

  if (-not [string]::IsNullOrWhiteSpace($Token)) {
    $headers.Authorization = "Bearer $Token"
  }

  return $headers
}

function Copy-UpdateFiles($SourceDir, $TargetDir) {
  Set-Step "copying update files from '$SourceDir' to '$TargetDir'"

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
  Set-Step "resolving app directory '$AppDir'"
  $resolvedAppDir = (Resolve-Path -LiteralPath $AppDir).Path
  Write-Info "App directory: $resolvedAppDir"

  $localConfig = Read-JsonFile (Join-Path $resolvedAppDir 'update-config.local.json')
  Set-Step 'reading repository setting'
  $repo = $env:TASKLIST_GITHUB_REPO

  if ([string]::IsNullOrWhiteSpace($repo)) {
    $repo = $env:NBK_GITHUB_REPO
  }

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

  $repo = Normalize-GitHubRepo $repo
  Write-Info "Repository: $repo"

  Set-Step 'reading asset pattern'
  $assetPattern = Get-ConfigValue $localConfig 'assetPattern' '*.zip'
  Write-Info "Asset pattern: $assetPattern"

  Set-Step 'reading GitHub token'
  $token = $env:TASKLIST_GITHUB_TOKEN

  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = $env:NBK_GITHUB_TOKEN
  }

  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = $env:GITHUB_TOKEN
  }

  if ([string]::IsNullOrWhiteSpace($token)) {
    $tokenPath = Join-Path $resolvedAppDir 'update-token.txt'
    Write-Info "Token source: $tokenPath"
    if (Test-Path -LiteralPath $tokenPath) {
      $token = (Get-Content -LiteralPath $tokenPath -Raw -Encoding UTF8).Trim()
    }
  }

  if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Info 'Token: not configured'
  } else {
    Write-Info 'Token: configured'
  }

  $headers = New-AuthHeaders $token
  $latestUrl = "https://api.github.com/repos/$repo/releases/latest"

  Set-Step "requesting latest release '$latestUrl'"
  Write-Info "Checking latest release for $repo..."
  $release = Invoke-RestMethod -Uri $latestUrl -Headers $headers -Method Get
  $latestVersion = Normalize-Version $release.tag_name
  $versionPath = Join-Path $resolvedAppDir 'VERSION'
  $currentVersion = ''

  Set-Step "reading local version '$versionPath'"
  if (Test-Path -LiteralPath $versionPath) {
    $currentVersion = Normalize-Version (Get-Content -LiteralPath $versionPath -Raw -Encoding UTF8)
  }

  Write-Info "Current version: $currentVersion"
  Write-Info "Latest version: $latestVersion"

  if (-not [string]::IsNullOrWhiteSpace($currentVersion) -and $currentVersion -eq $latestVersion) {
    Write-Info "Already up to date ($currentVersion)."
    exit 0
  }

  Set-Step "selecting release asset matching '$assetPattern'"
  $asset = $release.assets | Where-Object { $_.name -like $assetPattern } | Select-Object -First 1
  if ($null -eq $asset) {
    Write-Info "Release $($release.tag_name) has no asset matching '$assetPattern'. Skipping update."
    exit 0
  }

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('tasklist-update-' + [guid]::NewGuid().ToString('N'))
  $assetFileName = [System.IO.Path]::GetFileName($asset.name)
  if ([string]::IsNullOrWhiteSpace($assetFileName) -or $assetFileName.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0) {
    Write-Info "Release asset has an invalid file name: $($asset.name)"
    exit 0
  }

  Write-Info "Asset: $assetFileName"

  Set-Step 'creating temporary update paths'
  $archivePath = Join-Path $tempRoot $assetFileName
  $extractPath = Join-Path $tempRoot 'extract'

  New-Item -ItemType Directory -Path $tempRoot, $extractPath | Out-Null

  try {
    Set-Step "downloading release asset '$assetFileName'"
    Write-Info "Downloading $($asset.name) from $($release.tag_name)..."
    $downloadHeaders = $headers.Clone()
    $downloadHeaders.Accept = 'application/octet-stream'
    Invoke-WebRequest -Uri $asset.url -Headers $downloadHeaders -OutFile $archivePath

    Set-Step "extracting archive '$archivePath'"
    Write-Info 'Applying update...'
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath -Force

    Set-Step "detecting update payload in '$extractPath'"
    $payloadDir = $extractPath
    $children = Get-ChildItem -LiteralPath $extractPath -Force
    if ($children.Count -eq 1 -and $children[0].PSIsContainer) {
      $payloadDir = $children[0].FullName
    }

    Copy-UpdateFiles $payloadDir $resolvedAppDir
    Set-Step "writing version '$latestVersion'"
    Set-Content -LiteralPath $versionPath -Value $latestVersion -Encoding UTF8
    Write-Info "Updated to $latestVersion."
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
} catch {
  Write-Info (Format-Exception $_)
  exit 0
}
