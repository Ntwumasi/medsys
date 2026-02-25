import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { patientsAPI } from '../api/patients';
import type { Patient } from '../types';
import { format } from 'date-fns';
import AppLayout from '../components/AppLayout';
import { Card, Button, Input, Table, EmptyState } from '../components/ui';
import { SkeletonTable } from '../components/ui/Skeleton';

const PatientList: React.FC = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadPatients();
  }, [search]);

  const loadPatients = async () => {
    try {
      const response = await patientsAPI.getPatients({ search, limit: 100 });
      setPatients(response.patients || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (dob: string) => {
    if (!dob) return 'N/A';
    const today = new Date();
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return 'N/A';
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const columns = [
    {
      key: 'patient_number',
      header: 'Patient #',
      render: (patient: Patient) => (
        <span className="font-medium text-gray-900">{patient.patient_number}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (patient: Patient) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {patient.first_name} {patient.last_name}
            </span>
            {patient.vip_status && (
              <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded whitespace-nowrap ${
                patient.vip_status === 'platinum'
                  ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800'
                  : patient.vip_status === 'gold'
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-900'
                    : 'bg-gradient-to-r from-gray-200 to-slate-300 text-gray-700'
              }`}>
                ★ {patient.vip_status.charAt(0).toUpperCase() + patient.vip_status.slice(1)}
              </span>
            )}
          </div>
          {patient.email && (
            <div className="text-sm text-gray-500">{patient.email}</div>
          )}
        </div>
      ),
    },
    {
      key: 'age_gender',
      header: 'Age/Gender',
      render: (patient: Patient) => (
        <span className="text-gray-500">{calculateAge(patient.date_of_birth)} yrs / {patient.gender}</span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (patient: Patient) => (
        <span className="text-gray-500">{patient.phone || 'N/A'}</span>
      ),
    },
    {
      key: 'registered',
      header: 'Registered',
      render: (patient: Patient) => (
        <span className="text-gray-500">{format(new Date(patient.created_at), 'MMM d, yyyy')}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (patient: Patient) => (
        <Link to={`/patients/${patient.id}`}>
          <Button variant="ghost" size="sm">View</Button>
        </Link>
      ),
    },
  ];

  return (
    <AppLayout title="Patients">
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex-1 max-w-md">
              <Input
                type="text"
                placeholder="Search patients by name or patient number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                }
              />
            </div>
            <Link to="/patients/new">
              <Button variant="primary" leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }>
                New Patient
              </Button>
            </Link>
          </div>

          {loading ? (
            <SkeletonTable rows={8} cols={6} />
          ) : patients.length === 0 ? (
            <EmptyState
              title="No patients found"
              description={search ? "Try adjusting your search criteria" : "No patients have been registered yet"}
              icon={
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
              action={!search ? { label: 'Register New Patient', onClick: () => navigate('/patients/new') } : undefined}
            />
          ) : (
            <div className="animate-fade-in">
              <Table
                columns={columns}
                data={patients}
                keyExtractor={(patient) => patient.id}
                onRowClick={(patient) => navigate(`/patients/${patient.id}`)}
              />
            </div>
          )}
        </div>
      </Card>
    </AppLayout>
  );
};

export default PatientList;
