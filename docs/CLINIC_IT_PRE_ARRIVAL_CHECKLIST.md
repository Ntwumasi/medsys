# MedSys EMR Installation — Pre-Arrival Preparation

**To:** Clinic IT Team
**From:** Nokio Twumasi, MedSys Engineer
**Date:** _______________
**Arrival Date:** _______________

---

Hello,

I will be arriving on the date above to install the MedSys EMR system and connect it to your imaging equipment and accounting software. To ensure we can complete the installation efficiently, please prepare the following items **before I arrive**.

If any item is unclear or not possible, please contact me so we can discuss alternatives.

---

## 1. Server Computer

We need a dedicated computer that will run 24/7 as a server. This machine will host:
- QuickBooks Desktop (accounting sync)
- DICOM Server (receives images from X-ray and ultrasound machines)
- Secure tunnel to our cloud system

**Requirements:**

| Specification | Minimum | Preferred |
|---------------|---------|-----------|
| Operating System | Windows Server 2019 or Windows 10/11 Pro | Windows Server 2022 |
| Processor | 4 cores (Intel i5 or equivalent) | 8 cores (Intel i7/Xeon) |
| Memory (RAM) | 16 GB | 32 GB |
| Storage | 500 GB SSD | 1 TB SSD + 2 TB secondary drive |
| Network | Ethernet port (Gigabit) | Same |

**Please complete:**
- [ ] Server computer is purchased/available
- [ ] Windows is installed and activated
- [ ] Administrator username: _________________ Password: _________________
- [ ] Computer is placed in a secure, ventilated location (server room or locked office)

---

## 2. UPS (Battery Backup)

The server must be connected to a UPS to protect against power outages.

- [ ] UPS purchased and connected to server
- [ ] UPS provides at least **15 minutes** of battery runtime
- [ ] Brand/Model: _________________________

---

## 3. Network / Internet

The server must be on your clinic's local network and have internet access.

- [ ] Server is connected to the network via **Ethernet cable** (not Wi-Fi)
- [ ] A **static (fixed) IP address** has been assigned to the server
  - Static IP: `_____._____._____.______`
  - Subnet Mask: `_____._____._____.______`
  - Gateway: `_____._____._____.______`
- [ ] Internet is working on the server (can open websites in browser)
- [ ] Internet speed (approximate): _______ Mbps download / _______ Mbps upload
- [ ] ISP name: _________________________
- [ ] ISP support phone number: _________________________
- [ ] Router/firewall admin login available:
  - URL: _________________________
  - Username: _________________ Password: _________________

---

## 4. Imaging Equipment Information

I need the network details of your imaging machines so the server can receive images from them.

### Machine 1: Siemens Axiom Luminos dRF (X-Ray / Fluoroscopy)

