import type { GuideSection } from '../DepartmentGuide';

export const doctorGuideSections: GuideSection[] = [
  {
    title: 'Active Patients',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    steps: [
      { title: 'Patient List', content: 'Your active patients appear in the left sidebar under "Active Patients." These are patients who have been assigned to you by the nurse or receptionist. Click any patient row to load their full chart in the main panel.' },
      { title: 'VIP Indicators', content: 'Patients with concierge status (Silver, Gold, Platinum) have a colored badge next to their name. VIP patients are sorted to the top of the list.' },
      { title: 'Patient Chart Navigation', content: 'Click the patient\'s name (blue link) to open their full patient record in a new view. This includes demographics, encounter history, allergies, and documents.' },
    ],
  },
  {
    title: 'Results Alerts',
    icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    steps: [
      { title: 'Lab Results', content: 'The "Lab" tab shows completed lab results for your orders from the last 7 days. Each result shows the test name, patient, room, and completion status. Results appear automatically — no need to refresh.' },
      { title: 'Imaging Results', content: 'The "Imaging" tab shows completed imaging studies (X-ray, CT, MRI, ultrasound) with the imaging type, body part, and status.' },
      { title: 'Pharmacy Updates', content: 'The "Rx" tab shows pharmacy updates — medications that have been dispensed or are ready for pickup, with the medication name and current status.' },
    ],
  },
  {
    title: 'Pending Signatures',
    icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    steps: [
      { title: 'Global Signature Queue', content: 'The "Pending Signatures" panel shows ALL unsigned SOAP notes across all your active patients. Each entry shows the patient name, encounter number, and room. You can sign from here without having to click into each patient first.' },
      { title: 'Signing a SOAP Note', content: 'Click "Sign Now" on any entry. A confirmation dialog shows exactly which patient and encounter you\'re signing. Once signed, the note is locked and cannot be edited. The entry disappears from the queue.' },
      { title: 'Per-Patient Signing', content: 'You can also sign from within a patient\'s SOAP tab — the "Sign" button appears at the top of the SOAP form after you\'ve completed it. Either method works identically.' },
    ],
  },
  {
    title: 'SOAP Notes',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    steps: [
      { title: 'SOAP Tab', content: 'Select a patient, then click the "SOAP" tab in the Clinical Notes section. The SOAP form has expandable sections for each part: Chief Complaint, HPI/Subjective/Objective, Past Medical History, Review of Systems, Physical Examination, Assessment, and Plan.' },
      { title: 'Results for This Visit', content: 'If there are completed lab or imaging results for the current encounter, they appear in a blue "Results for this visit" panel at the top of the SOAP tab. Reference these while writing the Objective section — no need to switch tabs.' },
      { title: 'Smart Dictation', content: 'Use the "Smart Dictate" button in any text area for voice-to-text input. The system also provides medical term suggestions as you type.' },
      { title: 'Signing the SOAP', content: 'When you\'re done, click "Sign" at the top of the SOAP form. The note is locked for legal compliance. A green checkmark confirms the signature with your name and timestamp.' },
    ],
  },
  {
    title: 'Clinical Notes',
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    steps: [
      { title: 'Doctor\'s Notes', content: 'The "Doctor\'s Notes" tab lets you write free-form clinical notes. Use the smart text area with auto-complete for medical terms, or dictate with the microphone button. Notes are timestamped and attributed to you.' },
      { title: 'Nurse Notes', content: 'The "Nurse Notes" tab shows messages and clinical notes from the nurse. Nurse-to-doctor messages are highlighted. This is where the nurse communicates observations and concerns.' },
      { title: 'Instructions for Nurse', content: 'The "Nurse Instructions" tab lets you send instructions to the nurse (e.g., "Start IV fluids," "Recheck vitals in 30 min"). The nurse sees these in their dashboard immediately.' },
      { title: 'Procedural Notes', content: 'The "Procedural Notes" tab is for documenting procedures performed during the encounter (wound care, biopsies, injections, etc.). Each note is timestamped and becomes part of the permanent record.' },
      { title: 'Signing Individual Notes', content: 'Each note has a "Sign" button that locks it for legal compliance. Signed notes show a green checkmark with the signer\'s name.' },
    ],
  },
  {
    title: 'Orders',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    steps: [
      { title: 'Ordering Labs', content: 'In the Orders section at the bottom, select a lab test from the dropdown (CBC, CMP, UA, etc.), set the priority (Routine/Urgent/STAT), and click "Add." You can add multiple tests before submitting. Remove any with the X button.' },
      { title: 'Ordering Imaging', content: 'Select an imaging type (X-Ray, CT, MRI, Ultrasound), enter the body part, and set priority. Add to the pending queue like lab orders.' },
      { title: 'Prescribing Medications', content: 'Select a medication, enter dosage, frequency, route, quantity, refills, and days supply. The system automatically checks for drug interactions when you add a medication. If an interaction is found, you\'ll see a warning with severity and can choose to cancel or proceed with documentation.' },
      { title: 'Submitting Orders', content: 'Click "Submit All Orders" to send all pending lab, imaging, and pharmacy orders at once. Orders are routed to the appropriate department immediately.' },
      { title: 'Viewing Results', content: 'Below the order forms, the "Results" section shows all orders for the current encounter with their statuses. Switch between Lab, Imaging, and Pharmacy tabs. Completed results display inline with the order.' },
    ],
  },
  {
    title: 'Completing the Visit',
    icon: 'M5 13l4 4L19 7',
    steps: [
      { title: 'Alert Nurse / Complete', content: 'When you\'re done with the patient, click "Alert Nurse" (green button). This opens a dialog where you can mark whether a follow-up is required.' },
      { title: 'Follow-Up', content: 'If follow-up is needed, check the box, select a timeframe (1 week, 2 weeks, 1 month, etc.), and enter the reason. This automatically adds the patient to the nurse\'s follow-up call queue.' },
      { title: 'Claims Review', content: 'If there are insurance claims pending your review, they appear in the left sidebar under "Claims Pending Review." Click to open the claim details, review the charges, and approve or reject with notes.' },
    ],
  },
];
