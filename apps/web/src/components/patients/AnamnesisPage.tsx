'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Download,
  Loader2,
  Lock,
  Mic,
  MessageCircle,
  PlayCircle,
  Plus,
} from 'lucide-react';
import { getClientEnvOrDefault } from '@autamedica/shared';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import { useAnamnesis } from '@/hooks/patients/useAnamnesis';
import { useAnamnesisGuidance } from '@/hooks/patients/useAnamnesisGuidance';
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import type { GuidanceQuestion } from '@/lib/patients/services/anamnesis-guidance.service';
import { AnamnesisField as AnamnesisFieldRenderer } from '@/components/patients/anamnesis/AnamnesisField';
import { PausaCognitiva } from '@/components/patients/anamnesis/PausaCognitiva';
import { ClarificationStep } from '@/components/patients/anamnesis/ClarificationStep';
import { VersionTimeline } from '@/components/patients/anamnesis/VersionTimeline';
import { PrivacyAcceptanceScreen } from '@/components/patients/anamnesis/PrivacyAcceptanceScreen';
import { AnalysisResultOverlay } from '@/components/patients/anamnesis/AnalysisResultOverlay';
import { AnamnesisFlowTour } from '@/components/patients/tours/AnamnesisFlowTour';
import { ConversationalAnamnesis } from '@/components/patients/anamnesis/ConversationalAnamnesis';
import { VoiceAnamnesis } from '@/components/patients/anamnesis/VoiceAnamnesis';
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';
import type { AnamnesisSection } from '@autamedica/types';

type AnamnesisMode = 'wizard' | 'conversational';

const PAUSE_EVERY_N_STEPS = 4;
const PARTIAL_CHECKPOINT_AFTER_STEP = 6; // Checkpoint 1: after step index 5 (step 6 of 13)

type FormDataMap = Record<string, Record<string, AnamnesisFieldValue>>;

type PageView = 'loading' | 'privacy' | 'wizard' | 'completed' | 'locked';

