# MedSys System Architecture

Target architecture for MedSys EMR. Captures the decisions made during the Ghana go-live (2026-05-22) and the phased roadmap to get there.

**Status:** target architecture documented. Go-live (Phase 0) ships on the current cloud-only stack. Phase 1+ work happens after the clinic is stable.

---

## Decisions on file

| Question | Decision |
|---|---|
| Offline tolerance | **Must-have.** Clinic operations cannot stop when Starlink drops. |
| Multi-clinic in 2 years | **Yes — plan for it now.** Schema + services parameterised from Phase 2 onward. |
| Device-gateway runtime | **Node.js.** Same Express stack as the cloud backend; one codebase to maintain. |
| Data residency for PHI | **No constraint known.** US / EU Neon regions are fine. Revisit if Ghana law changes. |

These decisions shape everything below.

---

## Current hardware (MED-DC1)

The clinic has one on-prem server today, captured 2026-05-22:

| Spec | Value | Verdict |
|---|---|---|
| Model | Dell PowerEdge T150 (bare-metal) | OK |
| OS | Windows Server 2019 Standard (1809, **never patched**) | ⚠️ needs critical-security pass |
| CPU | Intel Pentium Gold G6405T — 2 cores / 4 threads @ 3.5 GHz | ❌ Below Phase 1 minimum (kiosk-grade chip) |
| RAM | 32 GB | ✅ Comfortable |
| Storage | Single 1 TB Seagate ST1000DM010 (consumer HDD, no RAID), partitioned C: 493 GB / D: 437 GB empty / E: 29 GB | ❌ Single point of failure; spinning disk is slow for Postgres |
| NICs | 2× embedded; NIC 1 disconnected, NIC 2 carrying all traffic | ⚠️ no redundancy |
| Domain | This box is the Domain Controller for `Medics.gh.com` | ⚠️ stacking clinical workload on DC = bad blast radius |
| Roles installed | AD DS, DNS, Hyper-V (unused), File/Storage, NPAS, RDS (CAL issue) | Hyper-V + RDS should come off — extra attack surface |
| IP | `192.168.1.10` | ✅ matches Orthanc / runbook |

### What this means

- **For Phase 0 / current state (Orthanc PACS only):** the server is *fine*. PACS workload is light; the CPU and disk aren't stressed by image storage.
- **For Phase 1 (all-in-one edge MedSys + Postgres + Orthanc + gateway):** the server is **not adequate**.
  - The 2-core Pentium Gold will bottleneck under a multi-user clinic's concurrent Postgres + Node workload.
  - Postgres on a single 7200 rpm spinning HDD that's *also* writing DICOM images = IO contention.
  - Single non-RAID consumer drive is a clinical-grade single point of failure.
  - Running the clinical app on the Domain Controller couples two failure domains that should be independent.

---

## What runs where (Phase 0 — current state)

### On-prem: MED-DC1 (Windows server at the clinic, `192.168.1.10`)

| Service / role | Purpose | Notes |
|---|---|---|
| **Active Directory Domain Controller** | Auth for staff workstations on `Medics.gh.com` | Pre-existing; predates MedSys |
| **DNS** | Domain name resolution for LAN | Part of AD role |
| **Orthanc PACS** | DICOM image storage; modality worklist; web viewer | Listening on `4242` (DICOM, LAN-open) + `8042` (HTTP, localhost-only) |
| **Orthanc plugins (active)** | `dicom-web`, `ohif`, `stone-webviewer`, `orthanc-worklists`, `gdcm`, `web-viewer`, `serve-folders`, `advanced-storage`, `authorization`, `connectivity-checks`, `housekeeper`, `transfers` | ~13 active after cleanup; unused plugins moved to `Plugins\disabled` |
| **Worklist directory** | `C:\OrthancWorklists` — modalities pull patient schedules from here | Populated by MedSys → Orthanc integration (Phase 1+) |
| **File / Storage role** | Generic Windows file share | Not actively used by MedSys today |

**Network posture:** static IP `192.168.1.10`, gateway `192.168.1.1`. Firewall rules: DICOM port LAN-open, HTTP port localhost-only. Outbound only — nothing from outside the clinic dials in.

### Cloud: Vercel + Neon

| Service | Purpose | Notes |
|---|---|---|
| **React frontend** | The MedSys web app — registration, encounters, vitals, orders, prescriptions, lab results, dashboards | medsys-five.vercel.app |
| **Express API (Vercel serverless)** | All EMR business logic | Same Express code as future edge; gated by `VERCEL` env var in `server/src/index.ts` |
| **PostgreSQL (Neon)** | Source of truth for patients, encounters, orders, prescriptions, audit logs, billing, charges, charge_master | Connection via `DATABASE_URL` |
| **JWT auth** | Login + role-based access (`is_super_admin`, role-switcher, etc.) | Signing secret on Vercel |
| **Documents (bytea in Postgres)** | PDF lab results, uploaded docs | Stored as binary in Neon; not on S3 |
| **Email / SMS gateways** | Receipts, reminders, password resets | Via SMTP / Twilio |
| **QuickBooks integration** | Accounting sync | Optional, runs from cloud |

