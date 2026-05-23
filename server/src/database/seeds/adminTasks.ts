// Initial admin task tracker rows — seeded from
// docs/TASK ASSIGNMENT TEMPLATE.xlsx (Angela's clinic-ops worksheet).
// One-time import; admin can edit/delete/add freely after the seed runs.

export interface AdminTaskSeed {
  category: string;
  task: string;
  contact_person: string | null;
  responsibility: string | null;
  status: 'pending' | 'in_progress' | 'complete' | 'blocked';
  remarks: string | null;
  cost: string | null;
}

const norm = (s: string): AdminTaskSeed['status'] => {
  const x = s.toLowerCase().trim();
  if (x.includes('complete')) return 'complete';
  if (x.includes('progress')) return 'in_progress';
  if (x.includes('block') || x.includes('hold')) return 'blocked';
  return 'pending';
};

const t = (
  category: string,
  task: string,
  contact_person: string | null,
  responsibility: string | null,
  status: string,
  remarks: string | null = null,
  cost: string | null = null,
): AdminTaskSeed => ({
  category,
  task,
  contact_person,
  responsibility,
  status: norm(status),
  remarks,
  cost,
});

export const adminTaskSeeds: AdminTaskSeed[] = [
  // ---------------- Facility Needs ----------------
  t('Facility Needs', 'SD card for camera (512 GB)', 'Mr. George', 'Dr. Patricia / Angela', 'Complete', null, 'GHS 1,350'),
  t('Facility Needs', 'Mini PAC software for ultrasound', 'Mr. Kwame Asante', 'Dr. Essel / Angela', 'Pending', null, 'GHS 7,600'),
  t('Facility Needs', 'Office locker for office manager', 'Angela', 'Angela', 'Pending'),
  t('Facility Needs', 'Telemedicine in exam rooms', 'Wise Infotech', 'Drs Sedo / Essel / Angela', 'Complete'),
  t('Facility Needs', 'Intercom (Telecel)', 'Telecel - Senyo', 'Angela', 'Pending', null, 'GHS 19,540'),
  t('Facility Needs', 'Blotchy paint on some walls', 'Mr. Lawson', 'Angela', 'Pending'),
  t('Facility Needs', 'Bollards for the parking space', 'Mr. Lawson', 'Dr Essel / Angela', 'Pending'),
  t('Facility Needs', 'Demarcation of the parking spaces', 'Mr. Lawson', 'Dr Essel / Angela', 'Pending'),
  t('Facility Needs', 'Signage at the Front', 'Frank Siamah', 'Drs Sedo / Essel / Angela', 'Pending'),
  t('Facility Needs', 'Fumigation (quarterly or 6-monthly)', 'LaDMA', 'Angela', 'Pending', null, 'GHS 2,500'),
  t('Facility Needs', 'Banisters', 'Mr Lawson', 'Cobba', 'Complete'),
  t('Facility Needs', 'Door flaps', 'Mr Lawson', 'Sedo', 'Complete'),
  t('Facility Needs', 'Billboard', 'Frank', 'Angela, Sedo, Cobba', 'Pending', 'No change'),
  t('Facility Needs', 'Security post', 'Angela', 'Dr Patricia', 'Pending'),
  t('Facility Needs', 'Stair protector', 'Angela', 'Dr Patricia', 'Pending'),
  t('Facility Needs', 'Reception paintings', 'Mr Lawson / Metrova', 'Sedo / Martina', 'Pending', 'Notified parties; due 5/11/2025'),
  t('Facility Needs', 'Mission / Vision', 'Frank', 'Angela, Sedo', 'Complete'),
  t('Facility Needs', 'Privacy curtains for Sick Bay & Ultrasound room', 'Angela', 'Angela', 'Pending', 'Currently using privacy screens for sick bay'),
  t('Facility Needs', 'Exam room dispensers / paintings', 'Mr Lawson / Metrova', 'Sedo / Martina', 'In progress', 'Dispensers complete'),
  t('Facility Needs', 'Letter to Landlord — repairs', 'Mr Zu / Cobba', 'Sedo', 'In progress', 'Met Alex 5/4/2025; rain gutter restored'),
  t('Facility Needs', 'Leak', 'Mr Lawson', 'Angela', 'Complete'),
  t('Facility Needs', 'Pharmacy — AC, blinds, high chairs', 'Mr Lawson / Metrova / Angela', 'Dr Patricia', 'In progress', 'Metrova notified'),
  t('Facility Needs', 'Safe', 'Angela', 'Cobba', 'Complete'),
  t('Facility Needs', 'Cabinetry in Ultrasound / Echo Room', 'Metrova / Carpenter', 'Sedo / Angela', 'Pending', 'Metrova notified'),
  t('Facility Needs', 'Clinic extension drawings', 'Michael', 'Sedo / Angela', 'Complete', 'Michael notified by Sedo'),
  t('Facility Needs', 'Business cards', 'Frank Siamah', 'Dr. Tamakloe / Angela', 'Pending'),
  t('Facility Needs', 'Generator lease extension', 'Mr. Lawson', 'Drs Sedo / Essel / Sarah', 'Pending'),

  // ---------------- Negotiations / Partnerships ----------------
  t('Negotiations / Partnerships', 'Bank Hospital', 'Grace Awotwe / Anne Rita', 'Sedo / Cobba', 'Complete', 'Completed'),
  t('Negotiations / Partnerships', 'Accra Medical Centre', null, 'Dr. Essel', 'Complete'),
  t('Negotiations / Partnerships', 'Pink Clinic with Metro TV / Ignite Media', 'Adriana — Metro TV', 'Dr. Patricia / Angela', 'Complete', 'Completed'),
  t('Negotiations / Partnerships', 'Global Entrepreneurship Festival (GEF)', null, 'Angela / Charles', 'Complete'),

  // ---------------- Pharmacy ----------------
  t('Pharmacy', 'Supplies / shelve signage', 'Frank / Metrova', 'Angela / Dr Patricia', 'In progress', 'Frank Siamah assessed shelves'),

  // ---------------- Staff Orientation ----------------
  t('Staff Orientation', 'Soft skills training', 'Rami', 'Angela / Cobba', 'In progress', 'First 2 sessions completed'),
  t('Staff Orientation', 'ACLS training for clinical staff', 'Mr. George', 'Dr. Patricia / Angela', 'Complete', 'BLS 900 / ACLS 1,100 / BLS 800 / ACLS 1,200', 'GHS 1,200 / head'),
  t('Staff Orientation', 'Fire safety training for all staff', 'Fire Service contact', 'Angela', 'Pending'),

  // ---------------- Marketing ----------------
  t('Marketing', 'Monthly newsletter', 'Charles', 'Charles', 'Complete', 'Posted'),
  t('Marketing', 'Podcast with Dr. Gbedemah', 'Charles', 'Charles / Dr. Gbedemah', 'Pending'),
  t('Marketing', 'Physician profiles on company website', 'Charles', null, 'Pending'),
  t('Marketing', 'Marketing for potential corporate clients', null, null, 'Pending'),

  // ---------------- Information Technology ----------------
  t('Information Technology', 'Website', 'Kwesi', 'Sedo', 'In progress', 'Working on physician profile pictures'),
  t('Information Technology', 'Teams', 'Kwesi / Dereck', 'Angela / Sedo', 'Pending'),
  t('Information Technology', 'EMR — MedSys', 'Nokio', 'Sedo / Angela', 'Pending', 'Dry run with vendor'),
  t('Information Technology', 'Telemedicine', 'Wise Infotech', 'Cobba / Sedo', 'Complete', 'Exam room 1 set up for telemedicine'),
  t('Information Technology', 'Telephones (for intercom)', 'Kwesi / Dereck', 'Angela / Sedo', 'In progress'),
  t('Information Technology', 'Premedgo', 'Jessica Boateng', 'Angela', 'In progress'),

  // ---------------- Registrations ----------------
  t('Registrations', 'HEFRA', null, 'Angela / Dr Patricia', 'Complete'),
  t('Registrations', 'EPA', null, 'Angela / Dr Patricia', 'Complete', 'Received forms & bill', 'GHS 3,315'),
  t('Registrations', 'NHIA', null, 'Angela / Dr Patricia', 'Complete'),
  t('Registrations', 'GHS — District', null, 'Angela / Dr Patricia', 'Pending'),
  t('Registrations', "Physician's MDC certification", "Cobba's contact person", 'Wendy', 'In progress', 'Almost complete'),
  t('Registrations', 'Application for privileges TBH', 'Dr Charlotte Osafo TBH', 'Wendy', 'Complete'),
  t('Registrations', 'Business Operating Permit', 'LaDMA', 'Angela', 'Pending', null, 'GHS 2,000'),

  // ---------------- Facility Works — Newland Interiors ----------------
  t('Facility Works (Newland Interiors)', 'Artwork re-print — 1 piece', 'Metrova', 'Angela', 'Pending', null, 'GHS 243.80 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Footrests — pharmacy (3 ea)', 'Metrova', 'Angela', 'Pending', null, 'GHS 3,291.30 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Adjustment of desk leg — pharmacy', 'Metrova', 'Angela', 'Pending', null, 'GHS 316.94 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Cover for pharmacy pipes with push-open door', 'Metrova', 'Angela', 'Pending', null, 'GHS 1,283.61 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Gas lifts for pharmacy cabinets (8)', 'Metrova', 'Angela', 'Pending', null, 'GHS 760.66 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Vinyl bolster', 'Metrova', 'Angela', 'Pending', null, 'GHS 853.30 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Vinyl seat cushion', 'Metrova', 'Angela', 'Pending', null, 'GHS 1,219.00 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Cladding for pharmacy seating area', 'Metrova', 'Angela', 'Pending', null, 'GHS 8,763.39 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Reception blinds', 'Metrova', 'Angela', 'Pending', null, 'GHS 13,981.93 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Pharmacy blind', 'Metrova', 'Angela', 'Pending', null, 'GHS 7,607.78 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Workmanship for blinds', 'Metrova', 'Angela', 'Pending', null, 'GHS 975.20 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Sickbay cabinets & worktop', 'Metrova', 'Angela', 'Pending', null, 'GHS 19,428.42 (incl VAT)'),
  t('Facility Works (Newland Interiors)', 'Sickbay sink and tap', 'Metrova', 'Angela', 'Pending', null, 'GHS 2,377.05 (incl VAT)'),

  // ---------------- NHIS Outstanding Tasks ----------------
  t('NHIS Outstanding Tasks', 'The Organogram', 'Mad. Anita Arthur', 'Angela', 'Complete'),
  t('NHIS Outstanding Tasks', 'Book for documentation on all referrals to other facilities', 'Angela', 'Angela', 'Complete', 'Pending follow-up'),
  t('NHIS Outstanding Tasks', 'Incident report book', 'Angela', 'Angela', 'Complete', 'Pending follow-up'),
  t('NHIS Outstanding Tasks', 'Access to ambulance (contacts must be displayed)', 'Angela', 'Angela', 'Pending'),
  t('NHIS Outstanding Tasks', 'Fire extinguisher — expiry must be visibly displayed', 'Fire Service Team', 'Angela', 'Pending'),
  t('NHIS Outstanding Tasks', 'Nursing and Lab protocols must be displayed', 'Wendy / William', 'Angela', 'Pending'),
  t('NHIS Outstanding Tasks', 'Implement staff surveys regarding working conditions', 'Angela', 'Angela', 'Pending'),
  t('NHIS Outstanding Tasks', 'Training plan', 'Angela', 'Angela', 'Pending'),
];
