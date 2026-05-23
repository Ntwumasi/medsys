# migrate-to-nssm.ps1
#
# Replace Orthanc's broken OrthancService.exe wrapper with NSSM. NSSM is
# a tiny single-binary service manager that wraps any exe as a Windows
# service. The Orthanc project itself recommends it when the bundled
# wrapper misbehaves.
#
# What this does:
#   1. Downloads NSSM if not already present
#   2. Stops the existing Orthanc service
#   3. Deletes the existing service registration
#   4. Registers a new "Orthanc" service that runs Orthanc.exe directly
#      with the production config, captures stdout/stderr to log files,
#      auto-starts on boot
#   5. Starts the new service and waits for it to reach Running
#
# Idempotent: safe to re-run. The old service registration is cleanly
# replaced; logs roll over instead of accumulating.

$ErrorActionPreference = 'Stop'

$NssmUrl    = 'https://nssm.cc/release/nssm-2.24.zip'
$NssmZip    = 'C:\nssm.zip'
$NssmDir    = 'C:\nssm'
$NssmExe    = "$NssmDir\nssm-2.24\win64\nssm.exe"
$LogDir     = 'C:\OrthancLogs'
$ConfigPath = 'C:\Program Files\Orthanc Server\Configuration\orthanc.json'
$OrthancExe = 'C:\Program Files\Orthanc Server\Orthanc.exe'
$OrthancDir = 'C:\Program Files\Orthanc Server'

# ------------------ 1. Get NSSM ------------------
if (-not (Test-Path $NssmExe)) {
    Write-Host "Downloading NSSM..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $NssmUrl -OutFile $NssmZip -UseBasicParsing
    Expand-Archive -Path $NssmZip -DestinationPath $NssmDir -Force
    Remove-Item $NssmZip -Force
    Write-Host "NSSM ready at: $NssmExe" -ForegroundColor Green
} else {
    Write-Host "NSSM already present at: $NssmExe" -ForegroundColor Yellow
}

# ------------------ 2. Log dir ------------------
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "Created log dir: $LogDir" -ForegroundColor Green
}

# ------------------ 3. Tear down old service ------------------
Write-Host ""
Write-Host "Stopping + removing the broken Orthanc service registration..." -ForegroundColor Cyan
& sc.exe stop Orthanc 2>&1 | Out-Null
Start-Sleep -Seconds 5
Get-Process Orthanc, OrthancService -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Reset failure counter so SCM isn't holding state about the old wrapper
& sc.exe failure Orthanc reset= 0 actions= '' 2>&1 | Out-Null

& sc.exe delete Orthanc 2>&1 | Out-Null
Start-Sleep -Seconds 3

# Confirm gone
$svc = Get-Service Orthanc -ErrorAction SilentlyContinue
if ($svc) {
    throw "Old Orthanc service still registered. Reboot may be required before re-running this script."
}
Write-Host "Old service removed cleanly." -ForegroundColor Green

# ------------------ 4. Install NSSM-managed service ------------------
Write-Host ""
Write-Host "Installing new Orthanc service via NSSM..." -ForegroundColor Cyan

& $NssmExe install Orthanc $OrthancExe
& $NssmExe set     Orthanc AppParameters    "`"$ConfigPath`""
& $NssmExe set     Orthanc AppDirectory     $OrthancDir
& $NssmExe set     Orthanc DisplayName      'Orthanc'
& $NssmExe set     Orthanc Description      'Orthanc DICOM server (managed by NSSM)'
& $NssmExe set     Orthanc Start            SERVICE_AUTO_START
& $NssmExe set     Orthanc ObjectName       LocalSystem

# Capture stdout / stderr — invaluable for debugging
& $NssmExe set     Orthanc AppStdout        "$LogDir\stdout.log"
& $NssmExe set     Orthanc AppStderr        "$LogDir\stderr.log"

# Rotate logs at 10 MB
& $NssmExe set     Orthanc AppRotateFiles   1
& $NssmExe set     Orthanc AppRotateOnline  1
& $NssmExe set     Orthanc AppRotateBytes   10485760

# On exit, restart with 30s delay; throttle after repeated failures so we
# don't burn CPU in a tight crash loop
& $NssmExe set     Orthanc AppExit          Default Restart
& $NssmExe set     Orthanc AppRestartDelay  30000
& $NssmExe set     Orthanc AppThrottle      60000

# Give it 5 min to come up (matches our SCM-timeout bump)
& $NssmExe set     Orthanc AppStopMethodConsole 1500
& $NssmExe set     Orthanc AppStopMethodWindow  1500
& $NssmExe set     Orthanc AppStopMethodThreads 5000

Write-Host "Service installed." -ForegroundColor Green

# ------------------ 5. Start + verify ------------------
Write-Host ""
Write-Host "Starting Orthanc..." -ForegroundColor Cyan
Start-Service Orthanc

# Poll up to 2 min for Running
$start = Get-Date
$running = $false
while (((Get-Date) - $start).TotalSeconds -lt 120) {
    Start-Sleep -Seconds 10
    $svc = Get-Service Orthanc
    $proc = Get-Process Orthanc -ErrorAction SilentlyContinue
    $procInfo = if ($proc) { "PID $($proc.Id)" } else { 'no process yet' }
    Write-Host ("  t+{0,3:N0}s  service={1}  {2}" -f ((Get-Date) - $start).TotalSeconds, $svc.Status, $procInfo)
    if ($svc.Status -eq 'Running' -and $proc) {
        $running = $true
        break
    }
}

Write-Host ""
if ($running) {
    Write-Host "=== Orthanc service is RUNNING under NSSM ===" -ForegroundColor Green
    Write-Host "Logs: $LogDir\stdout.log + $LogDir\stderr.log" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Verifying worklists endpoint..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5  # let HTTP listener fully bind
    curl.exe -i -u medsys:MedsysUser http://localhost:8042/plugins/worklists
} else {
    Write-Host "Service did NOT reach Running within 2 min" -ForegroundColor Red
    Write-Host "Check the captured logs for the real reason:" -ForegroundColor Yellow
    Write-Host "  Get-Content $LogDir\stderr.log -Tail 50"
    exit 1
}
