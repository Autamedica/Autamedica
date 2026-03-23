# Glosario Personas - Entidades de Usuarios

## 🎯 Propósito

Tipos y contratos para todas las entidades de personas en Autamedica: pacientes, médicos, usuarios base.

---

## Usuario Base

```typescript
export interface User {
  id: UUID;
  email: string;
  role: "admin" | "staff" | "doctor" | "patient";
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

---

## Paciente

```typescript
export interface Patient {
  id: PatientId;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth: ISODateString;
  medicalRecordNumber: string;
  emergencyContact?: EmergencyContact;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}
```

### Utilidades de Pacientes

```typescript
// Cálculos de salud y riesgo
export const calculateBMI: (heightCm: number, weightKg: number) => number;
export const calculateAge: (birthDate: ISODateString) => number;

// Evaluación de riesgo médico
export const calculateRiskLevel: (patient: Patient) => RiskLevel;
export const hasActiveAllergies: (patient: Patient) => boolean;
export const isHighRiskPatient: (patient: Patient) => boolean;
export const requiresSpecializedCare: (patient: Patient) => boolean;

// Elegibilidad de servicios
export const canReceiveTelemedicine: (patient: Patient) => boolean;

// Utilidades de perfiles de pacientes
export const generatePatientDisplayName: (patient: Patient) => string;
export const createPatientPublicProfile: (patient: Patient) => PatientPublicProfile;
export const createMedicalView: (patient: Patient) => PatientMedicalView;
export const extractPatientPrivateData: (patient: Patient) => PatientPrivateData;

