# One-shot backup setup for THIS machine.
# Run once after cloning the repo on a new computer:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-backup.ps1
# Installs: (1) git post-commit hook -> ZIP snapshot on every commit
#           (2) Windows scheduled task -> daily data backup at 03:00
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
Write-Output "Repo root: $root"

# (1) post-commit hook (portable: resolves repo root via git at run time)
$hookDir = Join-Path $root '.git\hooks'
if (Test-Path $hookDir) {
  $hook = Join-Path $hookDir 'post-commit'
  $body = "#!/bin/sh`n# Auto ZIP backup on every commit`nROOT=`"`$(git rev-parse --show-toplevel)`"`npowershell -NoProfile -ExecutionPolicy Bypass -File `"`$ROOT/backup.ps1`" >/dev/null 2>&1`nexit 0`n"
  [System.IO.File]::WriteAllText($hook, $body, (New-Object System.Text.UTF8Encoding($false)))
  Write-Output "[ok] post-commit hook installed -> $hook"
} else {
  Write-Output "[skip] .git/hooks 없음 (git 저장소가 아닌 위치?)"
}

# (2) daily scheduled task
try {
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\daily-data-backup.ps1`""
  $trigger = New-ScheduledTaskTrigger -Daily -At 3am
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName 'Garibong2 Daily Data Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Garibong2 homepage data daily backup' -Force -ErrorAction Stop | Out-Null
  $next = (Get-ScheduledTaskInfo -TaskName 'Garibong2 Daily Data Backup').NextRunTime
  Write-Output "[ok] scheduled task registered (next run: $next)"
} catch {
  Write-Output "[warn] scheduled task 등록 실패: $($_.Exception.Message)"
}

# (3) first backup now
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'backup.ps1')
Write-Output "=== setup done ==="
Write-Output "감사로그 백업을 원하면 backups\.worker_pw.txt 에 슈퍼 관리자 비밀번호 한 줄을 넣으세요."
