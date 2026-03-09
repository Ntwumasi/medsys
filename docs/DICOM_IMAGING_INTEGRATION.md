# DICOM Imaging Integration Plan

## Overview

This document outlines the integration of medical imaging systems (Siemens Axiom Luminos dRF and Siemens ACUSON Redwood) with the MedSys EMR using DICOM standards and an Orthanc PACS server.

---

## Current Imaging Equipment

### System 1: Siemens Axiom Luminos dRF
| Property | Value |
|----------|-------|
| Type | Digital Radiography / Fluoroscopy |
| Model | Axiom Luminos dRF |
| Year | 2017 |
| Software | VE10Z |
| Modality Codes | RF, DX, XA |
| Protocol | DICOM 3.0 |

**Capabilities:**
- DICOM C-STORE (push studies)
- DICOM Modality Worklist (MWL)
- DICOM MPPS (procedure status)
- Radiation Dose Structured Reports (RDSR)

### System 2: Siemens ACUSON Redwood
| Property | Value |
|----------|-------|
| Type | Ultrasound System |
| Model | ACUSON Redwood |
| Modality Code | US |
| Protocol | DICOM 3.0 + HL7 |

**Capabilities:**
- DICOM C-STORE
- DICOM Modality Worklist (MWL)
- DICOM SR (Structured Reports with measurements)
- DICOM MPPS
- DICOMweb capable

