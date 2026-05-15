# MedSys EMR — Pre-Arrival Preparation for Clinic IT

**To:** Clinic IT Team
**From:** Nokio Twumasi, MedSys Engineer
**Arrival Date:** _______________

---

I will be arriving on the date above to set up the on-site server that connects MedSys to your imaging equipment and QuickBooks accounting software. MedSys itself is already running in the cloud — this visit is about installing the local components that need to live at the clinic.

Please prepare the following items **before I arrive** so we can hit the ground running.

---

## 1. Server Computer

We need a dedicated machine that will stay powered on 24/7. It will run the DICOM imaging server and QuickBooks sync.

**Minimum specs:**

| | Minimum | Preferred |
|---|---------|-----------|
| OS | Windows 10/11 Pro | Windows Server 2022 |
| Processor | 4-core (Intel i5 or equivalent) | 8-core |
| RAM | 16 GB | 32 GB |
| Storage | 500 GB SSD | 1 TB SSD + extra drive for imaging |
| Network | Ethernet port | Same |

- [ ] Server computer is available and powered on
- [ ] Windows is installed and activated
- [ ] Administrator login credentials written down (I will need these)
- [ ] Machine is in a secure, ventilated location

---

## 2. UPS (Battery Backup)

A UPS protects the server during power cuts so data isn't lost.

- [ ] UPS connected to the server
- [ ] At least 15 minutes of battery runtime

---

## 3. Network

The server must be on the same local network as the imaging machines and have internet access.

- [ ] Server connected via **Ethernet cable** (not Wi-Fi)
- [ ] **Static IP address** assigned to the server
  - IP: `_____._____._____.______`
- [ ] Internet is working on the server
- [ ] Router/firewall admin credentials available (I may need to check settings)
  - Router login URL: _________________________
  - Username: _________________ Password: _________________

---

## 4. Imaging Equipment

I need the network details of your Siemens machines so I can configure them to send images to the server. If you don't know these, I can look them up on the machines when I arrive — but having them in advance saves time.

### Siemens Axiom Luminos dRF (X-Ray)
- [ ] Machine is on the clinic network
- [ ] IP Address: `_____._____._____.______` (or: "I don't know")
- [ ] AE Title: _________________________ (or: "I don't know")
- [ ] Is Siemens service support available if we need help configuring? Yes / No

### Siemens ACUSON Redwood (Ultrasound)
- [ ] Machine is on the clinic network
- [ ] IP Address: `_____._____._____.______` (or: "I don't know")
- [ ] AE Title: _________________________ (or: "I don't know")

**Quick test (optional but helpful):** On the server, open Command Prompt and type `ping` followed by each machine's IP. If you get "Reply from..." they can talk to each other.

---

## 5. QuickBooks

- [ ] **QuickBooks Desktop Pro 2024** or newer — license key available
  - License key: _________________________
  - OR: Already installed on a computer (we will move it to the server)
- [ ] If migrating from an existing installation: company file backup (.qbb) is ready
- [ ] Accountant is available to verify chart of accounts after setup

---

## 6. Clinic Logo

For invoices and printed reports:

- [ ] Clinic logo as a digital image file (PNG or JPG), sent to me by email or on a USB drive

---

## 7. Training Availability

Staff already have accounts in MedSys. I will do hands-on training by role during the visit.

Please confirm which staff can be available for a **1-hour training session** per group:

| Session | Available Date/Time |
|---------|-------------------|
| Receptionists | _________________________ |
| Nurses | _________________________ |
| Doctors | _________________________ |
| Pharmacists | _________________________ |
| Lab Technicians | _________________________ |
| Imaging Technicians | _________________________ |
| Accountant | _________________________ |

- [ ] A room with a screen/projector is available for training

---

## 8. Local IT Contact

Please designate one person as the ongoing IT point of contact — someone I can call or message if something needs attention on the server after I leave.

- Name: _________________________
- Phone / WhatsApp: _________________________

---

## Questions?

If anything is unclear or you can't complete an item, just let me know — we can work around it.

**Nokio Twumasi**
Phone: _________________________
WhatsApp: _________________________
Email: _________________________
