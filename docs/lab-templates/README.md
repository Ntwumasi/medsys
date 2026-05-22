# Lab Templates & Branding — Inputs

This folder is a staging area for materials Medics is providing so we can build the branded lab report templates + import the lab test catalog and pricing.

## Where to put what

```
docs/lab-templates/
├── manual-templates/   ← drop the 16 .docx templates from William's email here
│                         (fbs template.docx, fbc template, hbsag template, etc.)
│
├── branding/           ← clinic letterhead assets:
│                         - logo.png  (or .svg / .jpg) — high-resolution preferred
│                         - letterhead.txt — exact clinic name, address, phone,
│                                            license/accreditation #, lab director name
│
└── pricing/            ← drop the price lists here:
                          - MDS-LANCET PRICE LIST 2026 (PDF)
                          - GHA-TAT002 GH... (Ghana TAT, PDF)
                          If you can convert to CSV/Excel, that's even better.
```

## What I need from you to start building

### Phase 1 — Branded lab report template (today, ~1 hr)
- [ ] Logo file in `branding/`
- [ ] `branding/letterhead.txt` with:
  - Clinic full name (e.g. "Medics Group Clinic" — confirm exact wording)
  - Address (saw `N41 Nmatie Abonase St, Tse Addo, Accra` in the email signature)
  - Phone
  - Lab director name (for signature line)
  - Optional: license / accreditation number
- [ ] One representative `.docx` template (e.g. `fbs template.docx`) so I can match the layout

### Phase 2 — Per-test layouts (deferred until tomorrow)
- [ ] All 16 `.docx` templates so I can compare which tests need their own layout vs. a shared one

### Phase 3 — Bulk import test catalog + pricing (deferred)
- [ ] Pricing PDFs in `pricing/`
- [ ] Decision: CSV upload UI vs. AI extraction from the PDF

## Notes

- `.docx` files and PDFs are fine to commit; they're small and we may reference them later.
- The logo will eventually live in the React `client/src/assets/` folder once we finalise it. Drop it here first for review.
- If you don't have the letterhead details handy, just take a photo of the clinic header on any existing form.
