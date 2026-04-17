# MedSys EMR - Architecture & Disaster Recovery Plan

**Document Version:** 1.0
**Date:** March 30, 2026
**Classification:** Internal - Stakeholder Review

---

## Executive Summary

MedSys EMR is a hybrid cloud/on-premise medical practice management system that integrates:
- **Cloud-hosted** web application and database (Vercel + Neon PostgreSQL)
- **On-premise** QuickBooks Desktop integration for billing/accounting
- **On-premise** DICOM integration for medical imaging

This document outlines the recommended architecture, disaster recovery procedures, and operational best practices to ensure system resilience and data protection.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Recommended Architecture](#recommended-architecture)
3. [Component Overview](#component-overview)
4. [QuickBooks Integration](#quickbooks-integration)
5. [DICOM Integration](#dicom-integration)
6. [Disaster Recovery Plan](#disaster-recovery-plan)
7. [Backup Strategy](#backup-strategy)
8. [Security Considerations](#security-considerations)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Operational Procedures](#operational-procedures)

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUD (Vercel)                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   Next.js   │───▶│   API       │───▶│   Neon Postgres     │ │
│  │   Frontend  │    │   Routes    │    │   (Serverless DB)   │ │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘ │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTPS (outbound polling)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ON-PREMISE SERVER                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   QB Web    │───▶│ QuickBooks  │    │   DICOM Server      │ │
│  │  Connector  │    │  Desktop    │    │   (Medical Imaging) │ │
│  └─────────────┘    └─────────────┘    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Current Hosting Details

| Component | Platform | Location | Status |
|-----------|----------|----------|--------|
| Web Application | Vercel | Cloud (US) | Production |
| Database | Neon PostgreSQL | Cloud (US) | Production |
| QuickBooks Desktop | On-Premise Server | Local | Active |
| QB Web Connector | On-Premise Server | Local | Active |
| DICOM Server | On-Premise Server | Local | Active |

---

## Recommended Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD LAYER                                      │
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────────────────────────────────────┐│
│  │    Vercel       │     │              Backend Service                    ││
│  │  ┌───────────┐  │     │         (Railway / Render / AWS)                ││
│  │  │  Next.js  │  │     │  ┌─────────────┐  ┌─────────────────────────┐  ││
│  │  │  Frontend │──┼────▶│  │   Express   │  │   Background Workers    │  ││
│  │  └───────────┘  │     │  │   API       │  │   - DICOM polling       │  ││
│  └─────────────────┘     │  │   Server    │  │   - Queue processing    │  ││
│                          │  └──────┬──────┘  └─────────────────────────┘  ││
│                          └─────────┼──────────────────────────────────────┘│
│                                    │                                        │
│  ┌─────────────────────────────────┼───────────────────────────────────────┐│
│  │                          DATA LAYER                                      ││
│  │  ┌─────────────────┐    ┌──────┴──────┐    ┌─────────────────────────┐ ││
│  │  │  Neon Postgres  │◀──▶│   Redis     │    │   Blob Storage          │ ││
│  │  │  (Primary)      │    │   (Queue/   │    │   (S3/Vercel Blob)      │ ││
│  │  │                 │    │    Cache)   │    │   - DICOM files         │ ││
│  │  │  + Read Replica │    └─────────────┘    │   - Reports/PDFs        │ ││
│  │  └─────────────────┘                       └─────────────────────────┘ ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │   Cloudflare Tunnel / VPN      │
                    │   (Encrypted Connection)       │
                    └───────────────┬───────────────┘
                                    │
┌───────────────────────────────────┼──────────────────────────────────────────┐
│                          ON-PREMISE LAYER                                     │
│                                   │                                           │
│  ┌────────────────────────────────┴─────────────────────────────────────────┐│
│  │                PRIMARY GATEWAY SERVER (Windows Server)                    ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  ││
│  │  │  QB Web         │  │  DICOM Gateway  │  │  Tunnel Agent           │  ││
│  │  │  Connector      │  │  (Orthanc)      │  │  (Cloudflare/Tailscale) │  ││
│  │  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘  ││
│  └───────────┼────────────────────┼─────────────────────────────────────────┘│
│              │                    │                                           │
│  ┌───────────┴────────┐  ┌────────┴─────────┐                                │
│  │  QuickBooks        │  │  Imaging         │                                │
│  │  Desktop Pro       │  │  Equipment       │                                │
│  │  (Company File)    │  │  (CT/MRI/X-Ray)  │                                │
│  └────────────────────┘  └──────────────────┘                                │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                BACKUP/DR SERVER (Windows Server)                          ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  ││
│  │  │  QuickBooks     │  │  DICOM Backup   │  │  Standby Tunnel         │  ││
│  │  │  (Standby)      │  │  (Replica)      │  │  Agent                  │  ││
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Overview

### Cloud Components

| Component | Purpose | Provider | Cost (Est.) |
|-----------|---------|----------|-------------|
| **Frontend** | User interface, patient portal | Vercel | $20/month |
| **Database** | Patient records, billing data | Neon PostgreSQL | $25/month |
| **Blob Storage** | Documents, images, reports | Vercel Blob/S3 | $10/month |
| **Monitoring** | Uptime, performance alerts | Better Uptime | $20/month |

### On-Premise Components

| Component | Purpose | Requirements |
|-----------|---------|--------------|
| **Primary Server** | QuickBooks, DICOM, Gateway | Windows Server 2019+, 16GB RAM, 500GB SSD |
| **Backup Server** | DR replica, failover | Windows Server 2019+, 16GB RAM, 1TB HDD |
| **QuickBooks Desktop** | Accounting, billing sync | QB Desktop Pro 2024+ |
| **DICOM Server** | Medical image storage | Orthanc or DCM4CHEE |

---

## QuickBooks Integration

### Architecture Decision: Server vs. Accountant Desktop

**Recommendation: Install on Dedicated Server**

| Factor | Server Installation | Accountant Desktop |
|--------|--------------------|--------------------|
| **Availability** | 24/7 (always on) | Limited (work hours only) |
| **Reliability** | High (UPS, auto-restart) | Low (sleep, shutdown) |
| **Multi-user Access** | Yes | Limited |
| **Sync Frequency** | Every 5 minutes | Only when computer is on |
| **DR/Backup** | Automated | Manual |
| **Security** | Centralized, controlled | Varies |

### QuickBooks Web Connector Flow

```
┌─────────────────┐     HTTPS Poll      ┌─────────────────┐
│  QB Web         │ ──────────────────▶ │  MedSys API     │
│  Connector      │     (every 5 min)   │  (Vercel)       │
│  (On-Premise)   │ ◀────────────────── │                 │
└────────┬────────┘     QBXML Data      └─────────────────┘
         │
         ▼
┌─────────────────┐
│  QuickBooks     │
│  Desktop        │
│  (Company File) │
└─────────────────┘
```

### QB Integration Requirements

1. **QuickBooks Desktop Pro/Premier 2024** or newer
2. **Windows Server 2019/2022** (recommended) or Windows 10/11 Pro
3. **QB Web Connector 2.3+** installed and configured
4. **Company file** must be open for sync to work
5. **MedSys application** authorized in QuickBooks

### Sync Capabilities

| Entity | Direction | Frequency |
|--------|-----------|-----------|
| Customers (Patients) | MedSys → QB | On demand / Auto |
| Invoices | MedSys → QB | On demand / Auto |
| Payments | MedSys → QB | On demand / Auto |
| Service Items | QB → MedSys | Import on demand |

---

## DICOM Integration

### Overview

DICOM (Digital Imaging and Communications in Medicine) handles medical imaging from:
- X-Ray machines
- CT Scanners
- MRI machines
- Ultrasound equipment

### Recommended DICOM Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Imaging        │────▶│  Orthanc        │────▶│  Cloud Storage  │
│  Equipment      │     │  DICOM Server   │     │  (Archive)      │
│  (Modalities)   │     │  (On-Premise)   │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  Cloudflare Tunnel      │
                    │  (Secure Connection)    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  MedSys Web App         │
                    │  (OHIF/Cornerstone      │
                    │   DICOM Viewer)         │
                    └─────────────────────────┘
```

### DICOM Data Flow

1. **Acquisition**: Imaging equipment captures study
2. **Storage**: Images sent to Orthanc server (on-premise)
3. **Indexing**: Metadata synced to MedSys database
4. **Viewing**: Authorized users view via web-based DICOM viewer
5. **Archive**: Long-term storage in cloud (encrypted)

---

## Disaster Recovery Plan

### Recovery Time Objectives (RTO)

| Component | RTO | RPO | Priority |
|-----------|-----|-----|----------|
| Web Application | 15 min | 0 (real-time) | Critical |
| Database | 1 hour | 5 min | Critical |
| QuickBooks | 4 hours | 24 hours | High |
| DICOM Server | 4 hours | 1 hour | High |

### DR Scenarios

#### Scenario 1: Cloud Service Outage (Vercel/Neon)

| Impact | Response | Recovery |
|--------|----------|----------|
| Web app unavailable | Automatic failover to backup region | < 15 minutes |
| Database unavailable | Neon automatic recovery | < 1 hour |

**Mitigation:**
- Neon provides automatic backups and point-in-time recovery
- Vercel has multi-region deployment capability

#### Scenario 2: On-Premise Server Failure

| Impact | Response | Recovery |
|--------|----------|----------|
| QB sync stops | Activate backup server | < 4 hours |
| DICOM unavailable | Switch to replica | < 2 hours |

**Recovery Steps:**
1. Identify failure (monitoring alert)
2. Activate backup server
3. Restore QB company file from backup
4. Reconfigure Web Connector to use backup
5. Verify DICOM replica is current
6. Update Cloudflare Tunnel to backup server

#### Scenario 3: Data Corruption

| Impact | Response | Recovery |
|--------|----------|----------|
| Database corruption | Point-in-time restore | < 2 hours |
| QB file corruption | Restore from backup | < 4 hours |

**Prevention:**
- Neon automatic backups (continuous)
- Nightly QB company file backup
- DICOM replication to backup server

#### Scenario 4: Ransomware/Security Incident

| Impact | Response | Recovery |
|--------|----------|----------|
| Systems compromised | Isolate, assess, restore | 24-48 hours |

**Response Plan:**
1. Immediately isolate affected systems
2. Notify stakeholders and legal/compliance
3. Assess scope of compromise
4. Restore from clean backups
5. Conduct forensic analysis
6. Implement additional controls

---

## Backup Strategy

### Cloud Backups (Automated)

| Data | Method | Frequency | Retention |
|------|--------|-----------|-----------|
| Database | Neon automatic | Continuous | 30 days |
| Database | Export to S3 | Daily | 90 days |
| Documents | Vercel Blob replication | Real-time | Indefinite |

### On-Premise Backups

| Data | Method | Frequency | Retention |
|------|--------|-----------|-----------|
| QB Company File | Robocopy to NAS | Nightly | 30 days |
| QB Company File | Cloud upload (encrypted) | Weekly | 1 year |
| DICOM Database | Orthanc replication | Real-time | Indefinite |
| DICOM Images | Cloud archive | Daily | 7 years (HIPAA) |

### Backup Verification

- **Weekly**: Test restore of QB company file
- **Monthly**: Full DR drill (database restore)
- **Quarterly**: Complete failover test

---

## Security Considerations

### HIPAA Compliance

| Requirement | Implementation |
|-------------|----------------|
| Access Control | Role-based permissions, MFA |
| Audit Logging | All access logged to database |
| Encryption at Rest | Neon encryption, QB file encryption |
| Encryption in Transit | TLS 1.3 everywhere |
| Data Backup | Encrypted backups, tested recovery |

### Network Security

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                           │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Cloudflare │  │  Vercel     │  │  Application        │ │
│  │  WAF/DDoS   │─▶│  Edge       │─▶│  Auth (JWT)         │ │
│  │  Protection │  │  Network    │  │  Role-Based Access  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                              │
│  On-Premise:                                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Firewall   │  │  Cloudflare │  │  Windows            │ │
│  │  (No inbound│─▶│  Tunnel     │─▶│  Authentication     │ │
│  │   ports)    │  │  (Outbound) │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Access Control Matrix

| Role | Web App | QB Data | DICOM | Admin |
|------|---------|---------|-------|-------|
| Admin | Full | Full | Full | Full |
| Doctor | Read/Write | View | Full | None |
| Nurse | Read/Write | None | View | None |
| Accountant | Billing Only | Full | None | None |
| Front Desk | Limited | None | None | None |

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Task | Owner | Status |
|------|-------|--------|
| Set up Cloudflare Tunnel | IT Admin | Pending |
| Configure QB backup automation | IT Admin | Pending |
| Enable Neon read replica | DevOps | Pending |
| Add health monitoring endpoints | Developer | Pending |

### Phase 2: Redundancy (Week 3-4)

| Task | Owner | Status |
|------|-------|--------|
| Set up backup server | IT Admin | Pending |
| Configure DICOM replication | IT Admin | Pending |
| Test failover procedures | IT Admin | Pending |
| Document runbooks | IT Admin | Pending |

### Phase 3: Optimization (Week 5-6)

| Task | Owner | Status |
|------|-------|--------|
| Migrate API to dedicated server (optional) | Developer | Pending |
| Implement Redis caching | Developer | Pending |
| Set up automated DR testing | DevOps | Pending |
| Security audit | Security | Pending |

---

## Operational Procedures

### Daily Operations

- [ ] Verify QB Web Connector is running (check sync log)
- [ ] Review overnight backup success
- [ ] Check monitoring dashboard for alerts

### Weekly Operations

- [ ] Review sync error logs
- [ ] Verify backup file integrity
- [ ] Check disk space on servers
- [ ] Review security logs

### Monthly Operations

- [ ] Test database restore procedure
- [ ] Review and update access permissions
- [ ] Patch servers and applications
- [ ] Review DR plan and update if needed

### Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| IT Administrator | TBD | TBD | TBD |
| Application Support | TBD | TBD | TBD |
| Database Admin | TBD | TBD | TBD |
| Vendor Support (Intuit) | N/A | 1-800-4INTUIT | N/A |

---

## Appendix

### A. Server Specifications

**Primary Server (Recommended)**
- OS: Windows Server 2022
- CPU: Intel Xeon or AMD EPYC (4+ cores)
- RAM: 16GB minimum, 32GB recommended
- Storage: 500GB SSD (OS/Apps) + 2TB HDD (Data)
- Network: Gigabit Ethernet
- UPS: 1500VA minimum

**Backup Server**
- OS: Windows Server 2022
- CPU: Intel Xeon or AMD EPYC (4+ cores)
- RAM: 16GB
- Storage: 1TB SSD
- Network: Gigabit Ethernet

### B. Software Requirements

| Software | Version | License |
|----------|---------|---------|
| Windows Server | 2022 | Per-server |
| QuickBooks Desktop | Pro 2024+ | Annual subscription |
| QB Web Connector | 2.3+ | Free |
| Orthanc DICOM | Latest | Open Source |
| Cloudflare Tunnel | Latest | Free |

### C. Network Requirements

| Service | Port | Direction | Notes |
|---------|------|-----------|-------|
| HTTPS | 443 | Outbound | Web Connector → Cloud |
| Cloudflare Tunnel | 443 | Outbound | Tunnel connection |
| DICOM | 4242 | Internal | Imaging equipment |

---

**Document Approval**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| IT Director | | | |
| Practice Manager | | | |
| Compliance Officer | | | |

---

*This document should be reviewed and updated quarterly or when significant changes occur.*