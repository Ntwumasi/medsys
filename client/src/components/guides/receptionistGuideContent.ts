import type { GuideSection } from '../DepartmentGuide';

export const receptionistGuideSections: GuideSection[] = [
  {
    title: 'Patient Queue',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    steps: [
      { title: 'Queue Overview', content: 'The Patient Queue is your main view. It shows all patients currently in the clinic today — checked in, with nurse, with doctor, and ready for checkout. Each card shows the patient\'s name, ID, encounter number, room, wait time, and billing status.' },
      { title: 'Color-Coded Wait Times', content: 'Wait times are color-coded: Green (0-15 min), Yellow (15-30 min), Red (30+ min). This helps you identify patients who have been waiting too long.' },
      { title: 'Filtering & Sorting', content: 'Use the filters at the top to search by patient name/number, filter by clinic, filter by workflow status, or sort by check-in time, longest wait, or status. Click "Clear Filters" to reset.' },
      { title: 'Billing Alerts', content: 'A banner at the top highlights patients ready for checkout. Click "View" to jump to that patient, or "Dismiss" to hide the alert.' },
      { title: 'Assign Nurse/Doctor', content: 'On each patient card, use the dropdown to assign or change the nurse and doctor. Click the edit icon next to the current assignment to modify.' },
      { title: 'Cancel Visit', content: 'Click "Cancel" on a patient card to cancel the encounter. You\'ll be asked to confirm. The room is released and the encounter is marked as cancelled.' },
      { title: 'Checkout', content: 'When the doctor has completed the visit, click "Checkout" to discharge the patient. If a follow-up is required, you\'ll be prompted to schedule it before completing checkout.' },
    ],
  },
  {
    title: 'Check-In (Returning)',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    steps: [
      { title: 'Search for Patient', content: 'Click "Returning Patient" at the top, then search by name or patient number. Select from the dropdown suggestions. The patient\'s demographics, PCP, and visit history load automatically.' },
      { title: 'Set Encounter Details', content: 'Choose the clinic, encounter type (Walk-in, Scheduled, Emergency), and optionally enter the chief complaint. The billing amount (GH₵50 for returning patients) is shown automatically.' },
      { title: 'Previous Visit History', content: 'The right panel shows all previous encounters — date, chief complaint, diagnosis, treatment, and billing. This helps you verify the patient and understand their history.' },
      { title: 'Check In', content: 'Click "Check In" to create the encounter. The patient appears in the queue and can be assigned to a nurse and room.' },
    ],
  },
  {
    title: 'New Patient Registration',
    icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    steps: [
      { title: 'Personal Information', content: 'Enter first name, last name, date of birth, and gender (all required). Optional fields: allergies, nationality, preferred clinic, and concierge level (Silver/Gold/Platinum).' },
      { title: 'Contact Information', content: 'Enter phone number (required) and optionally email, address, GPS code, city, and region.' },
      { title: 'Emergency Contact', content: 'Enter emergency contact name, phone, and relationship. Not required but recommended.' },
      { title: 'Primary Care Physician', content: 'Select the patient\'s PCP from the dropdown and optionally enter their phone number.' },
      { title: 'Payer Source', content: 'Check one or more: Self Pay, Corporate (select employer), Insurance (select provider). At least one is required.' },
      { title: 'Register Only vs Register & Check In', content: '"Register Only" saves the patient without creating an encounter. "Register & Check In" saves AND creates an encounter — the patient goes directly to the queue. New patient fee is GH₵75.' },
    ],
  },
  {
    title: 'Appointments',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    steps: [
      { title: 'Today\'s Appointments', content: 'The left panel shows all appointments for today with their status (Scheduled, Confirmed, Checked In, Completed, Cancelled). Quick stats show counts for each category.' },
      { title: 'Booking an Appointment', content: 'Click "+ Book Appointment" or click an empty time slot on the calendar. Search for the patient, select appointment type, clinic, doctor (optional), duration, and enter the reason. Click "Book Appointment" to confirm.' },
      { title: 'Calendar Views', content: 'Switch between Day, Week, and Month views using the toggles. Filter by doctor using the dropdown. Appointments are color-coded by status. Orange events are medication refill reminders.' },
      { title: 'Managing Appointments', content: 'Click any appointment to see details. From the detail view you can: Check In the patient (creates an encounter), Mark as No-Show, or Cancel. Checking in from an appointment pre-fills the encounter details.' },
      { title: 'Medication Refills', content: 'Refill reminders appear as orange events on the calendar. Click one to see the medication details and check in the patient for their refill visit.' },
    ],
  },
  {
    title: 'Invoices & Payments',
    icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    steps: [
      { title: 'View/Print Invoice', content: 'On any patient in the queue, click the invoice icon to view their invoice. From there you can print or save it. The invoice shows all line items, subtotal, amount paid, and balance due.' },
      { title: 'Process Payment', content: 'When a patient pays, update their invoice through the Invoices page (sidebar). Enter the payment amount and method. When fully paid, the system auto-checks out the encounter if they haven\'t been discharged yet.' },
      { title: 'Post-Paid Patients', content: 'For patients who pay later (family settles the bill), the invoice stays "pending" until payment. When the full balance is settled, the system automatically discharges the encounter — no manual checkout needed.' },
      { title: 'Pending Payments', content: 'The "Pending Payments" page in the sidebar shows all outstanding invoices. Use this to track who still owes and follow up.' },
    ],
  },
  {
    title: 'Follow-Up Management',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    steps: [
      { title: 'Follow-Up Checkout', content: 'When checking out a patient who has a follow-up requirement (set by the doctor), a modal appears asking you to schedule the follow-up appointment before checkout. You can schedule now, skip, or cancel.' },
      { title: 'Future Appointments', content: 'Follow-up appointments appear on the calendar like any other appointment. The patient will be reminded and can be checked in directly from the appointment.' },
    ],
  },
];