export default function AnamnesisPage() {
  const { user, loading: sessionLoading } = usePatientSession();
  const {
    anamnesis,
    sections,
    progress,
    patientBirthDate,
    loading: anamnesisLoading,
    error: anamnesisError,
    authRequired: anamnesisAuthRequired,
    updateAnamnesis,
    updateSection,
  } = useAnamnesis();

  const {
    guidance,
    isExtracting,
    triggerExtraction,
    addClarification,
    dismissGuidance,
    authRequired: extractionAuthRequired,
  } = useAnamnesisGuidance();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<FormDataMap>({});
  const [showPause, setShowPause] = useState(false);
  const [showClarification, setShowClarification] = useState(false);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<'partial' | 'final' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [criticalSkipBlocked, setCriticalSkipBlocked] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showUpdatePicker, setShowUpdatePicker] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [anamnesisMode, setAnamnesisMode] = useState<AnamnesisMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('autamedica:anamnesis-mode') as AnamnesisMode) || 'conversational';
    }
    return 'conversational';
  });
  const [showAnalyzing, setShowAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ coverage: string[]; gaps: string[]; questions: GuidanceQuestion[] } | null>(null);
  const initializedRef = useRef(false);
  const authRedirectStartedRef = useRef(false);

  const redirectToPatientLogin = useCallback(() => {
    if (typeof window === 'undefined' || authRedirectStartedRef.current) {
      return;
    }

    authRedirectStartedRef.current = true;

    const authOrigin = getClientEnvOrDefault(
      'PUBLIC_APP_URL',
      import.meta.env.MODE === 'production'
        ? 'https://www.autamedica.com'
        : 'http://localhost:3000',
    );
    const loginUrl = new URL('/auth/login', authOrigin);
    loginUrl.searchParams.set('portal', 'patients');
    loginUrl.searchParams.set('returnTo', `${window.location.origin}/patients/anamnesis`);
    window.location.replace(loginUrl.toString());
  }, []);

  useEffect(() => {
    if (anamnesisAuthRequired || extractionAuthRequired) {
      redirectToPatientLogin();
    }
  }, [anamnesisAuthRequired, extractionAuthRequired, redirectToPatientLogin]);

  const switchMode = useCallback((mode: AnamnesisMode) => {
    setAnamnesisMode(mode);
    localStorage.setItem('autamedica:anamnesis-mode', mode);
  }, []);

  // Determine page view
  const pageView: PageView = useMemo(() => {
    if (sessionLoading || anamnesisLoading) return 'loading';
    if (anamnesis?.locked) return 'locked';
    if (editMode) return 'wizard';
    if (anamnesis?.status === 'completed' || anamnesis?.status === 'approved') return 'completed';
    if (!anamnesis?.privacy_accepted || !anamnesis?.terms_accepted) return 'privacy';
    return 'wizard';
  }, [sessionLoading, anamnesisLoading, anamnesis, editMode]);

  // Initialize form data from saved sections and resume position
  useEffect(() => {
    if (initializedRef.current) return;
    // Wait for data to load (sections may be empty for new anamnesis, but patientBirthDate should be resolved)
    if (anamnesisLoading) return;
    initializedRef.current = true;

    const saved: FormDataMap = {};
    for (const section of sections) {
      saved[section.section] = section.data as Record<string, AnamnesisFieldValue>;
    }

    // Pre-populate birth date from patient record if not already saved
    if (patientBirthDate && !saved.edad?.fecha_nacimiento) {
      saved.edad = { ...saved.edad, fecha_nacimiento: patientBirthDate };
    }

    setFormData(saved);

    // Determine starting step
    let startIndex = 0;

    // Skip step 1 (edad) if birth date already exists in DB — it never changes
    if (patientBirthDate && anamnesisSteps[0]?.id === 'edad') {
      startIndex = 1;
    }

    // Resume from first incomplete step (if further than startIndex)
    if (progress?.completed_sections) {
      const firstIncomplete = anamnesisSteps.findIndex(
        (s) => !progress.completed_sections.includes(s.id),
      );
      if (firstIncomplete > startIndex) {
        startIndex = firstIncomplete;
      }
    }

    if (startIndex > 0) {
      setCurrentStepIndex(startIndex);
    }
  }, [sections, progress, patientBirthDate, anamnesisLoading]);

  const currentStep = anamnesisSteps[currentStepIndex];
  const isLastStep = currentStepIndex === anamnesisSteps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  const completionPct = progress?.completion_percentage ?? 0;

  // Revisit detection: which steps were previously completed
  const isRevisit = useMemo(() => {
    if (!progress?.completed_sections) return false;
    return progress.completed_sections.length > 0;
  }, [progress]);

  const isStepCarriedForward = useMemo(() => {
    if (!isRevisit || !currentStep) return false;
    const wasCompleted = progress?.completed_sections?.includes(currentStep.id);
    return wasCompleted && (
      currentStep.mutability === 'carry_forward'
      || currentStep.mutability === 'carry_forward_additive'
      || currentStep.mutability === 'confirm_on_revisit'
    );
  }, [isRevisit, currentStep, progress]);

  // For carry_forward steps on revisit: show as readonly unless user clicks edit
  const [editingCarriedStep, setEditingCarriedStep] = useState(false);

  // Visible fields (respecting dependsOn)
  const visibleFields = useMemo(() => {
    if (!currentStep) return [];
    const stepData = formData[currentStep.id] ?? {};
    return currentStep.fields.filter((field) => {
      if (!field.dependsOn) return true;
      return stepData[field.dependsOn.fieldId] === field.dependsOn.value;
    });
  }, [currentStep, formData]);

  const handleFieldChange = useCallback(
    (fieldId: string, value: AnamnesisFieldValue) => {
      if (!currentStep) return;
      setFormData((prev) => ({
        ...prev,
        [currentStep.id]: {
          ...(prev[currentStep.id] ?? {}),
          [fieldId]: value,
        },
      }));
      setSaveError(null);
    },
    [currentStep],
  );

  const saveCurrentStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const stepData = formData[currentStep.id] ?? {};
      const ok = await updateSection(currentStep.id as AnamnesisSection, stepData);
      if (!ok) {
        setSaveError('No se pudo guardar esta sección');
        return false;
      }
      return true;
    } catch {
      setSaveError('Error al guardar');
      return false;
    } finally {
      setSaving(false);
    }
  }, [currentStep, formData, updateSection]);

  const handleNext = useCallback(async () => {
    const saved = await saveCurrentStep();
    if (!saved) return;

    // Checkpoint 2 (final): before marking completed — show ALL questions
    if (isLastStep) {
      setPendingCheckpoint('final');
      setShowAnalyzing(true);
      setAnalysisResult(null);

      const result = await triggerExtraction('final');

      setAnalysisResult({
        coverage: result?.coverage ?? [],
        gaps: result?.gaps ?? [],
        questions: result?.questions ?? [],
      });

      // If there are ANY questions, show them (not just critical)
      if (result?.questions && result.questions.length > 0) {
        return; // User clicks "Responder preguntas" → handleAnalysisContinue → showClarification
      }

      // No questions — complete directly
      setShowAnalyzing(false);
      setAnalysisResult(null);
      setPendingCheckpoint(null);
      dismissGuidance();
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
      return;
    }

    const nextIndex = currentStepIndex + 1;

    // Checkpoint 1 (partial): after step 6 — BLOCKING with visible analysis
    if (currentStepIndex + 1 === PARTIAL_CHECKPOINT_AFTER_STEP) {
      setPendingCheckpoint('partial');
      setShowAnalyzing(true);
      setAnalysisResult(null);

      const result = await triggerExtraction('partial');

      setAnalysisResult({
        coverage: result?.coverage ?? [],
        gaps: result?.gaps ?? [],
        questions: result?.questions ?? [],
      });
      return; // User must click "Continuar" to proceed
    }

    if ((nextIndex) % PAUSE_EVERY_N_STEPS === 0 && nextIndex < anamnesisSteps.length) {
      setShowPause(true);
      return;
    }

    // Skip carry_forward steps on revisit (auto-advance)
    let target = nextIndex;
    if (isRevisit && progress?.completed_sections) {
      while (
        target < anamnesisSteps.length - 1
        && anamnesisSteps[target].mutability === 'carry_forward'
        && progress.completed_sections.includes(anamnesisSteps[target].id)
      ) {
        target++;
      }
    }
    setEditingCarriedStep(false);
    setCurrentStepIndex(target);
  }, [saveCurrentStep, isLastStep, currentStepIndex, updateAnamnesis, triggerExtraction, isRevisit, progress]);

  const handleAnalysisContinue = useCallback(() => {
    setShowAnalyzing(false);
    setAnalysisResult(null);

    // Use guidance (hook state) as source of truth — ClarificationStep reads from it
    const hasQuestions = guidance?.questions && guidance.questions.length > 0;

    if (hasQuestions) {
      setShowClarification(true);
      return;
    }

    setPendingCheckpoint(null);
    dismissGuidance();
    // Advance to next step
    setCurrentStepIndex((prev) => prev + 1);
  }, [guidance, dismissGuidance]);

  const handlePrev = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
      setSaveError(null);
    }
  }, [isFirstStep]);

  const handlePauseContinue = useCallback(() => {
    setShowPause(false);
    setCurrentStepIndex((prev) => prev + 1);
  }, []);

  const handleClarificationSubmit = useCallback(async (
    answers: { question: string; answer: string }[],
  ) => {
    // Store clarification turns
    for (const a of answers) {
      addClarification(a.question, a.answer);
    }

    setShowClarification(false);

    // If this was the final checkpoint, complete the anamnesis
    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
    } else {
      // Partial checkpoint — advance to next step
      setCurrentStepIndex((prev) => prev + 1);
    }

    setPendingCheckpoint(null);
    dismissGuidance();
  }, [addClarification, pendingCheckpoint, updateAnamnesis, dismissGuidance]);

  const handleClarificationSkip = useCallback(async () => {
    // Block skip if there are unanswered critical questions
    const hasCritical = guidance?.questions?.some(
      (q: GuidanceQuestion) => q.priority === 'critical',
    );
    if (hasCritical) {
      setCriticalSkipBlocked(true);
      return;
    }

    setShowClarification(false);
    setCriticalSkipBlocked(false);

    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
    } else {
      // Partial checkpoint — advance to next step
      setCurrentStepIndex((prev) => prev + 1);
    }

    setPendingCheckpoint(null);
    dismissGuidance();
  }, [pendingCheckpoint, updateAnamnesis, dismissGuidance, guidance]);

  const handleAcceptPrivacy = useCallback(async () => {
    setSaving(true);
    await updateAnamnesis({
      privacy_accepted: true,
      terms_accepted: true,
    } as Record<string, unknown>);
    setSaving(false);
  }, [updateAnamnesis]);

  // --- RENDERS ---

  if (pageView === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-700" />
          <p className="mt-3 text-sm text-stone-500">Cargando tu anamnesis...</p>
        </div>
      </div>
    );
  }

  if (pageView === 'locked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
        <div className="max-w-md text-center">
          <Lock className="mx-auto h-12 w-12 text-stone-500" />
          <h1 className="mt-4 text-xl font-bold text-stone-900">Anamnesis en revisión</h1>
          <p className="mt-2 text-sm text-stone-600">
            Tu anamnesis está siendo revisada por tu equipo médico. No se pueden hacer cambios en este momento.
          </p>
          <a
            href="/patients/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border-2 border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al panel
          </a>
        </div>
      </div>
    );
  }

  if (pageView === 'completed') {
    const completedSections = progress?.completed_sections ?? [];
    const totalSteps = anamnesisSteps.length;
    const completedCount = completedSections.length;

    const handleDownloadPdf = async (versionNumber?: number) => {
      setSaving(true);
      try {
        const url = versionNumber
          ? `/api/patients/anamnesis/pdf?version=${versionNumber}`
          : '/api/patients/anamnesis/pdf';
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error('PDF download failed');
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')
          ?.match(/filename="(.+)"/)?.[1] ?? 'historia-clinica.pdf';
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {
        setSaveError('No se pudo descargar el PDF');
      } finally {
        setSaving(false);
      }
    };

    const completedDate = anamnesis?.completed_at
      ? new Date(anamnesis.completed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    const SECTION_SHORT_LABELS: Record<string, string> = {
      edad: 'Edad',
      ocupacion: 'Trabajo',
      motivo_consulta: 'Motivo',
      enfermedades_previas: 'Enfermedades',
      medicamentos: 'Medicamentos',
      alergias: 'Alergias',
      antecedentes_familiares: 'Familia',
      habitos: 'Hábitos',
      cardiovascular: 'Corazón',
      respiratorio: 'Pulmones',
      digestivo: 'Digestivo',
      genitourinario: 'Urinario',
      resumen_final: 'Resumen',
    };

    // Voice chat overlay
    if (showVoiceChat) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-stone-50 to-sky-50 p-4">
          <div className="mx-auto max-w-lg pt-8">
            <h2 className="mb-6 text-center text-xl font-bold text-stone-900">
              Conversación con IA
            </h2>
            <VoiceAnamnesis
              onDataExtracted={(_data) => {
                // Save voice conversation data then go back
                setShowVoiceChat(false);
                window.location.reload();
              }}
              onSwitchToText={() => setShowVoiceChat(false)}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-white">
        {/* Hero — video background, white text, immersive */}
        <div className="relative overflow-hidden bg-black">
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/videos/hero_background.mp4" type="video/mp4" />
          </video>
          <div className="relative px-6 pb-10 pt-12">
            <div className="mx-auto max-w-lg">
              <p className="text-sm font-medium text-white/60">
                {completedDate ?? 'Completada'}
              </p>
              <h1 className="mt-1 font-heading text-3xl font-bold text-white">
                Tu historia <span className="text-cyan-700">clínica</span>
              </h1>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-6">
          {/* Primary CTA — cyan accent on white */}
          <button
            onClick={() => handleDownloadPdf()}
            disabled={saving}
            className="flex w-full items-center gap-4 rounded-2xl bg-cyan-500 p-5 text-left text-white shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-600 active:scale-[0.97] disabled:opacity-50"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
              {saving ? <Loader2 className="h-7 w-7 animate-spin" /> : <Download className="h-7 w-7" />}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">Descargar PDF</p>
              <p className="text-sm text-white/70">Historia clínica completa</p>
            </div>
          </button>

          {/* Actions — clean black/white with cyan accent */}
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => setShowUpdatePicker(true)}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Actualizar</span>
            </button>
            <button
              onClick={() => setShowVoiceChat(true)}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 p-4 transition-all hover:border-sky-400 hover:bg-sky-100 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500 text-white">
                <Mic className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Hablar</span>
            </button>
            <a
              href="/patients/dashboard"
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white">
                <ArrowLeft className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Mi panel</span>
            </a>
            <a
              href="/patients/appointments?type=telemedicine"
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500 text-white">
                <PlayCircle className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Consultar</span>
            </a>
          </div>

          {/* Secondary: collapsed by default */}
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between rounded-xl px-1 py-2 text-xs font-semibold text-stone-500 hover:text-stone-600">
              <span>Ver detalle de secciones</span>
              <span className="text-[10px] group-open:hidden">{completedCount}/{totalSteps}</span>
            </summary>
            <div className="flex flex-wrap gap-2 pt-2">
              {anamnesisSteps.map((step) => {
                const isComplete = completedSections.includes(step.id);
                const label = SECTION_SHORT_LABELS[step.id] ?? step.id;
                return (
                  <span
                    key={step.id}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                      isComplete
                        ? 'bg-black text-white'
                        : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {isComplete && <Check className="h-3 w-3" />}
                    {label}
                  </span>
                );
              })}
            </div>
          </details>

          {/* Version history: collapsed */}
          <VersionTimeline onDownload={handleDownloadPdf} />

          {saveError && (
            <div className="rounded-xl bg-red-50 p-3 text-center text-xs text-red-600">{saveError}</div>
          )}
        </div>

        {/* Update picker — "What do you want to update?" */}
        {showUpdatePicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="absolute inset-0" onClick={() => setShowUpdatePicker(false)} />
            <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
              <h2 className="text-lg font-bold text-stone-900 mb-1">Que queres actualizar?</h2>
              <p className="text-sm text-stone-500 mb-4">Elegi la seccion y te llevamos directo</p>
              <div className="space-y-2">
                {[
                  { id: 'motivo_consulta', label: 'Nuevo motivo de consulta', icon: '🎯', idx: anamnesisSteps.findIndex(s => s.id === 'motivo_consulta') },
                  { id: 'medicamentos', label: 'Medicamentos', icon: '💊', idx: anamnesisSteps.findIndex(s => s.id === 'medicamentos') },
                  { id: 'alergias', label: 'Alergias', icon: '⚠️', idx: anamnesisSteps.findIndex(s => s.id === 'alergias') },
                  { id: 'enfermedades_previas', label: 'Enfermedades', icon: '📋', idx: anamnesisSteps.findIndex(s => s.id === 'enfermedades_previas') },
                  { id: 'habitos', label: 'Habitos', icon: '🏃', idx: anamnesisSteps.findIndex(s => s.id === 'habitos') },
                  { id: 'cardiovascular', label: 'Sintomas cardiovasculares', icon: '❤️', idx: anamnesisSteps.findIndex(s => s.id === 'cardiovascular') },
                ].map(option => (
                  <button
                    key={option.id}
                    onClick={() => {
                      setShowUpdatePicker(false);
                      setEditMode(true);
                      setCurrentStepIndex(option.idx >= 0 ? option.idx : 0);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-stone-100 bg-white px-4 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50 active:scale-[0.98]"
                  >
                    <span className="text-xl">{option.icon}</span>
                    <span className="text-sm font-medium text-stone-900">{option.label}</span>
                  </button>
                ))}
                <button
                  onClick={() => {
                    setShowUpdatePicker(false);
                    setEditMode(true);
                    setCurrentStepIndex(0);
                  }}
                  className="w-full rounded-xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500 hover:text-stone-700"
                >
                  Revisar todo desde el inicio
                </button>
              </div>
              <button
                onClick={() => setShowUpdatePicker(false)}
                className="mt-3 w-full text-center text-sm text-stone-400 hover:text-stone-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (pageView === 'privacy') {
    return (
      <PrivacyAcceptanceScreen
        error={anamnesisError}
        saving={saving}
        onAccept={handleAcceptPrivacy}
      />
    );
  }

  // --- MODE SWITCH ---
  // (switchMode defined above early returns to maintain hook order)

  // --- CONVERSATIONAL MODE ---
  // editMode uses wizard to target a specific section — don't override with conversational
  if (anamnesisMode === 'conversational' && !editMode) {
    return (
      <ConversationalAnamnesis
        initialData={formData}
        onComplete={() => {
          // Refresh to show completed view
          window.location.reload();
        }}
        onSwitchMode={() => switchMode('wizard')}
      />
    );
  }

  // --- WIZARD VIEW ---

  if (!currentStep) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-stone-50 to-sky-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-emerald-700">AutaMedica</span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            {isExtracting && (
              <Loader2 className="h-3 w-3 animate-spin text-sky-700" />
            )}
            Paso {currentStepIndex + 1} de {anamnesisSteps.length}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => switchMode('conversational')}
              className="text-xs text-emerald-600 transition-colors hover:text-emerald-700"
              title="Modo conversacional — una pregunta a la vez"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
            <button
              onClick={() => { if (editMode) { setEditMode(false); } else { window.location.href = '/'; } }}
              className="text-xs text-stone-500 transition-colors hover:text-stone-600"
            >
              {editMode ? 'Volver al resumen' : 'Guardar y salir'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-stone-100" data-tour="anamnesis-progress">
          <div
            className="h-full bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div data-tour="anamnesis-section">
          {/* Educational story */}
          {currentStep.story && (
            <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-5" data-tour="educational-media">
              <p className="text-sm leading-relaxed text-sky-900">{currentStep.story.intro}</p>
              {currentStep.story.why && (
                <p className="mt-3 text-sm leading-relaxed text-sky-800">{currentStep.story.why}</p>
              )}
              {currentStep.story.example && (
                <div className="mt-3 whitespace-pre-line rounded-lg bg-white/60 p-3 text-xs text-sky-700">
                  {currentStep.story.example}
                </div>
              )}
              {currentStep.story.didYouKnow && (
                <p className="mt-3 text-xs italic text-sky-700">{currentStep.story.didYouKnow}</p>
              )}
            </div>
          )}

          {/* Video */}
          {currentStep.mediaUrl && (
            <div className="mb-6 overflow-hidden rounded-xl" data-tour="educational-media">
              <video
                src={currentStep.mediaUrl}
                controls
                preload="metadata"
                className="w-full rounded-xl"
              >
                <track kind="captions" />
              </video>
            </div>
          )}

          {/* Step title */}
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">{currentStep.title}</h1>
          <p className="mt-1 text-sm text-stone-500">{currentStep.subtitle}</p>

          {/* Revisit: carried-forward preview */}
          {isStepCarriedForward && !editingCarriedStep ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-sm font-medium text-emerald-800 mb-3">
                  {currentStep.mutability === 'carry_forward_additive'
                    ? 'Datos anteriores — ¿hay algo nuevo?'
                    : 'Datos anteriores — ¿cambió algo?'}
                </p>
                <div className="space-y-2">
                  {currentStep.fields.filter(f => formData[currentStep.id]?.[f.id] != null).map(f => {
                    const val = formData[currentStep.id]?.[f.id];
                    const display = val === true ? 'Sí' : val === false ? 'No'
                      : Array.isArray(val) ? (val as string[]).join(', ') || 'Ninguno'
                      : String(val ?? '');
                    return (
                      <div key={f.id} className="flex justify-between text-sm">
                        <span className="text-stone-600">{f.label}</span>
                        <span className="font-medium text-stone-900 max-w-[60%] text-right truncate">{display}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingCarriedStep(true)}
                  className="flex-1 rounded-xl border-2 border-stone-200 px-4 py-3 text-sm font-medium text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                >
                  {currentStep.mutability === 'carry_forward_additive' ? 'Sí, agregar datos' : 'Sí, actualizar'}
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  No cambió nada
                </button>
              </div>
            </div>
          ) : (
          /* Fields — normal edit mode */
          <div className="mt-6 space-y-5" data-tour="anamnesis-field">
            {visibleFields.map((field) => (
              <AnamnesisFieldRenderer
                key={field.id}
                field={field}
                value={(formData[currentStep.id]?.[field.id] ?? null) as AnamnesisFieldValue}
                onChange={(val) => handleFieldChange(field.id, val)}
              />
            ))}
          </div>
          )}

          {/* Save error */}
          {saveError && (
            <p className="mt-4 text-center text-xs text-red-600">{saveError}</p>
          )}
        </div>
      </main>

      {/* Navigation */}
      <footer
        className="sticky bottom-0 border-t border-stone-200 bg-white/80 backdrop-blur-sm"
        data-tour="navigation-buttons"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={handlePrev}
            disabled={isFirstStep || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>

          <button
            onClick={handleNext}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLastStep ? (
              <>
                Finalizar
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </footer>

      {/* AI Analysis checkpoint overlay */}
      {showAnalyzing && (
        <AnalysisResultOverlay
          analysisResult={analysisResult}
          onContinue={handleAnalysisContinue}
          isFinal={pendingCheckpoint === 'final'}
        />
      )}

      {/* AI Clarification overlay */}
      {showClarification && guidance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <div className="w-full max-w-2xl">
            {criticalSkipBlocked && (
              <div className="mx-4 mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                <p className="text-sm font-semibold text-red-900">
                  Hay preguntas importantes sin responder
                </p>
                <p className="text-sm text-red-700 mt-1">
                  Por favor, responda las preguntas marcadas como prioritarias antes de continuar.
                  Son necesarias para que su profesional tenga la informacion completa.
                </p>
              </div>
            )}
            <ClarificationStep
              guidance={guidance}
              isPartial={pendingCheckpoint === 'partial'}
              onSubmit={handleClarificationSubmit}
              onSkip={handleClarificationSkip}
              isSubmitting={saving}
            />
          </div>
        </div>
      )}

      {/* Cognitive pause overlay */}
      {showPause && (
        <PausaCognitiva stepNumber={currentStepIndex + 1} onContinue={handlePauseContinue} />
      )}

      {/* Guided tour (first visit) */}
      {pageView === 'wizard' && user && (
        <AnamnesisFlowTour autoStart currentStep={currentStepIndex} />
      )}
    </div>
  );
}
