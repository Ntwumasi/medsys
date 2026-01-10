import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../api/client';
import { useNotification } from '../context/NotificationContext';
import { SmartTextArea } from './SmartTextArea';
import SmartDictationModal from './SmartDictationModal';

interface HPSection {
  id: string;
  title: string;
  content: string;
  completed: boolean;
  subsections?: HPSection[];
}

interface VitalSignsData {
  temperature?: number;
  temperature_unit?: string;
  heart_rate?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  weight_unit?: string;
  height?: number;
  height_unit?: string;
  pain_level?: number;
}

interface HPAccordionProps {
  encounterId: number;
  patientId: number;
  userRole: 'nurse' | 'doctor';
  onSave?: () => void;
  vitalSigns?: VitalSignsData;
}

const HPAccordion: React.FC<HPAccordionProps> = ({ encounterId, patientId, userRole, onSave: _onSave, vitalSigns }) => {
  const { showToast } = useNotification();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [sections, setSections] = useState<HPSection[]>([
    {
      id: 'chief_complaint',
      title: 'Today\'s Visit',
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
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const [showSmartDictation, setShowSmartDictation] = useState(false);

  // Auto-save debounce function
  const debouncedSave = useCallback(async (sectionId: string, content: string) => {
    if (content === lastSavedContentRef.current) return;

    setAutoSaveStatus('saving');
    try {
      const completed = content.trim().length > 0;
      await apiClient.post('/hp/save', {
        encounter_id: encounterId,
        patient_id: patientId,
        section_id: sectionId,
        content,
        completed,
        role: userRole,
      });

      lastSavedContentRef.current = content;
      setSections(prev => updateSection(prev, sectionId, content, completed));
      setAutoSaveStatus('saved');

      // Reset status after 2 seconds
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Auto-save error:', error);
      setAutoSaveStatus('error');
    }
  }, [encounterId, patientId, userRole]);

  // Handle content change with auto-save
  const handleContentChange = useCallback((newContent: string) => {
    setEditingContent(newContent);

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer for auto-save (1.5 second debounce)
    if (expandedSection) {
      autoSaveTimerRef.current = setTimeout(() => {
        debouncedSave(expandedSection, newContent);
      }, 1500);
    }
  }, [expandedSection, debouncedSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

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
    // Save any pending changes before switching sections
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      if (expandedSection && editingContent !== lastSavedContentRef.current) {
        debouncedSave(expandedSection, editingContent);
      }
    }

    if (expandedSection === sectionId) {
      setExpandedSection(null);
      setEditingContent('');
      lastSavedContentRef.current = '';
    } else {
      setExpandedSection(sectionId);
      const section = findSection(sections, sectionId);
      const content = section?.content || '';
      setEditingContent(content);
      lastSavedContentRef.current = content;
    }
    setAutoSaveStatus('idle');
  };

  // Print H&P document
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Please allow pop-ups to print', 'error');
      return;
    }

    const completedSections = sections.filter(s => s.completed || s.content);
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>History & Physical - Patient Record</title>
        <style>
          @media print {
            body { margin: 0; padding: 20px; }
            .no-print { display: none; }
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
          }
          h1 {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .section {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .section-title {
            font-weight: bold;
            font-size: 14px;
            text-transform: uppercase;
            margin-bottom: 5px;
            color: #1a1a1a;
            border-bottom: 1px solid #ccc;
            padding-bottom: 3px;
          }
          .section-content {
            font-size: 12px;
            white-space: pre-wrap;
            margin-left: 10px;
          }
          .subsection {
            margin-left: 20px;
            margin-top: 10px;
          }
          .subsection-title {
            font-weight: bold;
            font-size: 12px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #ccc;
            font-size: 10px;
            color: #666;
          }
          .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
          }
          .print-button:hover {
            background: #1d4ed8;
          }
        </style>
      </head>
      <body>
        <button class="print-button no-print" onclick="window.print()">Print / Save as PDF</button>
        <h1>History & Physical</h1>
        <div class="meta">
          <p><strong>Encounter ID:</strong> ${encounterId}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        ${completedSections.map(section => `
          <div class="section">
            <div class="section-title">${section.title}</div>
            <div class="section-content">${section.content || 'N/A'}</div>
            ${section.subsections ? section.subsections.filter(sub => sub.completed || sub.content).map(sub => `
              <div class="subsection">
                <div class="subsection-title">${sub.title}:</div>
                <div class="section-content">${sub.content || 'N/A'}</div>
              </div>
            `).join('') : ''}
          </div>
        `).join('')}
        <div class="footer">
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p>This document is part of the patient's medical record.</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Get existing sections for Smart Dictation merge mode
  const getExistingSections = useCallback(() => {
    const result: { id: string; content: string }[] = [];

    const extractSections = (sectionList: HPSection[]) => {
      for (const section of sectionList) {
        result.push({ id: section.id, content: section.content });
        if (section.subsections) {
          extractSections(section.subsections);
        }
      }
    };

    extractSections(sections);
    return result;
  }, [sections]);

  // Handle applying sections from Smart Dictation
  const handleApplySmartDictation = useCallback(async (
    parsedSections: { id: string; content: string }[]
  ) => {
    // Update local state for all parsed sections
    setSections(prev => {
      let updated = [...prev];
      for (const parsed of parsedSections) {
        updated = updateSection(updated, parsed.id, parsed.content, parsed.content.trim().length > 0);
      }
      return updated;
    });

    // Save each section to backend
    let savedCount = 0;
    for (const parsed of parsedSections) {
      try {
        await apiClient.post('/hp/save', {
          encounter_id: encounterId,
          patient_id: patientId,
          section_id: parsed.id,
          content: parsed.content,
          completed: parsed.content.trim().length > 0,
          role: userRole,
        });
        savedCount++;
      } catch (error) {
        console.error(`Error saving section ${parsed.id}:`, error);
      }
    }

    showToast(`${savedCount} section${savedCount !== 1 ? 's' : ''} updated from Smart Dictation`, 'success');
  }, [encounterId, patientId, userRole, showToast]);

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
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 z-10 shadow-md">
          {/* Title Row */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">History & Physical</h2>
            <span className="text-blue-100 text-sm">
              {sections.filter(s => s.completed).length} of {sections.length} completed
            </span>
          </div>
          {/* Actions Row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSmartDictation(true)}
              className="flex-1 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              title="Smart Dictation (AI-powered)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Smart Dictate
            </button>
            <button
              onClick={handlePrint}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              title="Print / Save as PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </button>
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
              {/* Special display for Vital Signs section */}
              {expandedSection === 'vital_signs' && vitalSigns && Object.keys(vitalSigns).length > 0 && (
                <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
                  <h4 className="text-md font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Recorded Vital Signs
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {vitalSigns.temperature && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">Temperature</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.temperature}°{vitalSigns.temperature_unit || 'F'}
                        </div>
                      </div>
                    )}
                    {vitalSigns.heart_rate && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">Heart Rate</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.heart_rate} <span className="text-sm font-normal">bpm</span>
                        </div>
                      </div>
                    )}
                    {(vitalSigns.blood_pressure_systolic || vitalSigns.blood_pressure_diastolic) && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">Blood Pressure</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.blood_pressure_systolic || '--'}/{vitalSigns.blood_pressure_diastolic || '--'}
                        </div>
                      </div>
                    )}
                    {vitalSigns.respiratory_rate && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">Resp. Rate</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.respiratory_rate} <span className="text-sm font-normal">/min</span>
                        </div>
                      </div>
                    )}
                    {vitalSigns.oxygen_saturation && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">SpO2</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.oxygen_saturation}%
                        </div>
                      </div>
                    )}
                    {vitalSigns.weight && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">Weight</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.weight} <span className="text-sm font-normal">{vitalSigns.weight_unit || 'lbs'}</span>
                        </div>
                      </div>
                    )}
                    {vitalSigns.height && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">Height</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.height} <span className="text-sm font-normal">{vitalSigns.height_unit || 'in'}</span>
                        </div>
                      </div>
                    )}
                    {vitalSigns.pain_level !== undefined && vitalSigns.pain_level !== null && (
                      <div className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="text-xs text-gray-500 uppercase font-medium">Pain Level</div>
                        <div className="text-lg font-bold text-gray-900">
                          {vitalSigns.pain_level}/10
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {expandedSection === 'vital_signs' && (!vitalSigns || Object.keys(vitalSigns).length === 0) && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 flex items-center gap-3">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-medium">No vital signs recorded yet. Please record vital signs in the Vital Signs tab.</span>
                </div>
              )}

              <div className="mb-4">
                <SmartTextArea
                  value={editingContent}
                  onChange={handleContentChange}
                  placeholder={expandedSection === 'vital_signs'
                    ? 'Add any additional notes about vital signs here (optional)...'
                    : `Enter ${currentSection.title.toLowerCase()} information here...\n\nStart typing to see medical term suggestions.\n\nVoice commands: "period", "comma", "new line", "new paragraph", "question mark", "stop dictation"`}
                  rows={expandedSection === 'vital_signs' ? 6 : 12}
                  sectionId={expandedSection || undefined}
                  showVoiceDictation={true}
                  label={expandedSection === 'vital_signs' ? 'Additional Notes' : 'Notes / Content'}
                  className={expandedSection === 'vital_signs' ? 'h-40' : 'h-80'}
                />
              </div>
            </div>

            {/* Auto-save Status Footer */}
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center justify-between">
                {/* Auto-save Status */}
                <div className="flex items-center gap-2">
                  {autoSaveStatus === 'saving' && (
                    <span className="flex items-center gap-2 text-sm text-blue-600">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  )}
                  {autoSaveStatus === 'saved' && (
                    <span className="flex items-center gap-2 text-sm text-emerald-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Saved
                    </span>
                  )}
                  {autoSaveStatus === 'error' && (
                    <span className="flex items-center gap-2 text-sm text-red-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Save failed - will retry
                    </span>
                  )}
                  {autoSaveStatus === 'idle' && (
                    <span className="text-sm text-gray-400 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Auto-saves as you type
                    </span>
                  )}
                </div>

                {/* Close Button */}
                <button
                  onClick={() => {
                    // Save any pending changes
                    if (autoSaveTimerRef.current) {
                      clearTimeout(autoSaveTimerRef.current);
                    }
                    if (editingContent !== lastSavedContentRef.current && expandedSection) {
                      debouncedSave(expandedSection, editingContent);
                    }
                    setExpandedSection(null);
                    setEditingContent('');
                    lastSavedContentRef.current = '';
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all text-sm"
                >
                  Close Section
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

      {/* Smart Dictation Modal */}
      <SmartDictationModal
        isOpen={showSmartDictation}
        onClose={() => setShowSmartDictation(false)}
        onApply={handleApplySmartDictation}
        existingSections={getExistingSections()}
      />
    </div>
  );
};

export default HPAccordion;
