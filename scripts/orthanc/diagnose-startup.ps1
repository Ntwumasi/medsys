# diagnose-startup.ps1
#
# Runs Orthanc in foreground long enough for full plugin load (~90s on the
# T150's Pentium Gold) and dumps the final 50 stderr lines + exit code.
# Use when the service won't stay running and you need to see what's
# actually going wrong.
#
# Copies the config to a no-spaces path first because PowerShell's
# Start-Process splits path-with-spaces into multiple arguments and
# Orthanc rejects that with "More than one configuration path were
# provided on the command line".

$ErrorActionPreference = 'Stop'

$ConfigPath = 'C:\Program Files\Orthanc Server\Configuration\orthanc.json'
$TmpConfig  = 'C:\OrthancWorklists\orthanc-test.json'
$LogStderr  = "$env:TEMP\orthanc-test.log"
$LogStdout  = "$env:TEMP\orthanc-out.log"

Write-Host "=== Cleaning up any lingering Orthanc processes ===" -ForegroundColor Cyan
Stop-Service Orthanc -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5
Get-Process Orthanc -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Make sure tmp directory exists for the no-spaces config copy
if (-not (Test-Path 'C:\OrthancWorklists')) {
    New-Item -ItemType Directory -Path 'C:\OrthancWorklists' -Force | Out-Null
}
Copy-Item $ConfigPath $TmpConfig -Force

Write-Host ""
Write-Host "=== Starting Orthanc in foreground (90s timeout) ===" -ForegroundColor Cyan
$start = Get-Date
$proc = Start-Process -FilePath 'C:\Program Files\Orthanc Server\Orthanc.exe' `
    -ArgumentList '--verbose', $TmpConfig `
    -NoNewWindow -RedirectStandardError $LogStderr -RedirectStandardOutput $LogStdout -PassThru

$proc.WaitForExit(90000) | Out-Null
$elapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)

if (-not $proc.HasExited) {
    Write-Host "Orthanc startup OK - still running after ${elapsed}s. Killing for cleanup." -ForegroundColor Green
    $proc.Kill()
    $proc.WaitForExit(5000) | Out-Null
} else {
    Write-Host "Orthanc EXITED after ${elapsed}s with code: $($proc.ExitCode)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Last 50 STDERR lines ===" -ForegroundColor Cyan
Get-Content $LogStderr -ErrorAction SilentlyContinue | Select-Object -Last 50

Write-Host ""
Write-Host "=== Last 20 STDOUT lines ===" -ForegroundColor Cyan
Get-Content $LogStdout -ErrorAction SilentlyContinue | Select-Object -Last 20
