# MedSys EMR — Ghana On-Site Deployment Checklist

**Deployment Date:** _______________
**Engineer:** Nokio Twumasi
**Clinic:** _______________

---

# PART 1: PRE-ARRIVAL CHECKLIST (Send to Clinic IT)

> **Send this section to the clinic's IT contact at least 3-5 days before arrival.**
> They need to prepare these items so installation can begin immediately.

---

## A. Server Hardware

- [ ] **Dedicated server machine** ready and powered on
  - Minimum: 4-core CPU, 16 GB RAM, 500 GB SSD
  - Recommended: 8-core CPU, 32 GB RAM, 1 TB SSD + 2 TB HDD
  - Must be rack-mounted or in a secure, ventilated location
- [ ] **UPS (Uninterruptible Power Supply)** connected to server
  - Minimum 15-minute runtime for graceful shutdown
- [ ] **Monitor, keyboard, mouse** available for initial setup (can remove after)

## B. Operating System

- [ ] **Windows Server 2022 Standard** installed (or Windows Server 2019)
  - If not yet installed, have the installation media and license key ready
- [ ] Server has a **local administrator account** with known password
- [ ] Windows is **activated** with a valid license

## C. Network

- [ ] Server is **connected to clinic LAN** via Ethernet (not Wi-Fi)
- [ ] Server has a **static IP address** assigned (write it here): `_____._____._____.______`
- [ ] **Internet connection** is active and working on the server
- [ ] Internet speed: _________ Mbps down / _________ Mbps up
- [ ] ISP name and support number: _________________________________
- [ ] **Router/firewall admin access** credentials available (may need to configure ports)

## D. Imaging Equipment Network Info

Please provide the following for each imaging machine:

### Siemens Axiom Luminos dRF (X-Ray/Fluoroscopy)
- [ ] Machine is **powered on** and accessible
- [ ] IP address on LAN: `_____._____._____.______`
- [ ] Current AE Title: _________________________
- [ ] DICOM port: _________ (usually 104)
- [ ] Siemens service login available? Yes / No
- [ ] Machine can ping the server IP? Yes / No / Not tested

### Siemens ACUSON Redwood (Ultrasound)
- [ ] Machine is **powered on** and accessible
- [ ] IP address on LAN: `_____._____._____.______`
- [ ] Current AE Title: _________________________
- [ ] DICOM port: _________ (usually 104)
- [ ] Siemens service login available? Yes / No
- [ ] Machine can ping the server IP? Yes / No / Not tested

### Other Imaging Equipment (if any)
- Machine: _________________________
- IP: `_____._____._____.______`
- AE Title: _________________________

## E. QuickBooks

- [ ] **QuickBooks Desktop Pro 2024+** license key available (or already installed)
- [ ] If migrating: **existing company file backup** (.qbb) on USB or network drive
- [ ] Accountant's name and contact: _________________________________
- [ ] Chart of accounts finalized? Yes / No

## F. Email (for receipts, reminders, password resets)

- [ ] Clinic email address to send from: _________________________________
- [ ] Email provider: Gmail / Outlook / Other: ____________
- [ ] If Gmail: **App Password** generated (not regular password)
  - Instructions: Google Account → Security → 2-Step Verification → App Passwords
- [ ] SMTP credentials:
  - Host: _____________ Port: _______
  - Username: _________________________
  - Password: _________________________

## G. Staff Preparation

- [ ] **List of all staff** who will use MedSys, with:
  - Full name
  - Role (doctor / nurse / receptionist / pharmacist / lab / imaging / accountant / admin)
  - Email address
  - Phone number (for password reset)
- [ ] Staff are **available for training** on installation day(s)
- [ ] One person designated as **local IT point of contact**: _________________________

## H. Clinic Information

- [ ] Clinic full legal name: _________________________
- [ ] Clinic address: _________________________
- [ ] Clinic phone: _________________________
- [ ] Clinic logo (digital file, PNG or JPG) for invoices/letterhead
- [ ] Tax ID / Business registration number (if needed for invoices): _________________________

---

# PART 2: ENGINEER'S INSTALLATION CHECKLIST

> **This is for Nokio to follow on-site, step by step.**

