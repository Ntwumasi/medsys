import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../api/client';

interface SearchResult {
  patients: any[];
  encounters: any[];
  total_results: number;
}

interface SearchBarProps {
  onPatientSelect?: (patient: any) => void;
  onEncounterSelect?: (encounter: any) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onPatientSelect,
  onEncounterSelect,
  placeholder = 'Search patients or encounters...',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async () => {
    if (searchTerm.trim().length < 2) return;

    setIsSearching(true);
    try {
      const response = await apiClient.get('/search/quick', {
        params: { q: searchTerm },
      });
      setResults(response.data);
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
      // Don't show error to user, just log it
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setResults(null);
      setShowResults(false);
      return;
    }

    const delaySearch = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchTerm, performSearch]);

  const handlePatientClick = (patient: any) => {
    if (onPatientSelect) {
      onPatientSelect(patient);
    }
    setSearchTerm('');
    setShowResults(false);
  };

  const handleEncounterClick = (encounter: any) => {
    if (onEncounterSelect) {
      onEncounterSelect(encounter);
    }
    setSearchTerm('');
    setShowResults(false);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-2 pl-10 pr-4 text-gray-900 placeholder-gray-400 border border-white border-opacity-30 bg-white bg-opacity-90 rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:bg-white"
        />
        <svg
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {isSearching && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
          </div>
        )}
      </div>

      {showResults && results && results.total_results > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
          {results.patients.length > 0 && (
            <div className="p-2">
              <div className="text-xs font-semibold text-gray-500 px-2 py-1">PATIENTS</div>
              {results.patients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handlePatientClick(patient)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{patient.full_name}</div>
                    <div className="text-sm text-gray-600">{patient.patient_number}</div>
                    {patient.phone && (
                      <div className="text-xs text-gray-500">{patient.phone}</div>
                    )}
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {results.encounters.length > 0 && (
            <div className="p-2 border-t border-gray-200">
              <div className="text-xs font-semibold text-gray-500 px-2 py-1">ENCOUNTERS</div>
              {results.encounters.map((encounter) => (
                <button
                  key={encounter.id}
                  onClick={() => handleEncounterClick(encounter)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{encounter.encounter_number}</div>
                    <div className="text-sm text-gray-600">{encounter.patient_name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(encounter.encounter_date).toLocaleDateString()}
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showResults && results && results.total_results === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-4 text-center text-gray-500">
          No results found for "{searchTerm}"
        </div>
      )}
    </div>
  );
};

export default SearchBar;