// Validaciones de cobertura
export const isPublicHealthcareEligible: (patient: Patient) => boolean;
export const isPAMIEligible: (patient: Patient) => boolean;
export const hasInsuranceCoverage: (patient: Patient, treatment: string) => boolean;
```

---

## Doctor

```typescript
export interface Doctor {
  id: DoctorId;
  firstName: string;
  lastName: string;
  email: string;
  specialization: string;
  licenseNumber: string;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

### Sistema de Especialidades Médicas

```typescript
// Catálogos de especialidades y certificaciones
export const MEDICAL_SPECIALTIES: readonly MedicalSpecialty[];
export const SUBSPECIALTIES: readonly MedicalSubspecialty[];
export const CERTIFICATION_TYPES: readonly CertificationType[];

// Estados de licencias médicas
export const LICENSE_STATUS: readonly LicenseStatus[];

// Validators de especialidades
export const isValidSpecialtyCode: (code: string) => boolean;
export const isValidSubspecialtyCode: (code: string) => boolean;

// Validators de licencias médicas
export const isValidMedicalLicense: (license: string) => boolean;
export const isActiveLicense: (license: MedicalLicense) => boolean;
export const isValidCertification: (cert: Certification) => boolean;

// Utilidades de especialidades
export const getSpecialtiesRequiring: (requirement: string) => MedicalSpecialty[];
export const getAvailableSubspecialties: (specialtyCode: string) => MedicalSubspecialty[];
export const getSpecialtiesByCategory: (category: string) => MedicalSpecialty[];
export const createBasicSpecialty: (code: string, name: string) => MedicalSpecialty;

// Utilidades de licencias médicas
export const formatMedicalLicense: (license: string) => string;
export const extractProvinceFromLicense: (license: string) => string;
export const createMedicalLicense: (province: string, number: string) => MedicalLicense;

// Validaciones de práctica médica
export const canPracticeSpecialty: (doctor: Doctor, specialty: string) => boolean;
export const canPracticeInArgentina: (license: MedicalLicense) => boolean;
export const isDoctorLicenseActive: (doctor: Doctor) => boolean;
export const isDoctorProfileComplete: (doctor: Doctor) => boolean;

// Cálculos médicos
export const calculateTotalTrainingYears: (doctor: Doctor) => number;
export const calculateYearsOfExperience: (doctor: Doctor) => number;

// Utilidades de perfiles
export const generateDisplayName: (firstName: string, lastName: string) => string;
```

### Validaciones Médicas y Profesionales

```typescript
// Validaciones de práctica médica
export const acceptsInsurancePlan: (doctor: Doctor, planId: string) => boolean;
export const isAvailableOnDay: (doctor: Doctor, date: ISODateString) => boolean;

// Validaciones de datos médicos
export const isValidTimeHHmm: (time: string) => boolean;
export const isValidDNI: (dni: string) => boolean;
export const isValidDoctorEmail: (email: string) => boolean;
export const isValidDoctorURL: (url: string) => boolean;
export const isValidBloodType: (bloodType: string) => boolean;

// Utilidades de perfiles médicos
export const createPublicProfile: (doctor: Doctor) => DoctorPublicProfile;
export const extractPrivateData: (doctor: Doctor) => DoctorPrivateData;
```

---

## Sistema de Reviews y Ratings

```typescript
// Constantes de configuración de reviews
export const REVIEW_WINDOW_DAYS: number;

// Validaciones de ratings
export const isValidRatingScore: (score: number) => boolean;
export const canSubmitReview: (patient: Patient, doctor: Doctor) => boolean;

// Cálculos de métricas de reviews
export const calculatePatientReviewsScore: (reviews: Review[]) => number;
export const calculateReviewsBreakdown: (reviews: Review[]) => ReviewBreakdown;
export const calculateVolumeScore: (doctor: Doctor) => number;
export const calculateRecognitionScore: (doctor: Doctor) => number;
export const calculateOverallRating: (doctor: Doctor) => number;
export const calculateMonthsActive: (doctor: Doctor) => number;
export const calculateVolumePercentile: (doctor: Doctor) => number;

// Utilidades de reconocimiento
export const isEligibleForRecognition: (doctor: Doctor) => boolean;
export const createRatingDisplay: (rating: number) => RatingDisplay;
export const getRecognitionBadgeText: (level: RecognitionLevel) => string;
```

---

## Sistema de Seguros Argentinos

```typescript
// Catálogo de obras sociales y seguros
export const ARGENTINA_INSURANCE_PROVIDERS: readonly InsuranceProvider[];
```

---

## Cita Médica (Appointment)

```typescript
export interface Appointment {
  id: AppointmentId;
  patientId: PatientId;
  doctorId: DoctorId;
  startTime: ISODateString;
  duration: number; // minutos
  type: "consultation" | "follow-up" | "emergency";
  status: "scheduled" | "in-progress" | "completed" | "cancelled" | "no-show" | "rescheduled";
  notes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

---

## Registros Médicos (MedicalRecord) ⚕️

### Tipos Base

```typescript
// Visibilidad de registro médico
export type MedicalRecordVisibility =
  | "normal" // Visibilidad estándar según RLS
  | "permanent" // No se aplica data retention (crítico)
  | "private" // Solo doctor que lo creó
  | "care_team" // Equipo médico del paciente
  | "patient" // Paciente puede ver
  | "emergency" // Acceso en emergencias
  | "restricted"; // Solo con autorización explícita

export const MEDICAL_RECORD_VISIBILITIES: readonly MedicalRecordVisibility[];

export type MedicalRecordType = "consultation" | "diagnosis" | "treatment" | "lab_result" | "prescription" | "imaging" | "procedure";
```

### Interfaz Principal

```typescript
/**
 * Registro médico - Refleja esquema de tabla medical_records
 *
 * HIPAA Compliant: Incluye audit trail y soft delete
 * CAMPOS: snake_case para coincidir con BD Supabase
 */
export interface MedicalRecord {
  id: UUID;
  patient_id: UUID | null;
  doctor_id: UUID | null;
  appointment_id: UUID | null;
  type: string; // MedicalRecordType
  title: string; // NOT NULL
  content: Record<string, unknown>; // JSONB NOT NULL
  attachments: Record<string, unknown>[] | null; // JSONB
  visibility: string | null; // MedicalRecordVisibility
  date_recorded: ISODateString | null; // Fecha del evento médico
  created_at: ISODateString | null;
  updated_at: ISODateString | null;
  deleted_at: ISODateString | null; // Soft delete
}

// DTOs para Supabase
export interface MedicalRecordInsert {
  patient_id?: UUID | null;
  doctor_id?: UUID | null;
  appointment_id?: UUID | null;
  type: string; // REQUIRED
  title: string; // REQUIRED
  content: Record<string, unknown>; // REQUIRED
  attachments?: Record<string, unknown>[] | null;
  visibility?: string | null;
  date_recorded?: ISODateString | null;
}

export interface MedicalRecordUpdate {
  patient_id?: UUID | null;
  doctor_id?: UUID | null;
  appointment_id?: UUID | null;
  type?: string;
  title?: string;
  content?: Record<string, unknown>;
  attachments?: Record<string, unknown>[] | null;
  visibility?: string | null;
  date_recorded?: ISODateString | null;
  updated_at?: ISODateString;
  deleted_at?: ISODateString | null; // Para soft delete
}

// Con detalles de relaciones
export interface MedicalRecordWithDetails extends MedicalRecord {
  patient: {
    id: UUID;
    email: string | null;
  } | null;
  doctor: {
    id: UUID;
    specialty: string | null;
    license_number: string;
  } | null;
  appointment: {
    id: UUID;
    start_time: ISODateString;
    type: string | null;
    status: string | null;
  } | null;
  access_log?: {
    id: string;
    user_id: UUID | null;
    action: string;
    created_at: ISODateString;
  }[];
}
```

### Utilidades de MedicalRecord

```typescript
// Type guards
export const isMedicalRecordVisibility: (v: unknown) => v is MedicalRecordVisibility;

// Control de acceso
export const canAccessRecord: (userRole: string, visibility: MedicalRecordVisibility) => boolean;

// Clasificación de sensibilidad
export const isHighSensitivityRecord: (recordType: MedicalRecordType) => boolean;
export const isPermanentRecord: (visibility: string | null) => boolean;
```

**Notas de Seguridad**:

- ✅ HIPAA Compliant: Audit logs automáticos via RLS
- ✅ Soft Delete: `deleted_at` para retención de datos
- ✅ Data Retention: `visibility: "permanent"` previene eliminación automática
- ✅ Access Control: Niveles granulares de visibilidad
- ✅ Immutability: Solo additive updates en `content`

## Reporte de Consulta SOAP (ConsultationReport) 📋

Tipos para reportes clínicos post-consulta formato SOAP, generados por AI cruzando transcripción + anamnesis + notas del doctor.

```typescript
// @autamedica/types — entities/consultation-report.ts

export interface SOAPReport {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface ConsultationReportContent extends SOAPReport {
  chiefComplaint: string | null;
  differentialDiagnosis: string[];
  followUpRecommendations: string[];
  aiGenerated: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  transcriptionWordCount: number;
  anamnesisAvailable: boolean;
  doctorNotes: string | null;
}

export interface GenerateReportRequest {
  transcriptionText: string;
  anamnesisSummary: string | null;
  anamnesisExtraction: Record<string, unknown> | null;
  doctorNotes: string | null;
  patientName: string;
  patientAge: number | null;
  patientGender: string | null;
}

export interface GenerateReportResponse {
  report: SOAPReport;
  chiefComplaint: string | null;
  differentialDiagnosis: string[];
  followUpRecommendations: string[];
  confidence: number;
  provider: string;
  model: string;
}
```

---

**Última actualización**: 2026-03-22
**Mantenido por**: Sistema de validación automática