---

## Phase 0: Pre-Flight (Before Leaving)

### Downloads & Media (prepare on USB drive)
- [ ] Windows Server 2022 ISO (if OS not pre-installed)
- [ ] Orthanc Windows installer (latest stable)
  - [ ] orthanc-dicomweb plugin
  - [ ] orthanc-worklists plugin
  - [ ] orthanc-python plugin
- [ ] QuickBooks Desktop Pro installer
- [ ] QB Web Connector 2.3+ installer
- [ ] Cloudflared (cloudflare tunnel agent) Windows installer
- [ ] Python 3.11+ Windows installer (for Orthanc Python plugin)
- [ ] Notepad++ or VS Code portable (for config editing)
- [ ] PuTTY or terminal tool
- [ ] Chrome browser installer

### Cloud-Side Preparation
- [ ] Cloudflare account created
- [ ] Cloudflare Tunnel created, tunnel token saved
- [ ] Tunnel routes configured:
  - `orthanc.yourdomain.com` → `http://localhost:8042`
- [ ] Vercel environment variables draft ready:
  - `ORTHANC_URL`
  - `ORTHANC_USERNAME` / `ORTHANC_PASSWORD`
  - `QB_USERNAME` / `QB_PASSWORD`
  - `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`
- [ ] MedSys backend DICOM service code deployed (dicomService.ts, worklistService.ts)
- [ ] Test patient data ready for end-to-end testing

### Physical Items to Pack
- [ ] Laptop + charger
- [ ] USB drive with all installers
- [ ] Ethernet cable (spare)
- [ ] Universal power adapter (Ghana uses UK-style Type G plugs, 230V)
- [ ] Printed copy of this checklist
- [ ] Printed copy of clinic IT pre-arrival checklist
- [ ] Phone with clinic IT contact number saved

---

## Phase 1: Server Foundation (Day 1, Morning)

### 1.1 — Verify Server Hardware
- [ ] Server powered on, UPS connected and charged
- [ ] Server accessible (monitor + keyboard or remote desktop)
- [ ] Confirm specs: _____ cores, _____ GB RAM, _____ GB disk
- [ ] Confirm static IP: `_____._____._____._____`
- [ ] Confirm internet access (open browser, load google.com)
- [ ] Ping test to imaging machines:
  - `ping _____._____._____._____ (Luminos)` → Success / Fail
  - `ping _____._____._____._____ (Redwood)` → Success / Fail

### 1.2 — Windows Server Configuration
- [ ] Windows fully updated
- [ ] Windows Firewall enabled
- [ ] Add firewall rules:
  - Inbound TCP 4242 (DICOM) — allow from LAN only
  - Inbound TCP 8042 (Orthanc REST) — allow from localhost only
- [ ] Set server to **never sleep** (Power Options → High Performance)
- [ ] Enable **auto-login** on reboot (for QB Web Connector)
- [ ] Set timezone to **GMT / UTC+0** (Ghana)
- [ ] Create MedSys admin user account (non-default)

---

## Phase 2: QuickBooks (Day 1, Midday)

### 2.1 — Install QuickBooks Desktop
- [ ] Run QB installer
- [ ] Activate license
- [ ] Create new company file OR restore from backup (.qbb)
- [ ] Verify company file opens correctly
- [ ] Set QuickBooks to **open automatically** on Windows login
- [ ] Test: create a test customer, create a test invoice

### 2.2 — Install QB Web Connector
- [ ] Run Web Connector installer
- [ ] Copy `.qwc` file to server
- [ ] Add application in Web Connector
- [ ] Enter MedSys sync password
- [ ] Set schedule: **every 5 minutes**
- [ ] Set Web Connector to **run at Windows startup**
- [ ] Test sync: trigger manual sync from Web Connector
  - [ ] Check MedSys API logs for successful connection
  - [ ] Verify test customer appears in QuickBooks

---

## Phase 3: Orthanc DICOM Server (Day 1, Afternoon)

### 3.1 — Install Orthanc
- [ ] Run Orthanc installer
- [ ] Create data directories:
  - `D:\OrthancData` (DICOM image storage)
  - `D:\OrthancIndex` (database index)
  - `D:\OrthancWorklists` (MWL files)
