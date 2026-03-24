'use client';

import { useState } from 'react';

interface ProfileCompletionStepProps {
  bio: string;
  languages: string[];
  onUpdate: (bio: string, languages: string[]) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const AVAILABLE_LANGUAGES = [
  'Spanish',
  'English',
  'Portuguese',
  'Italian',
  'French',
  'German',
  'Chinese',
  'Arabic',
  'Russian',
  'Japanese',
  'Korean'
] as const;

export function ProfileCompletionStep({
  bio,
  languages,
  onUpdate,
  onComplete,
  onBack,
  isSubmitting
}: ProfileCompletionStepProps) {
  const [currentBio, setCurrentBio] = useState(bio);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(languages);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);

  const updateBio = (newBio: string) => {
    setCurrentBio(newBio);
    onUpdate(newBio, selectedLanguages);
  };

  const toggleLanguage = (language: string) => {
    const updated = selectedLanguages.includes(language)
      ? selectedLanguages.filter(lang => lang !== language)
      : [...selectedLanguages, language];
    setSelectedLanguages(updated);
    onUpdate(currentBio, updated);
  };

  const bioCharacterCount = currentBio.length;
  const maxBioLength = 500;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-am-surface-900 mb-2">
          Completa tu Perfil Profesional
        </h3>
        <p className="text-am-surface-500">
          Agrega una biografía profesional y los idiomas que hablas para completar tu perfil.
        </p>
      </div>

      {/* Biografía */}
      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-am-surface-700 mb-1.5">
          Biografía Profesional
        </label>
        <textarea
          id="bio"
          value={currentBio}
          onChange={(e) => updateBio(e.target.value)}
          placeholder="Cuéntanos sobre tu experiencia médica, áreas de interés, filosofía de atención al paciente..."
          rows={6}
          maxLength={maxBioLength}
          className="w-full px-3.5 py-2.5 border border-am-surface-300 rounded-xl bg-white text-am-surface-900 placeholder:text-am-surface-400 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors resize-none"
        />
        <div className="flex justify-between items-center mt-1.5">
          <p className="text-xs text-am-surface-400">
            Una buena biografía ayuda a los pacientes a conocerte y generar confianza
          </p>
          <span className={`text-xs font-medium ${bioCharacterCount > maxBioLength * 0.9 ? 'text-red-500' : 'text-am-surface-400'}`}>
            {bioCharacterCount}/{maxBioLength}
          </span>
        </div>
      </div>

      {/* Idiomas */}
      <div>
        <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
          Idiomas que Hablas
        </label>

        <div className="relative">
          <button
            onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
            className="w-full px-3.5 py-2.5 text-left border border-am-surface-300 rounded-xl hover:bg-am-surface-50 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="text-am-surface-600">
                {selectedLanguages.length > 0
                  ? `${selectedLanguages.length} idioma${selectedLanguages.length > 1 ? 's' : ''} seleccionado${selectedLanguages.length > 1 ? 's' : ''}`
                  : 'Seleccionar idiomas...'
                }
              </span>
              <svg
                className={`w-5 h-5 text-am-surface-400 transition-transform ${showLanguageDropdown ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {showLanguageDropdown && (
            <div className="absolute z-10 w-full mt-1 border border-am-surface-200 rounded-xl p-2 bg-white shadow-am-md max-h-48 overflow-y-auto">
              {AVAILABLE_LANGUAGES.map(language => (
                <label key={language} className="flex items-center px-3 py-2 hover:bg-am-surface-50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedLanguages.includes(language)}
                    onChange={() => toggleLanguage(language)}
                    className="mr-3 w-4 h-4 rounded border-am-surface-300 text-am-doctor-500 focus:ring-am-doctor-400"
                  />
                  <span className="text-am-surface-900">{language}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {selectedLanguages.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedLanguages.map(language => (
              <span
                key={language}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-am-doctor-50 text-am-doctor-700"
              >
                {language}
                <button
                  onClick={() => toggleLanguage(language)}
                  className="ml-2 text-am-doctor-500 hover:text-am-doctor-700 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <p className="text-xs text-am-surface-400 mt-2">
          Los pacientes pueden filtrar médicos por idioma disponible
        </p>
      </div>

      {/* Preview */}
      {(currentBio || selectedLanguages.length > 0) && (
        <div className="bg-am-surface-50 border border-am-surface-200 rounded-xl p-4">
          <h4 className="text-sm font-medium text-am-surface-900 mb-3">Vista Previa del Perfil</h4>

          {currentBio && (
            <div className="mb-3">
              <p className="text-sm text-am-surface-600 leading-relaxed">{currentBio}</p>
            </div>
          )}

          {selectedLanguages.length > 0 && (
            <div>
              <p className="text-xs text-am-surface-400 mb-1.5">Idiomas:</p>
              <div className="flex flex-wrap gap-1">
                {selectedLanguages.map(language => (
                  <span
                    key={language}
                    className="inline-flex items-center px-2 py-1 rounded-lg text-xs bg-am-surface-200 text-am-surface-600"
                  >
                    {language}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-emerald-500 mr-2 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="text-emerald-800 text-sm">
              <strong>¡Casi terminamos!</strong> Al completar este paso, tu perfil médico estará listo
              y podrás comenzar a recibir pacientes en AutaMedica.
            </p>
            <p className="text-emerald-700 text-sm mt-1">
              Podrás editar toda esta información desde tu dashboard en cualquier momento.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-6 border-t border-am-surface-100">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="px-4 py-2.5 text-am-surface-500 hover:text-am-surface-900 hover:bg-am-surface-100 rounded-xl transition-all duration-am-fast disabled:opacity-50"
        >
          Atrás
        </button>

        <button
          onClick={onComplete}
          disabled={isSubmitting}
          className="px-8 py-2.5 bg-am-doctor-500 text-white rounded-xl hover:bg-am-doctor-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-am-fast font-medium shadow-am-sm active:scale-[0.97] flex items-center"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Creando perfil...
            </>
          ) : (
            'Completar Perfil Médico'
          )}
        </button>
      </div>
    </div>
  );
}
