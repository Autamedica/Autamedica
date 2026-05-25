import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, fetchApi } from '@/lib/api-client';

interface ClinicalIncidentRow {
  id: string;
  condition_display: string;
  setting: string;
  severity: string;
  status: string;
  sla_deadline: string;
  created_at: string;
}

interface EquipmentRiskRow {
  id: string;
  serial_number: string;
  brand: string;
  model_name: string;
  device_type: string;
  current_status: string;
  current_setting: string;
  next_calibration_due: string;
}

interface CEEDSSummary {
  generatedAt: string;
  clinical: {
    open: number;
    escalated: number;
    slaBreached: number;
    recent: ClinicalIncidentRow[];
  };
  outbox: {
    pending: number;
    failed: number;
  };
  equipment: {
    active: number;
    unavailable: number;
    expiredCalibration: number;
    openIncidents: number;
    atRisk: EquipmentRiskRow[];
  };
}

type EquipmentTargetStatus =
  | 'active'
  | 'review_required'
  | 'under_maintenance'
  | 'validation_pending'
  | 'decommissioned';

interface EquipmentActionDraft {
  targetStatus: EquipmentTargetStatus;
  notes: string;
  calibrationCertificateUrl: string;
}

const EQUIPMENT_STATUS_OPTIONS: Array<{ value: EquipmentTargetStatus; label: string }> = [
  { value: 'review_required', label: 'Revisar' },
  { value: 'under_maintenance', label: 'Mantenimiento' },
  { value: 'validation_pending', label: 'Validar' },
  { value: 'active', label: 'Activar' },
  { value: 'decommissioned', label: 'Retirar' },
];