- [ ] Install plugins to Orthanc plugins directory:
  - [ ] orthanc-dicomweb.dll
  - [ ] orthanc-worklists.dll
  - [ ] orthanc-python.dll
- [ ] Edit `orthanc.json`:
  ```
  Name:                MEDSYS_PACS
  DicomAet:            MEDSYS_PACS
  DicomPort:           4242
  HttpPort:            8042
  Authentication:      Enabled
  RegisteredUsers:     medsys / [secure password]
  StorageDirectory:    D:\OrthancData
  IndexDirectory:      D:\OrthancIndex
  ```
- [ ] Add imaging modalities to config:
  ```
  LUMINOS_DRF:  [AE Title, IP, Port]
  REDWOOD_US:   [AE Title, IP, Port]
  ```
- [ ] Configure DICOMweb plugin (enable WADO-RS, QIDO-RS, STOW-RS)
- [ ] Configure Worklists plugin → point to `D:\OrthancWorklists`

### 3.2 — Start & Verify Orthanc
- [ ] Install Orthanc as Windows Service
- [ ] Start the service
- [ ] Open browser: `http://localhost:8042` → Orthanc Explorer loads
- [ ] Login with medsys credentials
- [ ] Verify DICOM port listening: `netstat -an | find "4242"` → LISTENING
- [ ] Upload a test DICOM file via Explorer → appears in study list

### 3.3 — Configure Imaging Machines

**Siemens Axiom Luminos dRF (X-Ray):**
- [ ] Access Siemens service/config menu
- [ ] Add new DICOM destination:
  - AE Title: `MEDSYS_PACS`
  - IP: server's static IP
  - Port: `4242`
- [ ] Configure auto-send (C-STORE) to MEDSYS_PACS after acquisition
- [ ] Configure Modality Worklist (MWL):
  - Query AE: `MEDSYS_PACS`
  - Query IP: server's static IP
  - Query Port: `4242`
- [ ] **Test:** Send a stored image to Orthanc → verify it appears in Orthanc Explorer

**Siemens ACUSON Redwood (Ultrasound):**
- [ ] Access configuration/network settings
- [ ] Add new DICOM destination:
  - AE Title: `MEDSYS_PACS`
  - IP: server's static IP
  - Port: `4242`
- [ ] Configure auto-send to MEDSYS_PACS
- [ ] Configure MWL query (same as above)
- [ ] Enable DICOM Structured Report (SR) sending
- [ ] **Test:** Perform test scan, send to Orthanc → verify images + SR arrive

---

## Phase 4: Cloudflare Tunnel (Day 1, Late Afternoon)

### 4.1 — Install Tunnel Agent
- [ ] Install `cloudflared` on server
- [ ] Authenticate: `cloudflared tunnel login`
- [ ] Connect tunnel: `cloudflared tunnel run --token <TOKEN>`
- [ ] Verify tunnel status in Cloudflare dashboard: **HEALTHY**
- [ ] Install as Windows Service: `cloudflared service install`
- [ ] Verify service starts on reboot

### 4.2 — Test Cloud Connectivity
- [ ] From your laptop (not on clinic LAN), access:
  - `https://orthanc.yourdomain.com` → Orthanc login page loads
- [ ] From MedSys Vercel deployment, verify API can reach Orthanc
- [ ] Update Vercel environment variables with final URLs/credentials
- [ ] Redeploy MedSys backend

---

## Phase 5: End-to-End Testing (Day 2, Morning)

### 5.1 — Full Workflow Test

**Imaging Order Flow:**
- [ ] Login to MedSys as doctor
- [ ] Select a test patient
- [ ] Order an imaging study (e.g., Chest X-Ray)
- [ ] Verify worklist entry appears on Siemens machine
- [ ] Acquire test image on machine (use phantom/test mode if available)
- [ ] Verify study arrives in Orthanc (check Explorer)
- [ ] Verify study appears in MedSys imaging dashboard
- [ ] Verify doctor can view images in browser (OHIF/Cornerstone viewer)
- [ ] Verify order status auto-updated to 'completed'

