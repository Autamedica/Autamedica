import type { UUID, PatientId, DoctorId, AppointmentId } from "./ids";
import type { ISODateString } from "./scalars";
import type { EmergencyContact } from "./entities/profiles";

export type { EmergencyContact } from "./entities/profiles";

export interface User {
  id: UUID;
  email: string;
  role: "admin" | "staff" | "doctor" | "patient";
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

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

export interface Appointment {
  id: AppointmentId;
  patientId: PatientId;
  doctorId: DoctorId;
  startTime: ISODateString;
  duration: number; // minutos
<<<<<<< HEAD
  type: "consultation" | "follow_up" | "emergency" | "telemedicine" | "lab_test";
=======
  type: "consultation" | "follow_up" | "emergency";
>>>>>>> 8c1b54d85 (fix(types): consolidate appointment types and align anamnesis sections)
  status: "scheduled" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  notes?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}