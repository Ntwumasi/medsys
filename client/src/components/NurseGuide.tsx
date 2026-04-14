import React, { useState } from 'react';

const GUIDE_SECTIONS = [
  {
    title: 'Patient Assignment & Triage',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    steps: [
      { title: 'View Assigned Patients', content: 'Your assigned patients appear in the "My Assigned Patients" panel on the left. Click any patient to open their chart. Patients are assigned by the receptionist during check-in.' },
      { title: 'Room Assignment', content: 'Once a patient is selected, use the "Room Assignment" section to assign or change their exam room. Click "Change" to move them to a different room.' },
      { title: 'Priority & Triage', content: 'Each patient has a triage priority (Green/Yellow/Red). This is set during initial assessment. The priority badge appears next to their name in the patient list.' },
    ],
  },
  {
    title: 'Vital Signs',
    icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    steps: [
      { title: 'Recording Vitals', content: 'Select a patient, then go to the "Vital Signs" tab. Enter blood pressure, heart rate, temperature, respiratory rate, SpO2, weight, and height. Values auto-save after 3 seconds of inactivity.' },
      { title: 'Out-of-Range Alerts', content: 'Vitals outside normal ranges are highlighted in red automatically. Pay attention to these — they may need immediate attention.' },
      { title: 'Vital Signs History', content: 'Click "View History" to see a timeline of all vital sign readings for the current encounter, with trends and comparisons.' },
    ],
  },
  {
    title: 'Clinical Notes & Communication',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    steps: [
      { title: 'SOAP Notes', content: 'The "SOAP" tab contains the structured clinical note (Subjective, Objective, Assessment, Plan). Fill out sections by clicking each heading. Use the "Smart Dictate" button for voice input.' },
      { title: 'Clinical Notes', content: 'The "Clinical Notes" tab lets you write free-form nurse notes. These are visible to the doctor. Use "Nurse Instructions" for notes specifically for the doctor.' },
      { title: 'Alert Doctor', content: 'When the patient is ready for the doctor, click the green "Alert Doctor" button. This sends a notification to the assigned doctor and updates the patient\'s status to "Ready for Doctor".' },
    ],
  },
  {
    title: 'Orders & Routing',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    steps: [
      { title: 'Order Labs', content: 'Click "Order Labs" to request laboratory tests. Select from the test catalog, set priority (Routine/Urgent/STAT), and submit. The order goes directly to the lab department.' },
      { title: 'Order Imaging', content: 'Click "Order Imaging" to request radiology studies (X-ray, CT, MRI, etc.). Specify the body part and clinical indication.' },
      { title: 'Patient Routing', content: 'The "Patient Routing" tab shows where the patient has been sent (Lab, Imaging, Pharmacy). Use the department buttons to route patients to the appropriate department.' },
    ],
  },
  {
    title: 'Documents & Procedures',
    icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    steps: [
      { title: 'Upload Documents', content: 'Go to the "Documents" tab to upload scanned documents — lab results, imaging reports, referral letters. Select a category first, then drag-and-drop or click "Select Files". Files are stored in the patient\'s record.' },
      { title: 'Nurse Procedures', content: 'The "Nurse Procedures" tab lets you log procedures performed (wound care, IV insertion, medication administration, etc.). Each procedure is timestamped and linked to the encounter.' },
    ],
  },
  {
    title: 'Follow-Up Calls',
    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    steps: [
      { title: 'How Follow-Up Calls Work', content: 'When a doctor marks "Follow-up Required" on an encounter, that patient automatically appears in the Follow-Up Calls queue. The system calculates the due date based on the timeframe the doctor selected (1 week, 2 weeks, 1 month, etc.).' },
      { title: 'Call Queue', content: 'Open "Follow-Up Calls" from the sidebar. Patients are grouped by urgency: Overdue (red), Due Today (yellow), Upcoming (blue). All patient info (name, phone, doctor seen, complaint) is pre-filled from the encounter — no re-typing needed.' },
      { title: 'Logging a Call', content: 'Click "Log Call" on any patient. Select the call status (Reached, No Answer, Voicemail, etc.), type the patient\'s status and your recommendation, and optionally set a next review date. The log is saved to the patient\'s record.' },
      { title: 'Call History', content: 'Switch to the "Call History" tab to see a complete log of all follow-up calls with dates, outcomes, and who made each call.' },
    ],
  },
  {
    title: 'Inventory (All Nurses)',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    steps: [
      { title: 'Viewing Stock', content: 'Go to "Inventory" in the sidebar to see current supply levels. Items low on stock are highlighted in red. Use the search and category filters to find specific items.' },
      { title: 'Procurement (Head Nurse)', content: 'The Head Nurse has access to "Procurement" in the sidebar. This is where you add new inventory items, record purchases (with supplier, batch, and cost tracking), and view purchase history.' },
    ],
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const NurseGuide: React.FC<Props> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  if (!isOpen) return null;

  const section = GUIDE_SECTIONS[activeSection];
  const step = section.steps[activeStep];
  const totalSteps = GUIDE_SECTIONS.reduce((sum, s) => sum + s.steps.length, 0);
  let currentStepNumber = 0;
  for (let i = 0; i < activeSection; i++) currentStepNumber += GUIDE_SECTIONS[i].steps.length;
  currentStepNumber += activeStep + 1;

  const goNext = () => {
    if (activeStep < section.steps.length - 1) {
      setActiveStep(activeStep + 1);
    } else if (activeSection < GUIDE_SECTIONS.length - 1) {
      setActiveSection(activeSection + 1);
      setActiveStep(0);
    }
  };

  const goPrev = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    } else if (activeSection > 0) {
      const prevSection = GUIDE_SECTIONS[activeSection - 1];
      setActiveSection(activeSection - 1);
      setActiveStep(prevSection.steps.length - 1);
    }
  };

  const isFirst = activeSection === 0 && activeStep === 0;
  const isLast = activeSection === GUIDE_SECTIONS.length - 1 && activeStep === section.steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Nurse Dashboard Guide</h2>
                <p className="text-primary-100 text-sm">Step {currentStepNumber} of {totalSteps}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:text-primary-200 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-3 bg-white bg-opacity-20 rounded-full h-1.5">
            <div
              className="bg-white rounded-full h-1.5 transition-all duration-300"
              style={{ width: `${(currentStepNumber / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Section nav */}
          <div className="w-56 bg-gray-50 border-r border-gray-200 overflow-y-auto flex-shrink-0">
            {GUIDE_SECTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => { setActiveSection(i); setActiveStep(0); }}
                className={`w-full px-4 py-3 text-left text-sm flex items-center gap-2.5 transition-colors border-l-3 ${
                  activeSection === i
                    ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-600 font-semibold'
                    : 'text-gray-600 hover:bg-gray-100 border-l-4 border-transparent'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                </svg>
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </div>

          {/* Step content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                </svg>
              </div>
              <div>
                <div className="text-xs uppercase font-semibold text-primary-600 tracking-wide">{section.title}</div>
                <h3 className="text-xl font-bold text-gray-900">{step.title}</h3>
              </div>
            </div>

            {/* Step indicators */}
            <div className="flex gap-1.5 mb-6">
              {section.steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeStep ? 'bg-primary-600 w-8' : i < activeStep ? 'bg-primary-300 w-4' : 'bg-gray-200 w-4'
                  }`}
                />
              ))}
            </div>

            {/* Content */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <p className="text-gray-700 leading-relaxed text-[15px]">{step.content}</p>
            </div>

            {/* Tip */}
            <div className="mt-4 flex items-start gap-2 text-sm text-primary-700">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Click the section titles on the left to jump to any topic.</span>
            </div>
          </div>
        </div>

        {/* Footer navigation */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-gray-400">{currentStepNumber} / {totalSteps}</span>
          {isLast ? (
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-bold text-white bg-success-600 rounded-lg hover:bg-success-700"
            >
              Done!
            </button>
          ) : (
            <button
              onClick={goNext}
              className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NurseGuide;
