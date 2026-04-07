import { describe, expect, it } from 'vitest';
import {
  buildClarificationTurnsFromTranscript,
  buildInitialFormData,
  hasClarificationContext,
  resolvePostAnalysisAction,
  resolveInitialStepIndex,
  resolveNextWizardStepIndex,
  resolvePageView,
} from './anamnesis-flow.usecase';

describe('resolvePageView', () => {
  it('returns loading while data is still pending', () => {
    expect(resolvePageView({
      sessionLoading: true,
      anamnesisLoading: false,
      editMode: false,
      anamnesis: null,
    })).toBe('loading');
  });

  it('returns locked when anamnesis is under review', () => {
    expect(resolvePageView({
      sessionLoading: false,
      anamnesisLoading: false,
      editMode: false,
      anamnesis: { locked: true },
    })).toBe('locked');
  });

  it('returns privacy when legal acceptance is missing', () => {
    expect(resolvePageView({
      sessionLoading: false,
      anamnesisLoading: false,
      editMode: false,
      anamnesis: { privacyAccepted: false, termsAccepted: false },
    })).toBe('privacy');
  });

  it('returns wizard when editing a completed anamnesis', () => {
    expect(resolvePageView({
      sessionLoading: false,
      anamnesisLoading: false,
      editMode: true,
      anamnesis: { status: 'completed', privacyAccepted: true, termsAccepted: true },
    })).toBe('wizard');
  });

  it('returns completed when the anamnesis is already finished', () => {
    expect(resolvePageView({
      sessionLoading: false,
      anamnesisLoading: false,
      editMode: false,
      anamnesis: { status: 'completed', privacyAccepted: true, termsAccepted: true },
    })).toBe('completed');
  });
});

describe('buildInitialFormData', () => {
  it('hydrates saved sections and injects patient birth date when missing', () => {
    const formData = buildInitialFormData(
      [{ section: 'motivo_consulta', data: { sintoma_principal: 'cefalea' } }],
      '1990-01-10',
    );

    expect(formData.motivo_consulta?.sintoma_principal).toBe('cefalea');
    expect(formData.edad?.fecha_nacimiento).toBe('1990-01-10');
  });

  it('does not override an existing saved birth date', () => {
    const formData = buildInitialFormData(
      [{ section: 'edad', data: { fecha_nacimiento: '1985-12-24' } }],
      '1990-01-10',
    );

    expect(formData.edad?.fecha_nacimiento).toBe('1985-12-24');
  });
});

describe('resolveInitialStepIndex', () => {
  it('skips edad when patient birth date already exists', () => {
    expect(resolveInitialStepIndex({
      patientBirthDate: '1990-01-10',
      completedSections: [],
    })).toBe(1);
  });

  it('resumes from the first incomplete section beyond demographic skip', () => {
    expect(resolveInitialStepIndex({
      patientBirthDate: '1990-01-10',
      completedSections: ['edad', 'ocupacion', 'motivo_consulta'],
    })).toBe(3);
  });
});

describe('resolveNextWizardStepIndex', () => {
  it('advances normally for first-time patients', () => {
    expect(resolveNextWizardStepIndex({
      currentStepIndex: 0,
      isRevisit: false,
      completedSections: ['edad'],
    })).toBe(1);
  });

  it('skips carry-forward sections already completed on revisit', () => {
    expect(resolveNextWizardStepIndex({
      currentStepIndex: 5,
      isRevisit: true,
      completedSections: ['antecedentes_familiares'],
    })).toBe(7);
  });
});

describe('hasClarificationContext', () => {
  it('returns false when there is no actionable guidance', () => {
    expect(hasClarificationContext({
      questions: [],
      alerts: [],
      coverageSummary: '',
      coverage: ['Motivo de consulta'],
      gaps: [],
      hasCritical: false,
    })).toBe(false);
  });

  it('returns true when there are guidance questions', () => {
    expect(hasClarificationContext({
      questions: [{
        id: 'q-1',
        text: '¿Desde cuándo?',
        rationale: 'temporalidad',
        inputType: 'text',
        targetSection: 'motivo_consulta',
        priority: 'high',
      }],
      alerts: [],
      coverageSummary: '',
      coverage: [],
      gaps: [],
      hasCritical: false,
    })).toBe(true);
  });
});

describe('buildClarificationTurnsFromTranscript', () => {
  it('pairs assistant prompts with user answers', () => {
    expect(buildClarificationTurnsFromTranscript([
      { role: 'assistant', text: '¿Hace cuánto?' },
      { role: 'user', text: 'Hace tres días' },
      { role: 'assistant', text: '¿Qué intensidad?' },
      { role: 'user', text: 'Ocho sobre diez' },
    ])).toEqual([
      { question: '¿Hace cuánto?', answer: 'Hace tres días' },
      { question: '¿Qué intensidad?', answer: 'Ocho sobre diez' },
    ]);
  });

  it('ignores empty user answers and falls back to generic label', () => {
    expect(buildClarificationTurnsFromTranscript([
      { role: 'user', text: '  ' },
      { role: 'user', text: 'Me siento cansado' },
    ])).toEqual([
      { question: 'Aclaración por voz', answer: 'Me siento cansado' },
    ]);
  });
});

describe('resolvePostAnalysisAction', () => {
  it('opens voice clarification for partial checkpoints with follow-up', () => {
    expect(resolvePostAnalysisAction('partial', true)).toBe('open_voice');
  });

  it('opens voice clarification for final checkpoints with follow-up', () => {
    expect(resolvePostAnalysisAction('final', true)).toBe('open_voice');
  });

  it('finalizes when the final checkpoint has no follow-up', () => {
    expect(resolvePostAnalysisAction('final', false)).toBe('finalize');
  });

  it('advances when a non-final checkpoint has no follow-up', () => {
    expect(resolvePostAnalysisAction('partial', false)).toBe('advance');
    expect(resolvePostAnalysisAction(null, false)).toBe('advance');
  });
});
