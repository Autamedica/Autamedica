'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DoctorInsert, DoctorEducation, MedicalCertification, WeeklySchedule, UUID } from '@autamedica/types';
import { LicenseValidationStep } from './LicenseValidationStep';
import { SpecialtySelectionStep } from './SpecialtySelectionStep';
import { EducationCertificationStep } from './EducationCertificationStep';
import { ScheduleSetupStep } from './ScheduleSetupStep';
import { ProfileCompletionStep } from './ProfileCompletionStep';

interface DoctorOnboardingWizardProps {
  userId: string;
  onComplete?: (doctorProfile: DoctorInsert) => void;
  onCancel?: () => void;
}

export type OnboardingStep =
  | 'license'
  | 'specialty'
  | 'education'
  | 'schedule'
  | 'profile'
  | 'complete';

export interface OnboardingData {
  license_number: string;
  license_valid: boolean;
  specialty: string;
  subspecialty?: string;
  years_experience: number;
  education: DoctorEducation[];
  certifications: MedicalCertification[];
  schedule: WeeklySchedule;
  consultation_fee?: number;
  accepted_insurance: string[];
  bio: string;
  languages: string[];
  phone?: string;
}

const STEPS: OnboardingStep[] = ['license', 'specialty', 'education', 'schedule', 'profile'];

const STEP_LABELS: Record<string, string> = {
  license: 'Licencia',
  specialty: 'Especialidad',
  education: 'Educación',
  schedule: 'Horarios',
  profile: 'Perfil',
};

const STEP_ICONS = [
  <svg key="0" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
  <svg key="1" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>,
  <svg key="2" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" /></svg>,
  <svg key="3" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  <svg key="4" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
];

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 24 : -24, opacity: 0 }),
};

