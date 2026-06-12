# Seed test data into the comics table by writing directly to DynamoDB (no API/auth).
# Targets the table of the currently selected workspace.
# Usage:
#   .\scripts\deploy.ps1 dev        # select/deploy the target env first
#   .\scripts\seed-comics.ps1       # insert test data
#
# NOTE: this script is intentionally ASCII-only. PowerShell 5.1 reads .ps1 files
# as the locale code page (cp932 on JP Windows); non-ASCII bytes in the script
# can corrupt parsing. Japanese test data lives in seed-data/comics.json (UTF-8).
$ErrorActionPreference = "Stop"
$tfDir   = Join-Path $PSScriptRoot "..\terraform"
$srcJson = Join-Path $PSScriptRoot "seed-data\comics.json"

# AWS CLI reads file:// paramfiles using the locale encoding by default; force UTF-8.
$env:AWS_CLI_FILE_ENCODING = "utf-8"

# Resolve the table name (carries the -dev / -prod suffix per workspace).
$table = (terraform -chdir="$tfDir" output -raw table_name).Trim()
Write-Host "Seeding into table: $table" -ForegroundColor Cyan

# Read the UTF-8 JSON as raw text (no PowerShell parsing of the Japanese values),
# substitute the table-name placeholder, write a temp file as UTF-8 (no BOM).
$json = [System.IO.File]::ReadAllText($srcJson).Replace("__TABLE__", $table)
$tmp  = Join-Path $env:TEMP "seed-comics.json"
[System.IO.File]::WriteAllText($tmp, $json, (New-Object System.Text.UTF8Encoding($false)))

# Pipe the aws output (do not let it write straight to the console: when stdout is
# a console the CLI tries to decode the paramfile as cp932 and fails on UTF-8).
$result = aws dynamodb batch-write-item --request-items "file://$tmp" 2>&1 | Out-String
Remove-Item $tmp -ErrorAction SilentlyContinue

if ($result -match '"UnprocessedItems"\s*:\s*\{\s*\}') {
  Write-Host "Done. (all items written)" -ForegroundColor Green
}
else {
  Write-Host $result
  throw "batch-write-item failed"
}
