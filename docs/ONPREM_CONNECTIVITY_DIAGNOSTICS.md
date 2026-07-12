# On-Prem Connectivity Diagnostics — QuickBooks Web Connector + DICOM/PACS

> Hand-off checklist for diagnosing the "cannot connect to the server on premise"
> issue (raised by Sedo). Both integrations are **outbound-only** from the clinic:
> an on-prem process makes HTTPS calls OUT to the Vercel-hosted app. Nothing from
> the cloud dials into the clinic. If the clinic loses internet/DNS/SSL, or a
> key/password is wrong, both break.
>
> Topology confirmed in `docs/architecture.md` and the code paths cited below.

## Topology at a glance

- **QuickBooks:** the QB Web Connector (Windows box next to QuickBooks Desktop)
  POSTs SOAP/XML OUT to `https://medsys-five.vercel.app/api/quickbooks/soap`.
  Pull model — the Web Connector always initiates.
- **DICOM/PACS:** a Node service **`medsys-bridge`** (`bridge/`) runs on the
  on-prem server **MED-DC1 @ `192.168.1.10`** next to Orthanc. It polls Vercel
  for imaging orders and posts study notifications back, and talks to Orthanc
  over `localhost:8042`.
- **On-prem server = MED-DC1**, Windows, static `192.168.1.10`, AET `MEDSYS_PACS`,
  DICOM port `4242` (LAN-open), Orthanc REST `8042` (localhost-only). Remote
  access is via **Tailscale**.

## A. Get onto the box & basic health

1. From another clinic PC: `ping 192.168.1.10` (is MED-DC1 up on the LAN?).
2. Is **Tailscale** running on MED-DC1 (tray / `tailscale status`)? If down,
   restart the Tailscale service — this is the documented remote-access path.
3. Confirm outbound internet + DNS + SSL from MED-DC1:
   - `nslookup medsys-five.vercel.app`
   - `curl -v https://medsys-five.vercel.app/api/health` (expect 200). A TLS
     handshake error here = SSL/clock/proxy issue — **check the Windows clock**
     (skew breaks TLS).

## B. QuickBooks Web Connector

4. QuickBooks Desktop **open with the correct company file**; Web Connector app
   installed/running.
5. SOAP endpoint reachable from MED-DC1 (the URL baked into the `.QWC`):
   - `curl -v https://medsys-five.vercel.app/api/quickbooks/soap` — a GET should
     return the **WSDL XML**. 404/HTML/redirect ⇒ AppURL in the `.QWC` is stale
     or the deployment URL changed.
6. In the Web Connector, check the "MedSys EMR" row → **Last Result / status**:
   - *"Unable to connect / could not be resolved"* → step 3/5 (internet, DNS, or
     wrong AppURL).
   - *"Authentication failed / invalid user"* → credential mismatch. Fix: in
     MedSys (admin/accountant) open QB settings → **reset the QBWC password**
     (`POST /api/quickbooks/password/reset`), copy the shown value, re-enter it
     in the Web Connector. Confirm the Web Connector username matches
     `quickbooks_config.qbwc_username` (default `medsys`).
7. If AppURL is wrong: **re-download the `.QWC`** (`GET /api/quickbooks/qwc-file`,
   admin/accountant), remove the old app in the Web Connector, re-import.
   `<AppURL>` must be exactly `https://medsys-five.vercel.app/api/quickbooks/soap`.
8. SSL: the Web Connector refuses non-trusted certs. Confirm
   `https://medsys-five.vercel.app` opens with **no cert warning** in a browser
   on MED-DC1.
9. Server-side confirm: after a manual "Update Selected", check Vercel logs for
   `[QBWC SOAP] Action: ...` / `[QBWC] Authenticated user`. Absent ⇒ request never
   arrived (network/URL). An auth line returning `nvu` ⇒ credentials.

## C. DICOM / PACS (Orthanc + bridge)

10. Orthanc healthy locally (run **on the box** — 8042 is localhost-only):
    - `curl -u medsys:<ORTHANC_PASSWORD> http://localhost:8042/system` (expect JSON).
    - `curl -u medsys:<pw> http://localhost:8042/plugins` — confirm
      `orthanc-worklists` is loaded.
11. DICOM port listening: `netstat -ano | findstr 4242` on MED-DC1. From the
    Redwood, DICOM Echo to `MEDSYS_PACS @ 192.168.1.10:4242`.
