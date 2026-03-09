# Medical Imaging Integration - Technical Setup Guide
**For Hospital IT, Administration & Clinical Leadership**

---

## Executive Summary

To connect the Siemens X-ray and ultrasound machines to MedSys EMR, we need to:

1. **Deploy one server** running Orthanc (free PACS software)
2. **Schedule one Siemens service visit** to configure the machines
3. **Develop the EMR integration** (~3 weeks development)

**Total infrastructure cost: ~$0** (using existing servers + free software)

---

## Technical Architecture

```
                     HOSPITAL NETWORK
    ┌──────────────────────────────────────────────────────┐
    │                                                      │
    │   ┌─────────────┐         ┌─────────────┐           │
    │   │ Siemens     │         │ Siemens     │           │
    │   │ Luminos dRF │         │ ACUSON      │           │
    │   │ (X-Ray)     │         │ Redwood     │           │
    │   │             │         │ (Ultrasound)│           │
    │   └──────┬──────┘         └──────┬──────┘           │
    │          │                       │                   │
    │          │    DICOM Protocol     │                   │
    │          │    (Port 4242)        │                   │
    │          ▼                       ▼                   │
    │   ┌─────────────────────────────────────┐           │
    │   │                                     │           │
    │   │     ORTHANC PACS SERVER            │           │
    │   │     (Virtual Machine or Docker)     │           │
    │   │                                     │           │
    │   │  • Receives all images             │           │
    │   │  • Stores images (local/NAS)       │           │
    │   │  • Provides web API for MedSys     │           │
    │   │  • Sends patient worklist to       │           │
    │   │    machines                        │           │
    │   │                                     │           │
    │   └──────────────────┬──────────────────┘           │
    │                      │                               │
    │                      │  REST API                     │
    │                      │  (Port 8042)                  │
    │                      ▼                               │
    │   ┌─────────────────────────────────────┐           │
    │   │                                     │           │
    │   │     MEDSYS EMR SERVER              │           │
    │   │     (Existing Vercel/Cloud)         │           │
    │   │                                     │           │
    │   └─────────────────────────────────────┘           │
    │                                                      │
    └──────────────────────────────────────────────────────┘
```

---

## Infrastructure Requirements

### Option A: On-Premise Server (Recommended)

| Component | Specification | Notes |
|-----------|---------------|-------|
| **Server** | Any Linux VM or physical server | Can use existing infrastructure |
| **CPU** | 2+ cores | Minimal processing needed |
| **RAM** | 4GB minimum | 8GB recommended |
| **Storage** | 500GB - 2TB | Depends on image retention policy |
| **Network** | Static IP on hospital LAN | Must be reachable by imaging machines |
| **OS** | Ubuntu 22.04 LTS or similar | Docker-capable |

**Estimated Cost:** $0 if using existing VM infrastructure

### Option B: Dedicated NAS/Appliance

| Component | Specification | Cost Estimate |
|-----------|---------------|---------------|
| **Synology NAS** | DS920+ or similar | $550-800 |
| **Hard Drives** | 2x 4TB (RAID 1) | $200-300 |
| **Total** | | **$750-1,100** |

---

## Network Requirements

### Firewall Rules Needed

| Source | Destination | Port | Protocol | Purpose |
|--------|-------------|------|----------|---------|
| X-Ray Machine (192.168.x.x) | Orthanc Server | 4242 | TCP | Send images |
| Ultrasound Machine (192.168.x.x) | Orthanc Server | 4242 | TCP | Send images |
| Both Machines | Orthanc Server | 4242 | TCP | Query patient worklist |
| MedSys Server | Orthanc Server | 8042 | TCP | API access |
| Clinician Workstations | Orthanc Server | 8042 | TCP | View images |

### Network Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOSPITAL NETWORK (LAN)                       │
│                                                                 │
│  Imaging VLAN (192.168.10.x)          Server VLAN (192.168.1.x)│
│  ┌─────────────────────────┐         ┌─────────────────────┐   │
│  │                         │         │                     │   │
│  │  X-Ray: 192.168.10.100  │◄───────►│ Orthanc:           │   │
│  │  Ultrasound: 192.168.10.101       │ 192.168.1.50       │   │
│  │                         │         │                     │   │
│  └─────────────────────────┘         │ Ports:             │   │
│                                      │  • 4242 (DICOM)    │   │
│                                      │  • 8042 (Web API)  │   │
│                                      └──────────┬──────────┘   │
│                                                 │               │
│  Clinical Workstations ◄────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Siemens Configuration Requirements

### What Siemens Service Engineer Will Configure

**On Both Machines:**

| Setting | Value |
|---------|-------|
| Remote DICOM Server AE Title | `MEDSYS_PACS` |
| Remote Server IP Address | `[Orthanc Server IP]` |
| Remote Server Port | `4242` |
| Enable C-STORE | Yes (to send images) |
| Enable Worklist Query | Yes (to receive patient lists) |
| Enable MPPS | Yes (to report procedure status) |

**Machine-Specific AE Titles:**

| Machine | AE Title |
|---------|----------|
| Siemens Luminos dRF | `LUMINOS_DRF` |
| Siemens ACUSON Redwood | `REDWOOD_US` |

