# medsys-bridge

On-prem bridge between cloud MedSys (Vercel) and on-prem Orthanc PACS.

## What it does

Runs on the clinic Windows server (MED-DC1) alongside Orthanc. Closes two
loops that Vercel can't close itself because the clinic LAN is private:

1. **Orders out:** polls MedSys every 30s for imaging orders that need a
   DICOM Modality Worklist (MWL) entry. For each one it generates a `.wl`
   file in `C:\OrthancWorklists` so the modality (Redwood, Luminos) can
   query the patient when the tech starts a study.
2. **Results in:** polls Orthanc's `/changes` endpoint for `StableStudy`
   events (fires ~60s after the last instance is received). For each new
   study, fetches metadata via the REST API and POSTs it to MedSys's
   webhook so the imaging order flips to "completed" and the ordering
   doctor gets notified.

Both directions: pure outbound HTTPS from the bridge. The clinic LAN
stays closed to inbound traffic.

## Prerequisites on the server

- **Node.js 18+** (`node --version`)
- **DCMTK** (provides `dump2dcm.exe`) — download from
  https://dicom.offis.de/dcmtk and extract to `C:\Program Files\DCMTK\`
- **Git for Windows** — for `git clone`
- **Orthanc** running locally with `orthanc-worklists` plugin loaded and
  `worklists.json` configured (see `bridge/scripts/worklists.json`)
- **Tailscale** — gives you a stable way to SSH/RDP back into the box

**No Orthanc Python plugin required** — the bridge polls Orthanc's REST
`/changes` endpoint instead of relying on a plugin callback. Simpler
deploy, one less thing to install.

## Install

```powershell
cd D:\
git clone https://github.com/Ntwumasi/medsys.git
cd D:\medsys\bridge

npm install

copy .env.example .env
notepad .env
```

Fill in `.env`:
- `MEDSYS_API_URL` — e.g. `https://medsys.vercel.app`
- `BRIDGE_API_KEY` — same value as the one in Vercel env vars. Generate with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- `ORTHANC_PASSWORD` — from the password manager
- `DUMP2DCM_PATH` — verify the path matches where you extracted DCMTK

## Run

```powershell
npm start
```

Logs go to stdout. Leave the window open during the demo. Install as a
Windows service later via NSSM or node-windows.

## How it tracks "already processed" studies

The bridge writes `.bridge-state.json` in its working directory with the
last Orthanc change sequence number it processed. Surviving a restart
means it picks up exactly where it left off — no duplicate webhooks, no
missed studies.

To force a re-scan of all existing studies, delete `.bridge-state.json`.

## MedSys API surface the bridge calls

All bridge endpoints require the `X-Bridge-Key` header matching `BRIDGE_API_KEY`.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/imaging/integration/pending-worklist` | List orders that need .wl files |
| POST | `/api/imaging/integration/orders/:id/worklist-pushed` | Confirm .wl file was written |
| POST | `/api/webhooks/orthanc/study` | Notify MedSys a study landed in PACS |
