$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')

$nodeExe = Join-Path $env:LOCALAPPDATA 'Programs\AmiraASTAR-Node24\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw 'The AmiraASTAR Node.js 24 runtime is missing. Install it before resetting the admin password.'
}
$nodeVersion = (& $nodeExe -p "process.versions.node").Trim()
if (-not $nodeVersion.StartsWith('24.')) { throw "Node.js 24.x is required. Found $nodeVersion." }

$listener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
if ($listener) { throw 'Stop the AmiraASTAR server on port 8000, then run this reset script again.' }

& $nodeExe (Join-Path $PSScriptRoot 'reset-local-admin-password.cjs') amiraadmin
if ($LASTEXITCODE -ne 0) { throw 'Admin password reset did not complete. The server was not started.' }

Write-Host ''
Write-Host 'Starting AmiraASTAR. Keep this window open, sign in with the temporary password above, then choose your new password.'
& $nodeExe (Join-Path (Get-Location) 'server.cjs')
