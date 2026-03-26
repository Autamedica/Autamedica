'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Download,
  Loader2,
  Lock,
  PlayCircle,
  Plus,
  Shield,
} from 'lucide-react';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import { useAnamnesis } from '@/hooks/patients/useAnamnesis';
import { useAnamnesisGuidance } from '@/hooks/patients/useAnamnesisGuidance';
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import { AnamnesisField as AnamnesisFieldRenderer } from '@/components/patients/anamnesis/AnamnesisField';
import { PausaCognitiva } from '@/components/patients/anamnesis/PausaCognitiva';
import { ClarificationStep } from '@/components/patients/anamnesis/ClarificationStep';
import { AnamnesisFlowTour } from '@/components/patients/tours/AnamnesisFlowTour';
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';
import type { AnamnesisSection } from '@autamedica/types';

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
    updateAnamnesis,
    updateSection,
  } = useAnamnesis();

  const {
    guidance,
    isExtracting,
    triggerExtraction,
    addClarification,
    dismissGuidance,
  } = useAnamnesisGuidance();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<FormDataMap>({});
  const [showPause, setShowPause] = useState(false);
  const [showClarification, setShowClarification] = useState(false);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<'partial' | 'final' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAnalyzing, setShowAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ coverage: string[]; gaps: string[]; questions: { question: string; priority: string }[] } | null>(null);
  const initializedRef = useRef(false);

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

    // Checkpoint 2 (final): before marking completed
    if (isLastStep) {
      setPendingCheckpoint('final');
      const result = await triggerExtraction('final');
      if (result?.hasCritical) {
        setShowClarification(true);
        return;
      }
      // No critical questions or extraction failed — complete
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
      return;
    }

    const nextIndex = currentStepIndex + 1;

    // Checkpoint 1 (partial): after step 6 — BLOCKING with visible analysis
    if (currentStepIndex + 1 === PARTIAL_CHECKPOINT_AFTER_STEP) {
      setPendingCheckpoint('partial');
      setShowAnalyzing(true);
      setAnalysisResult(null);

      // Race: extraction vs 20s timeout
      const extractionPromise = triggerExtraction('partial');
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000));
      const result = await Promise.race([extractionPromise, timeoutPromise]);

      if (result) {
        // Show AI results — user must click "Continuar" to proceed
        setAnalysisResult({
          coverage: result.coverage ?? [],
          gaps: result.gaps ?? [],
          questions: result.questions ?? [],
        });
        return; // Wait for user to dismiss the analysis screen
      }

      // Extraction failed or timed out — show fallback and let user continue
      setAnalysisResult({
        coverage: [],
        gaps: [],
        questions: [],
      });
      return; // Still show the results screen (with "no data" message), user clicks to continue
    }

    if ((nextIndex) % PAUSE_EVERY_N_STEPS === 0 && nextIndex < anamnesisSteps.length) {
      setShowPause(true);
      return;
    }

    setCurrentStepIndex(nextIndex);
  }, [saveCurrentStep, isLastStep, currentStepIndex, updateAnamnesis, triggerExtraction]);

  const handleAnalysisContinue = useCallback(() => {
    const hasQuestions = analysisResult?.questions && analysisResult.questions.length > 0;
    setShowAnalyzing(false);
    setAnalysisResult(null);

    if (hasQuestions) {
      setShowClarification(true);
      return;
    }

    setPendingCheckpoint(null);
    dismissGuidance();
    // Advance to next step
    setCurrentStepIndex((prev) => prev + 1);
  }, [analysisResult, dismissGuidance]);

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
    }

    setPendingCheckpoint(null);
    dismissGuidance();
  }, [addClarification, pendingCheckpoint, updateAnamnesis, dismissGuidance]);

  const handleClarificationSkip = useCallback(async () => {
    setShowClarification(false);

    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
    }

    setPendingCheckpoint(null);
    dismissGuidance();
  }, [pendingCheckpoint, updateAnamnesis, dismissGuidance]);

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
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-stone-500">Cargando tu anamnesis...</p>
        </div>
      </div>
    );
  }

  if (pageView === 'locked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
        <div className="max-w-md text-center">
          <Lock className="mx-auto h-12 w-12 text-stone-400" />
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

    const handleDownloadPdf = async () => {
      setSaving(true);
      try {
        const response = await fetch('/api/patients/anamnesis/pdf', { credentials: 'include' });
        if (!response.ok) throw new Error('PDF download failed');
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')
          ?.match(/filename="(.+)"/)?.[1] ?? 'historia-clinica.pdf';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        setSaveError('No se pudo descargar el PDF');
      } finally {
        setSaving(false);
      }
    };

    const pct = Math.round((completedCount / totalSteps) * 100);
    const completedDate = anamnesis?.completed_at
      ? new Date(anamnesis.completed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return (
      <div className="min-h-screen bg-stone-50">
        {/* Hero card */}
        <div className="bg-emerald-600 px-6 pb-16 pt-10 text-white">
          <div className="mx-auto max-w-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Historia clínica completa</h1>
                <p className="text-sm text-emerald-100">
                  {completedDate ? `Completada el ${completedDate}` : 'Lista para tu equipo médico'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto -mt-10 max-w-lg space-y-4 px-4 pb-8">
          {/* Main action card */}
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-900/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-400">Documento</p>
                <p className="mt-0.5 font-semibold text-stone-900">Historia Clínica Digital</p>
              </div>
              <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {pct}% completa
              </div>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>

            <button
              onClick={handleDownloadPdf}
              disabled={saving}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Descargar PDF
            </button>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setEditMode(true);
                setCurrentStepIndex(0);
              }}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5 transition-all hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Plus className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-stone-700">Actualizar datos</span>
            </button>
            <a
              href="/"
              className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5 transition-all hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <ArrowLeft className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-stone-700">Ir al inicio</span>
            </a>
          </div>

          {/* Sections summary — collapsible style */}
          <details className="group rounded-2xl bg-white shadow-sm ring-1 ring-stone-900/5">
            <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-semibold text-stone-800">
              <span>Secciones completadas</span>
              <span className="text-xs font-normal text-stone-400 group-open:hidden">{completedCount}/{totalSteps}</span>
            </summary>
            <div className="space-y-0.5 px-5 pb-4">
              {anamnesisSteps.map((step, i) => {
                const isComplete = completedSections.includes(step.id);
                return (
                  <div key={step.id} className="flex items-center gap-3 rounded-lg py-1.5">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {isComplete ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className="text-sm text-stone-600">
                      {step.title.replace(/^[^\s]+\s/, '')}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>

          {saveError && (
            <div className="rounded-xl bg-red-50 p-3 text-center text-xs text-red-600">{saveError}</div>
          )}
        </div>
      </div>
    );
  }

  if (pageView === 'privacy') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
        <div className="max-w-lg rounded-2xl border-2 border-stone-200 bg-white p-8 shadow-sm">
          <Shield className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-center text-xl font-bold text-stone-900">
            Tu historia clínica digital
          </h1>
          <p className="mt-3 text-center text-sm text-stone-600">
            Vamos a hacerte algunas preguntas sobre tu salud. Esta información es confidencial y solo será compartida con tu equipo médico.
          </p>

          <div className="mt-6 space-y-3 rounded-xl bg-stone-50 p-4">
            <h2 className="text-sm font-semibold text-stone-800">Antes de comenzar:</h2>
            <ul className="space-y-2 text-sm text-stone-600">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>El formulario tiene 13 pasos con contenido educativo</span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>Puedes pausar y retomar cuando quieras</span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>Cada 4 pasos habrá una pausa para descansar</span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>Tus datos se guardan automáticamente</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 space-y-3 text-xs text-stone-500">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked disabled className="mt-0.5 accent-emerald-600" />
              <span>
                Acepto que mis datos de salud sean almacenados de forma segura y compartidos únicamente con mi equipo médico.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked disabled className="mt-0.5 accent-emerald-600" />
              <span>
                Comprendo que puedo solicitar la eliminación de mis datos en cualquier momento.
              </span>
            </label>
          </div>

          {anamnesisError && (
            <p className="mt-4 text-center text-xs text-red-600">{anamnesisError}</p>
          )}

          <button
            onClick={handleAcceptPrivacy}
            disabled={saving}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Comenzar anamnesis
          </button>

          <a
            href="/patients/dashboard"
            className="mt-3 block text-center text-xs text-stone-400 transition-colors hover:text-stone-600"
          >
            Completar más tarde
          </a>
        </div>
      </div>
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
              <Loader2 className="h-3 w-3 animate-spin text-sky-500" />
            )}
            Paso {currentStepIndex + 1} de {anamnesisSteps.length}
          </span>
          <button
            onClick={() => { if (editMode) { setEditMode(false); } else { window.location.href = '/'; } }}
            className="text-xs text-stone-400 transition-colors hover:text-stone-600"
          >
            {editMode ? 'Volver al resumen' : 'Guardar y salir'}
          </button>
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
                <p className="mt-3 text-xs italic text-sky-600">{currentStep.story.didYouKnow}</p>
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

          {/* Fields */}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-emerald-50 to-sky-50">
          <div className="mx-auto max-w-lg px-6 text-center">
            {!analysisResult ? (
              // Loading state
              <div className="space-y-6">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-stone-900">AutaMedica está analizando tus respuestas</h2>
                  <p className="mt-2 text-sm text-stone-600">
                    Estamos revisando tu historia clínica para asegurarnos de que no falte información importante para tu médico.
                  </p>
                </div>
                <div className="flex justify-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              // Results state
              <div className="space-y-6 text-left">
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-stone-900">Análisis completado</h2>
                  <p className="mt-1 text-sm text-stone-600">Llevás la mitad de tu historia clínica</p>
                </div>

                {analysisResult.coverage.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-white p-4">
                    <h3 className="text-sm font-semibold text-emerald-700 mb-2">Áreas cubiertas</h3>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.coverage.map((area) => (
                        <span key={area} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                          <Check className="h-3 w-3" /> {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysisResult.gaps.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <h3 className="text-sm font-semibold text-amber-700 mb-2">Tu médico necesitará más detalle en</h3>
                    <ul className="space-y-1">
                      {analysisResult.gaps.map((gap) => (
                        <li key={gap} className="text-sm text-amber-800 flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5">●</span> {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysisResult.coverage.length === 0 && analysisResult.gaps.length === 0 && (
                  <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
                    <p className="text-sm text-stone-600">Tus respuestas se registraron correctamente. Continuá con los pasos restantes.</p>
                  </div>
                )}

                <button
                  onClick={handleAnalysisContinue}
                  className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  Continuar con mi historia clínica →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Clarification overlay */}
      {showClarification && guidance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <ClarificationStep
            guidance={guidance}
            isPartial={pendingCheckpoint === 'partial'}
            onSubmit={handleClarificationSubmit}
            onSkip={handleClarificationSkip}
            isSubmitting={saving}
          />
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