**AI-Generated Measurements (output as DICOM SR):**
- eSie Measure — cardiac (2D, M-mode, Doppler)
- eSie Left Heart — LV/LA auto-contouring + quantification
- eSie OB — obstetric biometric measurements (AC, BPD, FL, EFW)
- eSie Follicle — follicle measurements
- syngo VVI — Global Longitudinal Strain (GLS, GRS, GCS)
- pSWE — tissue stiffness (liver)
- 2D Shear Wave — breast/thyroid

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        HOSPITAL NETWORK (LAN)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐          ┌─────────────────┐                      │
│  │ Siemens Luminos │          │ Siemens ACUSON  │                      │
│  │ dRF (X-Ray)     │          │ Redwood (US)    │                      │
│  │ AE: LUMINOS_DRF │          │ AE: REDWOOD_US  │                      │
│  └────────┬────────┘          └────────┬────────┘                      │
│           │                            │                                │
│           │ DICOM C-STORE              │ DICOM C-STORE                 │
│           │ DICOM MPPS                 │ DICOM MPPS                    │
│           │ Query MWL                  │ DICOM SR                      │
│           │                            │ Query MWL                     │
│           ▼                            ▼                                │
│  ┌──────────────────────────────────────────────┐                      │
│  │           ORTHANC DICOM SERVER               │                      │
│  │                                              │                      │
│  │  AE Title: MEDSYS_PACS                       │                      │
│  │  DICOM Port: 4242                            │                      │
│  │  REST API: http://orthanc:8042               │                      │
│  │                                              │                      │
│  │  Plugins:                                    │                      │
│  │  - orthanc-dicomweb (QIDO/WADO/STOW)        │                      │
│  │  - orthanc-worklists (MWL)                  │                      │
│  │  - orthanc-python (webhooks)                │                      │
│  │                                              │                      │
│  │  Storage: /var/lib/orthanc/db OR S3         │                      │
│  └──────────────────┬───────────────────────────┘                      │
│                     │                                                   │
│                     │ REST API / DICOMweb                              │
│                     │ Webhooks (on-stored-instance)                    │
│                     ▼                                                   │
│  ┌──────────────────────────────────────────────┐                      │
│  │           MEDSYS BACKEND                     │                      │
│  │                                              │                      │
│  │  Services:                                   │                      │
│  │  - dicomService.ts (Orthanc communication)  │                      │
│  │  - worklistService.ts (MWL generation)      │                      │
│  │  - studyService.ts (study management)       │                      │
│  │  - srParserService.ts (parse DICOM SR)      │                      │
│  │                                              │                      │
│  │  Endpoints:                                  │                      │
│  │  - POST /api/dicom/webhook (receive notify) │                      │
│  │  - GET /api/imaging/studies/:id             │                      │
│  │  - GET /api/imaging/viewer/:studyUid        │                      │
│  └──────────────────┬───────────────────────────┘                      │
│                     │                                                   │
│                     ▼                                                   │
│  ┌──────────────────────────────────────────────┐                      │
│  │           MEDSYS FRONTEND                    │                      │
│  │                                              │                      │
│  │  Components:                                 │                      │
│  │  - DicomViewer (OHIF or Cornerstone.js)     │                      │
│  │  - StudyList (patient's imaging history)    │                      │
│  │  - MeasurementsPanel (ultrasound data)      │                      │
│  │  - ImagingOrderStatus (real-time updates)   │                      │
│  └──────────────────────────────────────────────┘                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Doctor Orders Imaging Study
```
Doctor Dashboard                    MedSys Backend                 Orthanc
      │                                   │                           │
      │ POST /orders/imaging              │                           │
      │ (patient, study type)             │                           │
      │──────────────────────────────────►│                           │
      │                                   │                           │
      │                                   │ Create MWL entry          │
      │                                   │ (worklist file)           │
      │                                   │──────────────────────────►│
      │                                   │                           │
      │◄──────────────────────────────────│                           │
      │ Order created, Accession #        │                           │
```

### 2. Technician Acquires Images
```
Imaging Machine                         Orthanc
      │                                    │
      │ Query MWL (by patient ID)          │
      │───────────────────────────────────►│
      │                                    │
      │◄───────────────────────────────────│
      │ Worklist items (patient, order)    │
      │                                    │
      │ [Technician selects patient,       │
      │  acquires images]                  │
      │                                    │
      │ DICOM C-STORE (images)             │
      │───────────────────────────────────►│
      │                                    │
      │ DICOM MPPS (procedure complete)    │
      │───────────────────────────────────►│
      │                                    │
```

### 3. Study Arrives in EMR
```
Orthanc                          MedSys Backend                  Database
   │                                   │                            │
   │ Webhook: on-stored-instance       │                            │
   │ (new study arrived)               │                            │
   │──────────────────────────────────►│                            │
   │                                   │                            │
   │                                   │ Link study to order        │
   │                                   │ (by accession number)      │
   │                                   │───────────────────────────►│
   │                                   │                            │
   │                                   │ Update order status        │
   │                                   │ to 'completed'             │
   │                                   │───────────────────────────►│
   │                                   │                            │
   │                                   │ Parse SR (if ultrasound)   │
   │                                   │ Store measurements         │
   │                                   │───────────────────────────►│
   │                                   │                            │
   │                                   │ Notify doctor (SSE)        │
   │                                   │                            │
```

### 4. Doctor Views Images
```
Doctor Dashboard                 MedSys Backend                   Orthanc
      │                                │                             │
      │ Click "View Images"            │                             │
      │ GET /imaging/viewer/:studyUid  │                             │
      │───────────────────────────────►│                             │
      │                                │                             │
      │                                │ GET /dicom-web/studies/...  │
      │                                │────────────────────────────►│
      │                                │                             │
      │                                │◄────────────────────────────│
      │                                │ Study metadata + image URLs │
      │◄───────────────────────────────│                             │
      │                                │                             │
      │ [OHIF/Cornerstone loads        │                             │
      │  images directly from Orthanc] │                             │
      │─────────────────────────────────────────────────────────────►│
      │                                                              │
      │◄─────────────────────────────────────────────────────────────│
      │ DICOM images (WADO-RS)                                       │
```

---

## Database Schema Changes

### New Tables

```sql
-- Store DICOM studies metadata
CREATE TABLE imaging_studies (
  id SERIAL PRIMARY KEY,
  study_instance_uid VARCHAR(128) UNIQUE NOT NULL,  -- DICOM Study UID
  accession_number VARCHAR(64),                      -- Links to imaging_orders
  patient_id INTEGER REFERENCES patients(id),
  imaging_order_id INTEGER REFERENCES imaging_orders(id),
  encounter_id INTEGER REFERENCES encounters(id),

  -- Study metadata (from DICOM)
  study_date TIMESTAMP,
  study_description VARCHAR(255),
  modality VARCHAR(16),                              -- DX, RF, US, etc.
  institution_name VARCHAR(255),
  referring_physician VARCHAR(255),

  -- Orthanc references
  orthanc_id VARCHAR(64),                            -- Orthanc's internal ID
  series_count INTEGER DEFAULT 0,
  instances_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(32) DEFAULT 'received',             -- received, reviewed, reported
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store individual series within a study
CREATE TABLE imaging_series (
  id SERIAL PRIMARY KEY,
  study_id INTEGER REFERENCES imaging_studies(id) ON DELETE CASCADE,
  series_instance_uid VARCHAR(128) UNIQUE NOT NULL,
  series_number INTEGER,
  series_description VARCHAR(255),
  modality VARCHAR(16),
  body_part_examined VARCHAR(64),
  instances_count INTEGER DEFAULT 0,
  orthanc_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Store structured report measurements (from ultrasound)
CREATE TABLE imaging_measurements (
  id SERIAL PRIMARY KEY,
  study_id INTEGER REFERENCES imaging_studies(id) ON DELETE CASCADE,
  patient_id INTEGER REFERENCES patients(id),

  -- Measurement details
  measurement_type VARCHAR(64),        -- e.g., 'LV_EF', 'BPD', 'FL', 'AC'
  measurement_name VARCHAR(128),       -- Human readable name
  value DECIMAL(10, 4),
  unit VARCHAR(32),                    -- e.g., 'mm', 'cm', '%', 'ml'

  -- Context
  body_site VARCHAR(64),
  laterality VARCHAR(16),              -- 'left', 'right', 'bilateral'

  -- Reference ranges
  reference_min DECIMAL(10, 4),
  reference_max DECIMAL(10, 4),
  is_abnormal BOOLEAN DEFAULT FALSE,

  -- Source
  sr_sop_instance_uid VARCHAR(128),    -- DICOM SR reference

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_imaging_studies_patient ON imaging_studies(patient_id);
CREATE INDEX idx_imaging_studies_order ON imaging_studies(imaging_order_id);
CREATE INDEX idx_imaging_studies_accession ON imaging_studies(accession_number);
CREATE INDEX idx_imaging_studies_uid ON imaging_studies(study_instance_uid);
CREATE INDEX idx_imaging_measurements_study ON imaging_measurements(study_id);
CREATE INDEX idx_imaging_measurements_patient ON imaging_measurements(patient_id);
```

### Modify imaging_orders Table

```sql
-- Add DICOM-related fields to existing imaging_orders table
ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS accession_number VARCHAR(64) UNIQUE;
ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS study_instance_uid VARCHAR(128);
ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS scheduled_station_ae_title VARCHAR(16);
ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS scheduled_procedure_step_id VARCHAR(64);
ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS modality_worklist_pushed BOOLEAN DEFAULT FALSE;
ALTER TABLE imaging_orders ADD COLUMN IF NOT EXISTS mpps_received BOOLEAN DEFAULT FALSE;

-- Index for accession number lookups
CREATE INDEX IF NOT EXISTS idx_imaging_orders_accession ON imaging_orders(accession_number);
```

---

## Implementation Phases

### Phase 1: Orthanc Server Setup (Infrastructure)
**Duration: 1-2 days**

1. Create Docker Compose configuration for Orthanc
2. Configure Orthanc plugins (DICOMweb, Worklists, Python)
3. Set up storage (local or S3)
4. Configure network/firewall for DICOM port 4242
5. Test basic DICOM connectivity

**Deliverables:**
- `docker-compose.orthanc.yml`
- `orthanc.json` (configuration)
- Setup documentation

### Phase 2: Backend DICOM Service (Core Integration)
**Duration: 3-4 days**

1. Create `dicomService.ts` - Orthanc REST API client
2. Create `worklistService.ts` - Generate MWL files
3. Create `studyService.ts` - Manage imaging studies
4. Implement webhook endpoint for new studies
5. Update imaging order flow to generate accession numbers
6. Database migrations for new tables

**Deliverables:**
- Backend services
- API endpoints
- Database migrations

### Phase 3: Modality Worklist Integration
**Duration: 2-3 days**

1. Generate worklist files when imaging ordered
2. Configure Orthanc worklist plugin
3. Test MWL query from imaging machines
4. Handle worklist cleanup (completed/expired)

**Deliverables:**
- MWL generation service
- Worklist file management
- Machine configuration guide

### Phase 4: Study Reception & Linking
**Duration: 2-3 days**

1. Implement webhook handler for `on-stored-instance`
2. Parse DICOM metadata from incoming studies
3. Link studies to orders via accession number
4. Update order status automatically
5. Send real-time notifications to doctors

**Deliverables:**
- Webhook handler
- Study linking logic
- SSE notifications

### Phase 5: DICOM Viewer Integration
**Duration: 3-4 days**

1. Integrate OHIF Viewer OR Cornerstone.js
2. Create viewer component in React
3. Proxy DICOMweb requests through backend (auth)
4. Add viewer to Imaging Dashboard and Patient Details
5. Implement basic viewing tools (zoom, pan, window/level)

**Deliverables:**
- DICOM viewer component
- Integration with patient records
- Viewing tools

### Phase 6: Structured Report Parsing (Ultrasound)
**Duration: 2-3 days**

1. Parse DICOM SR files from Orthanc
2. Extract measurements (cardiac, OB, etc.)
3. Store in `imaging_measurements` table
4. Display measurements in UI
5. Flag abnormal values

**Deliverables:**
- SR parser service
- Measurements display component
- Abnormal value alerts

### Phase 7: Testing & Go-Live
**Duration: 2-3 days**

1. End-to-end testing with real machines
2. Test all modalities (X-Ray, Fluoro, Ultrasound)
3. Performance testing with large studies
4. User training documentation
5. Go-live support

**Deliverables:**
- Test results
- Training materials
- Go-live checklist

---

## Required Credentials & Configuration

### NO External API Keys Required!

DICOM is a standard protocol that works over your local network. No cloud API keys are needed.

### What You DO Need:

#### 1. Network Configuration
```
Item                          Value                    Notes
─────────────────────────────────────────────────────────────────
Orthanc Server IP             [Your Server IP]         Static IP recommended
Orthanc DICOM Port            4242                     Standard, configurable
Orthanc REST Port             8042                     For API access
```

#### 2. AE Titles (Application Entity Titles)
```
Device                        AE Title                 Description
─────────────────────────────────────────────────────────────────
Orthanc Server                MEDSYS_PACS              Your DICOM server
Siemens Luminos dRF           LUMINOS_DRF              X-Ray/Fluoro machine
Siemens ACUSON Redwood        REDWOOD_US               Ultrasound machine
```

#### 3. Orthanc Credentials (Internal)
```bash
# These are internal credentials, you define them
ORTHANC_USERNAME=medsys
ORTHANC_PASSWORD=[generate secure password]
```

#### 4. Machine Configuration (Done by Siemens/Biomedical)
Each imaging machine needs to be configured with:
- Remote AE Title: `MEDSYS_PACS`
- Remote Host: `[Orthanc Server IP]`
- Remote Port: `4242`
- Local AE Title: `LUMINOS_DRF` or `REDWOOD_US`

### Environment Variables for MedSys

```bash
# Add to .env file
# ──────────────────────────────────────────────────────

# Orthanc DICOM Server
ORTHANC_URL=http://localhost:8042
ORTHANC_USERNAME=medsys
ORTHANC_PASSWORD=your_secure_password
ORTHANC_AE_TITLE=MEDSYS_PACS
ORTHANC_DICOM_PORT=4242

# DICOMweb endpoints (served by Orthanc)
DICOMWEB_URL=http://localhost:8042/dicom-web

# Worklist directory (where MWL files are stored)
WORKLIST_DIR=/var/lib/orthanc/worklists

# Storage (optional - for S3 backend)
# ORTHANC_S3_BUCKET=medsys-dicom-storage
# ORTHANC_S3_REGION=us-east-1
# ORTHANC_S3_ACCESS_KEY=xxx
# ORTHANC_S3_SECRET_KEY=xxx
```

---

## Docker Compose Configuration

```yaml
# docker-compose.orthanc.yml

version: '3.8'

services:
  orthanc:
    image: orthancteam/orthanc:24.1.2
    container_name: medsys-orthanc
    restart: unless-stopped
    ports:
      - "4242:4242"   # DICOM port
      - "8042:8042"   # REST API port
    volumes:
      - orthanc-db:/var/lib/orthanc/db
      - orthanc-worklists:/var/lib/orthanc/worklists
      - ./orthanc.json:/etc/orthanc/orthanc.json:ro
    environment:
      - ORTHANC_NAME=MedSys PACS
      - VERBOSE_ENABLED=true
      - DICOM_WEB_PLUGIN_ENABLED=true
      - WORKLISTS_PLUGIN_ENABLED=true
    networks:
      - medsys-network

volumes:
  orthanc-db:
  orthanc-worklists:

networks:
  medsys-network:
    external: true
```

---

## Orthanc Configuration

```json
// orthanc.json
{
  "Name": "MedSys PACS",
  "StorageDirectory": "/var/lib/orthanc/db",
  "IndexDirectory": "/var/lib/orthanc/db",

  "RemoteAccessAllowed": true,
  "AuthenticationEnabled": true,
  "RegisteredUsers": {
    "medsys": "your_secure_password"
  },

  "DicomServerEnabled": true,
  "DicomAet": "MEDSYS_PACS",
  "DicomPort": 4242,
  "DicomCheckCalledAet": false,

  "HttpServerEnabled": true,
  "HttpPort": 8042,

  "DicomModalities": {
    "LUMINOS_DRF": ["LUMINOS_DRF", "192.168.1.100", 4242],
    "REDWOOD_US": ["REDWOOD_US", "192.168.1.101", 4242]
  },

  "DicomWeb": {
    "Enable": true,
    "Root": "/dicom-web/",
    "EnableWado": true,
    "WadoRoot": "/wado/",
    "Ssl": false,
    "QidoCaseSensitive": false,
    "Host": "0.0.0.0"
  },

  "Worklists": {
    "Enable": true,
    "Database": "/var/lib/orthanc/worklists"
  },

  "Python": {
    "Path": "/etc/orthanc/scripts/",
    "Verbose": true
  },

  "StableAge": 60,
  "LuaScripts": [],

  "HttpsCACertificates": "",
  "SslEnabled": false
}
```

---

## Security Considerations

### Network Security
- [ ] Orthanc server should be on internal network only
- [ ] Firewall rules: Only allow DICOM port from imaging machines
- [ ] HTTPS for REST API if exposed outside local network
- [ ] VPN required for remote access

### Authentication
- [ ] Basic auth for Orthanc REST API
- [ ] MedSys backend authenticates all viewer requests
- [ ] No direct public access to Orthanc

### Data Protection
- [ ] DICOM data contains PHI - handle per HIPAA/local regulations
- [ ] Consider encryption at rest for storage
- [ ] Audit logging for all image access
- [ ] Backup strategy for DICOM storage

---

## Vendor Coordination Required

### Siemens Healthineers / Biomedical Engineering

The imaging machines need to be configured to communicate with Orthanc. This typically requires:

1. **Service Engineer Visit** - Siemens certified engineer to configure:
   - Remote AE Title settings
   - Remote host/port configuration
   - MWL query settings
   - MPPS destination

2. **Information to Provide to Siemens:**
   ```
   DICOM Server Information
   ────────────────────────────────────
   AE Title:        MEDSYS_PACS
   IP Address:      [Your Orthanc Server IP]
   Port:            4242

   Worklist Settings
   ────────────────────────────────────
   Query by:        Patient ID, Accession Number

   MPPS Destination
   ────────────────────────────────────
   AE Title:        MEDSYS_PACS
   IP Address:      [Your Orthanc Server IP]
   Port:            4242
   ```

3. **Testing Requirements:**
   - C-ECHO (connectivity test)
   - MWL query test
   - C-STORE test (send test image)
   - MPPS test

---

## Viewer Options

### Option A: OHIF Viewer (Recommended)
- Full-featured medical image viewer
- Used by major institutions
- Runs as separate service or embedded
- Supports all DICOM modalities
- Measurement tools built-in
- URL: https://ohif.org

```yaml
# Add to docker-compose
ohif-viewer:
  image: ohif/viewer:v3.7.0
  ports:
    - "3001:80"
  environment:
    - APP_CONFIG=/usr/share/nginx/html/app-config.js
  volumes:
    - ./ohif-config.js:/usr/share/nginx/html/app-config.js
```

### Option B: Cornerstone.js (Embedded)
- Lightweight JavaScript library
- Embed directly in MedSys UI
- More customizable
- Requires more development
- URL: https://cornerstonejs.org

```typescript
// Example usage
import cornerstone from 'cornerstone-core';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

// Load and display image
const imageId = `wadors:${orthancUrl}/dicom-web/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}`;
cornerstone.loadAndCacheImage(imageId).then(image => {
  cornerstone.displayImage(element, image);
});
```

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Orthanc server running and accessible
- [ ] C-ECHO successful from both imaging machines
- [ ] REST API responding with authentication