### Service Visit Scope

1. Configure DICOM destinations on both machines
2. Test connectivity (C-ECHO)
3. Test image transfer (C-STORE)
4. Test worklist query (MWL)
5. Verify bidirectional communication

**Estimated Time:** 2-4 hours per machine

---

## Software Components

### Orthanc PACS Server (Free & Open Source)

| Feature | Description |
|---------|-------------|
| **License** | GPLv3 (Free for commercial use) |
| **Vendor** | Developed by Sébastien Jodogne, maintained by community |
| **Used By** | Hundreds of hospitals worldwide |
| **Support** | Community forums, optional paid support available |
| **Website** | https://www.orthanc-server.com |

### Orthanc Plugins Required

| Plugin | Purpose | Cost |
|--------|---------|------|
| orthanc-dicomweb | REST API for image retrieval | Free |
| orthanc-worklist | Send patient lists to machines | Free |
| orthanc-python | Notifications to EMR | Free |

---

## Data Flow (Step by Step)

### 1. Doctor Orders Imaging in MedSys

```
Doctor clicks "Order X-Ray"
         │
         ▼
MedSys creates order with:
  • Patient Name: John Doe
  • Patient ID: P000123
  • Study: Chest X-Ray
  • Accession #: ACC-2024-00456
         │
         ▼
MedSys sends to Orthanc Worklist
```

### 2. Technician Sees Patient on Machine

```
Technician opens "Worklist" on X-Ray machine
         │
         ▼
Machine queries Orthanc: "What patients are scheduled?"
         │
         ▼
Orthanc returns: "John Doe - Chest X-Ray - ACC-2024-00456"
         │
         ▼
Technician selects patient (no manual typing!)
```

### 3. Images Acquired and Sent

```
Technician takes X-Ray, clicks "Save"
         │
         ▼
Machine sends image to Orthanc (DICOM C-STORE)
         │
         ▼
Orthanc stores image and notifies MedSys:
  "New study arrived for ACC-2024-00456"
         │
         ▼
MedSys links image to John Doe's record
MedSys notifies ordering doctor
```

### 4. Doctor Views Images

```
Doctor opens John Doe's chart in MedSys
         │
         ▼
Clicks "View X-Ray"
         │
         ▼
MedSys requests image from Orthanc (DICOMweb)
         │
         ▼
Image displays in browser (OHIF Viewer)
```

---

## Implementation Timeline

| Phase | Tasks | Duration | Dependencies |
|-------|-------|----------|--------------|
| **1. Infrastructure** | Deploy Orthanc server, configure network | 1-2 days | Server/VM available |
| **2. Siemens Visit** | Configure both machines | 1 day | Orthanc running |
| **3. Backend Dev** | Build MedSys integration | 1-2 weeks | Phase 1 complete |
| **4. Viewer Integration** | Add image viewing to EMR | 1 week | Phase 3 complete |
| **5. Testing** | End-to-end testing with real images | 3-5 days | All phases complete |
| **6. Go-Live** | Training, documentation, support | 2-3 days | Testing complete |

**Total: 4-6 weeks** (including Siemens scheduling)

---

## Security & Compliance

### Data Protection

| Aspect | Implementation |
|--------|----------------|
| **Data at Rest** | Images stored on hospital-controlled server |
| **Data in Transit** | DICOM over hospital LAN (can add TLS) |
| **Access Control** | MedSys authentication required to view images |
| **Audit Trail** | All image access logged in MedSys |
| **Backup** | Standard hospital backup procedures apply |

### HIPAA/Data Privacy

- All data remains on-premise (no cloud required)
- No third-party vendors handle patient images
- Existing hospital security policies apply
- Access controlled through MedSys user roles

---

## Costs Summary

| Item | One-Time Cost | Recurring Cost |
|------|---------------|----------------|
| Orthanc Software | $0 | $0 |
| Server (if using existing VM) | $0 | $0 |
| Server (if buying new) | $750-1,100 | $0 |
| Storage (500GB-2TB) | $100-300 | $0 |
| Siemens Service Visit | TBD (contact Siemens) | $0 |
| MedSys Development | Internal | $0 |
| **Total (using existing infra)** | **~$0 + Siemens visit** | **$0/month** |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Siemens scheduling delays | Medium | Delays go-live | Schedule early, have backup dates |
| Network connectivity issues | Low | Images fail to send | Test thoroughly before go-live |
| Storage fills up | Low | New images rejected | Monitor disk space, set alerts |
| Machine firmware incompatibility | Very Low | Integration fails | Verify DICOM conformance beforehand |

---

## Next Steps

1. **IT Team:** Provision server/VM for Orthanc
2. **IT Team:** Document current network topology for imaging machines
3. **Administration:** Contact Siemens to schedule service visit
4. **Development:** Begin Orthanc deployment and MedSys integration
5. **Clinical:** Identify pilot users for testing phase

---

## Related Documentation

- [DICOM Imaging Integration - Technical Specification](./DICOM_IMAGING_INTEGRATION.md)

---

*Document created: March 2026*
*Status: Planning*
