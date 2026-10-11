# Deploy all Haven & Co. Edge Functions (skips _shared).
# Prerequisites: supabase CLI logged in and project linked (`supabase link`).
# Usage (from repo root or this folder):
#   .\supabase\deploy_functions.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$FunctionsRoot = Join-Path $ScriptDir 'functions'

if (-not (Test-Path $FunctionsRoot)) {
  Write-Error "Functions folder not found: $FunctionsRoot"
}

$dirs = Get-ChildItem -Path $FunctionsRoot -Directory |
  Where-Object { -not $_.Name.StartsWith('_') } |
  Sort-Object Name

if ($dirs.Count -eq 0) {
  Write-Error "No Edge Function directories found under $FunctionsRoot"
}

Write-Host "Deploying $($dirs.Count) function(s) from $FunctionsRoot"
Write-Host ""

foreach ($dir in $dirs) {
  $name = $dir.Name
  Write-Host "==> supabase functions deploy $name" -ForegroundColor Cyan
  & supabase functions deploy $name
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Deploy failed for '$name' (exit $LASTEXITCODE). Stopping."
  }
  Write-Host "OK: $name" -ForegroundColor Green
  Write-Host ""
}

Write-Host "All Edge Functions deployed." -ForegroundColor Green