12. **Redwood DHCP drift:** confirm the Redwood ultrasound still holds
    `192.168.1.87` and its Storage Server points at `192.168.1.10:4242` (NOT its
    own IP). It was moved from static to DHCP — a rotated lease silently stops
    imaging. Add a DHCP reservation (MAC `00:13:95:38:3D:9C`) or set static.
13. Bridge running on MED-DC1 (console window or NSSM/node-windows service).
    Startup log: `medsys-bridge starting`, `MedSys API: ...`, `Orthanc: ...`.
14. Bridge `.env` sane: `MEDSYS_API_URL=https://medsys-five.vercel.app`,
    `ORTHANC_URL=http://localhost:8042`, correct `ORTHANC_PASSWORD`, and
    `DUMP2DCM_PATH` points to a real `dump2dcm.exe` (DCMTK installed).
15. Bridge→cloud auth (from MED-DC1):
    - `curl -v -H "X-Bridge-Key: <BRIDGE_API_KEY>" https://medsys-five.vercel.app/api/imaging/integration/pending-worklist`
    - 200 + `{"orders":[...]}` = good. **401 "Invalid bridge key"** ⇒ bridge
      `BRIDGE_API_KEY` ≠ Vercel env var (regenerate, set both the same).
      **500 "Server configuration error"** ⇒ `BRIDGE_API_KEY` missing from Vercel.
16. Cloud→Orthanc (worklist): after a doctor places an imaging order, `.wl` files
    should appear in `C:\OrthancWorklists` (bridge log:
    `worklist entry written for order ...`). If not, check `dump2dcm.exe`
    path/permissions (log `dump2dcm exited ...`).
17. Study callback: after a study lands in Orthanc, bridge log shows
    `forwarded study ... (seq ...)`. If studies exist but don't forward, delete
    `.bridge-state.json` to force a re-scan, or check the webhook POST for a
    non-2xx (`study webhook HTTP ...`).
18. **Viewer** ("View Study" opens nothing): server env
    `ORTHANC_VIEWER_BASE_URL` must be set (else API returns 503 "Viewer not
    configured"), AND the **doctor's browser needs Tailscale connected** — the
    viewer loads pixels straight from Orthanc over the tailnet, not via Vercel.

## D. Escalation data to capture if still stuck

19. From MED-DC1: output of `curl -v https://medsys-five.vercel.app/api/health`,
    `tailscale status`, `ipconfig`, and the last ~50 lines of the bridge console
    + the Web Connector log.
20. Classify the failure — the three are independent and fixed differently:
    - **inbound-remote-access** (can't reach the box) — Tailscale/box.
    - **outbound-from-box** (box can't reach Vercel) — internet/DNS/SSL.
    - **LAN/DICOM** (modality ↔ Orthanc) — LAN/DHCP/echo.

## Key files

- QuickBooks SOAP + WSDL: `server/src/routes/qbwc.ts`
- QuickBooks business logic: `server/src/services/qbwcService.ts`
- QuickBooks controller (`.QWC` gen, password reset, settings): `server/src/controllers/quickbooksController.ts`
- QuickBooks config migration (all `quickbooks_config` keys + tables): `server/src/database/migrations/updateQuickBooksForDesktop.ts`
- Bridge (on-prem service): `bridge/` (`src/config.ts`, `src/index.ts`, `src/worklistPoller.ts`, `src/changesPoller.ts`, `src/orthancClient.ts`, `src/medsysClient.ts`, `src/dumpBuilder.ts`, `README.md`)
- Server imaging receiver: `server/src/controllers/imagingIntegrationController.ts`
- Bridge auth middleware: `server/src/middleware/bridgeAuth.ts`
- Route wiring: `server/src/routes/index.ts:653-656` (imaging), `:908-909` (quickbooks)
- Network/infra docs: `docs/equipment-inventory.md`, `docs/architecture.md`, `docs/orthanc-deployment-runbook.md`, `docs/DICOM_IMAGING_INTEGRATION.md`

> **Doc drift to ignore:** `bridge/README.md` / some `docs/` still mention an
> Orthanc **Python plugin** callback and `GHANA_DEPLOYMENT_CHECKLIST.md` lists
> installing `orthanc-python`. The shipped design uses the bridge polling Orthanc
> `/changes` instead — no Python plugin required.
