import React, { useState } from 'react';

interface HPFormProps {
  encounter: any;
  onSave: (hpData: any) => Promise<void>;
  onClose: () => void;
}

const HPForm: React.FC<HPFormProps> = ({ encounter, onSave, onClose }) => {
  // Auto-populated fields
  const patientAge = encounter.date_of_birth
    ? new Date().getFullYear() - new Date(encounter.date_of_birth).getFullYear()
    : '';

  const [formData, setFormData] = useState({
    // HPI
    hpiTime: '',
    hpiOnset: '',
    hpiLocation: '',
    hpiDuration: '',
    hpiCharacter: '',
    hpiAggravating: '',
    hpiRelieving: '',
    hpiTiming: '',
    hpiSeverity: '',
    hpiAssociated: '',

    // ROS - General
    rosFever: false,
    rosChills: false,
    rosMalaise: false,
    rosWeightChange: false,
    rosHeadaches: false,
    rosFatigue: false,
    rosSyncope: false,

    // ROS - Cardio
    rosChestPain: false,
    rosPalpitations: false,
    rosOrthopnea: false,
    rosDysphagia: false,

    // ROS - Pulm
    rosDyspnea: false,
    rosCough: false,
    rosSoreThroat: false,
    rosRunnyNose: false,

    // ROS - Neuro
    rosAnxiety: false,
    rosPhotophobia: false,
    rosTinnitus: false,
    rosVertigo: false,
    rosMemory: false,
    rosNumbness: false,
    rosWeakness: false,

    // ROS - GI
    rosDiarrhea: false,
    rosDiarrheaBlood: false,
    rosConstipation: false,
    rosAbdPain: false,
    rosNausea: false,
    rosVomiting: false,
    rosVomitingBlood: false,

    // ROS - GU
    rosFrequency: false,
    rosPainBurning: false,
    rosUrgency: false,
    rosBlood: false,

    // ROS - MSK
    rosArthralgias: false,
    rosMyalgias: false,
    rosRash: false,

    // ROS - Menstruation (if female)
    rosMenstruation: '',
    rosVaginalDischarge: '',

    // ROS - Male
    rosErectionEjaculation: '',
    rosTesticles: '',

    // PMH, Meds, FamHx
    pmh: '',
    meds: '',
    famHx: '',

    // Social Hx
    socialTobacco: '',
    socialAlcohol: '',
    socialIllicit: '',
    socialEdu: '',
    socialJob: '',
    socialHouse: '',
    socialDiet: '',
    socialExercise: '',
    socialSleep: '',
    socialSex: '',
    socialSO: '',
    socialKids: '',
    socialVacc: '',
    socialTravel: '',
    socialSickContact: '',
    socialPets: '',

    // Surgeries & Allergies
    surgeries: '',
    allergies: '',
    nkda: false,

    // Physical Exam
    peGen: 'NAD Alert, Awake, and Oriented X4, NDWN',
    peHeent: 'NCAT, MOIST, PERRL, TM intact, anterior nares, O overt injection',
    peNeck: 'Supple, O JVD, O LAD, O carotid bruit, O thyromegaly',
    peHeart: 'RRR, no m/r/g, O PMI, Cap Refill <2secs',
    peLungs: 'CTAB, no r/r/w, O egophony/tactile fremitus',
    peAbd: 'soft, non-distended/non-tender, +BS nd x4, O rebound/guarding, O HSM, O CVA',
    peExt: 'No cyanosis/clubbing or edema, normal ROM, O joint swelling or erythema',
    peSkin: 'Intact, O rashes, O lesions, O erythema',
    peNeuro: 'CN II-XII intact, no focal deficit, normal gait',
    pePsy: 'mSSE, HI or AVI, oriented to person, place, time, situation',

    // Vitals (auto-populated from nurse)
    vitalHR: encounter.vital_signs?.heart_rate || '',
    vitalBP: encounter.vital_signs?.blood_pressure_systolic && encounter.vital_signs?.blood_pressure_diastolic
      ? `${encounter.vital_signs.blood_pressure_systolic}/${encounter.vital_signs.blood_pressure_diastolic}`
      : '',
    vitalRR: encounter.vital_signs?.respiratory_rate || '',
    vitalSpO2: encounter.vital_signs?.oxygen_saturation || '',
    vitalTemp: encounter.vital_signs?.temperature
      ? `${encounter.vital_signs.temperature}°${encounter.vital_signs.temperature_unit || 'F'}`
      : '',

    // Labs
    labs: '',

    // Differential & Plan
    differential1: '',
    differential2: '',
    differential3: '',
    plan: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirm('Are you sure you want to save this H&P? This will be added to the patient\'s medical record.')) {
      return;
    }

    try {
      await onSave(formData);
      alert('H&P saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving H&P:', error);
      alert('Failed to save H&P');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-lg z-10">
          <h2 className="text-2xl font-bold text-gray-900">History & Physical Examination</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Room */}
          <div className="bg-gray-200 p-3 rounded">
            <strong>ROOM:</strong> {encounter.room_number || 'N/A'}
          </div>

          {/* HPI */}
          <div className="border border-gray-300 rounded p-4">
            <h3 className="text-lg font-semibold mb-3">HPI:</h3>
            <div className="mb-3 text-sm">
              <span className="font-medium">{encounter.patient_name}</span> is a{' '}
              <span className="font-medium">{patientAge}</span> year old{' '}
              <span className="font-medium">{encounter.gender?.toUpperCase() || 'M/F'}</span> presenting with{' '}
              <span className="font-medium">{encounter.chief_complaint}</span> for{' '}
              <input
                type="text"
                value={formData.hpiTime}
                onChange={(e) => setFormData({ ...formData, hpiTime: e.target.value })}
                className="inline-block w-32 px-2 py-1 border-b border-gray-400 focus:outline-none focus:border-primary-600"
                placeholder="duration"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">O - Onset:</span>
                <input
                  type="text"
                  value={formData.hpiOnset}
                  onChange={(e) => setFormData({ ...formData, hpiOnset: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">L - Location:</span>
                <input
                  type="text"
                  value={formData.hpiLocation}
                  onChange={(e) => setFormData({ ...formData, hpiLocation: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">D - Duration:</span>
                <input
                  type="text"
                  value={formData.hpiDuration}
                  onChange={(e) => setFormData({ ...formData, hpiDuration: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">C - Character:</span>
                <input
                  type="text"
                  value={formData.hpiCharacter}
                  onChange={(e) => setFormData({ ...formData, hpiCharacter: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">A - Aggravating:</span>
                <input
                  type="text"
                  value={formData.hpiAggravating}
                  onChange={(e) => setFormData({ ...formData, hpiAggravating: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">R - Relieving:</span>
                <input
                  type="text"
                  value={formData.hpiRelieving}
                  onChange={(e) => setFormData({ ...formData, hpiRelieving: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">T - Timing:</span>
                <input
                  type="text"
                  value={formData.hpiTiming}
                  onChange={(e) => setFormData({ ...formData, hpiTiming: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">S - Severity:</span>
                <input
                  type="text"
                  value={formData.hpiSeverity}
                  onChange={(e) => setFormData({ ...formData, hpiSeverity: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
              <div className="flex items-center">
                <span className="w-24 font-semibold text-gray-700">+ Associated:</span>
                <input
                  type="text"
                  value={formData.hpiAssociated}
                  onChange={(e) => setFormData({ ...formData, hpiAssociated: e.target.value })}
                  className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                />
              </div>
            </div>
          </div>

          {/* ROS */}
          <div className="border border-gray-300 rounded p-4">
            <h3 className="text-lg font-semibold mb-3">ROS:</h3>
            <div className="grid grid-cols-7 gap-3 text-xs">
              {/* General */}
              <div>
                <div className="font-semibold text-gray-700 mb-2">General</div>
                <label className="flex items-center mb-1">
                  <input
                    type="checkbox"
                    checked={formData.rosFever}
                    onChange={(e) => setFormData({ ...formData, rosFever: e.target.checked })}
                    className="mr-1"
                  />
                  fever
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosChills} onChange={(e) => setFormData({ ...formData, rosChills: e.target.checked })} className="mr-1" />
                  chills
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosMalaise} onChange={(e) => setFormData({ ...formData, rosMalaise: e.target.checked })} className="mr-1" />
                  malaise
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosWeightChange} onChange={(e) => setFormData({ ...formData, rosWeightChange: e.target.checked })} className="mr-1" />
                  wt change
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosHeadaches} onChange={(e) => setFormData({ ...formData, rosHeadaches: e.target.checked })} className="mr-1" />
                  headaches
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosFatigue} onChange={(e) => setFormData({ ...formData, rosFatigue: e.target.checked })} className="mr-1" />
                  fatigue
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosSyncope} onChange={(e) => setFormData({ ...formData, rosSyncope: e.target.checked })} className="mr-1" />
                  syncope
                </label>
              </div>

              {/* Cardio */}
              <div>
                <div className="font-semibold text-gray-700 mb-2">Cardio</div>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosChestPain} onChange={(e) => setFormData({ ...formData, rosChestPain: e.target.checked })} className="mr-1" />
                  chest pain
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosPalpitations} onChange={(e) => setFormData({ ...formData, rosPalpitations: e.target.checked })} className="mr-1" />
                  palpitations
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosOrthopnea} onChange={(e) => setFormData({ ...formData, rosOrthopnea: e.target.checked })} className="mr-1" />
                  orthopnea
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosDysphagia} onChange={(e) => setFormData({ ...formData, rosDysphagia: e.target.checked })} className="mr-1" />
                  dysphagia
                </label>
              </div>

              {/* Pulm */}
              <div>
                <div className="font-semibold text-gray-700 mb-2">Pulm</div>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosDyspnea} onChange={(e) => setFormData({ ...formData, rosDyspnea: e.target.checked })} className="mr-1" />
                  dyspnea
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosCough} onChange={(e) => setFormData({ ...formData, rosCough: e.target.checked })} className="mr-1" />
                  cough
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosSoreThroat} onChange={(e) => setFormData({ ...formData, rosSoreThroat: e.target.checked })} className="mr-1" />
                  sore throat
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosRunnyNose} onChange={(e) => setFormData({ ...formData, rosRunnyNose: e.target.checked })} className="mr-1" />
                  runny nose
                </label>
              </div>

              {/* Neuro */}
              <div>
                <div className="font-semibold text-gray-700 mb-2">Neuro</div>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosAnxiety} onChange={(e) => setFormData({ ...formData, rosAnxiety: e.target.checked })} className="mr-1" />
                  anxiety
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosPhotophobia} onChange={(e) => setFormData({ ...formData, rosPhotophobia: e.target.checked })} className="mr-1" />
                  photophobia
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosTinnitus} onChange={(e) => setFormData({ ...formData, rosTinnitus: e.target.checked })} className="mr-1" />
                  tinnitus
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosVertigo} onChange={(e) => setFormData({ ...formData, rosVertigo: e.target.checked })} className="mr-1" />
                  vertigo
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosMemory} onChange={(e) => setFormData({ ...formData, rosMemory: e.target.checked })} className="mr-1" />
                  memory
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosNumbness} onChange={(e) => setFormData({ ...formData, rosNumbness: e.target.checked })} className="mr-1" />
                  numbness
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosWeakness} onChange={(e) => setFormData({ ...formData, rosWeakness: e.target.checked })} className="mr-1" />
                  weakness
                </label>
              </div>

              {/* GI */}
              <div>
                <div className="font-semibold text-gray-700 mb-2">GI</div>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosDiarrhea} onChange={(e) => setFormData({ ...formData, rosDiarrhea: e.target.checked })} className="mr-1" />
                  diarrhea
                  <input type="checkbox" checked={formData.rosDiarrheaBlood} onChange={(e) => setFormData({ ...formData, rosDiarrheaBlood: e.target.checked })} className="ml-1 mr-1" />
                  <span className="text-red-600">blood?</span>
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosConstipation} onChange={(e) => setFormData({ ...formData, rosConstipation: e.target.checked })} className="mr-1" />
                  constipation
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosAbdPain} onChange={(e) => setFormData({ ...formData, rosAbdPain: e.target.checked })} className="mr-1" />
                  abd pain
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosNausea} onChange={(e) => setFormData({ ...formData, rosNausea: e.target.checked })} className="mr-1" />
                  nausea
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosVomiting} onChange={(e) => setFormData({ ...formData, rosVomiting: e.target.checked })} className="mr-1" />
                  vomiting
                  <input type="checkbox" checked={formData.rosVomitingBlood} onChange={(e) => setFormData({ ...formData, rosVomitingBlood: e.target.checked })} className="ml-1 mr-1" />
                  <span className="text-red-600">blood?</span>
                </label>
              </div>

              {/* GU */}
              <div>
                <div className="font-semibold text-gray-700 mb-2">GU</div>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosFrequency} onChange={(e) => setFormData({ ...formData, rosFrequency: e.target.checked })} className="mr-1" />
                  frequency
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosPainBurning} onChange={(e) => setFormData({ ...formData, rosPainBurning: e.target.checked })} className="mr-1" />
                  pain/burning
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosUrgency} onChange={(e) => setFormData({ ...formData, rosUrgency: e.target.checked })} className="mr-1" />
                  urgency
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosBlood} onChange={(e) => setFormData({ ...formData, rosBlood: e.target.checked })} className="mr-1" />
                  <span className="text-red-600">blood?</span>
                </label>
              </div>

              {/* MSK & Gender-specific */}
              <div>
                <div className="font-semibold text-gray-700 mb-2">MSK</div>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosArthralgias} onChange={(e) => setFormData({ ...formData, rosArthralgias: e.target.checked })} className="mr-1" />
                  arthralgias
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosMyalgias} onChange={(e) => setFormData({ ...formData, rosMyalgias: e.target.checked })} className="mr-1" />
                  myalgias
                </label>
                <label className="flex items-center mb-1">
                  <input type="checkbox" checked={formData.rosRash} onChange={(e) => setFormData({ ...formData, rosRash: e.target.checked })} className="mr-1" />
                  rash
                </label>

                <div className="mt-3">
                  <div className="font-semibold text-gray-700 mb-1">Menstruation:</div>
                  <input
                    type="text"
                    value={formData.rosMenstruation}
                    onChange={(e) => setFormData({ ...formData, rosMenstruation: e.target.value })}
                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                  />
                  <div className="font-semibold text-gray-700 mb-1 mt-1">vaginal discharge</div>
                  <input
                    type="text"
                    value={formData.rosVaginalDischarge}
                    onChange={(e) => setFormData({ ...formData, rosVaginalDischarge: e.target.value })}
                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                  />
                </div>

                <div className="mt-3">
                  <div className="font-semibold text-gray-700 mb-1">Erection/ejaculation:</div>
                  <input
                    type="text"
                    value={formData.rosErectionEjaculation}
                    onChange={(e) => setFormData({ ...formData, rosErectionEjaculation: e.target.value })}
                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                  />
                  <div className="font-semibold text-gray-700 mb-1 mt-1">Testicles</div>
                  <input
                    type="text"
                    value={formData.rosTesticles}
                    onChange={(e) => setFormData({ ...formData, rosTesticles: e.target.value })}
                    className="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* PMH, MEDS, FamHx, Social Hx - Part 1 */}
          <div className="grid grid-cols-4 gap-4">
            {/* PMH */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">PMH:</h3>
              <textarea
                value={formData.pmh}
                onChange={(e) => setFormData({ ...formData, pmh: e.target.value })}
                className="w-full h-32 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Past medical history..."
              />
            </div>

            {/* MEDS */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">MEDS:</h3>
              <textarea
                value={formData.meds}
                onChange={(e) => setFormData({ ...formData, meds: e.target.value })}
                className="w-full h-32 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Current medications..."
              />
            </div>

            {/* FamHx */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">FamHx:</h3>
              <textarea
                value={formData.famHx}
                onChange={(e) => setFormData({ ...formData, famHx: e.target.value })}
                className="w-full h-32 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Family history..."
              />
            </div>

            {/* Social Hx */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">Social Hx:</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <label className="font-medium text-gray-600">Tobacco:</label>
                  <input
                    type="text"
                    value={formData.socialTobacco}
                    onChange={(e) => setFormData({ ...formData, socialTobacco: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="font-medium text-gray-600">Alcohol:</label>
                  <input
                    type="text"
                    value={formData.socialAlcohol}
                    onChange={(e) => setFormData({ ...formData, socialAlcohol: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="font-medium text-gray-600">Illicit:</label>
                  <input
                    type="text"
                    value={formData.socialIllicit}
                    onChange={(e) => setFormData({ ...formData, socialIllicit: e.target.value })}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Social Hx - Part 2 (continued) */}
          <div className="border border-gray-300 rounded p-3">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <label className="font-medium text-gray-600">Edu:</label>
                <input
                  type="text"
                  value={formData.socialEdu}
                  onChange={(e) => setFormData({ ...formData, socialEdu: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Job:</label>
                <input
                  type="text"
                  value={formData.socialJob}
                  onChange={(e) => setFormData({ ...formData, socialJob: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">House:</label>
                <input
                  type="text"
                  value={formData.socialHouse}
                  onChange={(e) => setFormData({ ...formData, socialHouse: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Diet:</label>
                <input
                  type="text"
                  value={formData.socialDiet}
                  onChange={(e) => setFormData({ ...formData, socialDiet: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Exercise:</label>
                <input
                  type="text"
                  value={formData.socialExercise}
                  onChange={(e) => setFormData({ ...formData, socialExercise: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Sleep:</label>
                <input
                  type="text"
                  value={formData.socialSleep}
                  onChange={(e) => setFormData({ ...formData, socialSleep: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Sex:</label>
                <input
                  type="text"
                  value={formData.socialSex}
                  onChange={(e) => setFormData({ ...formData, socialSex: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">SO:</label>
                <input
                  type="text"
                  value={formData.socialSO}
                  onChange={(e) => setFormData({ ...formData, socialSO: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Kids:</label>
                <input
                  type="text"
                  value={formData.socialKids}
                  onChange={(e) => setFormData({ ...formData, socialKids: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Vacc:</label>
                <input
                  type="text"
                  value={formData.socialVacc}
                  onChange={(e) => setFormData({ ...formData, socialVacc: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Travel:</label>
                <input
                  type="text"
                  value={formData.socialTravel}
                  onChange={(e) => setFormData({ ...formData, socialTravel: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Sick con:</label>
                <input
                  type="text"
                  value={formData.socialSickContact}
                  onChange={(e) => setFormData({ ...formData, socialSickContact: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="font-medium text-gray-600">Pets:</label>
                <input
                  type="text"
                  value={formData.socialPets}
                  onChange={(e) => setFormData({ ...formData, socialPets: e.target.value })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
            </div>
          </div>

          {/* Surgeries & Allergies */}
          <div className="grid grid-cols-2 gap-4">
            {/* Surgeries */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">Surgeries:</h3>
              <textarea
                value={formData.surgeries}
                onChange={(e) => setFormData({ ...formData, surgeries: e.target.value })}
                className="w-full h-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Past surgical history..."
              />
            </div>

            {/* Allergies */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">
                Allergies:
                <label className="ml-3 font-normal">
                  <input
                    type="checkbox"
                    checked={formData.nkda}
                    onChange={(e) => setFormData({ ...formData, nkda: e.target.checked })}
                    className="mr-1"
                  />
                  NKDA?
                </label>
              </h3>
              <textarea
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                disabled={formData.nkda}
                className="w-full h-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
                placeholder="List allergies..."
              />
            </div>
          </div>

          {/* Physical Exam & Labs */}
          <div className="grid grid-cols-3 gap-4">
            {/* Physical Exam */}
            <div className="col-span-2 border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-3">PHYSICAL EXAM:</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>GEN:</strong>
                  <input
                    type="text"
                    value={formData.peGen}
                    onChange={(e) => setFormData({ ...formData, peGen: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>HEENT:</strong>
                  <input
                    type="text"
                    value={formData.peHeent}
                    onChange={(e) => setFormData({ ...formData, peHeent: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>NECK:</strong>
                  <input
                    type="text"
                    value={formData.peNeck}
                    onChange={(e) => setFormData({ ...formData, peNeck: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>HEART:</strong>
                  <input
                    type="text"
                    value={formData.peHeart}
                    onChange={(e) => setFormData({ ...formData, peHeart: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>LUNGS:</strong>
                  <input
                    type="text"
                    value={formData.peLungs}
                    onChange={(e) => setFormData({ ...formData, peLungs: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>ABD:</strong>
                  <input
                    type="text"
                    value={formData.peAbd}
                    onChange={(e) => setFormData({ ...formData, peAbd: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>EXT:</strong>
                  <input
                    type="text"
                    value={formData.peExt}
                    onChange={(e) => setFormData({ ...formData, peExt: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>SKIN:</strong>
                  <input
                    type="text"
                    value={formData.peSkin}
                    onChange={(e) => setFormData({ ...formData, peSkin: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>NEURO:</strong>
                  <input
                    type="text"
                    value={formData.peNeuro}
                    onChange={(e) => setFormData({ ...formData, peNeuro: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div>
                  <strong>PSY:</strong>
                  <input
                    type="text"
                    value={formData.pePsy}
                    onChange={(e) => setFormData({ ...formData, pePsy: e.target.value })}
                    className="w-full px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
              </div>
            </div>

            {/* Vitals & Labs */}
            <div>
              <div className="border border-gray-300 rounded p-3 bg-gray-50 mb-3">
                <h3 className="font-semibold text-gray-700 mb-2">Vitals:</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center">
                    <span className="w-16">HR:</span>
                    <input
                      type="text"
                      value={formData.vitalHR}
                      onChange={(e) => setFormData({ ...formData, vitalHR: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">BP:</span>
                    <input
                      type="text"
                      value={formData.vitalBP}
                      onChange={(e) => setFormData({ ...formData, vitalBP: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">RR:</span>
                    <input
                      type="text"
                      value={formData.vitalRR}
                      onChange={(e) => setFormData({ ...formData, vitalRR: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">SpO2:</span>
                    <input
                      type="text"
                      value={formData.vitalSpO2}
                      onChange={(e) => setFormData({ ...formData, vitalSpO2: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="w-16">Temp:</span>
                    <input
                      type="text"
                      value={formData.vitalTemp}
                      onChange={(e) => setFormData({ ...formData, vitalTemp: e.target.value })}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded"
                    />
                  </div>
                </div>
              </div>

              <div className="border border-gray-300 rounded p-3">
                <h3 className="font-semibold text-gray-700 mb-2">LABS:</h3>
                <textarea
                  value={formData.labs}
                  onChange={(e) => setFormData({ ...formData, labs: e.target.value })}
                  className="w-full h-32 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Lab results..."
                />
              </div>
            </div>
          </div>

          {/* Differential & Plan */}
          <div className="grid grid-cols-2 gap-4">
            {/* Differential */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">Differential:</h3>
              <div className="space-y-2">
                <div className="flex items-center">
                  <span className="w-8 font-semibold">1.</span>
                  <input
                    type="text"
                    value={formData.differential1}
                    onChange={(e) => setFormData({ ...formData, differential1: e.target.value })}
                    className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div className="flex items-center">
                  <span className="w-8 font-semibold">2.</span>
                  <input
                    type="text"
                    value={formData.differential2}
                    onChange={(e) => setFormData({ ...formData, differential2: e.target.value })}
                    className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
                <div className="flex items-center">
                  <span className="w-8 font-semibold">3.</span>
                  <input
                    type="text"
                    value={formData.differential3}
                    onChange={(e) => setFormData({ ...formData, differential3: e.target.value })}
                    className="flex-1 px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-primary-600"
                  />
                </div>
              </div>
            </div>

            {/* Plan */}
            <div className="border border-gray-300 rounded p-3">
              <h3 className="font-semibold text-gray-700 mb-2">PLAN:</h3>
              <textarea
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                className="w-full h-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Treatment plan..."
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
            >
              Save H&P
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HPForm;
