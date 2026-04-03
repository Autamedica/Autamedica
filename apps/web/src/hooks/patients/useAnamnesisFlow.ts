'use client';

import { getClientEnvOrDefault } from '@autamedica/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnamnesisSection } from '@autamedica/types';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import { useAnamnesis } from '@/hooks/patients/useAnamnesis';
import { useAnamnesisGuidance } from '@/hooks/patients/useAnamnesisGuidance';
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';
import {
  buildAnalysisResult,
  buildClarificationTurnsFromTranscript,
  buildInitialFormData,
  type FormDataMap,
  hasClarificationContext,
  PARTIAL_CHECKPOINT_AFTER_STEP,
  resolveInitialStepIndex,
  resolveNextWizardStepIndex,
  resolvePageView,
  type AnamnesisAnalysisResult,
  type AnamnesisCheckpoint,
  type AnamnesisMode,
  type AnamnesisPageView,
} from '@/lib/patients/usecases/anamnesis-flow.usecase';

interface ClarificationTurn {
  question: string;
  answer: string;
}

interface VoiceTranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface VoiceExtractionPayload {
  chiefComplaint: string;
  transcript: VoiceTranscriptEntry[];
  detectedSections: string[];
  extractedFields?: Record<string, string>;
}

interface UseAnamnesisFlowReturn {
  user: ReturnType<typeof usePatientSession>['user'];
  guidance: ReturnType<typeof useAnamnesisGuidance>['guidance'];
  currentStepIndex: number;
  currentStep: typeof anamnesisSteps[number] | null;
  formData: FormDataMap;
  visibleFields: typeof anamnesisSteps[number]['fields'];
  pageView: AnamnesisPageView;
  completionPct: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  isExtracting: boolean;
  isStepCarriedForward: boolean;
  editingCarriedStep: boolean;
  saving: boolean;
  saveError: string | null;
  showClarification: boolean;
  pendingCheckpoint: AnamnesisCheckpoint | null;
  anamnesisMode: AnamnesisMode;
  showAnalyzing: boolean;
  analysisResult: AnamnesisAnalysisResult | null;
  showUpdatePicker: boolean;
  showVoiceChat: boolean;
  editMode: boolean;
  anamnesisError: string | null;
  anamnesis: ReturnType<typeof useAnamnesis>['anamnesis'];
  progress: ReturnType<typeof useAnamnesis>['progress'];
  updateAnamnesis: ReturnType<typeof useAnamnesis>['updateAnamnesis'];
  updateSection: ReturnType<typeof useAnamnesis>['updateSection'];
  setEditingCarriedStep: (value: boolean) => void;
  setShowClarification: (value: boolean) => void;
  setShowUpdatePicker: (value: boolean) => void;
  setShowVoiceChat: (value: boolean) => void;
  switchMode: (mode: AnamnesisMode) => void;
  handleFieldChange: (fieldId: string, value: AnamnesisFieldValue) => void;
  handlePrev: () => Promise<void>;
  handleNext: () => Promise<void>;
  handleAcceptPrivacy: () => Promise<void>;
  handleAnalysisContinue: () => void;
  handleGeneratePdf: (versionNumber?: number) => Promise<void>;
  handleClarificationComplete: (turns: ClarificationTurn[]) => Promise<void>;
  handleVoiceDataExtracted: (data: VoiceExtractionPayload) => Promise<void>;
  handleVoiceSwitchToText: () => void;
  selectUpdateSection: (stepId: string) => void;
  handleExitWizard: () => void;
}

const VOICE_FIELD_MAP: Record<string, { section: string; field: string }> = {
  motivo_principal: { section: 'motivo_consulta', field: 'sintoma_principal' },
  cuando_empezo: { section: 'motivo_consulta', field: 'cuando_empezo' },
  intensidad: { section: 'motivo_consulta', field: 'intensidad_sintoma' },
  medicamentos: { section: 'medicamentos', field: 'lista_medicamentos' },
  alergias: { section: 'alergias', field: 'lista_alergias' },
  enfermedades_previas: { section: 'enfermedades_previas', field: 'enfermedades_cronicas' },
};

