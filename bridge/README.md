# medsys-bridge

On-prem bridge between cloud MedSys (Vercel) and on-prem Orthanc PACS.

## What it does

Runs on the clinic Windows server (MED-DC1) alongside Orthanc. Closes two loops
that Vercel can't close itself because the clinic LAN is private:

1. **Orders out:** polls MedSys every 30s for imaging orders that need a
   DICOM Modality Worklist (MWL) entry. For each one it generates a `.wl` file
   in `C:\OrthancWorklists` so the modality (Redwood, Luminos) can query the
   patient when the tech starts a study.
2. **Results in:** receives a callback from Orthanc's Python plugin when a new
   study lands. Fetches the study metadata from Orthanc's REST API, then POSTs
   it to MedSys's webhook so the imaging order flips to "completed" and the
   ordering doctor gets notified.

## Prerequisites on the server

- **Node.js 18+** (check with `node --version`; install from https://nodejs.org if missing)
- **DCMTK** (provides `dump2dcm.exe`) — download from https://dicom.offis.de/dcmtk
  - Extract to `C:\Program Files\DCMTK\`
  - Confirm: `& 'C:\Program Files\DCMTK\bin\dump2dcm.exe' --version`
- **Orthanc** running locally with the `orthanc-worklists` and `orthanc-python` plugins loaded
- **Tailscale** (optional but recommended) — gives you a stable way to SSH/RDP back into the box from anywhere

## Install

```powershell
# Clone or pull MedSys to the server (anywhere on D:)
cd D:\
git clone <repo-url> medsys
cd D:\medsys\bridge

# Install deps
npm install

# Configure
copy .env.example .env
notepad .env
```

Fill in `.env`:
- `MEDSYS_API_URL` — production MedSys URL (e.g. `https://medsys.vercel.app`)
- `BRIDGE_API_KEY` — generate one and paste the **same value** into Vercel env vars:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- `ORTHANC_PASSWORD` — from the password manager

## Run

```powershell
npm start
```

Logs go to stdout. Leave the window open during the demo. Tomorrow we'll
install it as a Windows service (NSSM or node-windows) so it survives reboots.

## Install the Orthanc Python plugin

The bridge depends on a tiny Orthanc Python plugin that fires when a new
study lands. Drop `bridge/orthanc_plugin.py` into Orthanc's Python plugin
folder and restart Orthanc. See `docs/orthanc-deployment-runbook.md` step 10
for details.

## Health check

While the bridge is running, from the same machine:

```powershell
curl.exe http://localhost:9000/health
# {"ok":true,"queued":0}
```

## What's the API surface MedSys exposes for the bridge?

All bridge endpoints require the `X-Bridge-Key` header matching `BRIDGE_API_KEY`.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/imaging/integration/pending-worklist` | List orders that need .wl files |
| POST | `/api/imaging/integration/orders/:id/worklist-pushed` | Confirm .wl file was written |
| POST | `/api/webhooks/orthanc/study` | Notify MedSys a study landed in PACS |
