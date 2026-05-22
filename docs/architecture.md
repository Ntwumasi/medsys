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

### Phase 0 — Go-live (THIS WEEK, no architecture change)
- Ship MedSys as-is, cloud-only on Vercel + Neon
- UPS on the Starlink router at the clinic
- 4G mobile failover when feasible
- Accept that internet outages halt clinic ops; track frequency in week 1 to size the offline work
- **What to do beforehand:** nothing — the current architecture stays

### Phase 1 — Stand up edge server, one-way sync (2–3 weeks post-go-live)
- Package MedSys Node app as a Windows service alongside Orthanc on the existing on-prem server
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
