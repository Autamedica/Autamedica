/**
 * Hook: Prescriptions Core — typed with @autamedica/prescriptions models.
 * Consumes the SAME endpoints as usePrescriptions but returns IssuedPrescription[].
 */
import { useState, useEffect, useCallback } from 'react';
import { logger } from '@autamedica/shared';
import type { IssuedPrescription } from '@autamedica/prescriptions';
import type { Prescription } from '@/lib/doctors/types/medical';
import { mapLegacyToCore } from '@/lib/doctors/types/prescription-core.dto';

interface PrescriptionCoreFilters {
  status?: string;
  medicationName?: string;
  activeOnly?: boolean;
}

interface IssuanceResult {
  cuir: string;
  qrContent: string;
  signedPdfUrl: string | null;
  issuedAt: string;
  expiresAt: string;
}

interface UsePrescriptionsCoreResult {
  prescriptions: IssuedPrescription[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createDraft: (data: Record<string, unknown>) => Promise<string>;
  updatePrescription: (id: string, updates: Record<string, unknown>) => Promise<void>;
  issuePrescription: (id: string) => Promise<IssuanceResult>;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

const PRESCRIPTIONS_CHANGED_EVENT = 'medical-prescriptions:changed';

function buildQueryString(patientId: string, filters?: PrescriptionCoreFilters): string {
  const params = new URLSearchParams({ patientId });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.medicationName) params.set('medicationName', filters.medicationName);
  if (filters?.activeOnly) params.set('activeOnly', 'true');
  return params.toString();
}

function mapResponseToCore(legacyList: Prescription[]): IssuedPrescription[] {
  return legacyList.map(mapLegacyToCore);
}

export function usePrescriptionsCore(
  patientId: string | null,
  filters?: PrescriptionCoreFilters,
): UsePrescriptionsCoreResult {
  const [prescriptions, setPrescriptions] = useState<IssuedPrescription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => setIsClient(true), []);

  const filterStatus = filters?.status;
  const filterMedication = filters?.medicationName;
  const filterActive = filters?.activeOnly;

  const fetchPrescriptions = useCallback(async (): Promise<void> => {
    if (!patientId || !isClient) {
      setPrescriptions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const stableFilters: PrescriptionCoreFilters = {
        status: filterStatus,
        medicationName: filterMedication,
        activeOnly: filterActive,
      };
      const qs = buildQueryString(patientId, stableFilters);
      const res = await fetch(`/api/doctors/prescriptions?${qs}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const json = (await res.json()) as ApiEnvelope<Prescription[]>;
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to fetch prescriptions');
      }

      setPrescriptions(mapResponseToCore(json.data));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(`Error al cargar prescripciones: ${message}`);
      logger.error('[usePrescriptionsCore] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [patientId, filterStatus, filterMedication, filterActive, isClient]);

  const createDraft = useCallback(async (data: Record<string, unknown>): Promise<string> => {
    const res = await fetch('/api/doctors/prescriptions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json = (await res.json()) as ApiEnvelope<Prescription>;
    if (!json.success || !json.data) {
      throw new Error(json.error?.message ?? 'Failed to create prescription');
    }

    window.dispatchEvent(new Event(PRESCRIPTIONS_CHANGED_EVENT));
    return json.data.id;
  }, []);

  const updatePrescription = useCallback(async (id: string, updates: Record<string, unknown>): Promise<void> => {
    const res = await fetch(`/api/doctors/prescriptions/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json = (await res.json()) as ApiEnvelope<unknown>;
    if (!json.success) {
      throw new Error(json.error?.message ?? 'Failed to update prescription');
    }

    window.dispatchEvent(new Event(PRESCRIPTIONS_CHANGED_EVENT));
  }, []);

  const issuePrescription = useCallback(async (id: string): Promise<IssuanceResult> => {
    const res = await fetch(`/api/doctors/prescriptions/${id}/issue`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json = (await res.json()) as ApiEnvelope<IssuanceResult>;
    if (!json.success || !json.data) {
      throw new Error(json.error?.message ?? 'Failed to issue prescription');
    }

    window.dispatchEvent(new Event(PRESCRIPTIONS_CHANGED_EVENT));
    return json.data;
  }, []);

  useEffect(() => {
    void fetchPrescriptions();
  }, [fetchPrescriptions]);

  useEffect(() => {
    const handleChanged = (): void => {
      void fetchPrescriptions();
    };

    window.addEventListener(PRESCRIPTIONS_CHANGED_EVENT, handleChanged);
    return () => {
      window.removeEventListener(PRESCRIPTIONS_CHANGED_EVENT, handleChanged);
    };
  }, [fetchPrescriptions]);

  return {
    prescriptions,
    loading,
    error,
    refresh: fetchPrescriptions,
    createDraft,
    updatePrescription,
    issuePrescription,
  };
}
