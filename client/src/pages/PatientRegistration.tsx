import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientsAPI } from '../api/patients';

const PatientRegistration: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    blood_group: '',
    nationality: '',
    marital_status: '',
    occupation: '',
    address: '',
    gps_address: '',
    city: '',
    region: '',
    preferred_clinic: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    insurance_provider: '',
    insurance_number: '',
    // Health Status
    hiv_status: '',
    hepatitis_b_status: '',
    hepatitis_c_status: '',
    tb_status: '',
    sickle_cell_status: '',
    other_health_conditions: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await patientsAPI.createPatient(formData);
      navigate(`/patients/${response.patient.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to register patient');
    } finally {
      setLoading(false);
    }
  };

  const ghanaRegions = [
    'Greater Accra',
    'Ashanti',
    'Western',
    'Central',
    'Eastern',
    'Northern',
    'Volta',
    'Upper East',
    'Upper West',
    'Bono',
    'Bono East',
    'Ahafo',
    'Western North',
    'Oti',
    'North East',
    'Savannah',
  ];

  const clinics = [
    'General Practice',
    'ENT (Ear, Nose & Throat)',
    'Urology',
    'Cardiology',
    'Dermatology',
    'Gastroenterology',
    'Neurology',
    'Obstetrics & Gynecology',
    'Ophthalmology',
    'Orthopedics',
    'Pediatrics',
    'Psychiatry',
    'Pulmonology',
    'Rheumatology',
    'Endocrinology',
  ];

  const healthStatusOptions = [
    { value: '', label: 'Unknown' },
    { value: 'Negative', label: 'Negative' },
    { value: 'Positive', label: 'Positive' },
    { value: 'Not Tested', label: 'Not Tested' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Register New Patient</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Personal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="first_name" className="label">
                    First Name *
                  </label>
                  <input
                    id="first_name"
                    name="first_name"
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="last_name" className="label">
                    Last Name *
                  </label>
                  <input
                    id="last_name"
                    name="last_name"
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="date_of_birth" className="label">
                    Date of Birth *
                  </label>
                  <input
                    id="date_of_birth"
                    name="date_of_birth"
                    type="date"
                    required
                    value={formData.date_of_birth}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="gender" className="label">
                    Gender *
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    required
                    value={formData.gender}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="nationality" className="label">
                    Nationality
                  </label>
                  <input
                    id="nationality"
                    name="nationality"
                    type="text"
                    value={formData.nationality}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., Ghanaian"
                  />
                </div>

                <div>
                  <label htmlFor="marital_status" className="label">
                    Marital Status
                  </label>
                  <select
                    id="marital_status"
                    name="marital_status"
                    value={formData.marital_status}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="occupation" className="label">
                    Occupation
                  </label>
                  <input
                    id="occupation"
                    name="occupation"
                    type="text"
                    value={formData.occupation}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="blood_group" className="label">
                    Blood Group
                  </label>
                  <select
                    id="blood_group"
                    name="blood_group"
                    value={formData.blood_group}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select Blood Group</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="preferred_clinic" className="label">
                    Preferred Clinic
                  </label>
                  <select
                    id="preferred_clinic"
                    name="preferred_clinic"
                    value={formData.preferred_clinic}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select Clinic</option>
                    {clinics.map((clinic) => (
                      <option key={clinic} value={clinic}>{clinic}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="label">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="label">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., 0244123456"
                  />
                </div>

                <div>
                  <label htmlFor="address" className="label">
                    Residential Address
                  </label>
                  <input
                    id="address"
                    name="address"
                    type="text"
                    value={formData.address}
                    onChange={handleChange}
                    className="input"
                    placeholder="House number, Street name"
                  />
                </div>

                <div>
                  <label htmlFor="gps_address" className="label">
                    GPS Address Code
                  </label>
                  <input
                    id="gps_address"
                    name="gps_address"
                    type="text"
                    value={formData.gps_address}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., GA-123-4567"
                  />
                </div>

                <div>
                  <label htmlFor="city" className="label">
                    City/Town
                  </label>
                  <input
                    id="city"
                    name="city"
                    type="text"
                    value={formData.city}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="region" className="label">
                    Region
                  </label>
                  <select
                    id="region"
                    name="region"
                    value={formData.region}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select Region</option>
                    {ghanaRegions.map((region) => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Emergency Contact
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="emergency_contact_name" className="label">
                    Contact Name
                  </label>
                  <input
                    id="emergency_contact_name"
                    name="emergency_contact_name"
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="emergency_contact_phone" className="label">
                    Contact Phone
                  </label>
                  <input
                    id="emergency_contact_phone"
                    name="emergency_contact_phone"
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={handleChange}
                    className="input"
                  />
                </div>

                <div>
                  <label htmlFor="emergency_contact_relationship" className="label">
                    Relationship
                  </label>
                  <select
                    id="emergency_contact_relationship"
                    name="emergency_contact_relationship"
                    value={formData.emergency_contact_relationship}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select Relationship</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Parent">Parent</option>
                    <option value="Child">Child</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Friend">Friend</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Health Status */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Health Status
              </h2>
              <p className="text-sm text-gray-500 mb-4">This information is confidential and used for clinical care only.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="hiv_status" className="label">
                    HIV Status
                  </label>
                  <select
                    id="hiv_status"
                    name="hiv_status"
                    value={formData.hiv_status}
                    onChange={handleChange}
                    className="input"
                  >
                    {healthStatusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="hepatitis_b_status" className="label">
                    Hepatitis B Status
                  </label>
                  <select
                    id="hepatitis_b_status"
                    name="hepatitis_b_status"
                    value={formData.hepatitis_b_status}
                    onChange={handleChange}
                    className="input"
                  >
                    {healthStatusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="hepatitis_c_status" className="label">
                    Hepatitis C Status
                  </label>
                  <select
                    id="hepatitis_c_status"
                    name="hepatitis_c_status"
                    value={formData.hepatitis_c_status}
                    onChange={handleChange}
                    className="input"
                  >
                    {healthStatusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="tb_status" className="label">
                    TB Status
                  </label>
                  <select
                    id="tb_status"
                    name="tb_status"
                    value={formData.tb_status}
                    onChange={handleChange}
                    className="input"
                  >
                    {healthStatusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sickle_cell_status" className="label">
                    Sickle Cell Status
                  </label>
                  <select
                    id="sickle_cell_status"
                    name="sickle_cell_status"
                    value={formData.sickle_cell_status}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Unknown</option>
                    <option value="AA">AA (Normal)</option>
                    <option value="AS">AS (Carrier/Trait)</option>
                    <option value="SS">SS (Sickle Cell Disease)</option>
                    <option value="SC">SC (Sickle Cell Disease)</option>
                    <option value="Not Tested">Not Tested</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label htmlFor="other_health_conditions" className="label">
                    Other Health Conditions
                  </label>
                  <textarea
                    id="other_health_conditions"
                    name="other_health_conditions"
                    value={formData.other_health_conditions}
                    onChange={handleChange}
                    className="input"
                    rows={3}
                    placeholder="List any other relevant health conditions..."
                  />
                </div>
              </div>
            </div>

            {/* Insurance Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Insurance Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="insurance_provider" className="label">
                    Insurance Provider
                  </label>
                  <input
                    id="insurance_provider"
                    name="insurance_provider"
                    type="text"
                    value={formData.insurance_provider}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g., NHIS, Private Insurance"
                  />
                </div>

                <div>
                  <label htmlFor="insurance_number" className="label">
                    Insurance Number
                  </label>
                  <input
                    id="insurance_number"
                    name="insurance_number"
                    type="text"
                    value={formData.insurance_number}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-4 justify-end pt-4 border-t">
              <button
                type="button"
                onClick={() => navigate('/patients')}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Registering...' : 'Register Patient'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default PatientRegistration;
