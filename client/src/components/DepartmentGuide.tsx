/**
 * Reusable Department Guide component.
 * Each dashboard passes its own section/step content.
 */
import React, { useState } from 'react';

export interface GuideSection {
  title: string;
  icon: string;
  steps: { title: string; content: string }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sections: GuideSection[];
}

const DepartmentGuide: React.FC<Props> = ({ isOpen, onClose, title, sections }) => {
  const [activeSection, setActiveSection] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  if (!isOpen) return null;

  const section = sections[activeSection];
  const step = section.steps[activeStep];
  const totalSteps = sections.reduce((sum, s) => sum + s.steps.length, 0);
  let currentStepNumber = 0;
  for (let i = 0; i < activeSection; i++) currentStepNumber += sections[i].steps.length;
  currentStepNumber += activeStep + 1;

  const goNext = () => {
    if (activeStep < section.steps.length - 1) {
      setActiveStep(activeStep + 1);
    } else if (activeSection < sections.length - 1) {
      setActiveSection(activeSection + 1);
      setActiveStep(0);
    }
  };

  const goPrev = () => {
    if (activeStep > 0) {
      setActiveStep(activeStep - 1);
    } else if (activeSection > 0) {
      setActiveSection(activeSection - 1);
      setActiveStep(sections[activeSection - 1].steps.length - 1);
    }
  };

  const isFirst = activeSection === 0 && activeStep === 0;
  const isLast = activeSection === sections.length - 1 && activeStep === section.steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-primary-600 to-secondary-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{title}</h2>
                <p className="text-primary-100 text-sm">Step {currentStepNumber} of {totalSteps}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:text-primary-200">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 bg-white bg-opacity-20 rounded-full h-1.5">
            <div className="bg-white rounded-full h-1.5 transition-all duration-300" style={{ width: `${(currentStepNumber / totalSteps) * 100}%` }} />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 bg-gray-50 border-r border-gray-200 overflow-y-auto flex-shrink-0">
            {sections.map((s, i) => (
              <button
                key={i}
                onClick={() => { setActiveSection(i); setActiveStep(0); }}
                className={`w-full px-4 py-3 text-left text-sm flex items-center gap-2.5 transition-colors border-l-4 ${
                  activeSection === i
                    ? 'bg-primary-50 text-primary-700 border-primary-600 font-semibold'
                    : 'text-gray-600 hover:bg-gray-100 border-transparent'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
                </svg>
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
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

            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <p className="text-gray-700 leading-relaxed text-[15px]">{step.content}</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button onClick={goPrev} disabled={isFirst} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            Previous
          </button>
          <span className="text-xs text-gray-400">{currentStepNumber} / {totalSteps}</span>
          {isLast ? (
            <button onClick={onClose} className="px-6 py-2 text-sm font-bold text-white bg-success-600 rounded-lg hover:bg-success-700">Done!</button>
          ) : (
            <button onClick={goNext} className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700">Next</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DepartmentGuide;