- [ ] Machine is operational and powered on
- [ ] Machine is connected to the clinic network
- [ ] IP Address: `_____._____._____.______`
- [ ] DICOM AE Title: _________________________ (check in machine's network/DICOM settings)
- [ ] DICOM Port: _________ (usually 104)
- [ ] Can you access the machine's DICOM/network configuration screen? Yes / No
- [ ] Is a Siemens service engineer available if we need help? Yes / No
  - Contact: _________________________

### Machine 2: Siemens ACUSON Redwood (Ultrasound)

- [ ] Machine is operational and powered on
- [ ] Machine is connected to the clinic network
- [ ] IP Address: `_____._____._____.______`
- [ ] DICOM AE Title: _________________________ (check in network settings)
- [ ] DICOM Port: _________ (usually 104)
- [ ] Can you access the machine's network configuration screen? Yes / No

### Other Imaging Machines (if any)

| Machine Name | Type | IP Address | AE Title | Port |
|-------------|------|------------|----------|------|
| ____________ | ____________ | ____________ | ____________ | ______ |
| ____________ | ____________ | ____________ | ____________ | ______ |

**Quick test you can do now:** From the server, open Command Prompt and type:
```
ping [machine IP address]
```
If you see "Reply from..." it means the server can communicate with the machine. Please note the results:
- Ping to X-Ray machine: Success / Fail / Not tested
- Ping to Ultrasound machine: Success / Fail / Not tested

---

## 5. QuickBooks

- [ ] QuickBooks Desktop Pro **2024 or newer** — license key available
  - License key: _________________________
  - OR: QuickBooks is already installed on the server
- [ ] If you have an **existing company file** from a previous QuickBooks installation:
  - [ ] Backup file (.qbb) is saved and accessible
  - Location: _________________________
- [ ] If starting fresh: chart of accounts has been decided by the accountant

---

## 6. Clinic Email Account

MedSys sends emails for receipts, appointment reminders, and password resets. We need an email account to send from.

- [ ] Email address to use: _________________________
- [ ] Email provider: Gmail / Outlook / Yahoo / Other: _____________

**If using Gmail** (recommended):
- [ ] Two-factor authentication is enabled on the account
- [ ] An "App Password" has been generated:
  1. Go to https://myaccount.google.com/security
  2. Under "2-Step Verification," click "App passwords"
  3. Create a new app password for "Mail"
  4. Write it here: _________________________

**If using another provider:**
- [ ] SMTP server address: _________________________
- [ ] SMTP port: _________ (usually 587 for TLS)
- [ ] Username: _________________________
- [ ] Password: _________________________

---

## 7. Staff List

Please prepare a list of all staff members who will use MedSys. We will create their accounts during installation.

| # | Full Name | Role | Email | Phone |
|---|-----------|------|-------|-------|
| 1 | _________________________ | Doctor / Nurse / Receptionist / Pharmacist / Lab / Imaging / Accountant / Admin | _________________________ | _________________________ |
| 2 | _________________________ | _________________________ | _________________________ | _________________________ |
| 3 | _________________________ | _________________________ | _________________________ | _________________________ |
| 4 | _________________________ | _________________________ | _________________________ | _________________________ |
| 5 | _________________________ | _________________________ | _________________________ | _________________________ |
| 6 | _________________________ | _________________________ | _________________________ | _________________________ |
| 7 | _________________________ | _________________________ | _________________________ | _________________________ |
| 8 | _________________________ | _________________________ | _________________________ | _________________________ |
| 9 | _________________________ | _________________________ | _________________________ | _________________________ |
| 10 | _________________________ | _________________________ | _________________________ | _________________________ |

_(Add more rows as needed on a separate sheet)_

- [ ] One person has been designated as the **local IT point of contact** for ongoing support
  - Name: _________________________
  - Phone: _________________________

---

## 8. Training Schedule

Staff will need **1-2 hours of training** per role. Please ensure relevant staff are available:

| Session | Who Should Attend | Duration |
|---------|-------------------|----------|
| Reception & Front Desk | Receptionists, Admins | 1.5 hours |
| Clinical (Nursing) | Nurses | 1.5 hours |
| Clinical (Doctors) | Doctors | 1 hour |
| Pharmacy | Pharmacists | 1 hour |
| Laboratory | Lab Technicians | 1 hour |
| Imaging | Imaging Technicians | 1 hour |
| Accounting | Accountants | 1 hour |
| Admin / IT | IT Contact, Admin Staff | 1 hour |

- [ ] Training schedule confirmed
- [ ] Training room with projector/screen available? Yes / No

---

## 9. Clinic Information (for system configuration)

- [ ] Clinic full legal name: _________________________
- [ ] Clinic address: _________________________
  _________________________
- [ ] Clinic phone number: _________________________
- [ ] Clinic logo (digital file — PNG or JPG, emailed to me or on USB)
- [ ] Tax/Business registration number (for invoices): _________________________

---

## Questions?

If you have any questions about this checklist, please contact:

**Nokio Twumasi**
Phone: _________________________
Email: _________________________
WhatsApp: _________________________

Thank you for your preparation. The more items completed before arrival, the faster we can get MedSys running for your team.
