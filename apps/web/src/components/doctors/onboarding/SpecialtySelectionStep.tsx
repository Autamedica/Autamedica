'use client';

import { useState } from 'react';
import {
  MEDICAL_SPECIALTIES,
  SUBSPECIALTIES,
} from '@autamedica/types';

interface SpecialtySelectionStepProps {
  specialty: string;
  subspecialty?: string;
  yearsExperience: number;
  onUpdate: (specialty: string, subspecialty?: string, yearsExperience?: number) => void;
  onNext: () => void;
  onBack: () => void;
}

const SPECIALTY_NAMES = Object.values(MEDICAL_SPECIALTIES).sort((a, b) => a.localeCompare(b, 'es'));

const NAME_TO_CODE = Object.fromEntries(
  Object.entries(MEDICAL_SPECIALTIES).map(([code, name]) => [name, code])
);

function getSubspecialtiesForName(specialtyName: string): string[] {
  const code = NAME_TO_CODE[specialtyName];
  if (!code) return [];
  const prefix = code + '_';
  return Object.entries(SUBSPECIALTIES)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, name]) => name);
}

export function SpecialtySelectionStep({
  specialty,
  subspecialty,
  yearsExperience,
  onUpdate,
  onNext,
  onBack
}: SpecialtySelectionStepProps) {
  const [selectedSpecialty, setSelectedSpecialty] = useState(specialty);
  const [selectedSubspecialty, setSelectedSubspecialty] = useState(subspecialty || '');
  const [experience, setExperience] = useState(yearsExperience);
  const [showSubspecialties, setShowSubspecialties] = useState(false);

  const availableSubspecialties = selectedSpecialty ? getSubspecialtiesForName(selectedSpecialty) : [];

  const handleSpecialtyChange = (newSpecialty: string) => {
    setSelectedSpecialty(newSpecialty);
    setSelectedSubspecialty('');
    setShowSubspecialties(false);
    onUpdate(newSpecialty, '', experience);
  };

  const handleSubspecialtyChange = (newSubspecialty: string) => {
    setSelectedSubspecialty(newSubspecialty);
    onUpdate(selectedSpecialty, newSubspecialty, experience);
  };

  const handleExperienceChange = (newExperience: number) => {
    setExperience(newExperience);
    onUpdate(selectedSpecialty, selectedSubspecialty, newExperience);
  };

  const handleNext = () => {
    if (!selectedSpecialty) {
      alert('Por favor selecciona una especialidad médica');
      return;
    }
    onNext();
  };

  const inputClass = 'w-full px-3.5 py-2.5 border border-am-surface-300 rounded-xl bg-white text-am-surface-900 placeholder:text-am-surface-400 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-am-surface-900 mb-2">
          Especialidad Médica
        </h3>
        <p className="text-am-surface-500">
          Selecciona tu especialidad principal y años de experiencia profesional.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="specialty" className="block text-sm font-medium text-am-surface-700 mb-1.5">
            Especialidad Principal <span className="text-red-500">*</span>
          </label>
          <select
            id="specialty"
            value={selectedSpecialty}
            onChange={(e) => handleSpecialtyChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Selecciona una especialidad</option>
            {SPECIALTY_NAMES.map(spec => (
              <option key={spec} value={spec}>{spec}</option>
            ))}
          </select>
        </div>

        {selectedSpecialty && availableSubspecialties.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
              Subspecialidad (Opcional)
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowSubspecialties(!showSubspecialties)}
                className="w-full px-3.5 py-2.5 text-left border border-am-surface-300 rounded-xl hover:bg-am-surface-50 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className={selectedSubspecialty ? 'text-am-surface-900' : 'text-am-surface-400'}>
                    {selectedSubspecialty || 'Seleccionar subspecialidad...'}
                  </span>
                  <svg
                    className={`w-5 h-5 text-am-surface-400 transition-transform ${showSubspecialties ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {showSubspecialties && (
                <div className="border border-am-surface-200 rounded-xl p-2 bg-am-surface-50 max-h-40 overflow-y-auto shadow-am-md">
                  <div
                    className="px-3 py-2 hover:bg-white rounded-lg cursor-pointer text-am-surface-500 transition-colors"
                    onClick={() => {
                      handleSubspecialtyChange('');
                      setShowSubspecialties(false);
                    }}
                  >
                    Sin subspecialidad
                  </div>
                  {availableSubspecialties.map(subspec => (
                    <div
                      key={subspec}
                      className="px-3 py-2 hover:bg-white rounded-lg cursor-pointer text-am-surface-900 transition-colors"
                      onClick={() => {
                        handleSubspecialtyChange(subspec);
                        setShowSubspecialties(false);
                      }}
                    >
                      {subspec}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="experience" className="block text-sm font-medium text-am-surface-700 mb-1.5">
            Años de Experiencia Profesional <span className="text-red-500">*</span>
          </label>
          <select
            id="experience"
            value={experience}
            onChange={(e) => handleExperienceChange(parseInt(e.target.value))}
            className={inputClass}
          >
            <option value={0}>Recién graduado</option>
            <option value={1}>1 año</option>
            <option value={2}>2 años</option>
            <option value={3}>3 años</option>
            <option value={4}>4 años</option>
            <option value={5}>5 años</option>
            {Array.from({ length: 15 }, (_, i) => i + 6).map(year => (
              <option key={year} value={year}>{year} años</option>
            ))}
            <option value={21}>Más de 20 años</option>
          </select>
        </div>

        {selectedSpecialty && (
          <div className="bg-am-doctor-50 border border-am-doctor-200 rounded-xl p-4">
            <div className="flex">
              <svg className="w-5 h-5 text-am-doctor-400 mr-2 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-am-doctor-800 text-sm">
                  <strong>Especialidad seleccionada:</strong> {selectedSpecialty}
                </p>
                {selectedSubspecialty && (
                  <p className="text-am-doctor-700 text-sm mt-1">
                    <strong>Subspecialidad:</strong> {selectedSubspecialty}
                  </p>
                )}
                <p className="text-am-doctor-700 text-sm mt-1">
                  Esta información aparecerá en tu perfil público y ayudará a los pacientes a encontrarte.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-6 border-t border-am-surface-100">
        <button
          onClick={onBack}
          className="px-4 py-2.5 text-am-surface-500 hover:text-am-surface-900 hover:bg-am-surface-100 rounded-xl transition-all duration-am-fast"
        >
          Atrás
        </button>

        <button
          onClick={handleNext}
          disabled={!selectedSpecialty}
          className="px-6 py-2.5 bg-am-doctor-500 text-white rounded-xl hover:bg-am-doctor-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-am-fast font-medium shadow-am-sm active:scale-[0.97]"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
