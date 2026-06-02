/**
 * Migration: Sync prices from official 2026 rate sheets + payer-aware clinic consults
 *
 * - Updates charge_master cash prices (all duplicate copies of a service).
 * - Loads per-payer prices (6 insurers + 2 corporates) into payer_price_schedules,
 *   honouring exclusions (is_excluded) and covered=0.
 * - Adds Family Medicine (400), Haematology (600), Nephrology (600) consults.
 *   ENT/Haematology/Nephrology mirror the Physician Specialist payer schedule.
 * - Links each clinic to its consultation charge so check-in bills by payer source.
 * - Deactivates clinics not offered (Neurology, Rheumatology).
 *
 * Idempotent: re-runnable. Resolves payer/charge IDs by stable name/code at runtime.
 */
import pool from '../db';

const DATA: any = {
  "cash_updates": [
    {
      "codes": [
        "REG-001"
      ],
      "price": 100.0
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "price": 200.0
    },
    {
      "codes": [
        "CONS-TELREV"
      ],
      "price": 0.0
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "price": 250.0
    },
    {
      "codes": [
        "PROC-DRESS-MINOR"
      ],
      "price": 80.0
    },
    {
      "codes": [
        "PROC-DRESS-MAJOR"
      ],
      "price": 150.0
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "price": 80.0
    },
    {
      "codes": [
        "PROC-SUTURE-MINOR"
      ],
      "price": 180.0
    },
    {
      "codes": [
        "PROC-SUTURE-MAJOR"
      ],
      "price": 200.0
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "price": 150.0
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "price": 80.0
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "price": 450.0
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "price": 700.0
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "price": 120.0
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "price": 400.0
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "price": 500.0
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "price": 800.0
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "price": 450.0
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "price": 250.0
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "price": 250.0
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "price": 1000.0
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "SPEC-SURG"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "price": 240.0
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "price": 280.0
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "price": 400.0
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "price": 600.0
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "price": 800.0
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "price": 260.0
    },
    {
      "codes": [
        "DIAG-PELV"
      ],
      "price": 240.0
    },
    {
      "codes": [
        "DIAG-ABD"
      ],
      "price": 240.0
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "price": 420.0
    },
    {
      "codes": [
        "DIAG-BREAST"
      ],
      "price": 480.0
    },
    {
      "codes": [
        "IMG-XR-CHEST",
        "IMG-XRAY-CHEST",
        "DIAG-XR-CHEST"
      ],
      "price": 220.0
    },
    {
      "codes": [
        "DIAG-XR-LUMBAR"
      ],
      "price": 220.0
    },
    {
      "codes": [
        "DIAG-XR-PELVIS"
      ],
      "price": 220.0
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "price": 250.0
    },
    {
      "codes": [
        "IMG-ECHO",
        "DIAG-ECHO"
      ],
      "price": 650.0
    },
    {
      "codes": [
        "CONS-HOME"
      ],
      "price": 800.0
    }
  ],
  "new_charges": [
    {
      "code": "CONS-FM",
      "name": "Family Medicine Consultation",
      "category": "consultation",
      "price": 400
    },
    {
      "code": "SPEC-HAEM",
      "name": "Haematology",
      "category": "consultation",
      "price": 600
    },
    {
      "code": "SPEC-NEPH",
      "name": "Nephrology",
      "category": "consultation",
      "price": 600
    }
  ],
  "payer_prices": [
    {
      "codes": [
        "REG-001"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "REG-001"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 100.0,
      "excluded": false
    },
    {
      "codes": [
        "REG-001"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "REG-001"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "REG-001"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 100.0,
      "excluded": false
    },
    {
      "codes": [
        "REG-001"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "REG-001"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 120.0,
      "excluded": false
    },
    {
      "codes": [
        "REG-001"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 120.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 280.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 225.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-PCP"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 225.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-TELREV"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": null,
      "excluded": true
    },
    {
      "codes": [
        "CONS-TELREV"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 0.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-TELREV"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 0.0,
      "excluded": false
    },
    {
      "codes": [
        "CONS-TELREV"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 0.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 160.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 280.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SHORT STAY",
        "QB-DETENTION"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MINOR"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 70.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MINOR"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 60.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MINOR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MINOR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MAJOR"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 90.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MAJOR"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MAJOR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-DRESS-MAJOR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 70.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 60.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 60.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 72.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 50.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-STERISTRIP"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MINOR"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MINOR"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MINOR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MINOR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MAJOR"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MAJOR"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MAJOR"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MAJOR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-SUTURE-MAJOR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 120.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 160.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 120.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 160.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-NEBULISATION"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 70.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 100.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 85.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-1HR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 80.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 468.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 550.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-6HR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 900.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 850.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 800.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 850.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 850.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 800.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 700.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-O2-12HR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 700.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 120.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 160.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 160.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 180.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 100.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 120.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-INJ-CONS",
        "QB-CONSUMABLE"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 120.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 460.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSICIAN"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 425.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 500.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PAED"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 500.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 460.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OBGYN"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 460.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-CARDIO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 460.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 800.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEURO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 800.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPHTH"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 380.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 383.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-OPTOM"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 298.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PHYSIO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": null,
      "excluded": true
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 280.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 298.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DIET"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INTMED"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 1000.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCH"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 1000.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-DERM"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-UROL"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": null,
      "excluded": true
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-INFECT"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-GASTRO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENDO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ORTHO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 330.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PULM"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-SURG"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-SURG"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-SURG"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 230.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 195.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-EARLY"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 230.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 195.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 280.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-OBS-LATE"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 280.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": null,
      "excluded": true
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 320.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 320.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 260.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-SINGLE"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": null,
      "excluded": true
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 390.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TWINS"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": null,
      "excluded": true
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 740.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 640.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 800.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 520.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 800.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ANOM-TRIP"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 800.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 230.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 260.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 195.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 260.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-TVS"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 260.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-PELV"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-PELV"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-BREAST"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-BREAST"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "IMG-XR-CHEST",
        "IMG-XRAY-CHEST",
        "DIAG-XR-CHEST"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 220.0,
      "excluded": false
    },
    {
      "codes": [
        "IMG-XR-CHEST",
        "IMG-XRAY-CHEST",
        "DIAG-XR-CHEST"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 220.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-XR-LUMBAR"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 220.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-XR-LUMBAR"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 220.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-XR-PELVIS"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 220.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-XR-PELVIS"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 220.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 150.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 260.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 195.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ECG"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "IMG-ECHO",
        "DIAG-ECHO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 650.0,
      "excluded": false
    },
    {
      "codes": [
        "IMG-ECHO",
        "DIAG-ECHO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 726.0,
      "excluded": false
    },
    {
      "codes": [
        "IMG-ECHO",
        "DIAG-ECHO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 726.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCHO"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": null,
      "excluded": true
    },
    {
      "codes": [
        "SPEC-PSYCHO"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCHO"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCHO"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 510.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCHO"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 450.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCHO"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-PSYCHO"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 230.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 260.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 200.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 240.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 300.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 195.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "DIAG-ABD-PELV"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 420.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-MVE",
        "SURG-MVE"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 1000.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-MVE",
        "SURG-MVE"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 1250.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-MVE",
        "SURG-MVE"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 1120.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-MVE",
        "SURG-MVE"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 1300.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-MVE",
        "SURG-MVE"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 1000.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-LUMP",
        "SURG-LUMP"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 580.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-LUMP",
        "SURG-LUMP"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 500.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-LUMP",
        "SURG-LUMP"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "PROC-LUMP",
        "SURG-LUMP"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 460.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-ENT"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 460.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-HAEM"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "Premier Health Insurance",
      "kind": "insurance",
      "price": 250.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "Acacia Health Insurance",
      "kind": "insurance",
      "price": 350.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "ACE Medical Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "GLICO Healthcare",
      "kind": "insurance",
      "price": 480.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "Orange Health Insurance",
      "kind": "insurance",
      "price": 460.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "GAB Health Insurance",
      "kind": "insurance",
      "price": 400.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "The Meal Box",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    },
    {
      "codes": [
        "SPEC-NEPH"
      ],
      "payer": "Bigpay Ghana Ltd",
      "kind": "corporate",
      "price": 600.0,
      "excluded": false
    }
  ],
  "clinic_links": {
    "Cardiology": "SPEC-CARDIO",
    "Dermatology": "SPEC-DERM",
    "Dietician": "SPEC-DIET",
    "ENT (Ear, Nose & Throat)": "SPEC-ENT",
    "Endocrinology": "SPEC-ENDO",
    "Family Medicine": "CONS-FM",
    "Gastroenterology": "SPEC-GASTRO",
    "General Practice": "CONS-PCP",
    "Hematology": "SPEC-HAEM",
    "Infectious Disease": "SPEC-INFECT",
    "Internal Medicine": "SPEC-INTMED",
    "Nephrology": "SPEC-NEPH",
    "Obstetrics & Gynecology": "SPEC-OBGYN",
    "Ophthalmology": "SPEC-OPHTH",
    "Orthopedics": "SPEC-ORTHO",
    "Pediatrics": "SPEC-PAED",
    "Psychiatry": "SPEC-PSYCH",
    "Pulmonology": "SPEC-PULM",
    "Urology": "SPEC-UROL"
  },
  "deactivate": [
    "Neurology",
    "Rheumatology"
  ]
};

export const runMigration = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Cash price updates (apply to every duplicate copy by service_code)
    let cashN = 0;
    for (const u of DATA.cash_updates) {
      const r = await client.query(
        'UPDATE charge_master SET price = $1, updated_at = CURRENT_TIMESTAMP WHERE service_code = ANY($2)',
        [u.price, u.codes]
      );
      cashN += r.rowCount || 0;
    }

    // 2. New consultation charges
    for (const c of DATA.new_charges) {
      await client.query(
        `INSERT INTO charge_master (service_code, service_name, category, price, is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (service_code) DO UPDATE
           SET service_name = EXCLUDED.service_name, category = EXCLUDED.category,
               price = EXCLUDED.price, is_active = true, updated_at = CURRENT_TIMESTAMP`,
        [c.code, c.name, c.category, c.price]
      );
    }

    // 3. Payer price schedules
    let payerN = 0, payerSkipped: string[] = [];
    for (const p of DATA.payer_prices) {
      const cm = await client.query('SELECT id FROM charge_master WHERE service_code = ANY($1) LIMIT 1', [p.codes]);
      if (!cm.rows.length) { payerSkipped.push(p.codes.join('/')); continue; }
      const chargeId = cm.rows[0].id;
      const table = p.kind === 'insurance' ? 'insurance_providers' : 'corporate_clients';
      const payer = await client.query(`SELECT id FROM ${table} WHERE name = $1 LIMIT 1`, [p.payer]);
      if (!payer.rows.length) { payerSkipped.push(p.payer); continue; }
      const payerId = payer.rows[0].id;
      const price = p.excluded ? null : p.price;
      if (p.kind === 'insurance') {
        await client.query(
          `INSERT INTO payer_price_schedules (charge_master_id, payer_type, insurance_provider_id, price, is_excluded)
           VALUES ($1,'insurance',$2,$3,$4)
           ON CONFLICT (charge_master_id, insurance_provider_id) WHERE payer_type='insurance'
           DO UPDATE SET price = EXCLUDED.price, is_excluded = EXCLUDED.is_excluded, updated_at = CURRENT_TIMESTAMP`,
          [chargeId, payerId, price, p.excluded]
        );
      } else {
        await client.query(
          `INSERT INTO payer_price_schedules (charge_master_id, payer_type, corporate_client_id, price, is_excluded)
           VALUES ($1,'corporate',$2,$3,$4)
           ON CONFLICT (charge_master_id, corporate_client_id) WHERE payer_type='corporate'
           DO UPDATE SET price = EXCLUDED.price, is_excluded = EXCLUDED.is_excluded, updated_at = CURRENT_TIMESTAMP`,
          [chargeId, payerId, price, p.excluded]
        );
      }
      payerN++;
    }

    // 4. Link clinics to their consultation charge + keep consultation_price in sync
    await client.query('ALTER TABLE clinics ADD COLUMN IF NOT EXISTS charge_master_id INTEGER REFERENCES charge_master(id)');
    let linkN = 0;
    for (const [clinic, code] of Object.entries(DATA.clinic_links)) {
      const r = await client.query(
        `UPDATE clinics c
         SET charge_master_id = cm.id,
             consultation_price = cm.price,
             updated_at = CURRENT_TIMESTAMP
         FROM charge_master cm
         WHERE cm.service_code = $2 AND c.name = $1`,
        [clinic, code]
      );
      linkN += r.rowCount || 0;
    }

    // 5. Deactivate clinics not offered
    await client.query('UPDATE clinics SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE name = ANY($1)', [DATA.deactivate]);

    await client.query('COMMIT');
    console.log(`Price sync complete: cash rows ${cashN}, payer rows ${payerN}, clinics linked ${linkN}, deactivated ${DATA.deactivate.join(', ')}`);
    if (payerSkipped.length) console.warn('Payer rows skipped (charge/payer not found):', [...new Set(payerSkipped)].join(', '));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Price sync migration failed:', e);
    throw e;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runMigration().then(() => { console.log('Migration completed'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