### Phase 2 Complete When:
- [ ] Backend can query Orthanc for studies
- [ ] Backend can retrieve study metadata
- [ ] Webhook endpoint receives notifications

### Phase 3 Complete When:
- [ ] MWL files generated when imaging ordered
- [ ] Machines can query and see worklist items
- [ ] Patient info auto-populates on machine

### Phase 4 Complete When:
- [ ] Studies automatically linked to orders
- [ ] Order status updates to "completed"
- [ ] Doctor receives notification of results

### Phase 5 Complete When:
- [ ] Images viewable in browser
- [ ] Basic tools work (zoom, pan, window/level)
- [ ] Viewer accessible from patient record

### Phase 6 Complete When:
- [ ] Ultrasound measurements extracted
- [ ] Measurements displayed in UI
- [ ] Abnormal values flagged

---

## Timeline Estimate

| Phase | Description | Duration | Dependencies |
|-------|-------------|----------|--------------|
| 1 | Orthanc Setup | 1-2 days | Server/Docker ready |
| 2 | Backend Services | 3-4 days | Phase 1 |
| 3 | Modality Worklist | 2-3 days | Phase 2 |
| 4 | Study Reception | 2-3 days | Phase 3 |
| 5 | DICOM Viewer | 3-4 days | Phase 4 |
| 6 | SR Parsing | 2-3 days | Phase 4 |
| 7 | Testing & Go-Live | 2-3 days | All phases |

**Total Estimate: 15-22 days**

*Note: Timeline assumes Siemens service visit scheduled in parallel with development.*

---

## References

- [DICOM Standard](https://www.dicomstandard.org/)
- [Orthanc Documentation](https://book.orthanc-server.com/)
- [DICOMweb Standard](https://www.dicomstandard.org/using/dicomweb)
- [OHIF Viewer](https://docs.ohif.org/)
- [Cornerstone.js](https://docs.cornerstonejs.org/)
- [Siemens DICOM Conformance Statements](https://www.siemens-healthineers.com/services/it-standards-interoperability/dicom-conformance-statements)

---

## Contact Points

| Role | Responsibility |
|------|----------------|
| IT/Network Admin | Network config, firewall rules, server provisioning |
| Biomedical Engineering | Coordinate Siemens service visit |
| Siemens Service Engineer | Configure imaging machines |
| MedSys Developer | Backend/frontend integration |
| Radiology Staff | Testing and validation |

---

*Document created: March 2026*
*Last updated: March 2026*
*Status: Planning*
