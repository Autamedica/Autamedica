export type BrazilPrescriptionModel =
  | 'simples'
  | 'controle_especial'
  | 'antimicrobiano'
  | 'notificacao_a'
  | 'notificacao_b';

export interface BrazilPatientInfo {
  name: string;
  cpf: string;
  cns?: string;
  birthDate?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface BrazilPrescriberInfo {
  name: string;
  crm: string;
  uf: string;
  rqe?: string;
  cpf: string;
  specialty?: string;
  address?: string;
  signatureImageUrl?: string;
}

export interface BrazilMedicationItem {
  genericName: string;         // DCB
  commercialName?: string;
  registroAnvisa?: string;
  dosage: string;
  presentation: string;
  quantity: number;
  instructions: string;
  isContinuousUse?: boolean;
}

export interface BrazilPrescriptionInput {
  prescriptionId: string;
  model: BrazilPrescriptionModel;
  patient: BrazilPatientInfo;
  prescriber: BrazilPrescriberInfo;
  medications: BrazilMedicationItem[];
  diagnosis?: string;
  notes?: string;
  issuedAt: string;
  expiresAt: string;
  itiValidationUrl?: string;
}
