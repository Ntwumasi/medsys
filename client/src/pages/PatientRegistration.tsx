import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientsAPI } from '../api/patients';
import type { ApiError } from '../types';
import AppLayout from '../components/AppLayout';
import { Card, Button, Input, Select, Textarea } from '../components/ui';

const PatientRegistration: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicatePatient, setDuplicatePatient] = useState<{id: number, patientNumber: string} | null>(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    allergies: '',
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
    setDuplicatePatient(null);
    setLoading(true);

    try {
      const response = await patientsAPI.createPatient(formData);
      navigate(`/patients/${response.patient.id}`);
    } catch (err) {
      const apiError = err as ApiError;
      const responseData = apiError.response?.data;

      if (responseData?.existingPatientId) {
        setDuplicatePatient({
          id: responseData.existingPatientId,
          patientNumber: responseData.existingPatientNumber || 'Unknown'
        });
        setError(responseData.message || 'A patient with this information already exists.');
      } else {
        setError(responseData?.error || 'Failed to register patient');
      }
    } finally {
      setLoading(false);
    }
  };

  const ghanaRegions = [
    { value: 'Greater Accra', label: 'Greater Accra' },
    { value: 'Ashanti', label: 'Ashanti' },
    { value: 'Western', label: 'Western' },
    { value: 'Central', label: 'Central' },
    { value: 'Eastern', label: 'Eastern' },
    { value: 'Northern', label: 'Northern' },
    { value: 'Volta', label: 'Volta' },
    { value: 'Upper East', label: 'Upper East' },
    { value: 'Upper West', label: 'Upper West' },
    { value: 'Bono', label: 'Bono' },
    { value: 'Bono East', label: 'Bono East' },
    { value: 'Ahafo', label: 'Ahafo' },
    { value: 'Western North', label: 'Western North' },
    { value: 'Oti', label: 'Oti' },
    { value: 'North East', label: 'North East' },
    { value: 'Savannah', label: 'Savannah' },
  ];

  const clinics = [
    { value: 'General Practice', label: 'General Practice' },
    { value: 'ENT (Ear, Nose & Throat)', label: 'ENT (Ear, Nose & Throat)' },
    { value: 'Urology', label: 'Urology' },
    { value: 'Cardiology', label: 'Cardiology' },
    { value: 'Dermatology', label: 'Dermatology' },
    { value: 'Gastroenterology', label: 'Gastroenterology' },
    { value: 'Neurology', label: 'Neurology' },
    { value: 'Obstetrics & Gynecology', label: 'Obstetrics & Gynecology' },
    { value: 'Ophthalmology', label: 'Ophthalmology' },
    { value: 'Orthopedics', label: 'Orthopedics' },
    { value: 'Pediatrics', label: 'Pediatrics' },
    { value: 'Psychiatry', label: 'Psychiatry' },
    { value: 'Pulmonology', label: 'Pulmonology' },
    { value: 'Rheumatology', label: 'Rheumatology' },
    { value: 'Endocrinology', label: 'Endocrinology' },
  ];

  const genderOptions = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Other', label: 'Other' },
  ];

  const maritalStatusOptions = [
    { value: 'Single', label: 'Single' },
    { value: 'Married', label: 'Married' },
    { value: 'Divorced', label: 'Divorced' },
    { value: 'Widowed', label: 'Widowed' },
  ];

  const relationshipOptions = [
    { value: 'Spouse', label: 'Spouse' },
    { value: 'Parent', label: 'Parent' },
    { value: 'Child', label: 'Child' },
    { value: 'Sibling', label: 'Sibling' },
    { value: 'Friend', label: 'Friend' },
    { value: 'Other', label: 'Other' },
  ];

  const healthStatusOptions = [
    { value: '', label: 'Unknown' },
    { value: 'Negative', label: 'Negative' },
    { value: 'Positive', label: 'Positive' },
    { value: 'Not Tested', label: 'Not Tested' },
  ];

  const sickleCellOptions = [
    { value: '', label: 'Unknown' },
    { value: 'AA', label: 'AA (Normal)' },
    { value: 'AS', label: 'AS (Carrier/Trait)' },
    { value: 'SS', label: 'SS (Sickle Cell Disease)' },
    { value: 'SC', label: 'SC (Sickle Cell Disease)' },
    { value: 'Not Tested', label: 'Not Tested' },
  ];

  return (
    <AppLayout title="Register New Patient">
      <div className="max-w-4xl mx-auto">
        <Card>
          <div className="p-6">
            {error && (
              <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg mb-6">
                <p>{error}</p>
                {duplicatePatient && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-2"
                    onClick={() => navigate(`/patients/${duplicatePatient.id}`)}
                    leftIcon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    }
                  >
                    View Existing Patient ({duplicatePatient.patientNumber})
                  </Button>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Personal Information */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Personal Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="First Name"
                    name="first_name"
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={handleChange}
                  />
                  <Input
                    label="Last Name"
                    name="last_name"
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={handleChange}
                  />
                  <Input
                    label="Date of Birth"
                    name="date_of_birth"
                    type="date"
                    required
                    value={formData.date_of_birth}
                    onChange={handleChange}
                  />
                  <Select
                    label="Gender"
                    name="gender"
                    required
                    value={formData.gender}
                    onChange={handleChange}
                    options={genderOptions}
                    placeholder="Select Gender"
                  />
                  <Input
                    label="Nationality"
                    name="nationality"
                    type="text"
                    value={formData.nationality}
                    onChange={handleChange}
                    placeholder="e.g., Ghanaian"
                  />
                  <Select
                    label="Marital Status"
                    name="marital_status"
                    value={formData.marital_status}
                    onChange={handleChange}
                    options={maritalStatusOptions}
                    placeholder="Select Status"
                  />
                  <Input
                    label="Occupation"
                    name="occupation"
                    type="text"
                    value={formData.occupation}
                    onChange={handleChange}
                  />
                  <Input
                    label="Allergies"
                    name="allergies"
                    type="text"
                    value={formData.allergies}
                    onChange={handleChange}
                    placeholder="e.g., Penicillin, Peanuts, Latex"
                  />
                  <Select
                    label="Preferred Clinic"
                    name="preferred_clinic"
                    value={formData.preferred_clinic}
                    onChange={handleChange}
                    options={clinics}
                    placeholder="Select Clinic"
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Contact Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                  />
                  <Input
                    label="Phone Number"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="e.g., 0244123456"
                  />
                  <Input
                    label="Residential Address"
                    name="address"
                    type="text"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="House number, Street name"
                  />
                  <Input
                    label="GPS Address Code"
                    name="gps_address"
                    type="text"
                    value={formData.gps_address}
                    onChange={handleChange}
                    placeholder="e.g., GA-123-4567"
                  />
                  <Input
                    label="City/Town"
                    name="city"
                    type="text"
                    value={formData.city}
                    onChange={handleChange}
                  />
                  <Select
                    label="Region"
                    name="region"
                    value={formData.region}
                    onChange={handleChange}
                    options={ghanaRegions}
                    placeholder="Select Region"
                  />
                </div>
              </div>

              {/* Emergency Contact */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-danger-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Emergency Contact
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Contact Name"
                    name="emergency_contact_name"
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={handleChange}
                  />
                  <Input
                    label="Contact Phone"
                    name="emergency_contact_phone"
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={handleChange}
                  />
                  <Select
                    label="Relationship"
                    name="emergency_contact_relationship"
                    value={formData.emergency_contact_relationship}
                    onChange={handleChange}
                    options={relationshipOptions}
                    placeholder="Select Relationship"
                  />
                </div>
              </div>

              {/* Health Status */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-secondary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Health Status
                </h2>
                <p className="text-sm text-gray-500 mb-4">This information is confidential and used for clinical care only.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Select
                    label="HIV Status"
                    name="hiv_status"
                    value={formData.hiv_status}
                    onChange={handleChange}
                    options={healthStatusOptions}
                  />
                  <Select
                    label="Hepatitis B Status"
                    name="hepatitis_b_status"
                    value={formData.hepatitis_b_status}
                    onChange={handleChange}
                    options={healthStatusOptions}
                  />
                  <Select
                    label="Hepatitis C Status"
                    name="hepatitis_c_status"
                    value={formData.hepatitis_c_status}
                    onChange={handleChange}
                    options={healthStatusOptions}
                  />
                  <Select
                    label="TB Status"
                    name="tb_status"
                    value={formData.tb_status}
                    onChange={handleChange}
                    options={healthStatusOptions}
                  />
                  <Select
                    label="Sickle Cell Status"
                    name="sickle_cell_status"
                    value={formData.sickle_cell_status}
                    onChange={handleChange}
                    options={sickleCellOptions}
                  />
                  <div className="md:col-span-3">
                    <Textarea
                      label="Other Health Conditions"
                      name="other_health_conditions"
                      value={formData.other_health_conditions}
                      onChange={handleChange}
                      rows={3}
                      placeholder="List any other relevant health conditions..."
                    />
                  </div>
                </div>
              </div>

              {/* Insurance Information */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Insurance Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Insurance Provider"
                    name="insurance_provider"
                    type="text"
                    value={formData.insurance_provider}
                    onChange={handleChange}
                    placeholder="e.g., NHIS, Private Insurance"
                  />
                  <Input
                    label="Insurance Number"
                    name="insurance_number"
                    type="text"
                    value={formData.insurance_number}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-4 justify-end pt-4 border-t">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/patients')}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={loading} isLoading={loading}>
                  {loading ? 'Registering...' : 'Register Patient'}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

export default PatientRegistration;
