$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$nodeExe = Join-Path $env:LOCALAPPDATA 'Programs\AmiraASTAR-Node24\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) { throw 'Node.js 24.x is required. Install it, reopen PowerShell, then run this script again.' }
  $nodeExe = $nodeCommand.Source
}
$nodeVersion = (& $nodeExe -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -ne 24) { throw "This project requires Node.js 24.x (package.json pins Node 24). Found Node.js $nodeVersion at $nodeExe." }

if (-not (Test-Path -LiteralPath '.env')) {
  Write-Host 'Create the first AmiraASTAR administrator. These credentials are saved only in the local ignored .env file.'
  do {
    $adminUser = (Read-Host 'Admin username (3-20 letters, numbers, dot or underscore)').Trim().ToLowerInvariant()
    if ($adminUser -notmatch '^[a-z0-9_.]{3,20}$') { Write-Host 'Use 3-20 letters, numbers, dot or underscore.' }
  } while ($adminUser -notmatch '^[a-z0-9_.]{3,20}$')

  do {
    $secure1 = Read-Host 'Admin password (10+ characters, with a letter and number)' -AsSecureString
    $secure2 = Read-Host 'Enter the password again' -AsSecureString
    $ptr1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure1)
    $ptr2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure2)
    try {
      $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr1)
      $confirmPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr2)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr1)
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr2)
    }
    $validPassword = $adminPassword.Length -ge 10 -and $adminPassword.Length -le 128 -and $adminPassword -match '[a-zA-Z]' -and $adminPassword -match '\d' -and $adminPassword -notmatch '[\r\n]' -and -not $adminPassword.Contains('"') -and -not $adminPassword.Contains("'")
    if (-not $validPassword) { Write-Host 'Use 10-128 characters with a letter and a number. Quotes and line breaks are not supported.' }
    elseif ($adminPassword -cne $confirmPassword) { Write-Host 'Passwords did not match.' }
  } while (-not $validPassword -or $adminPassword -cne $confirmPassword)

  $adminName = (Read-Host 'Admin display name (press Enter for AmiraASTAR Admin)').Trim().Replace("`r", ' ').Replace("`n", ' ')
  if (-not $adminName) { $adminName = 'AmiraASTAR Admin' }
  $envText = "ADMIN_USERNAME=$adminUser`r`nADMIN_PASSWORD=$adminPassword`r`nADMIN_NAME=$adminName`r`nHOST=127.0.0.1`r`nPORT=8000`r`n"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $envText, $utf8NoBom)
  $adminPassword = $null
  $confirmPassword = $null
  Write-Host 'Local admin setup saved.'
}

Write-Host 'Starting AmiraASTAR at http://127.0.0.1:8000/ (press Ctrl+C to stop).'
& $nodeExe server.cjs
