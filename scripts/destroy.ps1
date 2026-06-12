# 指定した環境(dev/prod)のリソースを削除する。
# 使い方: .\scripts\destroy.ps1 dev   /   .\scripts\destroy.ps1 prod
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("dev", "prod")]
  [string]$Environment
)

$ErrorActionPreference = "Stop"
$tfDir = Join-Path $PSScriptRoot "..\terraform"

Write-Host "=== [$Environment] select workspace ===" -ForegroundColor Cyan
terraform -chdir="$tfDir" workspace select $Environment

Write-Host "=== [$Environment] destroy ===" -ForegroundColor Yellow
terraform -chdir="$tfDir" destroy -auto-approve

Write-Host "=== [$Environment] destroy complete ===" -ForegroundColor Green
