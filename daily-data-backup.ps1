# Garibong2 DAILY DATA backup
# Backs up the live "database" the website depends on:
#   - content.json / notices.json   (from GitHub raw - canonical, reflects admin edits)
#   - visit counters                (Abacus public API -> appended to visits.csv)
#   - audit log + staff perms        (Cloudflare Worker KV - ONLY if admin pw file exists)
# All output goes to backups\data\ which is gitignored (never pushed - audit log has IPs).
$ErrorActionPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root    = 'C:\Users\duels\Desktop\garibong2-site'
$dataDir = Join-Path $root 'backups\data'
New-Item -ItemType Directory -Force $dataDir | Out-Null

$today  = Get-Date -Format 'yyyyMMdd'
$dayDir = Join-Path $dataDir $today
New-Item -ItemType Directory -Force $dayDir | Out-Null

$RAW    = 'https://raw.githubusercontent.com/duelspost-droid/garibong2-site/master'
$WORKER = 'https://garibong2-audit.duels.workers.dev'
$ABACUS = 'https://abacus.jasoncameron.dev/get/garibong2-9x7k2p'

Write-Output "=== Garibong2 daily data backup : $today ==="

# 1) content.json / notices.json (canonical from GitHub)
foreach ($f in @('content.json','notices.json')) {
  try { Invoke-WebRequest "$RAW/$f" -OutFile (Join-Path $dayDir $f) -UseBasicParsing; Write-Output "  [ok] $f" }
  catch { Write-Output "  [skip] $f ($($_.Exception.Message))" }
}

# 2) Visit counters -> append to visits.csv (builds a daily time series)
$total = ''; $dayCnt = ''
try { $total  = (Invoke-RestMethod "$ABACUS/total").value } catch {}
try { $dayCnt = (Invoke-RestMethod "$ABACUS/d$today").value } catch {}
$csv = Join-Path $dataDir 'visits.csv'
if (-not (Test-Path $csv)) { 'date,total,today' | Out-File $csv -Encoding utf8 }
"$today,$total,$dayCnt" | Out-File $csv -Append -Encoding utf8
Write-Output "  [ok] visits.csv (total=$total today=$dayCnt)"

# 3) Audit log + perms (sensitive) - only if admin password file present
$pwFile = Join-Path $root 'backups\.worker_pw.txt'
if (Test-Path $pwFile) {
  $pw = (Get-Content $pwFile -Raw).Trim()
  $h  = @{ 'X-Admin-Pw' = $pw }
  try { Invoke-WebRequest "$WORKER/api/audit" -Headers $h -OutFile (Join-Path $dayDir 'audit_log.json') -UseBasicParsing; Write-Output "  [ok] audit_log.json" }
  catch { Write-Output "  [skip] audit_log.json ($($_.Exception.Message))" }
  try { Invoke-WebRequest "$WORKER/api/perms" -Headers $h -OutFile (Join-Path $dayDir 'perms.json') -UseBasicParsing; Write-Output "  [ok] perms.json" }
  catch { Write-Output "  [skip] perms.json ($($_.Exception.Message))" }
} else {
  Write-Output "  [info] backups\.worker_pw.txt 없음 -> 감사로그/권한 백업 건너뜀"
  Write-Output "         (이 파일에 슈퍼 관리자 비밀번호 한 줄을 넣으면 감사로그도 백업됩니다)"
}

# 4) Keep only the latest 60 day-folders
Get-ChildItem $dataDir -Directory | Sort-Object Name -Descending |
  Select-Object -Skip 60 | Remove-Item -Recurse -Force

Write-Output "=== done -> $dayDir ==="
