# Orthanc on-prem scripts

PowerShell scripts for setting up and diagnosing the Orthanc PACS on a clinic Windows server.

## Usage (from the server)

Fetch and run any script directly from GitHub:

```powershell
$url = 'https://raw.githubusercontent.com/Ntwumasi/medsys/main/scripts/orthanc'
iwr "$url/diagnose-startup.ps1" -OutFile D:\scripts\diagnose-startup.ps1
powershell -ExecutionPolicy Bypass -File D:\scripts\diagnose-startup.ps1
```

Replace `diagnose-startup.ps1` with whichever script you need.

## Scripts in this folder

| Script | Purpose |
|---|---|
| `diagnose-startup.ps1` | Run Orthanc in foreground for 90s, dump the last 50 log lines + exit code. Use when the service won't start and you need the real error. |
| `start-and-verify.ps1` | Clean stop, start the service, wait, verify it's Running, hit the worklists endpoint. |

## Convention

- All scripts are idempotent (safe to re-run)
- All destructive changes are backed up first (e.g. `orthanc.json.bak-YYYYMMDD-HHMMSS`)
- Scripts exit 0 on success, non-zero on failure
- Comments explain WHY each step exists, not WHAT it does
