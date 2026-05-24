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

## Step 0 — Install Tailscale on MED-DC1 (10 min, one-time)

Without this, you can only RDP/admin the box when physically inside the
clinic LAN. Tailscale gives you a stable encrypted path to it from anywhere
without exposing any port on the public internet.

1. Sign up at https://login.tailscale.com (free tier is fine for this) and
   create a tailnet for the clinic. Use a clinic-owned email so the tailnet
   survives staff turnover.
2. On MED-DC1 (you must be at the console or on the clinic wifi — this is the
   one-time bootstrap):
   ```powershell
   # Download and install Tailscale
   winget install tailscale.tailscale
   # Or download from https://tailscale.com/download/windows
   ```
3. Run `tailscale up` and authenticate in the browser that opens. Approve the
   device in the admin console: https://login.tailscale.com/admin/machines
4. Pin the Tailscale IP (looks like `100.x.y.z`) for the box and tag the
   device `tag:clinic-server` for ACL purposes.
5. Enable **MagicDNS** in the tailnet settings so you can RDP to `med-dc1`
   instead of remembering the IP.
6. Install Tailscale on your laptop too, log into the same tailnet.

**Done when:** from your laptop *outside* the clinic, `ping med-dc1` succeeds
and Microsoft Remote Desktop connects to `med-dc1` (no IP, no VPN).

**Highly recommended:** install Tailscale on a second always-on device at the
clinic (a Raspberry Pi or spare laptop is fine) so you can still reach the
LAN if MED-DC1 ever drops off the tailnet.

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

## Step 9 — Install DCMTK (10 min)

The bridge service uses DCMTK's `dump2dcm.exe` to convert text MWL definitions
into binary `.wl` files that Orthanc's worklist plugin reads.

1. Download the latest DCMTK Windows binary release:
   https://dicom.offis.de/download/dcmtk/dcmtk368/bin/dcmtk-3.6.8-win64-dynamic.zip
2. Extract to `C:\Program Files\DCMTK\`
3. Verify:
   ```powershell
   & 'C:\Program Files\DCMTK\bin\dump2dcm.exe' --version
   ```

**Done when:** `dump2dcm.exe --version` prints version info.

---

## Step 10 — Install Node.js (5 min, if not present)

```powershell
node --version    # should print v18+ or v20+; if not, install
winget install OpenJS.NodeJS.LTS
# Restart PowerShell so PATH picks up node + npm
```

---

## Step 11 — Deploy the bridge service (15 min)

The bridge is a small Node.js process that polls MedSys for imaging orders and
forwards Orthanc study notifications back to MedSys. Lives in `bridge/` in the
MedSys repo.

```powershell
# Clone the MedSys repo somewhere on D:
cd D:\
git clone https://github.com/Ntwumasi/medsys.git
cd D:\medsys\bridge

# Install deps
npm install

# Configure
copy .env.example .env
notepad .env
```

Fill in `.env`:
- `MEDSYS_API_URL` — e.g. `https://medsys.vercel.app`
- `BRIDGE_API_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`; **paste the same value into Vercel env vars as `BRIDGE_API_KEY`** (and redeploy)
- `ORTHANC_PASSWORD` — from the password manager
- `ORTHANC_VIEWER_BASE_URL` (set this one on Vercel, not the bridge) — e.g. `http://med-dc1:8042` if doctors will RDP/Tailscale to view, or `https://med-dc1.<tailnet>.ts.net:8042` for Tailscale Funnel

Start the bridge:
```powershell
npm start
```

You should see:
```
[info] medsys-bridge starting
[info] plugin ingress listening on http://127.0.0.1:9000
[info] worklist poller starting (every 30000ms → C:\OrthancWorklists)
```