export function useAnamnesisFlow(): UseAnamnesisFlowReturn {
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
  const [showClarification, setShowClarification] = useState(false);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<AnamnesisCheckpoint | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showUpdatePicker, setShowUpdatePicker] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [showAnalyzing, setShowAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnamnesisAnalysisResult | null>(null);
  const [editingCarriedStep, setEditingCarriedStep] = useState(false);
  const [anamnesisMode, setAnamnesisMode] = useState<AnamnesisMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('autamedica:anamnesis-mode') as AnamnesisMode) || 'wizard';
    }
    return 'wizard';
  });

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

  const pageView = useMemo(() => resolvePageView({
    sessionLoading,
    anamnesisLoading,
    editMode,
    anamnesis,
  }), [sessionLoading, anamnesisLoading, editMode, anamnesis]);

  useEffect(() => {
    if (initializedRef.current || anamnesisLoading) {
      return;
    }

    initializedRef.current = true;
    setFormData(buildInitialFormData(sections, patientBirthDate));

    const startIndex = resolveInitialStepIndex({
      patientBirthDate,
      completedSections: progress?.completed_sections,
    });

    if (startIndex > 0) {
      setCurrentStepIndex(startIndex);
    }
  }, [sections, patientBirthDate, progress, anamnesisLoading]);

  const currentStep = anamnesisSteps[currentStepIndex] ?? null;
  const isLastStep = currentStepIndex === anamnesisSteps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  const completionPct = progress?.completion_percentage ?? 0;
  const isRevisit = Boolean(progress?.completed_sections?.length);

  const isStepCarriedForward = useMemo(() => {
    if (!isRevisit || !currentStep) {
      return false;
    }

    const wasCompleted = progress?.completed_sections?.includes(currentStep.id);
    return Boolean(
      wasCompleted && (
        currentStep.mutability === 'carry_forward'
        || currentStep.mutability === 'carry_forward_additive'
        || currentStep.mutability === 'confirm_on_revisit'
      ),
    );
  }, [isRevisit, currentStep, progress]);

  const visibleFields = useMemo(() => {
    if (!currentStep) {
      return [];
    }

    const stepData = formData[currentStep.id] ?? {};
    return currentStep.fields.filter((field) => {
      if (!field.dependsOn) {
        return true;
      }
      return stepData[field.dependsOn.fieldId] === field.dependsOn.value;
    });
  }, [currentStep, formData]);

  const handleFieldChange = useCallback((fieldId: string, value: AnamnesisFieldValue) => {
    if (!currentStep) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [currentStep.id]: {
        ...(prev[currentStep.id] ?? {}),
        [fieldId]: value,
      },
    }));
    setSaveError(null);
  }, [currentStep]);

  const saveCurrentStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep) {
      return false;
    }

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

  const handleGeneratePdf = useCallback(async (versionNumber?: number) => {
    setSaving(true);
    setSaveError(null);

    try {
      const url = versionNumber
        ? `/api/patients/anamnesis/pdf?version=${versionNumber}`
        : '/api/patients/anamnesis/pdf';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('PDF download failed');
      }

      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')
        ?.match(/filename="(.+)"/)?.[1] ?? 'historia-clinica.pdf';
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setSaveError('No se pudo descargar el PDF');
    } finally {
      setSaving(false);
    }
  }, []);

  const advanceToNextStep = useCallback(() => {
    setEditingCarriedStep(false);
    setCurrentStepIndex((prev) => resolveNextWizardStepIndex({
      currentStepIndex: prev,
      isRevisit,
      completedSections: progress?.completed_sections,
    }));
  }, [isRevisit, progress]);

  const finalizeCheckpoint = useCallback(async (checkpoint: AnamnesisCheckpoint | null) => {
    setShowVoiceChat(false);
    setShowClarification(false);
    setPendingCheckpoint(null);
    dismissGuidance();

    if (checkpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
      await handleGeneratePdf();
      return;
    }

    advanceToNextStep();
  }, [advanceToNextStep, dismissGuidance, handleGeneratePdf, updateAnamnesis]);

  const handleNext = useCallback(async () => {
    const saved = await saveCurrentStep();
    if (!saved) {
      return;
    }

    if (isLastStep) {
      setPendingCheckpoint('final');
      setShowAnalyzing(true);
      setAnalysisResult(null);

      const result = await triggerExtraction('final');
      setAnalysisResult(buildAnalysisResult(result));

      if (result?.questions && result.questions.length > 0) {
        return;
      }

      setShowAnalyzing(false);
      setAnalysisResult(null);
      await finalizeCheckpoint('final');
      return;
    }

    if (currentStepIndex + 1 === PARTIAL_CHECKPOINT_AFTER_STEP) {
      setPendingCheckpoint('partial');
      setShowAnalyzing(true);
      setAnalysisResult(null);

      const result = await triggerExtraction('partial');
      setAnalysisResult(buildAnalysisResult(result));
      return;
    }

    advanceToNextStep();
  }, [
    advanceToNextStep,
    currentStepIndex,
    finalizeCheckpoint,
    isLastStep,
    saveCurrentStep,
    triggerExtraction,
  ]);

  const handleAnalysisContinue = useCallback(() => {
    setShowAnalyzing(false);
    setAnalysisResult(null);

    if (hasClarificationContext(guidance)) {
      if (pendingCheckpoint === 'partial') {
        setShowVoiceChat(true);
        return;
      }

      setShowClarification(true);
      return;
    }

    setPendingCheckpoint(null);
    dismissGuidance();
    advanceToNextStep();
  }, [advanceToNextStep, dismissGuidance, guidance, pendingCheckpoint]);

  const handlePrev = useCallback(async () => {
    if (isFirstStep) {
      return;
    }

    await saveCurrentStep();
    setCurrentStepIndex((prev) => prev - 1);
    setSaveError(null);
  }, [isFirstStep, saveCurrentStep]);

  const handleAcceptPrivacy = useCallback(async () => {
    setSaving(true);
    await updateAnamnesis({
      privacy_accepted: true,
      terms_accepted: true,
    } as Record<string, unknown>);
    setSaving(false);
  }, [updateAnamnesis]);

  const handleClarificationComplete = useCallback(async (turns: ClarificationTurn[]) => {
    const activeCheckpoint = pendingCheckpoint;

    turns.forEach((turn) => addClarification(turn.question, turn.answer));
    await finalizeCheckpoint(activeCheckpoint);
  }, [addClarification, finalizeCheckpoint, pendingCheckpoint]);

  const handleVoiceDataExtracted = useCallback(async (data: VoiceExtractionPayload) => {
    const activeCheckpoint = pendingCheckpoint;

    if (activeCheckpoint && guidance) {
      const turns = buildClarificationTurnsFromTranscript(data.transcript);
      turns.forEach((turn) => addClarification(turn.question, turn.answer));
      await finalizeCheckpoint(activeCheckpoint);
      return;
    }

    if (data.extractedFields) {
      const sectionUpdates: Record<string, Record<string, string>> = {};

      for (const [key, value] of Object.entries(data.extractedFields)) {
        const mapping = VOICE_FIELD_MAP[key];
        if (!mapping || !value) {
          continue;
        }

        if (!sectionUpdates[mapping.section]) {
          sectionUpdates[mapping.section] = {};
        }
        sectionUpdates[mapping.section][mapping.field] = value;
      }

      for (const [section, fields] of Object.entries(sectionUpdates)) {
        await updateSection(section as AnamnesisSection, fields).catch(() => {});
      }

      await fetch('/api/patients/anamnesis/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: 'Actualización por conversación de voz con IA' }),
      }).catch(() => {});
    }

    setShowVoiceChat(false);
    window.location.reload();
  }, [addClarification, finalizeCheckpoint, guidance, pendingCheckpoint, updateSection]);

  const handleVoiceSwitchToText = useCallback(() => {
    setShowVoiceChat(false);

    if (pendingCheckpoint && guidance) {
      setShowClarification(true);
    }
  }, [guidance, pendingCheckpoint]);

  const selectUpdateSection = useCallback((stepId: string) => {
    const targetIndex = anamnesisSteps.findIndex((step) => step.id === stepId);
    setShowUpdatePicker(false);
    setEditMode(true);
    setCurrentStepIndex(targetIndex >= 0 ? targetIndex : 0);
  }, []);

  const handleExitWizard = useCallback(() => {
    if (editMode) {
      setEditMode(false);
      return;
    }

    window.location.href = '/';
  }, [editMode]);

  return {
    user,
    guidance,
    currentStepIndex,
    currentStep,
    formData,
    visibleFields,
    pageView,
    completionPct,
    isFirstStep,
    isLastStep,
    isExtracting,
    isStepCarriedForward,
    editingCarriedStep,
    saving,
    saveError,
    showClarification,
    pendingCheckpoint,
    anamnesisMode,
    showAnalyzing,
    analysisResult,
    showUpdatePicker,
    showVoiceChat,
    editMode,
    anamnesisError,
    anamnesis,
    progress,
    updateAnamnesis,
    updateSection,
    setEditingCarriedStep,
    setShowClarification,
    setShowUpdatePicker,
    setShowVoiceChat,
    switchMode,
    handleFieldChange,
    handlePrev,
    handleNext,
    handleAcceptPrivacy,
    handleAnalysisContinue,
    handleGeneratePdf,
    handleClarificationComplete,
    handleVoiceDataExtracted,
    handleVoiceSwitchToText,
    selectUpdateSection,
    handleExitWizard,
  };
}
