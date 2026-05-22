# Orthanc / On-Prem PACS Deployment Runbook

Step-by-step for setting up the on-site Orthanc PACS at MEDICS CLINIC (or any future clinic deployment). Tested 2026-05-22/23 during the Ghana go-live trip.

Companion doc: [`equipment-inventory.md`](./equipment-inventory.md) — the IPs / AE titles / network details this runbook depends on.

---

## Prerequisites

- Orthanc server on the clinic LAN (verified at `192.168.1.10`)
- Admin access to the router
- Laptop on the same LAN for verification
- DICOM modalities (Siemens Redwood, Luminos) physically reachable on the LAN

---

## State at the start of this runbook (what's already done)

- ✅ Orthanc service installed and running at `192.168.1.10`
- ✅ DICOM port `4242` listening; REST port `8042` listening
- ✅ AE Title set to `MEDSYS_PACS`
- ✅ REST API authentication enabled (user `medsys`, password kept off-system)
- ✅ Firewall rules: DICOM open to LAN, HTTP open to localhost only
- ✅ Plugins loaded include `orthanc-worklists`, `dicom-web`, `ohif`, `stone-webviewer`
- ✅ `DicomAlwaysAllowFindWorklist: true` (modalities can query worklist)
- ❌ `Worklists` plugin block missing from `orthanc.json` — runbook step 1 fixes this
- ❌ Modality network reservations not yet pinned in router DHCP
- ❌ Modality DICOM config not yet validated end-to-end
- ❌ Luminos dRF X-ray location/IP unknown

---

## Step 1 — Configure worklists plugin (5 min)

Plugin is loaded but has no config block. Adds a directory the plugin watches for `.wl` files.

Save the script below as `D:\scripts\04-configure-worklists.ps1`, then run it.

```powershell
# D:\scripts\04-configure-worklists.ps1
# Configure the orthanc-worklists plugin so modalities can pull patient
# schedules. Idempotent.

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
Write-Host "Done. Worklists directory: $WorklistDir" -ForegroundColor Green
```

```powershell
powershell -ExecutionPolicy Bypass -File D:\scripts\04-configure-worklists.ps1
curl.exe -i -u medsys:<password> http://localhost:8042/plugins/worklists
```

**Done when:** `/plugins/worklists` returns `200 OK` with a non-empty body.

---

## Step 2 — Network hygiene (15-20 min)

Pin device IPs so reboots don't break the integration.

| Device | MAC | Reserve to |
|---|---|---|
| Siemens Redwood | `00:13:95:38:3D:9C` | `192.168.1.87` |
| Wondfo Finecare | capture from device → Communications | `192.168.1.104` |
| Abbott AFINION 2 | verify static; defend `.105` from other claims | `192.168.1.105` |

Glance at the router's DHCP lease table for anything else on the LAN you haven't catalogued.

**Done when:** reservations are in the router and devices still ping at their addresses.

---

## Step 3 — Lock down Redwood DICOM config (15-20 min)

On the Redwood ultrasound: **System Configuration → Connectivity & Network → DICOM Configuration**

1. **Storage Server tab** — exactly one entry: `MEDSYS_PACS @ 192.168.1.10:4242`. Delete any stragglers (resolves the `.87` anomaly seen during initial config).
2. **Worklist Server tab** — same single entry.
3. **Local AE tab** — confirm `REDWOOD_US`.
4. **Echo** test on Storage + Worklist tabs.

**Done when:** both Echo tests pass; one server entry per tab.

---

## Step 4 — Find and configure Luminos dRF (30-60 min)

1. Confirm it's on site.
2. Capture IP + MAC from System Configuration → Network. Update `equipment-inventory.md`.
3. DHCP reservation for its MAC.
4. Mirror Redwood config:
   - Local AE: `LUMINOS_DRF`
   - Storage Server: `MEDSYS_PACS @ 192.168.1.10:4242`
   - Worklist Server: same
5. **Echo** on both tabs.

**Done when:** both Echo tests pass.

---

## Step 5 — C-STORE round-trip test (10-15 min)

Confirm a modality can push images all the way to Orthanc.

1. On the Redwood: acquire a quick phantom/air scan.
2. Save → auto-pushes to `MEDSYS_PACS`.
3. From the Orthanc server (HTTP is localhost-only):
   ```powershell
   curl.exe -u medsys:<password> http://localhost:8042/studies
   ```
   New study should appear.
4. Visually confirm in Orthanc Explorer: `http://localhost:8042` in a browser on the server.

**Done when:** image taken on Redwood appears in Orthanc's studies list. Repeat for Luminos if present.

---

## Step 6 — Worklist sanity test (10 min)

Without MedSys → Orthanc integration yet, we can't populate the worklist with real orders. But we can prove the plugin is alive.

1. On the Redwood: open **Worklist** → Query/Refresh.
2. Should return zero patients **without error**.

**Done when:** zero-result response (not a connection error).

---

## Step 7 — Document lab analyzer surfaces (15-20 min, exploratory)

Don't integrate today — just learn.

1. **AFINION 2** — browse from laptop to `http://192.168.1.105` (or `http://AF20056149`). Note auth, endpoints, confirmed port.
2. **Wondfo Finecare Plus** — on the device, navigate to LIS / HL7 / Communications / Network. Note protocols offered and config fields.

**Done when:** `equipment-inventory.md` has confirmed ports + protocol list.

---

## Step 8 — Commit doc updates (5-10 min)

In `docs/equipment-inventory.md`:
- Luminos IP + MAC
- AFINION confirmed port
- Wondfo supported protocols
- Mark resolved questions as done
- Note Orthanc REST user `medsys` (password lives in pwd manager, not docs)
- Note HTTP 8042 is localhost-only (relevant for future MedSys ↔ Orthanc integration)

Commit + push.

---

## What this runbook does NOT cover (post-go-live)

- **Modality registration** in Orthanc's `DicomModalities` block — not required for C-STORE (modality → Orthanc); needed later for C-MOVE / C-GET (Orthanc routing images).
- **MedSys → Orthanc worklist push** — writing `.wl` files into `C:\OrthancWorklists` whenever a doctor orders imaging. Needs a small server-side service since Vercel can't reach the on-prem network. See architecture doc.
- **Orthanc → MedSys result webhook** — Python plugin posts to MedSys API when a study lands. Same caveat.
- **OHIF viewer embedding** — the plugin is loaded; we still need to wire a `<iframe>` or deep link from MedSys's imaging order detail.
- **Backups** — Orthanc DB + storage backup schedule. Discuss with the architecture doc.

---

## Recovery / troubleshooting

- **Orthanc won't start after a config change:** the configure scripts (`02-`, `04-`) back up `orthanc.json` to a timestamped `.bak-YYYYMMDD-HHMMSS` file before writing. Restore the latest backup, restart the service.
- **Modality Echo fails:** check `DicomCheckCalledAet` in `orthanc.json` — it's currently `false` (permissive). If you ever tighten it, ensure the modality's "Called AET" matches `MEDSYS_PACS` exactly.
- **HTTP 8042 unreachable from LAN:** by design — firewall rule `MedSys-Orthanc-HTTP-Local` blocks it. RDP to the server or open a temporary hole for the MedSys backend IP when integration ships.
- **Worklist plugin not responding:** check `C:\OrthancWorklists` exists and is readable by the Orthanc service account.