Leave the window open during the demo. To install as a Windows service later,
use [NSSM](https://nssm.cc/) or [node-windows](https://github.com/coreybutler/node-windows).

**Done when:** `curl.exe http://localhost:9000/health` returns `{"ok":true,...}`.

---

## Step 12 — Install the Orthanc Python plugin (5 min)

This single Python file makes Orthanc notify the bridge whenever a new study
lands.

1. Locate the Orthanc Python plugin's script directory (configured as
   `PythonScript` in `orthanc.json`). If not set:
   ```json
   "Python" : {
     "PythonScript" : "C:\\Program Files\\Orthanc Server\\plugins\\medsys_bridge.py",
     "PythonVerbose" : false
   }
   ```
2. Copy the plugin:
   ```powershell
   copy D:\medsys\bridge\orthanc_plugin.py "C:\Program Files\Orthanc Server\plugins\medsys_bridge.py"
   ```
3. Restart Orthanc:
   ```powershell
   Restart-Service Orthanc
   ```
4. Check Orthanc logs (default `C:\Orthanc\Logs\`) for:
   ```
   [medsys-bridge] plugin loaded; will notify http://127.0.0.1:9000/study-stored on STABLE_STUDY
   ```

**Done when:** acquire a phantom scan on the Redwood, wait ~60s for STABLE_STUDY
to fire, and watch the bridge log line:
```
[info] plugin reported stored study: <orthanc-id>
[info] study forwarded to MedSys ...
```
And confirm in MedSys: the imaging order flips to "completed" and "View
Images" appears for the doctor.

---

## Step 13 — End-to-end smoke test (10 min)

Test the full loop from cloud MedSys to on-prem Orthanc and back:

1. **In MedSys (any browser):** as a doctor, create an encounter and order an
   Ultrasound for a test patient.
2. **Wait ~30s** for the bridge poll. Confirm a `.wl` file appears in
   `C:\OrthancWorklists`:
   ```powershell
   ls C:\OrthancWorklists
   ```
3. **On the Redwood:** start a study, query worklist. Test patient should
   appear.
4. **Acquire a phantom scan** on the test patient. Modality auto-pushes to
   `MEDSYS_PACS`.
5. **Wait ~60s** for Orthanc's STABLE_STUDY event.
6. **In MedSys (refresh):** order should now show "completed" with "View
   Images" button. Click it — Stone Web Viewer opens in a new tab.

**Done when:** doctor clicks "View Images" and sees the phantom scan in the
browser.

---

## What this runbook does NOT cover (post-go-live)

- **Modality registration** in Orthanc's `DicomModalities` block — not required for C-STORE (modality → Orthanc); needed later for C-MOVE / C-GET (Orthanc routing images).
- **OHIF viewer embedding** — replace the Stone Web Viewer deep-link with an embedded OHIF iframe. Plugin is loaded; just needs frontend work.
- **Backups** — Orthanc DB + storage backup schedule. Discuss with the architecture doc.
- **Bridge as Windows service** — for now `npm start` in a console window. Install as a service via NSSM once the system is stable.
- **Structured Report parsing** — the Redwood emits DICOM SR with ultrasound measurements (LV_EF, BPD, etc). The webhook stores study + series metadata; SR parsing into `imaging_measurements` is a follow-on task.

---

## Recovery / troubleshooting

- **Orthanc won't start after a config change:** the configure scripts (`02-`, `04-`) back up `orthanc.json` to a timestamped `.bak-YYYYMMDD-HHMMSS` file before writing. Restore the latest backup, restart the service.
- **Modality Echo fails:** check `DicomCheckCalledAet` in `orthanc.json` — it's currently `false` (permissive). If you ever tighten it, ensure the modality's "Called AET" matches `MEDSYS_PACS` exactly.
- **HTTP 8042 unreachable from LAN:** by design — firewall rule `MedSys-Orthanc-HTTP-Local` blocks it. RDP to the server or open a temporary hole for the MedSys backend IP when integration ships.
- **Worklist plugin not responding:** check `C:\OrthancWorklists` exists and is readable by the Orthanc service account.
