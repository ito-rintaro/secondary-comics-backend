# 指定した環境(dev/prod)にデプロイする。
# 使い方: .\scripts\deploy.ps1 dev   /   .\scripts\deploy.ps1 prod
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("dev", "prod")]
  [string]$Environment
)

$ErrorActionPreference = "Stop"
$tfDir = Join-Path $PSScriptRoot "..\terraform"

Write-Host "=== [$Environment] terraform init ===" -ForegroundColor Cyan
terraform -chdir="$tfDir" init -input=false

Write-Host "=== [$Environment] select workspace (create if missing) ===" -ForegroundColor Cyan
terraform -chdir="$tfDir" workspace select -or-create $Environment

Write-Host "=== [$Environment] apply ===" -ForegroundColor Cyan
terraform -chdir="$tfDir" apply -auto-approve

Write-Host "=== [$Environment] deploy complete ===" -ForegroundColor Green
