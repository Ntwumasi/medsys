import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';

interface HPSection {
  id: string;
  title: string;
  content: string;
  completed: boolean;
  subsections?: HPSection[];
}

interface HPAccordionProps {
  encounterId: number;
  patientId: number;
  userRole: 'nurse' | 'doctor';
  onSave?: () => void;
}

const HPAccordion: React.FC<HPAccordionProps> = ({ encounterId, patientId, userRole, onSave }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [sections, setSections] = useState<HPSection[]>([
    {
      id: 'chief_complaint',
      title: 'Chief Complaint',
      content: '',
      completed: false,
    },
    {
      id: 'hpi',
      title: 'HPI / Subjective / Objective',
      content: '',
      completed: false,
    },
    {
      id: 'past_medical_history',
      title: 'Past Medical History',
      content: '',
      completed: false,
    },
    {
      id: 'past_surgical_history',
      title: 'Past Surgical History',
      content: '',
      completed: false,
    },
    {
      id: 'health_maintenance',
      title: 'Health Maintenance',
      content: '',
      completed: false,
    },
    {
      id: 'immunization_history',
      title: 'Immunization History',
      content: '',
      completed: false,
    },
    {
      id: 'home_medications',
      title: 'Home Medications',
      content: '',
      completed: false,
    },
    {
      id: 'allergies',
      title: 'Allergies',
      content: '',
      completed: false,
    },
    {
      id: 'social_history',
      title: 'Social History',
      content: '',
      completed: false,
    },
    {
      id: 'family_history',
      title: 'Family History',
      content: '',
      completed: false,
    },
    {
      id: 'primary_care_provider',
      title: 'Primary Care Provider',
      content: '',
      completed: false,
    },
    {
      id: 'review_of_systems',
      title: 'REVIEW OF SYSTEMS',
      content: '',
      completed: false,
      subsections: [
        { id: 'ros_constitutional', title: 'Constitutional', content: '', completed: false },
        { id: 'ros_allergic', title: 'Allergic / Immunologic', content: '', completed: false },
        { id: 'ros_head', title: 'Head', content: '', completed: false },
        { id: 'ros_eyes', title: 'Eyes', content: '', completed: false },
        { id: 'ros_ent', title: 'Ears, Nose, Mouth and Throat', content: '', completed: false },
        { id: 'ros_neck', title: 'Neck', content: '', completed: false },
        { id: 'ros_breasts', title: 'Breasts', content: '', completed: false },
        { id: 'ros_respiratory', title: 'Respiratory', content: '', completed: false },
        { id: 'ros_cardiac', title: 'Cardiac/Peripheral Vascular', content: '', completed: false },
        { id: 'ros_gi', title: 'Gastrointestinal', content: '', completed: false },
        { id: 'ros_gu', title: 'Genitourinary', content: '', completed: false },
        { id: 'ros_musculoskeletal', title: 'Musculoskeletal', content: '', completed: false },
        { id: 'ros_skin', title: 'Skin', content: '', completed: false },
        { id: 'ros_neuro', title: 'Neurological', content: '', completed: false },
        { id: 'ros_psych', title: 'Psychiatric', content: '', completed: false },
        { id: 'ros_endo', title: 'Endocrine', content: '', completed: false },
        { id: 'ros_heme', title: 'Hematologic/Lymphatic', content: '', completed: false },
      ],
    },
    {
      id: 'vital_signs',
      title: 'Vital Signs',
      content: '',
      completed: false,
    },
    {
      id: 'physical_exam',
      title: 'PHYSICAL EXAM',
      content: '',
      completed: false,
    },
    {
      id: 'lab_results',
      title: 'Lab Results',
      content: '',
      completed: false,
    },
    {
      id: 'imaging_results',
      title: 'Imaging Results',
      content: '',
      completed: false,
    },
    {
      id: 'assessment',
      title: 'Assessment/Problem List',
      content: '',
      completed: false,
    },
    {
      id: 'plan',
      title: 'Plan',
      content: '',
      completed: false,
    },
  ]);

  const [editingContent, setEditingContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadHPData();
  }, [encounterId]);

  const loadHPData = async () => {
    try {
      const response = await apiClient.get(`/hp/${encounterId}`);
      if (response.data.sections) {
        setSections(response.data.sections);
      }
    } catch (error) {
      console.error('Error loading H&P data:', error);
    }
  };

  const handleSectionClick = (sectionId: string) => {
    if (expandedSection === sectionId) {
      setExpandedSection(null);
      setEditingContent('');
    } else {
      setExpandedSection(sectionId);
      const section = findSection(sections, sectionId);
      setEditingContent(section?.content || '');
    }
  };

  const findSection = (sectionsArray: HPSection[], id: string): HPSection | undefined => {
    for (const section of sectionsArray) {
      if (section.id === id) return section;
      if (section.subsections) {
        const found = findSection(section.subsections, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const updateSection = (sectionsArray: HPSection[], id: string, content: string, completed: boolean): HPSection[] => {
    return sectionsArray.map(section => {
      if (section.id === id) {
        return { ...section, content, completed };
      }
      if (section.subsections) {
        return {
          ...section,
          subsections: updateSection(section.subsections, id, content, completed),
        };
      }
      return section;
    });
  };

  const handleSaveSection = async () => {
    if (!expandedSection) return;

    setSaving(true);
    try {
      const completed = editingContent.trim().length > 0;
      const updatedSections = updateSection(sections, expandedSection, editingContent, completed);
      setSections(updatedSections);

      await apiClient.post('/hp/save', {
        encounter_id: encounterId,
        patient_id: patientId,
        section_id: expandedSection,
        content: editingContent,
        completed,
        role: userRole,
      });

      if (onSave) onSave();

      alert('Section saved successfully!');
    } catch (error) {
      console.error('Error saving H&P section:', error);
      alert('Failed to save section');
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (section: HPSection, level: number = 0) => {
    const isExpanded = expandedSection === section.id;
    const hasSubsections = section.subsections && section.subsections.length > 0;
    const indentClass = level === 0 ? '' : 'ml-4';

    return (
      <div key={section.id} className={indentClass}>
        <div
          onClick={() => handleSectionClick(section.id)}
          className={`
            group relative flex items-center gap-3 py-4 px-4 cursor-pointer
            border-l-4 transition-all duration-200 ease-in-out
            ${
              section.completed
                ? 'border-emerald-500 bg-emerald-50 hover:bg-emerald-100 shadow-sm'
                : 'border-gray-200 bg-white hover:bg-gradient-to-r hover:from-gray-50 hover:to-slate-50 hover:border-gray-300'
            }
            ${isExpanded ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-500 shadow-md ring-2 ring-blue-100' : ''}
          `}
        >
          {/* Completion Indicator */}
          <div className="flex-shrink-0">
            {section.completed ? (
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-400 rounded-full blur-sm opacity-40"></div>
                <svg className="w-6 h-6 text-emerald-600 relative" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <svg className="w-6 h-6 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
              </svg>
            )}
          </div>

          {/* Section Title */}
          <div className="flex-1">
            <h3 className={`font-semibold transition-colors ${level === 0 ? 'text-base' : 'text-sm'} ${
              section.completed ? 'text-emerald-900' : 'text-gray-800 group-hover:text-gray-900'
            }`}>
              {section.title}
            </h3>
            {section.completed && (
              <div className="flex items-center gap-1 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Completed
                </span>
              </div>
            )}
          </div>

          {/* Expand/Collapse Icon */}
          <div className="flex-shrink-0">
            {isExpanded ? (
              <svg className="w-5 h-5 text-blue-600 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>

          {/* Completion shine effect */}
          {section.completed && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-20 transform -skew-x-12 transition-opacity duration-500"></div>
          )}
        </div>

        {/* Subsections */}
        {hasSubsections && (
          <div className="ml-6 border-l-2 border-gray-200 hover:border-gray-300 transition-colors">
            {section.subsections!.map(subsection => renderSection(subsection, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const currentSection = expandedSection ? findSection(sections, expandedSection) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Side - Accordion Sections */}
      <div className="lg:col-span-1 bg-white rounded-xl shadow-lg border border-gray-200 max-h-[800px] overflow-hidden flex flex-col">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 z-10 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                History & Physical
              </h2>
              <p className="text-blue-100 text-sm mt-1 flex items-center gap-2">
                <span className="font-semibold">{sections.filter(s => s.completed).length}</span>
                <span>of</span>
                <span className="font-semibold">{sections.length}</span>
                <span>sections completed</span>
              </p>
            </div>
            {/* Progress Circle */}
            <div className="relative w-14 h-14">
              <svg className="transform -rotate-90 w-14 h-14">
                <circle cx="28" cy="28" r="24" stroke="rgba(255,255,255,0.2)" strokeWidth="4" fill="none" />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke="white"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${(sections.filter(s => s.completed).length / sections.length) * 150.8} 150.8`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {Math.round((sections.filter(s => s.completed).length / sections.length) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sections.map(section => renderSection(section))}
        </div>
      </div>

      {/* Right Side - Content Editor */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        {expandedSection && currentSection ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{currentSection.title}</h3>
                  <div className="flex items-center gap-2">
                    {currentSection.completed ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800 shadow-sm">
                        <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Section completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 text-amber-800 shadow-sm">
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Section incomplete
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setExpandedSection(null);
                    setEditingContent('');
                  }}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg p-2 transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Notes / Content
                </label>
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="w-full h-80 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all shadow-sm hover:border-gray-300"
                  placeholder={`Enter ${currentSection.title.toLowerCase()} information here...\n\nProvide detailed notes for this section.`}
                />
              </div>

              {currentSection.completed && currentSection.content && (
                <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <h4 className="text-sm font-bold text-emerald-900">Previously Saved Content</h4>
                  </div>
                  <div className="text-sm text-emerald-900 whitespace-pre-wrap bg-white bg-opacity-60 p-4 rounded-lg border border-emerald-200">
                    {currentSection.content}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="border-t border-gray-200 bg-gray-50 p-6">
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setExpandedSection(null);
                    setEditingContent('');
                  }}
                  className="px-6 py-2.5 bg-white border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSection}
                  disabled={saving}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Section
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-gray-400 p-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-blue-200 rounded-full blur-2xl opacity-20"></div>
              <svg className="w-24 h-24 text-gray-300 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-gray-600 mb-2">Select a section to begin</p>
            <p className="text-sm text-gray-400 text-center max-w-md">
              Click on any section from the accordion menu on the left to add or edit content for the patient's H&P record
            </p>
            <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Completed sections will be highlighted in green
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HPAccordion;