export function DoctorOnboardingWizard({ userId, onComplete, onCancel }: DoctorOnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('license');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const direction = useRef(1);

  const [formData, setFormData] = useState<Partial<OnboardingData>>({
    education: [],
    certifications: [],
    schedule: {},
    accepted_insurance: [],
    languages: ['Spanish'],
    years_experience: 0,
  });

  const updateFormData = useCallback((updates: Partial<OnboardingData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setError(null);
  }, []);

  const handleComplete = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      if (!formData.license_number || !formData.specialty) {
        throw new Error('Faltan datos obligatorios: licencia médica y especialidad');
      }

      const doctorProfile: DoctorInsert = {
        user_id: userId as UUID,
        license_number: formData.license_number,
        specialty: formData.specialty,
        subspecialty: formData.subspecialty || null,
        years_experience: formData.years_experience || 0,
        education: formData.education || [],
        certifications: formData.certifications || [],
        schedule: formData.schedule || {},
        consultation_fee: formData.consultation_fee || null,
        accepted_insurance: formData.accepted_insurance || [],
        bio: formData.bio || '',
        languages: formData.languages || ['Spanish'],
        active: true,
      };

      const response = await fetch('/api/profiles/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doctorProfile),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear perfil de doctor');
      }

      await response.json();

      await fetch('/api/doctors/onboarding-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});

      onComplete?.(doctorProfile);
      direction.current = 1;
      setCurrentStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToNextStep = useCallback(() => {
    direction.current = 1;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStepIndex(nextIndex);
      setCurrentStep(STEPS[nextIndex]);
    } else {
      handleComplete();
    }
  }, [currentStepIndex]);

  const goToPreviousStep = useCallback(() => {
    direction.current = -1;
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStepIndex(prevIndex);
      setCurrentStep(STEPS[prevIndex]);
    }
  }, [currentStepIndex]);

  const getStepTitle = (step: OnboardingStep): string => {
    switch (step) {
      case 'license': return 'Validación de Licencia Médica';
      case 'specialty': return 'Especialidad Médica';
      case 'education': return 'Educación y Certificaciones';
      case 'schedule': return 'Horarios y Consultas';
      case 'profile': return 'Perfil Profesional';
      case 'complete': return '¡Completado!';
      default: return 'Configuración';
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'license':
        return (
          <LicenseValidationStep
            licenseNumber={formData.license_number || ''}
            onUpdate={(license_number, license_valid) => updateFormData({ license_number, license_valid })}
            onNext={goToNextStep}
            onCancel={onCancel}
          />
        );
      case 'specialty':
        return (
          <SpecialtySelectionStep
            specialty={formData.specialty || ''}
            subspecialty={formData.subspecialty}
            yearsExperience={formData.years_experience || 0}
            onUpdate={(specialty, subspecialty, years_experience) => updateFormData({ specialty, subspecialty, years_experience })}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 'education':
        return (
          <EducationCertificationStep
            education={formData.education || []}
            certifications={formData.certifications || []}
            onUpdate={(education, certifications) => updateFormData({ education, certifications })}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 'schedule':
        return (
          <ScheduleSetupStep
            schedule={formData.schedule || {}}
            consultationFee={formData.consultation_fee}
            acceptedInsurance={formData.accepted_insurance || []}
            onUpdate={(schedule, consultation_fee, accepted_insurance) => updateFormData({ schedule, consultation_fee, accepted_insurance })}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        );
      case 'profile':
        return (
          <ProfileCompletionStep
            bio={formData.bio || ''}
            languages={formData.languages || ['Spanish']}
            onUpdate={(bio, languages) => updateFormData({ bio, languages })}
            onComplete={handleComplete}
            onBack={goToPreviousStep}
            isSubmitting={isSubmitting}
          />
        );
      case 'complete':
        return (
          <div className="text-center py-16 relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 rounded-full bg-am-doctor-100/30 blur-3xl" />
            </div>
            <div className="relative">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-am-doctor-400 to-am-primary-500 flex items-center justify-center shadow-am-doctor mb-6"
              >
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-am-surface-900 mb-3"
              >
                ¡Perfil de Doctor Completado!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-am-surface-500 mb-8 max-w-md mx-auto"
              >
                Tu perfil profesional ha sido creado exitosamente. Ahora puedes comenzar a atender pacientes.
              </motion.p>
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => window.location.reload()}
                className="bg-am-doctor-500 text-white px-8 py-3 rounded-xl hover:bg-am-doctor-600 transition-colors shadow-am-doctor font-medium"
              >
                Ir al Dashboard
              </motion.button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="portal-doctor min-h-screen bg-am-surface-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {currentStep !== 'complete' && (
          <div className="bg-white rounded-2xl shadow-am-md overflow-hidden mb-6">
            <div className="h-1.5 bg-gradient-to-r from-am-doctor-500 via-am-doctor-400 to-am-primary-500" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-am-surface-900 tracking-tight">
                    Configuración de Perfil Médico
                  </h1>
                  <p className="text-am-surface-500 text-sm mt-1">{getStepTitle(currentStep)}</p>
                </div>
                <span className="text-sm font-medium text-am-doctor-600 bg-am-doctor-50 px-3 py-1.5 rounded-full whitespace-nowrap">
                  {currentStepIndex + 1} / {STEPS.length}
                </span>
              </div>

              <div className="flex items-center">
                {STEPS.map((step, i) => (
                  <React.Fragment key={step}>
                    {i > 0 && (
                      <div className="flex-1 h-0.5 mx-1 sm:mx-2 rounded-full overflow-hidden bg-am-surface-100">
                        <motion.div
                          className="h-full bg-am-doctor-500 origin-left"
                          initial={false}
                          animate={{ scaleX: i <= currentStepIndex ? 1 : 0 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    )}
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                          i < currentStepIndex
                            ? 'bg-am-doctor-500 text-white'
                            : i === currentStepIndex
                              ? 'bg-am-doctor-500 text-white ring-4 ring-am-doctor-100'
                              : 'bg-am-surface-100 text-am-surface-400'
                        }`}
                      >
                        {i < currentStepIndex ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          STEP_ICONS[i]
                        )}
                      </div>
                      <span className={`mt-2 text-xs font-medium hidden sm:block ${
                        i <= currentStepIndex ? 'text-am-doctor-600' : 'text-am-surface-400'
                      }`}>
                        {STEP_LABELS[step]}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-am-md p-6 sm:p-8 overflow-hidden">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6"
            >
              <div className="flex">
                <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            </motion.div>
          )}

          <AnimatePresence mode="wait" custom={direction.current}>
            <motion.div
              key={currentStep}
              custom={direction.current}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              {renderCurrentStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