function dateTime(value: string): string {
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'red' | 'amber' | 'emerald';
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-950',
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };

  return (
    <div className={`rounded-md border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function CEEDSDashboard() {
  const [data, setData] = useState<CEEDSSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equipmentDrafts, setEquipmentDrafts] = useState<Record<string, EquipmentActionDraft>>({});
  const [equipmentSavingId, setEquipmentSavingId] = useState<string | null>(null);
  const [equipmentMessage, setEquipmentMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchApi<CEEDSSummary>('/api/admin/clinical-safety-summary'));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? 'Tu usuario no tiene permisos para ver CEEDS.'
          : err instanceof Error
            ? err.message
            : 'No se pudo cargar CEEDS.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const getDraft = useCallback((equipment: EquipmentRiskRow): EquipmentActionDraft => {
    return equipmentDrafts[equipment.id] ?? {
      targetStatus: equipment.current_status === 'active' ? 'review_required' : 'active',
      notes: '',
      calibrationCertificateUrl: '',
    };
  }, [equipmentDrafts]);

  const updateDraft = useCallback((equipment: EquipmentRiskRow, patch: Partial<EquipmentActionDraft>) => {
    setEquipmentDrafts((current) => ({
      ...current,
      [equipment.id]: {
        targetStatus: equipment.current_status === 'active' ? 'review_required' : 'active',
        notes: '',
        calibrationCertificateUrl: '',
        ...current[equipment.id],
        ...patch,
      },
    }));
  }, []);

  const submitEquipmentAction = useCallback(async (equipment: EquipmentRiskRow) => {
    const draft = getDraft(equipment);
    setEquipmentSavingId(equipment.id);
    setEquipmentMessage(null);
    try {
      await fetchApi('/api/admin/clinical-safety-equipment-status', {
        method: 'POST',
        body: {
          equipmentId: equipment.id,
          targetStatus: draft.targetStatus,
          notes: draft.notes,
          calibrationCertificateUrl: draft.calibrationCertificateUrl.trim() || undefined,
        },
      });
      setEquipmentDrafts((current) => {
        const next = { ...current };
        delete next[equipment.id];
        return next;
      });
      setEquipmentMessage('Estado de equipo actualizado.');
      await load();
    } catch (err) {
      setEquipmentMessage(
        err instanceof Error ? err.message : 'No se pudo actualizar el estado del equipo.'
      );
    } finally {
      setEquipmentSavingId(null);
    }
  }, [getDraft, load]);

  if (loading && !data) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-5 text-red-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <p className="font-semibold">CEEDS no disponible</p>
        </div>
        <p className="mt-2 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const clinicalRisk = data.clinical.slaBreached > 0 || data.clinical.escalated > 0;
  const equipmentRisk = data.equipment.expiredCalibration > 0 || data.equipment.unavailable > 0;
  const outboxRisk = data.outbox.failed > 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
            <h3 className="text-lg font-semibold text-slate-950">CEEDS operativo</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Seguridad clínica, outbox e inventario biomédico. Última lectura: {dateTime(data.generatedAt)}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Incidentes abiertos" value={data.clinical.open} tone={clinicalRisk ? 'amber' : 'slate'} />
        <StatCard label="SLA vencidos" value={data.clinical.slaBreached} tone={data.clinical.slaBreached > 0 ? 'red' : 'emerald'} />
        <StatCard label="Outbox pendiente" value={data.outbox.pending} tone={data.outbox.failed > 0 ? 'red' : 'slate'} />
        <StatCard label="Equipos bloqueados" value={data.equipment.unavailable} tone={equipmentRisk ? 'amber' : 'emerald'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-rose-700" />
              <h4 className="font-semibold text-slate-950">Incidentes clínicos activos</h4>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${clinicalRisk ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {data.clinical.escalated} escalados
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {data.clinical.recent.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Sin incidentes clínicos abiertos.</p>
            ) : data.clinical.recent.map((incident) => (
              <div key={incident.id} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-semibold text-slate-950">{incident.condition_display}</p>
                  <p className="text-xs text-slate-500">
                    {incident.setting} · {incident.severity} · {incident.status}
                  </p>
                </div>
                <p className="font-mono text-xs text-slate-600">SLA {dateTime(incident.sla_deadline)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <ServerCog className="h-5 w-5 text-sky-700" />
              <h4 className="font-semibold text-slate-950">Equipamiento en riesgo</h4>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${equipmentRisk ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {data.equipment.openIncidents} tickets
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {data.equipment.atRisk.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Sin equipos bloqueados ni calibración vencida.</p>
            ) : data.equipment.atRisk.map((equipment) => (
              <div key={equipment.id} className="grid gap-3 px-5 py-4 text-sm">
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {equipment.brand} {equipment.model_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {equipment.serial_number} · {equipment.device_type} · {equipment.current_setting}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-semibold text-slate-700">{equipment.current_status}</p>
                      <p className="font-mono text-xs text-slate-500">Cal. {dateTime(equipment.next_calibration_due)}</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 lg:grid-cols-[150px_1fr]">
                  <select
                    value={getDraft(equipment).targetStatus}
                    onChange={(event) => updateDraft(equipment, {
                      targetStatus: event.target.value as EquipmentTargetStatus,
                    })}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
                  >
                    {EQUIPMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    value={getDraft(equipment).notes}
                    onChange={(event) => updateDraft(equipment, { notes: event.target.value })}
                    placeholder="Nota operativa"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                {getDraft(equipment).targetStatus === 'active' && (
                  <input
                    value={getDraft(equipment).calibrationCertificateUrl}
                    onChange={(event) => updateDraft(equipment, {
                      calibrationCertificateUrl: event.target.value,
                    })}
                    placeholder="URL del certificado de calibración"
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-800 placeholder:text-slate-400"
                  />
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void submitEquipmentAction(equipment)}
                    disabled={equipmentSavingId === equipment.id || getDraft(equipment).notes.trim().length < 3}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Save className="h-4 w-4" />
                    {equipmentSavingId === equipment.id ? 'Guardando' : 'Guardar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {equipmentMessage && (
            <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{equipmentMessage}</p>
          )}
        </div>
      </div>

      {(outboxRisk || data.outbox.pending > 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <ClipboardCheck className="h-4 w-4" />
            Outbox clínico
          </div>
          <p className="mt-1">
            Pendientes: {data.outbox.pending}. Fallidos: {data.outbox.failed}. Revisar worker si los fallidos crecen.
          </p>
        </div>
      )}
    </section>
  );
}
