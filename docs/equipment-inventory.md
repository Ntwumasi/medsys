# Equipment Inventory — MEDICS CLINIC (Ghana)

Network: clinic LAN, `192.168.1.0/24`, gateway `192.168.1.1`.
WiFi SSID for portable devices: `Medics-Starlink-Wifi`.

Last updated: 2026-05-22 (during deployment trip).

---

## Devices

| # | Device | Type | IP | Port | AE Title / Hostname | Connection |
|---|---|---|---|---|---|---|
| 1 | **MedSys PACS / Orthanc** (on-site server) | DICOM SCP + REST | `192.168.1.10` | `4242` (DICOM), `8042` (REST per Orthanc default) | AET `MEDSYS_PACS` | Wired, static |
| 2 | **Siemens ACUSON Redwood** — ultrasound | DICOM modality (SCU + SCP) | `192.168.1.87` | n/a (client) | AET `REDWOOD_US` | Wired, **was static, now DHCP** — request reservation |
| 3 | **Siemens Luminos dRF** — X-ray / fluoroscopy | DICOM modality | _TBD_ | _TBD_ | Target AET `LUMINOS_DRF` | _TBD — confirm presence on site_ |
| 4 | **Wondfo Finecare Plus** — POC immunoassay | proprietary / HL7-LIS capable | `192.168.1.104` | _TBD_ | n/a | WiFi (Medics-Starlink-Wifi), DHCP — lease may drift |
| 5 | **Abbott AFINION 2** — HbA1c / CRP analyzer | static + built-in web server | `192.168.1.105` | web server (port unconfirmed; AFINION default 80/443) | Hostname `AF20056149` | Wired, static, gateway 192.168.1.1, mask 255.255.255.0 |

### Quick reference for DICOM-side configuration

Every imaging modality on this network points its Storage Server / Worklist Server / MPPS Server to:

```
Alias    : MEDSYS_PACS
AE Title : MEDSYS_PACS
IP       : 192.168.1.10
Port     : 4242
```

Per-machine Local AE Titles:

| Machine | Local AE Title |
|---|---|
| Siemens ACUSON Redwood | `REDWOOD_US` |
| Siemens Luminos dRF | `LUMINOS_DRF` |

---

## Verified state (as of 2026-05-22)

- Redwood Local AE: `REDWOOD_US` ✓ (image #11)
- Redwood Storage Server → `MEDSYS_PACS @ 192.168.1.10:4242` ✓ Echo test succeeded (image #6)
- Redwood Worklist Server → `MEDSYS_PACS @ 192.168.1.10:4242` ✓ Ping + Echo tests succeeded (images #7, #8)
- Redwood Auto Store to DICOM: **ON**, Store at end of exam
- AFINION 2 IP/gateway/mask confirmed (image #14)
- Wondfo Finecare Plus on `Medics-Starlink-Wifi`, route IP `192.168.1.104` (image #13)

---

## Open questions / TODO before go-live

1. **Redwood Storage Server anomaly**: one screenshot (image #10) shows Storage Server IP as `192.168.1.87` (the Redwood's own IP) instead of `192.168.1.10`. Verify only one Storage Server entry exists on the Redwood and it points at `192.168.1.10:4242`.
2. **Redwood network mode**: switched from Static IP to DHCP between sessions. Currently holds `192.168.1.87` but the lease can rotate. **Ask the router admin for a DHCP reservation** on MAC `00:13:95:38:3D:9C` → `192.168.1.87`, or revert to Static.
3. **Siemens Luminos dRF**: confirm whether the X-ray is on-site, capture its IP, and apply the same Storage/Worklist Server config with Local AE Title `LUMINOS_DRF`.
4. **Wondfo**: WiFi-only. If we want stable connectivity for an LIS integration later, either pin a DHCP reservation by MAC, or move it to wired.
5. **AFINION 2 port**: confirm whether the built-in web server is on `80` or `443` (touch the hostname from a browser on the LAN).
6. **PACS server itself**: confirm Orthanc is actually running on `192.168.1.10:4242` with AET `MEDSYS_PACS` and the worklist plugin loaded. The Redwood's successful Echo test suggests yes, but worth verifying the Orthanc instance still has the right config after the PowerShell session from yesterday.

---

## Automation roadmap

Order chosen: **Siemens DICOM (Redwood + Luminos) via Orthanc** first, after go-live.

### Phase A — Orthanc → MedSys callback

1. Orthanc Python plugin: on every new study/instance, POST a webhook to MedSys with `study_instance_uid`, `accession_number`, `patient_id`, `modality`, `study_description`.
2. MedSys endpoint matches incoming accession (= Path No / `lab_orders.path_no`) to the imaging order, attaches the study link, and flips `imaging_orders.status` to `completed`.
3. Doctor sees the result automatically in the alerts panel.

### Phase B — DICOM viewer link

- Embed an OHIF viewer (or link to Orthanc Explorer) from the imaging result row so the doctor can click through to the images without leaving MedSys.

### Phase C — Lab analyzers (Wondfo, AFINION 2)

Different protocols per device:

- **AFINION 2**: poll the built-in web server (192.168.1.105) for new results, or accept HL7 ORU messages over TCP if the device supports outbound posting. Static IP = easy.
- **Wondfo Finecare Plus**: HL7 or ASTM E1394 over TCP socket. WiFi makes this brittle — DHCP reservation strongly recommended before integration.

Both flow into a generic `analyzer_results` ingest endpoint that matches by Path No / patient identifier and inserts structured parameter values into `lab_orders` — same shape as the manual structured-entry templates we just shipped.

---

## Where the wiring lives in the codebase

- DICOM integration spec: [`docs/DICOM_IMAGING_INTEGRATION.md`](./DICOM_IMAGING_INTEGRATION.md)
- Stakeholder-facing summary: [`docs/IMAGING_INTEGRATION_STAKEHOLDER_GUIDE.md`](./IMAGING_INTEGRATION_STAKEHOLDER_GUIDE.md)
- Imaging orders controller: `server/src/controllers/ordersController.ts` → `createImagingOrder`, `updateImagingOrder`
- Lab structured templates (analogous schema for future analyzer ingest): `server/src/database/seeds/labTestTemplates.ts`
