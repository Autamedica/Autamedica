export interface MedicalHistoryCondition {
    id: string;
    name: string;
    onset_date?: string;
    created_at: string;
    status: string;
    severity: string;
    notes?: string;
}

export interface MedicalAllergy {
    id: string;
    allergen: string;
    onset_date?: string;
    created_at: string;
    allergen_type: string;
    reaction_description?: string;
    severity: string;
}

export interface PatientMedication {
    id: string;
    name: string;
    start_date: string;
    dosage: string;
    frequency: string;
    status: string;
}

export interface MedicalProcedure {
    id: string;
    name: string;
    performed_date: string;
    indication?: string;
    outcome?: string;
}

export interface MedicalEncounter {
    id: string;
    created_at: string;
    reason: string;
    location?: string;
}

export interface Immunization {
    id: string;
    administered_date: string;
    vaccine: string;
    dose?: string;
}

export interface MedicalHistoryTimeline {
    patient_id?: string;
    sections: {
        conditions: MedicalHistoryCondition[];
        allergies: MedicalAllergy[];
        medications: PatientMedication[];
        procedures: MedicalProcedure[];
        encounters: MedicalEncounter[];
        immunizations: Immunization[];
    };
}

export interface MedicalHistorySummary {
    patient_id?: string;
    active_conditions_count: number;
    active_medications_count: number;
    known_allergies_count: number;
    last_encounter_date?: string;
    critical_allergies: string[];
    chronic_conditions: string[];
    current_medications: string[];
}
