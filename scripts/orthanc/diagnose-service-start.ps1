# diagnose-service-start.ps1
#
# Use when the Orthanc service won't stay Running but no obvious error
# surfaces. Tries to start via sc.exe (sync error), watches process
# activity, pulls SCM events from the System log (not Application), and
# confirms the binaries exist where the service config says they should.

Write-Host ""
Write-Host "=== sc.exe start Orthanc (synchronous error code) ===" -ForegroundColor Cyan
sc.exe start Orthanc

Write-Host ""
Write-Host "=== Service + process state (every 20s, for 60s) ===" -ForegroundColor Cyan
foreach ($i in 1..3) {
    Start-Sleep -Seconds 20
    $svc  = Get-Service Orthanc
    $proc = Get-Process Orthanc, OrthancService -ErrorAction SilentlyContinue
    $procInfo = if ($proc) { ($proc | ForEach-Object { "$($_.Name) PID $($_.Id)" }) -join ', ' } else { 'NONE' }
    Write-Host ("  t+{0,3:N0}s  service={1}  processes={2}" -f ($i * 20), $svc.Status, $procInfo)
}

Write-Host ""
Write-Host "=== System log: Service Control Manager + Orthanc (last 15 min) ===" -ForegroundColor Cyan
Get-EventLog -LogName System -Newest 200 -ErrorAction SilentlyContinue |
  Where-Object { $_.TimeGenerated -gt (Get-Date).AddMinutes(-15) -and
                ($_.Source -eq 'Service Control Manager' -or $_.Message -like '*Orthanc*') } |
  Format-List TimeGenerated, EntryType, Source, EventID, Message

Write-Host ""
Write-Host "=== Application log: errors mentioning Orthanc (last 15 min) ===" -ForegroundColor Cyan
Get-EventLog -LogName Application -Newest 100 -ErrorAction SilentlyContinue |
  Where-Object { $_.TimeGenerated -gt (Get-Date).AddMinutes(-15) -and
                ($_.Message -like '*Orthanc*' -or $_.Source -like '*Orthanc*') } |
  Format-List TimeGenerated, EntryType, Source, EventID, Message

Write-Host ""
Write-Host "=== Binary + config existence ===" -ForegroundColor Cyan
@(
    'C:\Program Files\Orthanc Server\OrthancService.exe',
    'C:\Program Files\Orthanc Server\Orthanc.exe',
    'C:\Program Files\Orthanc Server\Configuration\orthanc.json'
) | ForEach-Object {
    $exists = Test-Path $_
    $marker = if ($exists) { 'OK ' } else { 'MISSING' }
    Write-Host "  $marker  $_"
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
