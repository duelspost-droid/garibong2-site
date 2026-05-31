# Garibong2 site backup script
# Saves a timestamped ZIP of the whole project (source/images/content) into backups\.
# Excludes the .git folder and backups folder itself (.git already keeps full history).
$ErrorActionPreference = 'Stop'
# 스크립트 위치 = 저장소 루트 (어느 컴퓨터에서 클론해도 자동 인식)
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
$bdir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force $bdir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$zip   = Join-Path $bdir "garibong2_$stamp.zip"

# Compress top-level items except .git and backups
$items = Get-ChildItem -Path $root -Force | Where-Object { $_.Name -ne '.git' -and $_.Name -ne 'backups' }
Compress-Archive -Path $items.FullName -DestinationPath $zip -Force

# Keep only the latest 50 ZIPs (auto-clean older)
Get-ChildItem $bdir -Filter '*.zip' | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 50 | Remove-Item -Force -ErrorAction SilentlyContinue

$kb = [math]::Round((Get-Item $zip).Length / 1KB)
$cnt = (Get-ChildItem $bdir -Filter '*.zip').Count
Write-Output "[backup done] $zip  (${kb} KB)"
Write-Output "[kept] $cnt zip(s)"