### What's NOT yet integrated (the gap in Phase 0)

- Modalities (Redwood, future Luminos) push DICOM images to Orthanc on the LAN — but the cloud MedSys doesn't know a study landed
- Doctors order imaging in cloud MedSys — but Orthanc's worklist isn't populated, so the technologist types patient info manually on the modality
- Lab tech types results manually into cloud MedSys (no auto-ingest from Wondfo / AFINION)
- No automated flow between on-prem Orthanc and cloud MedSys

This is the gap Phase 1 closes by adding an on-prem MedSys edge service alongside Orthanc.

### Phase 1+ will add on-prem (pending hardware decision)

| New on-prem service | Purpose |
|---|---|
| **MedSys edge app (Node + nginx)** | Long-running Express server; browsers connect to LAN URL; same codebase as Vercel build |
| **Local PostgreSQL** | Clinic-authoritative source of truth for clinical data; syncs outbound to Neon |
| **Device gateway** (in-process module of the edge app) | Receives Orthanc webhooks on study landing; opens HL7 / ASTM TCP listeners for lab analyzers; polls device REST endpoints |
| **Sync worker** (in-process) | Outbound CDC events → Neon when internet is up; queue when offline |

When Phase 1 lands, the cloud's role narrows to: aggregator + admin portal + patient portal + telehealth + backup of record. Clinic operations keep running through internet outages.

---

## Hardware decision pending

Phase 1 is blocked on a hardware decision. Three paths, ordered by recommendation:

### Path A (recommended): keep MED-DC1 as PACS-only; provision a second box for MedSys edge
- New machine: modern mini-PC (Intel NUC / Beelink / Dell OptiPlex Micro). i5-13500 or Ryzen 5, 32 GB RAM, 1 TB NVMe SSD. **~$700–1,100.**
- Clean architectural separation: DC + PACS on the T150, clinical app + Postgres on the new box.
- Each machine is right-sized; one's crash doesn't take down the other.
- Recipe is then reusable for clinic #2.

### Path B: upgrade the T150 in place
- NVMe M.2 SSD (~$80) for Postgres + Node + OS — biggest single-cost performance win.
- CPU swap to i5-11400 (LGA 1200 socket, ~$130) for 6C / 12T — ~3× the throughput.
- **Total ~$200 + ~2 hours of work.**
- Better but still single-disk, still single-box, still DC + everything.

### Path C: defer Phase 1 indefinitely; stay cloud-only
- Cheapest path. Accept that until hardware is procured, the clinic remains internet-dependent.
- Mitigations: UPS on Starlink router + 4G failover.
- Risk: every Starlink outage halts the clinic.

**Current decision (2026-05-22):** Path C for go-live (Phase 0). Stakeholder conversation about hardware budget happens after go-live is stable. Path A is the architectural recommendation but not committed.

---

## Target shape

