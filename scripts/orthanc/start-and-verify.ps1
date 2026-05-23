# start-and-verify.ps1
#
# Cleanly start the Orthanc service, wait long enough for plugin load to
# complete (slow on the T150's CPU), confirm it ends up Running, then
# verify the worklists endpoint is responding. Use when you think things
# should work and want to confirm.
#
# Requires:
#   - Worklists block already in orthanc.json
#   - ServicesPipeTimeout already bumped (registry, applied after reboot)
#   - Unused plugins already trimmed for faster startup

param(
    [string]$User     = 'medsys',
    [string]$Password = 'MedsysUser',
    [int]$TimeoutSec  = 120
)

$ErrorActionPreference = 'Stop'

Write-Host "=== Stopping any lingering Orthanc ===" -ForegroundColor Cyan
Stop-Service Orthanc -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 8
Get-Process Orthanc -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=== Starting service ===" -ForegroundColor Cyan
Start-Service Orthanc
$start = Get-Date

# Poll until Running, up to $TimeoutSec
$running = $false
while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
    $svc = Get-Service Orthanc
    $proc = Get-Process Orthanc -ErrorAction SilentlyContinue
    $procInfo = if ($proc) { "PID $($proc.Id)" } else { 'no process' }
    Write-Host ("  t+{0,3:N0}s  service={1}  {2}" -f ((Get-Date) - $start).TotalSeconds, $svc.Status, $procInfo)

    if ($svc.Status -eq 'Running') {
        $running = $true
        break
    }
    Start-Sleep -Seconds 10
}

if (-not $running) {
    Write-Host ""
    Write-Host "Service did NOT reach Running within ${TimeoutSec}s" -ForegroundColor Red
    Write-Host "Run diagnose-startup.ps1 to capture the actual error from Orthanc." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== Verifying worklists endpoint ===" -ForegroundColor Cyan
$response = curl.exe -i -u "${User}:${Password}" http://localhost:8042/plugins/worklists 2>&1
$response | ForEach-Object { Write-Host $_ }

if ($response -match 'HTTP/1\.\d 200') {
    Write-Host ""
    Write-Host "=== ALL GOOD ===" -ForegroundColor Green
    Write-Host "Orthanc is Running, worklists plugin responding." -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "Service is Running but worklists endpoint did not return 200." -ForegroundColor Yellow
    exit 1
}
