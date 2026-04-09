/**
 * Neuro Scoring Engine - Layer 3 of Autamedica Systemic Architecture.
 * Defines clinical risk thresholds for CNS Stimulants continuity (Medvi LATAM Model).
 * Covers: ADHD, Narcolepsy, and other high-complexity neuro-treatments.
 */

export type StabilityScore = "GREEN" | "YELLOW" | "RED";

export interface ScoringResult {
  score: StabilityScore;
  reasons: string[];
  requiresManualReview: boolean;
}

export interface NeuroStabilityReportContent extends ScoringResult {
  prescription_snapshot?: {
    id: string;
    source: "prescriptions_core" | "legacy";
    medication_name: string;
    dosage: string | null;
    diagnosis: string | null;
    prescribed_date: string;
    issuance_status: string | null;
    has_verifiable_artifact: boolean;
  };
  vitals_snapshot?: {
    bloodPressure?: string | null;
    heartRate?: number | null;
    weight?: number | null;
  };
  extraction_id: string;
  computed_at: string;
}

// --- Clinical Gold Rules (Argentina/International Protocols) ---
const THRESHOLDS = {
  BLOOD_PRESSURE: {
    MAX_SYSTOLIC: 135, // mmHg
    MAX_DIASTOLIC: 85, // mmHg
    DANGER_SYSTOLIC: 145,
    DANGER_DIASTOLIC: 95,
  },
  HEART_RATE: {
    MAX_NORMAL: 95, // bpm
    DANGER: 110,
  },
  WEIGHT_LOSS: {
    MAX_MONTHLY_KG: 2.5,
  },
  ADHERENCE: {
    MIN_PERCENTAGE: 80,
  },
};

const SCORE_SEVERITY: Record<StabilityScore, number> = {
  GREEN: 0,
  YELLOW: 1,
  RED: 2,
};

export interface ScorableData {
  vitals?: {
    bloodPressure?: string | null;
    heartRate?: number | null;
    weight?: number | null;
  };
  sideEffects?: Array<{ severity: number }>;
  redFlags?: {
    suicidalIdeation: boolean;
    doseEscalation: boolean;
  };
}

export class NeuroScoringEngine {
  /**
   * Computes the stability score based on extracted anamnesis data.
   */
  static compute(data: ScorableData): ScoringResult {
    const reasons: string[] = [];
    let currentScore: StabilityScore = "GREEN";

    const setScore = (newScore: StabilityScore) => {
      if (SCORE_SEVERITY[newScore] > SCORE_SEVERITY[currentScore]) {
        currentScore = newScore;
      }
    };

    // 1. Validate Blood Pressure
    const bpString = data.vitals?.bloodPressure;
    const [sys, dia] = this.parseBP(bpString || "");

    if (
      sys >= THRESHOLDS.BLOOD_PRESSURE.DANGER_SYSTOLIC ||
      dia >= THRESHOLDS.BLOOD_PRESSURE.DANGER_DIASTOLIC
    ) {
      setScore("RED");
      reasons.push("Hipertensión nivel de riesgo detectada.");
    } else if (
      sys > THRESHOLDS.BLOOD_PRESSURE.MAX_SYSTOLIC ||
      dia > THRESHOLDS.BLOOD_PRESSURE.MAX_DIASTOLIC
    ) {
      setScore("YELLOW");
      reasons.push("Presión arterial ligeramente elevada.");
    }

    // 2. Validate Heart Rate
    const hr = data.vitals?.heartRate;
    if (hr && hr >= THRESHOLDS.HEART_RATE.DANGER) {
      setScore("RED");
      reasons.push("Taquicardia severa reportada.");
    } else if (hr && hr > THRESHOLDS.HEART_RATE.MAX_NORMAL) {
      setScore("YELLOW");
      reasons.push("Frecuencia cardíaca por encima del promedio.");
    }

    // 3. Side Effects Assessment (Simplified for CNS Stimulants)
    if (data.sideEffects?.some((se) => se.severity >= 4)) {
      setScore("RED");
      reasons.push("Efectos secundarios de alta severidad reportados.");
    }

    // 4. Red Flags (Mood/Abuse/Safety)
    if (data.redFlags?.suicidalIdeation || data.redFlags?.doseEscalation) {
      setScore("RED");
      reasons.push("Alerta de seguridad: Requiere intervención inmediata.");
    }

    return {
      score: currentScore,
      reasons,
      requiresManualReview: currentScore !== "GREEN",
    };
  }

  private static parseBP(bpString: string): [number, number] {
    if (!bpString) return [0, 0];
    const parts = bpString.split("/").map(Number);
    return [parts[0] || 0, parts[1] || 0];
  }
}