**QuickBooks Sync Flow:**
- [ ] Create a test patient in MedSys
- [ ] Create a test invoice with items
- [ ] Wait for QB Web Connector sync (or trigger manual)
- [ ] Verify customer + invoice appear in QuickBooks
- [ ] Record payment in MedSys
- [ ] Verify payment syncs to QuickBooks

**Email Flow:**
- [ ] Trigger a test receipt email from MedSys
- [ ] Verify email arrives at recipient
- [ ] Check sender name and formatting

### 5.2 — Failure Scenarios
- [ ] **Server reboot:** Restart server → verify all services auto-start:
  - [ ] QuickBooks opens automatically
  - [ ] QB Web Connector starts and resumes sync
  - [ ] Orthanc service running
  - [ ] Cloudflare tunnel reconnects
- [ ] **Internet outage:** Disconnect internet cable
  - [ ] DICOM still works (LAN only)
  - [ ] QuickBooks still opens locally
  - [ ] Reconnect → tunnel recovers, sync resumes
- [ ] **Power outage:** UPS test
  - [ ] Server stays on during brief outage
  - [ ] If extended: graceful shutdown occurs

---

## Phase 6: Staff Training & Handoff (Day 2, Afternoon)

### 6.1 — Create User Accounts
- [ ] Create all staff accounts in MedSys (from staff list)
- [ ] Default password: `demo123` (users must change on first login)
- [ ] Verify each role can login and see correct dashboard
- [ ] Set up super admin accounts: `stamakloe`, `rkyei`, `ntwumasi`

### 6.2 — Role-Specific Training
- [ ] **Receptionist:** Check-in, appointments, billing, special invoices
- [ ] **Nurse:** Vitals, triage, procedures, inventory, follow-up calls
- [ ] **Doctor:** Encounters, prescriptions, orders, note signing
- [ ] **Pharmacist:** Dispensing, inventory, OTC walk-ins, refill calendar
- [ ] **Lab:** Lab orders, results entry, QC
- [ ] **Imaging:** Order queue, DICOM viewer, study management
- [ ] **Accountant:** Invoices, payments, QuickBooks sync, reports
- [ ] **Admin:** User management, system config, audit logs

### 6.3 — Documentation Handoff
- [ ] Print and leave copy of `ARCHITECTURE_AND_DR_PLAN.md`
- [ ] Print server credentials sheet (sealed envelope to clinic admin)
- [ ] Leave USB drive with all installers as backup
- [ ] Share emergency contact info for remote support

### 6.4 — Local IT Contact Briefing
- [ ] Walk through server room setup
- [ ] Show how to check service status (Orthanc, QB, Tunnel)
- [ ] Show how to restart services if needed
- [ ] Explain UPS monitoring and battery replacement schedule
- [ ] Exchange contact details for ongoing support

---

## Post-Deployment (Remote Follow-Up)

- [ ] **Day 3-5:** Check Cloudflare tunnel uptime dashboard
- [ ] **Week 1:** Verify QB sync logs — no errors
- [ ] **Week 1:** Verify DICOM studies flowing from both machines
- [ ] **Week 2:** Follow up with staff on usability issues
- [ ] **Month 1:** Review audit logs for any security concerns
- [ ] **Month 1:** Verify database backups running (Neon point-in-time recovery)
- [ ] **Ongoing:** Monitor server uptime via Better Uptime or similar

---

## Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| MedSys Engineer | Nokio Twumasi | _____________ | _____________ |
| Clinic IT Contact | _____________ | _____________ | _____________ |
| ISP Support | _____________ | _____________ | _____________ |
| Siemens Service | _____________ | _____________ | _____________ |
| QuickBooks Support | _____________ | _____________ | _____________ |

---

## Notes / Issues Encountered

_Use this space during installation to log any issues, workarounds, or deviations from the plan._

```
Date:       Issue:                                    Resolution:
_________   ________________________________________  ________________________________________
_________   ________________________________________  ________________________________________
_________   ________________________________________  ________________________________________
_________   ________________________________________  ________________________________________
_________   ________________________________________  ________________________________________
_________   ________________________________________  ________________________________________
```

---

**Document Version:** 1.0
**Created:** May 15, 2026
**Last Updated:** May 15, 2026