```
┌──────────────────────────────────────────────────────────────────┐
│  CLOUD BACKBONE  (Vercel + Neon)                                 │
│                                                                  │
│   ┌──────────────────┐   ┌────────────────────────┐              │
│   │ medsys.app       │   │ Aggregator DB (Neon)   │              │
│   │ - Admin portal   │←→ │ - Multi-clinic view    │              │
│   │ - Patient portal │   │ - Reporting / analytics│              │
│   │ - Telehealth     │   │ - Backup of record     │              │
│   └──────────────────┘   └────────────────────────┘              │
│         ▲                       ▲                                │
└─────────┼───────────────────────┼────────────────────────────────┘
          │ outbound HTTPS,       │ outbound HTTPS,
          │ patients/staff        │ idempotent sync events
          │ from anywhere         │ (clinic → cloud)
          │                       │
┌─────────┼───────────────────────┼────────────────────────────────┐
│  PER-CLINIC EDGE  (one Windows server per clinic)                │
│                                                                  │
│   ┌─────────────────────────────────────────────────┐            │
│   │ MedSys edge app  (Node + nginx)                 │            │
│   │  - same Express code as cloud, long-running     │            │
│   │  - local Postgres (source of truth on-site)     │            │
│   │  - sync worker (CDC outbound to Neon)           │            │
│   │  - device gateway (Orthanc webhooks, HL7, ASTM) │            │
│   │  - JWT signing keys distributed offline         │            │
│   └─────────────────────────────────────────────────┘            │
│         ▲              ▲              ▲                          │
│   [Clinic browsers] [Orthanc PACS] [Lab analyzers]               │
│   (LAN URL)         (DICOM 4242)   (HL7 / ASTM TCP)              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Core idea:** the clinic talks to its own local server. The cloud only matters for (a) syncing when reachable, (b) external users (patients, telehealth, admin).

---

## Why this shape

- **Offline tolerance:** browsers connect to the LAN. Starlink dies, nothing changes — vitals, orders, dispenses all keep working against local Postgres.
- **Multi-clinic:** each clinic is independent and identical. Cloud Neon is the aggregator, not the operator. Adding clinic #2 is "stand up another Windows server"; the schema is already `clinic_id`-aware.
- **Same code everywhere:** the Express server runs both on Vercel (for cloud surfaces) and on-prem (for clinic surfaces). The `VERCEL` env guard in `server/src/index.ts` already gates the standalone-vs-serverless behaviour. No duplicate codebase to maintain.
- **Device gateway is in-process:** since the edge app is Node, it can ingest Orthanc webhooks, HL7 sockets, and analyzer pollers without a separate service. One thing to deploy per clinic.

---

## Critical principles (commit to these from Phase 1 onward)

| Principle | Why it matters |
|---|---|
| **Edge first, cloud second** | Local Postgres is the source of truth for that clinic. Cloud is downstream. Anything that needs sub-second response runs at the edge. |
| **Idempotent events on every sync** | Dedup key is `(clinic_id, source_event_id, version)`. Retries are safe forever — Starlink will flap and retries will happen. |
| **One codebase** | Same Express server runs at the edge and on Vercel. Differences live in env vars: `VERCEL`, `MEDSYS_EDGE`, `CLINIC_ID`. |
| **Device IPs never leave the clinic** | The edge gateway abstracts. Cloud sees `imaging_orders.completed_at`, never `192.168.1.87`. Protects against IP changes and reduces attack surface. |
| **PHI sanitised at the edge** | Logs scrubbed before they leave the clinic. Cloud telemetry stays compliance-friendly. |
| **One direction of truth per data class** | Clinical data → clinic-authoritative. Org config → cloud-authoritative. Patient portal credentials → cloud-authoritative. Images → Orthanc-authoritative. No data class has two masters. |
| **Backups in two places** | Neon PITR + on-prem `pg_dump` to USB + Orthanc storage to USB. Belt + suspenders + a third belt. |
| **Outbound only from on-prem** | Clinic firewall is closed. The edge dials out; the cloud never dials in. Same posture Orthanc is already on (HTTP 8042 is localhost-only). |

---

## The hard parts, in order of difficulty

1. **Bidirectional sync** — local Postgres ⇄ Neon. The safe pattern is **clinic-authoritative writes + cloud-authoritative aggregation**: every write happens locally first, then a sync worker ships changes to Neon. Cloud-side admin surfaces are read-only against the aggregator, OR write back via per-clinic queue. Conflict resolution becomes "last writer wins, scoped by `clinic_id`" — easy in practice because two clinics shouldn't be writing the same row.

2. **JWT + auth when cloud is down** — sign tokens with a shared secret distributed to the edge server. User table is replicated to each clinic that user accesses. Login works against the local user table; the cloud only matters for cross-clinic admin.

3. **Schema migrations across N clinics + cloud** — needs a coordinator. Each migration runs locally first on a canary clinic, then propagates. The auto-ensure pattern already in `ordersController.ts` (e.g. `ensureLabVerificationSchema`) is a foundation; formalise it.

4. **Patient identity across clinics** — usually fine because patients are clinic-scoped. If we ever support cross-clinic patient records, we need a global MRN + clinic-local IDs. Defer until there's a real use case.

---

## Phased roadmap

### Phase 0 — Go-live (current state, indefinite until hardware decision)
- Ship MedSys as-is, cloud-only on Vercel + Neon
- On-prem server runs Orthanc PACS only (per [`orthanc-deployment-runbook.md`](./orthanc-deployment-runbook.md))
- UPS on the Starlink router at the clinic
- 4G mobile failover when feasible
- Accept that internet outages halt clinic ops; track frequency to inform the hardware-budget conversation
- **What to do beforehand:** nothing — the current architecture stays
- **Exit criteria:** stakeholders agree on hardware procurement (see [Hardware decision pending](#hardware-decision-pending))

### Phase 1 — Stand up edge server, one-way sync (2–3 weeks post-procurement)
- **Blocked on:** hardware decision (Path A new box, or Path B upgrade T150)
- Package MedSys Node app as a Windows service on the edge server
- Local Postgres (same schema as Neon), initialised from a Neon snapshot
- One-way sync worker: local → Neon. Cloud becomes a read-only mirror of clinic data.
- Clinic browsers switch to the LAN URL. Cloud URL still works as remote backup.
- **Result:** Starlink outage = no impact on clinic operations.

### Phase 2 — Multi-tenant schema (1 week, can run parallel to Phase 1)
- Add `clinic_id` to every table that needs it (encounters, lab_orders, patients, etc.)
- Index appropriately; queries are always scoped by `clinic_id`
- Backfill existing rows to MEDICS' clinic_id
- Sync events tagged with `clinic_id`
- **Pre-go-live prep:** add the column nullable-with-default in a 1-day migration. Saves a painful retrofit later. Confirm before scheduling.

### Phase 3 — Bidirectional sync (3–4 weeks)
- Cloud admin can write back (disable a user across all clinics, push a new charge to the master charge list, etc.)
- Per-table policy: clinic-authoritative for clinical data, cloud-authoritative for org config
- Test with a staging "clinic #2" environment to prove the multi-tenant path
- **Result:** cloud and edge are bidirectional partners, not master/slave.

### Phase 4 — Second real clinic (rollout when needed)
- Stand up a second Windows server in <1 day using the deployment runbook
- Per-clinic config (clinic_id, AETs, IP range, branding) lives in one env file
- **Result:** the architecture is proven, not theoretical.

---

## What changes per-component

| Component | Today | After Phase 3 |
|---|---|---|
| `server/src/index.ts` | Express that runs on Vercel | Same code, also runs as Windows service when `MEDSYS_EDGE=1` |
| `server/src/database/db.ts` | Pool from `DATABASE_URL` | Same. Pool just points at `localhost:5432` on the edge. |
| `client` (Vite + React) | Single build deployed to Vercel | Same build; clinic nginx serves it from the on-prem box. URL is `medsys.local` on the LAN. |
| Auth | JWT signed with `JWT_SECRET` on Vercel | Same secret distributed to edge servers. Auth keeps working when cloud is offline. |
| Migrations | `ts-node` against `DATABASE_URL` | Coordinator runs migrations locally first, then propagates to Neon. Auto-ensure stays as a safety net. |
| Orthanc | On-prem, MedSys never talks to it directly | Edge gateway in MedSys posts to Orthanc REST when doctor orders imaging; Orthanc Python plugin posts back to MedSys when study lands. All on-prem. |
| Lab analyzers | Not integrated | Edge gateway opens HL7/ASTM TCP listeners or polls device REST endpoints. Posts normalised events to MedSys API on the same machine. |

---

## Day-1 server hygiene (Phase 0)

The PACS-only role still needs the T150 patched and locked down. From the on-site pre-deployment audit (2026-05-22):

| Item | Decision | Notes |
|---|---|---|
| Windows updates (never run since OS install) | **Critical security only, defer feature updates** | Single DC, no failover, no real backup — full patch cycle is too risky without a rollback path |
| Backup target | **Use D: as interim backup target** | Better than nothing; protects against software corruption but **not disk failure**. USB drive procurement is the next upgrade. |
| NIC teaming (degraded) | **Break team, run single NIC** | Pragmatic; no failover but stable. Re-cabling NIC 1 is a follow-up. |
| RDS role (CAL error) | **Uninstall** | Removes the whole licensing class of problem. The 2 free admin RDP sessions are sufficient for IT management. |
| Hyper-V role (unused) | **Remove in hardening pass** | Extra attack surface for no benefit. |
| Hardware redundancy | **On the roadmap, not Day-1** | RAID 1 + enterprise SSD when budget allows. If Path A is chosen, the new edge server becomes the de-facto reliable storage tier for clinical data; T150 redundancy still matters for images. |
| `OrthancStorage` backup | **Before any real PHI lands** | Once the lab tech starts pushing images, this directory contains patient data. The HDD has no redundancy — back it up to D: nightly + an external drive once available. |

---

## Cross-references

- [`equipment-inventory.md`](./equipment-inventory.md) — current device IPs, AE titles, ports
- [`orthanc-deployment-runbook.md`](./orthanc-deployment-runbook.md) — step-by-step PACS setup (the foundation Phase 1 builds on)
- [`DICOM_IMAGING_INTEGRATION.md`](./DICOM_IMAGING_INTEGRATION.md) — the older imaging integration spec; superseded for the on-prem direction but still useful for AET / port reference
- [`CLAUDE.md`](../CLAUDE.md) — codebase quick reference

---

## Open items / future work

- **Telehealth video** ([VoIP discussion](#)) — WebRTC with the existing backend as signaling layer. Deferred until after Phase 1. Could fit naturally as another in-process feature on the edge gateway.
- **Patient portal off-LAN** — patients access from outside the clinic, so the portal stays cloud-hosted. Read-only mirror of clinic data is sufficient for the things patients see.
- **Cross-clinic patient identity** — see "hard parts" item 4. Defer.
- **Compliance review** — re-check Ghana data residency law before Phase 3. Cloud aggregator location matters more once we're storing months of clinic data there.
