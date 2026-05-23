# migrate-to-winsw.ps1
#
# Replace the crashing OrthancService.exe wrapper with WinSW (a tiny
# single-binary Windows-service wrapper, hosted on GitHub so it's not
# subject to nssm.cc outages). We've already proven Orthanc.exe runs
# fine in foreground with the production config; this just swaps the
# launcher.
#
# What it does:
#   1. Downloads WinSW-x64.exe from GitHub releases
#   2. Writes a config XML next to it
#   3. Stops and deletes the existing Orthanc service registration
#   4. Registers the new service via "WinSW install"
#   5. Starts and waits up to 3 min for Running
#   6. Verifies the worklists endpoint

$ErrorActionPreference = 'Stop'

$WinSWUrl    = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
$ServiceDir  = 'C:\OrthancService'
$WinSWExe    = "$ServiceDir\OrthancWrapper.exe"
$WinSWConfig = "$ServiceDir\OrthancWrapper.xml"
$LogDir      = 'C:\OrthancLogs'
$ConfigPath  = 'C:\Program Files\Orthanc Server\Configuration\orthanc.json'
$OrthancExe  = 'C:\Program Files\Orthanc Server\Orthanc.exe'
$OrthancDir  = 'C:\Program Files\Orthanc Server'

# ------------------ 1. Get WinSW ------------------
if (-not (Test-Path $ServiceDir)) {
    New-Item -ItemType Directory -Path $ServiceDir -Force | Out-Null
}
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

if (-not (Test-Path $WinSWExe)) {
    Write-Host "Downloading WinSW from GitHub..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $WinSWUrl -OutFile $WinSWExe -UseBasicParsing
    Write-Host "WinSW ready at: $WinSWExe" -ForegroundColor Green
} else {
    Write-Host "WinSW already present: $WinSWExe" -ForegroundColor Yellow
}

# ------------------ 2. Write service config XML ------------------
# Convention: WinSW reads <wrapper-exe-name-without-.exe>.xml from same folder.
# OnFailure: restart with 30s delay. Log rotation at 10 MB.
$xml = @"
<service>
  <id>Orthanc</id>
  <name>Orthanc</name>
  <description>Orthanc DICOM server (managed by WinSW)</description>
  <executable>$OrthancExe</executable>
  <arguments>--verbose &quot;$ConfigPath&quot;</arguments>
  <workingdirectory>$OrthancDir</workingdirectory>
  <logpath>$LogDir</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>5</keepFiles>
  </log>
  <onfailure action="restart" delay="30 sec"/>
  <startmode>Automatic</startmode>
  <stoptimeout>30 sec</stoptimeout>
</service>
"@
Set-Content -Path $WinSWConfig -Value $xml -Encoding UTF8
Write-Host "Config written: $WinSWConfig" -ForegroundColor Green

# ------------------ 3. Tear down old service ------------------
Write-Host ""
Write-Host "Removing broken Orthanc service registration..." -ForegroundColor Cyan
& sc.exe stop Orthanc 2>&1 | Out-Null
Start-Sleep -Seconds 5
Get-Process Orthanc, OrthancService -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
& sc.exe failure Orthanc reset= 0 actions= '' 2>&1 | Out-Null
& sc.exe delete  Orthanc 2>&1 | Out-Null
Start-Sleep -Seconds 3

$existing = Get-Service Orthanc -ErrorAction SilentlyContinue
if ($existing) {
    throw "Old Orthanc service still registered. Reboot before re-running this script."
}
Write-Host "Old service removed." -ForegroundColor Green

# ------------------ 4. Install via WinSW ------------------
Write-Host ""
Write-Host "Installing Orthanc service via WinSW..." -ForegroundColor Cyan
& $WinSWExe install
Start-Sleep -Seconds 2

$svc = Get-Service Orthanc -ErrorAction SilentlyContinue
if (-not $svc) {
    throw "WinSW install did not register the Orthanc service. Inspect $LogDir for clues."
}
Write-Host "Service registered." -ForegroundColor Green

# ------------------ 5. Start + poll ------------------
Write-Host ""
Write-Host "Starting Orthanc..." -ForegroundColor Cyan
Start-Service Orthanc

$start = Get-Date
$running = $false
while (((Get-Date) - $start).TotalSeconds -lt 180) {
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
    Write-Host "=== Orthanc service is RUNNING under WinSW ===" -ForegroundColor Green
    Write-Host "Logs: $LogDir\OrthancWrapper.out.log + .err.log + .wrapper.log" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Verifying worklists endpoint..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    curl.exe -i -u medsys:MedsysUser http://localhost:8042/plugins/worklists
} else {
    Write-Host "Service did NOT reach Running within 3 min" -ForegroundColor Red
    Write-Host "Check captured logs:" -ForegroundColor Yellow
    Write-Host "  Get-Content $LogDir\OrthancWrapper.err.log -Tail 50"
    Write-Host "  Get-Content $LogDir\OrthancWrapper.wrapper.log -Tail 30"
    exit 1
}
