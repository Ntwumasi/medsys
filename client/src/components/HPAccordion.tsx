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
          className={`flex items-center gap-3 py-3 px-4 cursor-pointer border-l-4 hover:bg-gray-50 transition-colors ${
            section.completed
              ? 'border-green-500 bg-green-50'
              : 'border-gray-300 bg-white'
          } ${isExpanded ? 'bg-blue-50 border-blue-500' : ''}`}
        >
          {/* Completion Indicator */}
          <div className="flex-shrink-0">
            {section.completed ? (
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
              </svg>
            )}
          </div>

          {/* Section Title */}
          <div className="flex-1">
            <h3 className={`font-semibold ${level === 0 ? 'text-base' : 'text-sm'} ${
              section.completed ? 'text-green-900' : 'text-gray-900'
            }`}>
              {section.title}
            </h3>
            {section.completed && (
              <p className="text-xs text-green-600 mt-0.5">Completed by {userRole}</p>
            )}
          </div>

          {/* Expand/Collapse Icon */}
          <div className="flex-shrink-0">
            {isExpanded ? (
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        </div>

        {/* Subsections */}
        {hasSubsections && (
          <div className="ml-6 border-l-2 border-gray-200">
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
      <div className="lg:col-span-1 bg-white rounded-lg shadow-sm border border-gray-200 max-h-[800px] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
          <h2 className="text-lg font-bold text-gray-900">History & Physical</h2>
          <p className="text-xs text-gray-600 mt-1">
            {sections.filter(s => s.completed).length} of {sections.length} sections completed
          </p>
        </div>
        <div className="divide-y divide-gray-200">
          {sections.map(section => renderSection(section))}
        </div>
      </div>

      {/* Right Side - Content Editor */}
      <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {expandedSection && currentSection ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{currentSection.title}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {currentSection.completed ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Section completed
                    </span>
                  ) : (
                    <span className="text-orange-600">Section incomplete - Add notes below</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => {
                  setExpandedSection(null);
                  setEditingContent('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes / Content
              </label>
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder={`Enter ${currentSection.title.toLowerCase()} information here...`}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveSection}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Section
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setExpandedSection(null);
                  setEditingContent('');
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>

            {currentSection.completed && currentSection.content && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-sm font-semibold text-green-900 mb-2">Previously Saved Content:</h4>
                <div className="text-sm text-green-800 whitespace-pre-wrap">
                  {currentSection.content}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-96 text-gray-500">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium">Select a section to begin</p>
            <p className="text-sm mt-1">Click on any section from the left to add or edit content</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HPAccordion;
