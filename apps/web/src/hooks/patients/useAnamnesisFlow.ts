'use client';

import { logger } from '@autamedica/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnamnesisSection } from '@autamedica/types';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import { useAnamnesis } from '@/hooks/patients/useAnamnesis';
import { useAnamnesisGuidance } from '@/hooks/patients/useAnamnesisGuidance';
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import { anamnesisPdfService } from '@/lib/patients/services/anamnesis-pdf.service';
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';
import {
  buildAnalysisResult,
  buildClarificationTurnsFromTranscript,
  buildInitialFormData,
  type FormDataMap,
  hasClarificationContext,
  PARTIAL_CHECKPOINT_AFTER_STEP,
  resolvePostAnalysisAction,
  resolveInitialStepIndex,
  resolveNextWizardStepIndex,
  resolvePageView,
  validateRequiredFields,
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

    const authOrigin = window.location.origin;
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

    const allCompleted = progress?.completedSections?.length === anamnesisSteps.length;
    const startIndex = resolveInitialStepIndex({
      patientBirthDate,
      completedSections: progress?.completedSections,
      isRevisit: allCompleted,
    });

    if (startIndex > 0) {
      setCurrentStepIndex(startIndex);
    }
  }, [sections, patientBirthDate, progress, anamnesisLoading]);

  const currentStep = anamnesisSteps[currentStepIndex] ?? null;
  const isLastStep = currentStepIndex === anamnesisSteps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  const completionPct = progress?.completionPercentage ?? 0;
  const isRevisit = Boolean(progress?.completedSections?.length);

  const isStepCarriedForward = useMemo(() => {
    if (!isRevisit || !currentStep) {
      return false;
    }

    const wasCompleted = progress?.completedSections?.includes(currentStep.id);
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
      const actualValue = stepData[field.dependsOn.fieldId]
      const depValue = field.dependsOn.value

      if (Array.isArray(depValue)) {
        return depValue.includes(actualValue as never)
      }
      return actualValue === depValue
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
      logger.warn('[AnamnesisFlow] saveCurrentStep — no currentStep');
      return false;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const stepData = formData[currentStep.id] ?? {};
      logger.info('[AnamnesisFlow] saveCurrentStep', {
        step: currentStep.id,
        fieldCount: Object.keys(stepData).length,
      });
      const ok = await updateSection(currentStep.id as AnamnesisSection, stepData);
      if (!ok) {
        logger.error('[AnamnesisFlow] saveCurrentStep — updateSection returned false', {
          step: currentStep.id,
        });
        setSaveError('No se pudo guardar esta sección');
        return false;
      }

      return true;
    } catch (err) {
      logger.error('[AnamnesisFlow] saveCurrentStep — exception', {
        step: currentStep.id,
        error: err,
      });
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
      await anamnesisPdfService.downloadPdf(versionNumber);
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
      completedSections: progress?.completedSections,
    }));
  }, [isRevisit, progress]);

  const finalizeCheckpoint = useCallback(async (checkpoint: AnamnesisCheckpoint | null) => {
    logger.info('[AnamnesisFlow] finalizeCheckpoint', { checkpoint });
    setShowVoiceChat(false);
    setShowClarification(false);
    setPendingCheckpoint(null);
    dismissGuidance();

    if (checkpoint === 'final') {
      logger.info('[AnamnesisFlow] Marking anamnesis as completed');
      const ok = await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
      if (!ok) {
        logger.error('[AnamnesisFlow] finalizeCheckpoint(final) — failed to mark as completed');
        setSaveError('No se pudo finalizar la anamnesis. Intentá de nuevo.');
        return;
      }
      logger.info('[AnamnesisFlow] Generating PDF after final checkpoint');
      await handleGeneratePdf();
      return;
    }

    logger.info('[AnamnesisFlow] Advancing to next step after checkpoint', { checkpoint });
    advanceToNextStep();
  }, [advanceToNextStep, dismissGuidance, handleGeneratePdf, updateAnamnesis]);

  const handleNext = useCallback(async () => {
    // Validate required fields before saving (skip if carried-forward and not editing)
    if (currentStep && !(isStepCarriedForward && !editingCarriedStep)) {
      const stepData = formData[currentStep.id] ?? {};
      const missing = validateRequiredFields(stepData, visibleFields);
      if (missing.length > 0) {
        setSaveError(`Completá los campos obligatorios: ${missing.join(', ')}`);
        return;
      }
    }

    const saved = await saveCurrentStep();
    if (!saved) {
      logger.error('[AnamnesisFlow] handleNext — saveCurrentStep failed', {
        step: currentStep?.id,
        stepIndex: currentStepIndex,
      });
      return;
    }

    if (isLastStep) {
      logger.info('[AnamnesisFlow] Last step reached — triggering FINAL checkpoint extraction', {
        step: currentStep?.id,
      });
      setPendingCheckpoint('final');
      setShowAnalyzing(true);
      setAnalysisResult(null);

      const result = await triggerExtraction('final');
      logger.info('[AnamnesisFlow] FINAL extraction result', {
        hasQuestions: !!(result?.questions?.length),
        questionsCount: result?.questions?.length ?? 0,
      });
      setAnalysisResult(buildAnalysisResult(result));
      return;
    }

    if (currentStepIndex + 1 === PARTIAL_CHECKPOINT_AFTER_STEP) {
      logger.info('[AnamnesisFlow] PARTIAL checkpoint reached at step', {
        step: currentStep?.id,
        stepIndex: currentStepIndex,
        checkpointAt: PARTIAL_CHECKPOINT_AFTER_STEP,
      });
      setPendingCheckpoint('partial');
      setShowAnalyzing(true);
      setAnalysisResult(null);

      const result = await triggerExtraction('partial');
      logger.info('[AnamnesisFlow] PARTIAL extraction result', {
        hasQuestions: !!(result?.questions?.length),
        questionsCount: result?.questions?.length ?? 0,
        guidanceNull: result === null,
      });
      setAnalysisResult(buildAnalysisResult(result));
      return;
    }

    advanceToNextStep();
  }, [
    advanceToNextStep,
    currentStep,
    currentStepIndex,
    editingCarriedStep,
    finalizeCheckpoint,
    formData,
    isLastStep,
    isStepCarriedForward,
    saveCurrentStep,
    triggerExtraction,
    visibleFields,
  ]);

  const handleAnalysisContinue = useCallback(() => {
    setShowAnalyzing(false);
    setAnalysisResult(null);

    const hasClarification = hasClarificationContext(guidance);
    logger.info('[AnamnesisFlow] handleAnalysisContinue', {
      pendingCheckpoint,
      hasClarification,
      guidanceNull: guidance === null,
    });

    const nextAction = resolvePostAnalysisAction(pendingCheckpoint, hasClarification);

    if (nextAction === 'open_voice') {
      logger.info('[AnamnesisFlow] Checkpoint — opening voice chat for clarification', { pendingCheckpoint });
      setShowVoiceChat(true);
      return;
    }

    if (nextAction === 'finalize') {
      logger.info('[AnamnesisFlow] Final checkpoint — no clarification needed, finalizing after review');
      void finalizeCheckpoint('final');
      return;
    }

    logger.info('[AnamnesisFlow] No clarification needed — dismissing guidance and advancing');
    setPendingCheckpoint(null);
    dismissGuidance();
    advanceToNextStep();
  }, [advanceToNextStep, dismissGuidance, finalizeCheckpoint, guidance, pendingCheckpoint]);

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
    setSaveError(null);
    logger.info('[AnamnesisFlow] Accepting privacy + terms');

    const ok = await updateAnamnesis({
      privacyAccepted: true,
      termsAccepted: true,
    } as Record<string, unknown>);

    if (!ok) {
      logger.error('[AnamnesisFlow] handleAcceptPrivacy failed — updateAnamnesis returned false');
      setSaveError('No se pudo aceptar los términos. Intentá de nuevo.');
    }

    setSaving(false);
  }, [updateAnamnesis]);

  const handleClarificationComplete = useCallback(async (turns: ClarificationTurn[]) => {
    const activeCheckpoint = pendingCheckpoint;
    logger.info('[AnamnesisFlow] handleClarificationComplete', {
      checkpoint: activeCheckpoint,
      turnsCount: turns.length,
      turns: turns.map(t => ({ q: t.question.slice(0, 50), a: t.answer.slice(0, 50) })),
    });

    turns.forEach((turn) => addClarification(turn.question, turn.answer));
    await finalizeCheckpoint(activeCheckpoint);
  }, [addClarification, finalizeCheckpoint, pendingCheckpoint]);

  const handleVoiceDataExtracted = useCallback(async (data: VoiceExtractionPayload) => {
    const activeCheckpoint = pendingCheckpoint;
    logger.info('[AnamnesisFlow] handleVoiceDataExtracted', {
      checkpoint: activeCheckpoint,
      hasGuidance: !!guidance,
      transcriptLength: data.transcript.length,
      detectedSections: data.detectedSections,
      hasExtractedFields: !!data.extractedFields,
    });

    // Always save extracted fields to sections — even during checkpoints.
    if (data.extractedFields) {
      const sectionUpdates: Record<string, Record<string, string>> = {};

      for (const [key, value] of Object.entries(data.extractedFields)) {
        const mapping = VOICE_FIELD_MAP[key];
        if (!mapping || !value) {
          logger.debug('[AnamnesisFlow] Voice field skipped — no mapping', { key });
          continue;
        }

        if (!sectionUpdates[mapping.section]) {
          sectionUpdates[mapping.section] = {};
        }
        sectionUpdates[mapping.section][mapping.field] = value;
      }

      logger.info('[AnamnesisFlow] Voice extraction — saving sections', {
        sections: Object.keys(sectionUpdates),
      });

      for (const [section, fields] of Object.entries(sectionUpdates)) {
        const ok = await updateSection(section as AnamnesisSection, fields).catch((err) => {
          logger.error('[AnamnesisFlow] Voice section save failed', { section, error: err });
          return false;
        });
        if (!ok) {
          logger.warn('[AnamnesisFlow] Voice section save returned false', { section });
        }
      }

      logger.info('[AnamnesisFlow] Voice fields saved to sections', {
        sections: Object.keys(sectionUpdates),
      });
    }

    // Register clarification turns from the voice transcript
    if (activeCheckpoint && guidance) {
      const turns = buildClarificationTurnsFromTranscript(data.transcript);
      logger.info('[AnamnesisFlow] Voice clarification turns registered', { turnsCount: turns.length });
      turns.forEach((turn) => addClarification(turn.question, turn.answer));
    }

    // Finalize: advance the wizard (partial → next step, final → complete + PDF)
    if (activeCheckpoint) {
      await finalizeCheckpoint(activeCheckpoint);
      return;
    }

    // No checkpoint: standalone voice update
    setShowVoiceChat(false);
    window.location.reload();
  }, [addClarification, finalizeCheckpoint, guidance, pendingCheckpoint, updateSection]);

  const handleVoiceSwitchToText = useCallback(() => {
    logger.info('[AnamnesisFlow] handleVoiceSwitchToText — exiting voice, clearing checkpoint state');
    setShowVoiceChat(false);
    setShowAnalyzing(false);
    setAnalysisResult(null);

    // If there's a pending checkpoint with guidance questions, offer text clarification.
    // Otherwise, clear the checkpoint entirely and advance to prevent looping.
    if (pendingCheckpoint && guidance) {
      setShowClarification(true);
    } else {
      setPendingCheckpoint(null);
      dismissGuidance();
      advanceToNextStep();
    }
  }, [advanceToNextStep, dismissGuidance, guidance, pendingCheckpoint]);

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
