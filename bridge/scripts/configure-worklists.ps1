$ErrorActionPreference = 'Stop'

$ConfigPath  = 'C:\Program Files\Orthanc Server\Configuration\orthanc.json'
$WorklistDir = 'C:\OrthancWorklists'

if (-not (Test-Path $WorklistDir)) {
    New-Item -ItemType Directory -Path $WorklistDir -Force | Out-Null
    Write-Host "Created worklist directory: $WorklistDir" -ForegroundColor Green
} else {
    Write-Host "Worklist directory already exists: $WorklistDir"
}

$content = Get-Content -Raw -Path $ConfigPath

if ($content -match '"Worklists"\s*:') {
    Write-Host "Worklists block already present - nothing to do." -ForegroundColor Yellow
    exit 0
}

$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$ConfigPath.bak-$stamp"
Copy-Item $ConfigPath $backup -Force

$block = @"
    "Worklists" : {
        "Enable": true,
        "Database": "C:\\OrthancWorklists",
        "FilterIssuerAet": false,
        "LimitAnswers": 0
    },
"@

$idx = $content.IndexOf('{')
if ($idx -lt 0) { throw "Could not find opening brace in orthanc.json" }
$updated = $content.Substring(0, $idx + 1) + "`r`n" + $block + $content.Substring($idx + 1)

Set-Content -Path $ConfigPath -Value $updated -Encoding UTF8
Restart-Service Orthanc
Start-Sleep -Seconds 2

if ((Get-Service Orthanc).Status -ne 'Running') {
    Copy-Item $backup $ConfigPath -Force
    Restart-Service Orthanc
    throw "Orthanc failed to restart - rolled back config"
}
Write-Host "Done. Worklist directory: $WorklistDir" -ForegroundColor Green
