import type { DashboardSummary } from '@/types/dashboard-summary';
import type {
  PatientAiInsightRecord,
  PatientDeterministicAlert,
} from '@/types/patient-snapshot';

export interface DashboardViewData {
  summary: DashboardSummary;
  alerts: PatientDeterministicAlert[];
  missingSections: string[];
  latestInsight: PatientAiInsightRecord | null;
}

export interface DashboardViewResponse {
  success: boolean;
  data?: DashboardViewData;
  error?: string;
}
