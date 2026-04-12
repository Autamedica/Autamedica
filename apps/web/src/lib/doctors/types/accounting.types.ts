/**
 * Layer 1: Types — Doctor Accounting Module
 * Typed interfaces for the Argentine tax system (Monotributo / Responsable Inscripto)
 */

export type TaxRegime = 'monotributo' | 'responsable_inscripto';
export type MonotributoCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K';
export type InvoiceType = 'A' | 'B' | 'C' | 'M' | 'E';
export type IncomeSource = 'consulta_particular' | 'obra_social' | 'prepaga' | 'clinica' | 'otro';
export type ExpenseCategory = 'alquiler' | 'insumos' | 'equipamiento' | 'formacion' | 'seguros' | 'transporte' | 'servicios' | 'honorarios_contador' | 'otro';
export type ObligationType = 'monotributo_cuota' | 'iva_ddjj' | 'ganancias_anticipo' | 'ganancias_anual' | 'iibb' | 'autonomos' | 'recategorizacion';
export type ObligationStatus = 'pending' | 'paid' | 'overdue' | 'exempt';

export interface DoctorFiscalProfile {
  id: string;
  doctorId: string;
  taxRegime: TaxRegime;
  cuit: string;
  monotributoCategory: MonotributoCategory | null;
  iibbNumber: string | null;
  iibbJurisdiction: string;
  iibbConvenioMultilateral: boolean;
  invoiceType: InvoiceType;
  fiscalStartDate: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeRecord {
  id: string;
  doctorId: string;
  fiscalProfileId: string;
  periodYear: number;
  periodMonth: number;
  source: IncomeSource;
  sourceName: string | null;
  description: string | null;
  grossAmount: number; // centavos
  taxWithheld: number;
  netAmount: number;
  invoiceNumber: string | null;
  invoiceType: InvoiceType | null;
  invoiceDate: string | null;
  appointmentId: string | null;
  prescriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  doctorId: string;
  fiscalProfileId: string;
  periodYear: number;
  periodMonth: number;
  category: ExpenseCategory;
  description: string;
  amount: number; // centavos
  ivaAmount: number;
  deductible: boolean;
  receiptUrl: string | null;
  supplierCuit: string | null;
  supplierName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxObligation {
  id: string;
  doctorId: string;
  fiscalProfileId: string;
  periodYear: number;
  periodMonth: number;
  obligationType: ObligationType;
  amount: number; // centavos
  dueDate: string;
  paid: boolean;
  paidDate: string | null;
  paidAmount: number | null;
  paymentReference: string | null;
  status: ObligationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalSummary {
  id: string;
  doctorId: string;
  fiscalProfileId: string;
  periodYear: number;
  periodMonth: number;
  totalIncome: number;
  totalExpenses: number;
  totalIvaDebito: number;
  totalIvaCredito: number;
  ivaBalance: number;
  totalRetenciones: number;
  netResult: number;
  accumulatedAnnualIncome: number;
  monotributoCategorySuggested: MonotributoCategory | null;
  recategorizationNeeded: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Monotributo 2026 reference data ──

export interface MonotributoCategoryInfo {
  category: MonotributoCategory;
  maxAnnualIncome: number; // centavos
  monthlyFee: number; // centavos (servicios)
  servicesOnly: boolean; // categorías I-K antes eran solo bienes
}

export const MONOTRIBUTO_CATEGORIES_2026: MonotributoCategoryInfo[] = [
  { category: 'A', maxAnnualIncome: 1_027_798_813, monthlyFee: 4_238_674, servicesOnly: false },
  { category: 'B', maxAnnualIncome: 1_506_268_414, monthlyFee: 4_825_078, servicesOnly: false },
  { category: 'C', maxAnnualIncome: 2_111_754_257, monthlyFee: 5_650_185, servicesOnly: false },
  { category: 'D', maxAnnualIncome: 2_621_550_997, monthlyFee: 6_890_000, servicesOnly: false },
  { category: 'E', maxAnnualIncome: 3_083_668_496, monthlyFee: 9_450_000, servicesOnly: false },
  { category: 'F', maxAnnualIncome: 3_864_488_328, monthlyFee: 12_780_000, servicesOnly: false },
  { category: 'G', maxAnnualIncome: 4_621_846_775, monthlyFee: 15_340_000, servicesOnly: false },
  { category: 'H', maxAnnualIncome: 7_011_358_955, monthlyFee: 26_850_000, servicesOnly: false },
  { category: 'I', maxAnnualIncome: 7_811_000_000, monthlyFee: 82_480_226, servicesOnly: false },
  { category: 'J', maxAnnualIncome: 9_450_000_000, monthlyFee: 99_900_765, servicesOnly: false },
  { category: 'K', maxAnnualIncome: 10_835_708_405, monthlyFee: 138_168_790, servicesOnly: false },
];

// ── RI tax rates ──

export const GANANCIAS_BRACKETS_2026 = [
  { from: 0, to: 1_000_000_00, rate: 0.05 },
  { from: 1_000_000_00, to: 2_000_000_00, rate: 0.09 },
  { from: 2_000_000_00, to: 3_000_000_00, rate: 0.12 },
  { from: 3_000_000_00, to: 6_000_000_00, rate: 0.15 },
  { from: 6_000_000_00, to: 12_000_000_00, rate: 0.19 },
  { from: 12_000_000_00, to: 24_000_000_00, rate: 0.23 },
  { from: 24_000_000_00, to: 48_000_000_00, rate: 0.27 },
  { from: 48_000_000_00, to: 96_000_000_00, rate: 0.31 },
  { from: 96_000_000_00, to: Infinity, rate: 0.35 },
];

export const IVA_RATE = 0.21;
export const IIBB_RATE_DEFAULT = 0.035; // 3.5% CABA
