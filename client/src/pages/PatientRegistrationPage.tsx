import React, { useState, useEffect } from 'react';
import AppLayout from '../components/AppLayout';
import NationalityAutocomplete from '../components/NationalityAutocomplete';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import type { ApiError } from '../types';

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
}

interface PayerSource {
  payer_type: string;
  corporate_client_id?: number;
  insurance_provider_id?: number;
}

const ghanaRegions = [
  'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Northern',
  'Volta', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo',
  'Western North', 'Oti', 'North East', 'Savannah',
];

const clinics = [
  'General Practice', 'ENT (Ear, Nose & Throat)', 'Urology', 'Cardiology',
  'Dermatology', 'Gastroenterology', 'Neurology', 'Obstetrics & Gynecology',
  'Ophthalmology', 'Orthopedics', 'Pediatrics', 'Psychiatry', 'Pulmonology',
  'Rheumatology', 'Endocrinology',
];

const PatientRegistrationPage: React.FC = () => {
  const { showToast } = useNotification();

  // Patient form state
  const [patient, setPatient] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    gps_address: '',
    city: '',
    region: '',
    preferred_clinic: '',
    vip_status: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    pcp_name: '',
    pcp_phone: '',
    allergies: '',
    nationality: '',
  });

  // Payer source state
  const [selectedPayerTypes, setSelectedPayerTypes] = useState<string[]>([]);
  const [selectedCorporateClient, setSelectedCorporateClient] = useState<number | null>(null);
  const [selectedInsuranceProvider, setSelectedInsuranceProvider] = useState<number | null>(null);

  // Appointment state
  const [showAppointment, setShowAppointment] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('09:00');
  const [appointmentDoctor, setAppointmentDoctor] = useState<number | null>(null);
  const [appointmentClinic, setAppointmentClinic] = useState('');
  const [appointmentType, setAppointmentType] = useState('new');
  const [appointmentDuration, setAppointmentDuration] = useState(30);
  const [appointmentReason, setAppointmentReason] = useState('');

  // Data lists
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [corporateClients, setCorporateClients] = useState<Array<{ id: number; name: string }>>([]);
  const [insuranceProviders, setInsuranceProviders] = useState<Array<{ id: number; name: string }>>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ patientNumber: string; appointmentDate?: string } | null>(null);

  // DOB helpers
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [doctorsRes, payersRes] = await Promise.all([
          apiClient.get('/users/doctors'),
          apiClient.get('/charge-master/payers'),
        ]);
        setDoctors(doctorsRes.data.doctors || doctorsRes.data || []);
        const allPayers = payersRes.data.payers || [];
        setCorporateClients(allPayers.filter((p: { payer_type: string }) => p.payer_type === 'corporate'));
        setInsuranceProviders(allPayers.filter((p: { payer_type: string }) => p.payer_type === 'insurance'));
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, []);

  // Build DOB string when parts change
  useEffect(() => {
    if (dobDay && dobMonth && dobYear) {
      setPatient(prev => ({
        ...prev,
        date_of_birth: `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`,
      }));
    }
  }, [dobDay, dobMonth, dobYear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Build payer sources
      const payer_sources: PayerSource[] = [];
      if (selectedPayerTypes.includes('self_pay')) {
        payer_sources.push({ payer_type: 'self_pay' });
      }
      if (selectedPayerTypes.includes('corporate') && selectedCorporateClient) {
        payer_sources.push({ payer_type: 'corporate', corporate_client_id: selectedCorporateClient });
      }
      if (selectedPayerTypes.includes('insurance') && selectedInsuranceProvider) {
        payer_sources.push({ payer_type: 'insurance', insurance_provider_id: selectedInsuranceProvider });
      }

      // 1. Create patient
      const patientRes = await apiClient.post('/patients', { ...patient, payer_sources });
      const newPatient = patientRes.data.patient;

      let appointmentDateStr: string | undefined;

      // 2. Optionally book appointment
      if (showAppointment && appointmentDate) {
        const dateTime = new Date(`${appointmentDate}T${appointmentTime}`);
        await apiClient.post('/appointments', {
          patient_id: newPatient.id,
          patient_name: `${newPatient.first_name} ${newPatient.last_name}`,
          provider_id: appointmentDoctor,
          appointment_date: dateTime.toISOString(),
          duration_minutes: appointmentDuration,
          appointment_type: appointmentType,
          reason: appointmentReason || appointmentClinic || 'New Patient',
          notes: '',
        });
        appointmentDateStr = dateTime.toLocaleDateString('en-GB', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
      }

      // Show success
      setSuccessData({
        patientNumber: newPatient.patient_number,
        appointmentDate: appointmentDateStr,
      });
      setShowSuccess(true);

      // Reset form
      setPatient({
        first_name: '', last_name: '', date_of_birth: '', gender: '',
        phone: '', email: '', address: '', gps_address: '', city: '', region: '',
        preferred_clinic: '', vip_status: '',
        emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
        pcp_name: '', pcp_phone: '', allergies: '', nationality: '',
      });
      setDobDay(''); setDobMonth(''); setDobYear('');
      setSelectedPayerTypes([]); setSelectedCorporateClient(null); setSelectedInsuranceProvider(null);
      setShowAppointment(false); setAppointmentDate(''); setAppointmentTime('09:00');
      setAppointmentDoctor(null); setAppointmentClinic(''); setAppointmentType('new');
      setAppointmentDuration(30); setAppointmentReason('');

      showToast(`Patient ${newPatient.patient_number} registered successfully!`, 'success');
    } catch (error) {
      console.error('Error registering patient:', error);
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || apiError.response?.data?.error || 'Failed to register patient';
      showToast(errorMessage, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setPatient(prev => ({ ...prev, [field]: value }));
  };

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => currentYear - i);

  return (
    <AppLayout title="Register Patient">
      <div className="max-w-4xl mx-auto">
        {/* Success Confirmation */}
        {showSuccess && successData && (
          <div className="mb-6 bg-success-50 border border-success-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 bg-success-100 rounded-full p-3">
                <svg className="w-6 h-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-success-800">Patient Registered</h3>
                <p className="text-success-700 mt-1">
                  Patient number: <span className="font-semibold">{successData.patientNumber}</span>
                </p>
                {successData.appointmentDate && (
                  <p className="text-success-700 mt-1">
                    Appointment booked: <span className="font-semibold">{successData.appointmentDate}</span>
                  </p>
                )}
                <button
                  onClick={() => setShowSuccess(false)}
                  className="mt-3 text-sm text-success-600 hover:text-success-800 font-medium"
                >
                  Register another patient
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Register New Patient</h2>
            <p className="text-sm text-gray-500 mt-1">Patient # will be automatically generated upon registration</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input type="text" required value={patient.first_name} onChange={(e) => updateField('first_name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input type="text" required value={patient.last_name} onChange={(e) => updateField('last_name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
                  <div className="flex gap-2">
                    <select value={dobDay} onChange={(e) => setDobDay(e.target.value)} required className="flex-1 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
                      <option value="">Day</option>
                      {days.map(d => <option key={d} value={String(d)}>{d}</option>)}
                    </select>
                    <select value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} required className="flex-1 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
                      <option value="">Month</option>
                      {months.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                    </select>
                    <select value={dobYear} onChange={(e) => setDobYear(e.target.value)} required className="flex-1 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 text-sm">
                      <option value="">Year</option>
                      {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                  <select required value={patient.gender} onChange={(e) => updateField('gender', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                  <input type="text" value={patient.allergies} onChange={(e) => updateField('allergies', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="e.g., Penicillin, Peanuts, Latex" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
                  <NationalityAutocomplete value={patient.nationality} onChange={(value: string) => updateField('nationality', value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Clinic</label>
                  <select value={patient.preferred_clinic} onChange={(e) => updateField('preferred_clinic', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">Select Clinic</option>
                    {clinics.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Concierge</label>
                  <select value={patient.vip_status} onChange={(e) => updateField('vip_status', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">None</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                    <option value="platinum">Platinum</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input type="tel" required value={patient.phone} onChange={(e) => updateField('phone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="e.g., 0244123456" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={patient.email} onChange={(e) => updateField('email', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Residential Address</label>
                  <input type="text" value={patient.address} onChange={(e) => updateField('address', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="House number, Street name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GPS Address Code</label>
                  <input type="text" value={patient.gps_address} onChange={(e) => updateField('gps_address', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="e.g., GA-123-4567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City/Town</label>
                  <input type="text" value={patient.city} onChange={(e) => updateField('city', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <select value={patient.region} onChange={(e) => updateField('region', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">Select Region</option>
                    {ghanaRegions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                  <input type="text" value={patient.emergency_contact_name} onChange={(e) => updateField('emergency_contact_name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                  <input type="tel" value={patient.emergency_contact_phone} onChange={(e) => updateField('emergency_contact_phone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Relationship</label>
                  <select value={patient.emergency_contact_relationship} onChange={(e) => updateField('emergency_contact_relationship', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">Select Relationship</option>
                    <option value="spouse">Spouse</option>
                    <option value="parent">Parent</option>
                    <option value="child">Child</option>
                    <option value="sibling">Sibling</option>
                    <option value="friend">Friend</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Primary Care Physician */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Primary Care Physician
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PCP Name</label>
                  <select value={patient.pcp_name} onChange={(e) => updateField('pcp_name', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                    <option value="">Select Doctor</option>
                    {doctors.map(d => (
                      <option key={d.id} value={`Dr. ${d.first_name} ${d.last_name}`}>
                        Dr. {d.first_name} {d.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PCP Phone</label>
                  <input type="tel" value={patient.pcp_phone} onChange={(e) => updateField('pcp_phone', e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="(555) 123-4567" />
                </div>
              </div>
            </div>

            {/* Payer Source */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Payer Source
              </h3>
              <div className="space-y-3">
                <div className="flex items-start">
                  <input type="checkbox" id="reg-payer-self" checked={selectedPayerTypes.includes('self_pay')} onChange={(e) => e.target.checked ? setSelectedPayerTypes([...selectedPayerTypes, 'self_pay']) : setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'self_pay'))} className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                  <label htmlFor="reg-payer-self" className="ml-3 text-sm text-gray-700 font-medium">Self Pay</label>
                </div>
                <div>
                  <div className="flex items-start mb-2">
                    <input type="checkbox" id="reg-payer-corporate" checked={selectedPayerTypes.includes('corporate')} onChange={(e) => { if (e.target.checked) { setSelectedPayerTypes([...selectedPayerTypes, 'corporate']); } else { setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'corporate')); setSelectedCorporateClient(null); } }} className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                    <label htmlFor="reg-payer-corporate" className="ml-3 text-sm text-gray-700 font-medium">Corporate</label>
                  </div>
                  {selectedPayerTypes.includes('corporate') && (
                    <div className="ml-7">
                      <select value={selectedCorporateClient || ''} onChange={(e) => setSelectedCorporateClient(e.target.value ? Number(e.target.value) : null)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" required>
                        <option value="">Select Corporate Client</option>
                        {corporateClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-start mb-2">
                    <input type="checkbox" id="reg-payer-insurance" checked={selectedPayerTypes.includes('insurance')} onChange={(e) => { if (e.target.checked) { setSelectedPayerTypes([...selectedPayerTypes, 'insurance']); } else { setSelectedPayerTypes(selectedPayerTypes.filter(t => t !== 'insurance')); setSelectedInsuranceProvider(null); } }} className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
                    <label htmlFor="reg-payer-insurance" className="ml-3 text-sm text-gray-700 font-medium">Insurance</label>
                  </div>
                  {selectedPayerTypes.includes('insurance') && (
                    <div className="ml-7">
                      <select value={selectedInsuranceProvider || ''} onChange={(e) => setSelectedInsuranceProvider(e.target.value ? Number(e.target.value) : null)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" required>
                        <option value="">Select Insurance Provider</option>
                        {insuranceProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Book Future Appointment (optional) */}
            <div className="border-t pt-6">
              <button
                type="button"
                onClick={() => setShowAppointment(!showAppointment)}
                className="flex items-center gap-2 text-primary-600 hover:text-primary-800 font-semibold text-lg"
              >
                <svg className={`w-5 h-5 transition-transform ${showAppointment ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Book Future Appointment (Optional)
              </button>

              {showAppointment && (
                <div className="mt-4 bg-gray-50 rounded-lg p-5 space-y-4 border border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                      <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" required={showAppointment} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
                      <input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" required={showAppointment} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                      <select value={appointmentDuration} onChange={(e) => setAppointmentDuration(Number(e.target.value))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        <option value={15}>15 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={45}>45 minutes</option>
                        <option value={60}>1 hour</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Type</label>
                      <select value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        <option value="new">New Patient</option>
                        <option value="consultation">Consultation</option>
                        <option value="follow-up">Follow-up Visit</option>
                        <option value="procedure">Procedure</option>
                        <option value="general-checkup">General Checkup</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
                      <select value={appointmentClinic} onChange={(e) => setAppointmentClinic(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        <option value="">Select Clinic</option>
                        {clinics.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Doctor</label>
                      <select value={appointmentDoctor || ''} onChange={(e) => setAppointmentDoctor(e.target.value ? Number(e.target.value) : null)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        <option value="">Any available doctor</option>
                        {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Visit</label>
                    <textarea value={appointmentReason} onChange={(e) => setAppointmentReason(e.target.value)} rows={2} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" placeholder="Reason for the appointment..." />
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Registering...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  {showAppointment && appointmentDate ? 'Register & Book Appointment' : 'Register Patient'}
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
};

export default PatientRegistrationPage;
