'use client';

import { useMedicalHistory } from '@/hooks/useMedicalHistory';
import Link from 'next/link';
import { ArrowRight, Download, Eye, FileText, Loader2 } from 'lucide-react';

const recordTypeConfig = {
  diagnosis: { label: 'Diagnóstico', color: 'bg-blue-50 text-blue-700 border-blue-300' },
  prescription: { label: 'Receta', color: 'bg-purple-50 text-purple-700 border-purple-300' },
  allergy: { label: 'Alergia', color: 'bg-red-50 text-red-700 border-red-300' },
  procedure: { label: 'Procedimiento', color: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
  consultation: { label: 'Consulta', color: 'bg-amber-50 text-amber-700 border-amber-300' },
  encounter: { label: 'Encuentro', color: 'bg-amber-50 text-amber-700 border-amber-300' },
} as const;

interface TimelineRecord {
  id: string;
  kind: keyof typeof recordTypeConfig;
  title: string;
  createdAt: string;
  description?: string;
}

function toTimelineRecords(timeline: ReturnType<typeof useMedicalHistory>['timeline']): TimelineRecord[] {
  if (!timeline) {
    return [];
  }

  return [
    ...timeline.sections.conditions.map((record) => ({
      id: record.id,
      kind: 'diagnosis' as const,
      title: record.name,
      createdAt: record.created_at,
      description: record.notes,
    })),
    ...timeline.sections.medications.map((record) => ({
      id: record.id,
      kind: 'prescription' as const,
      title: record.name,
      createdAt: record.start_date,
      description: `${record.dosage} · ${record.frequency}`,
    })),
    ...timeline.sections.allergies.map((record) => ({
      id: record.id,
      kind: 'allergy' as const,
      title: record.allergen,
      createdAt: record.created_at,
      description: record.reaction_description,
    })),
    ...timeline.sections.procedures.map((record) => ({
      id: record.id,
      kind: 'procedure' as const,
      title: record.name,
      createdAt: record.performed_date,
      description: record.indication ?? record.outcome,
    })),
    ...timeline.sections.encounters.map((record) => ({
      id: record.id,
      kind: 'consultation' as const,
      title: record.reason,
      createdAt: record.created_at,
      description: record.location,
    })),
  ].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export default function MedicalHistoryPage() {
  const { summary, timeline, loading, error } = useMedicalHistory();
  const records = toTimelineRecords(timeline);

  const stats = [
    { key: 'conditions', label: 'Diagnósticos activos', value: summary?.active_conditions_count ?? 0 },
    { key: 'medications', label: 'Medicaciones activas', value: summary?.active_medications_count ?? 0 },
    { key: 'allergies', label: 'Alergias registradas', value: summary?.known_allergies_count ?? 0 },
    { key: 'records', label: 'Eventos en timeline', value: records.length },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-stone-900">Mi Historia Clínica</h1>
        <p className="mt-2 text-stone-600">
          Aquí concentras tu anamnesis, antecedentes y registros clínicos para evitar
          navegar entre secciones repetidas.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-sky-200 bg-sky-50 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-sky-950">Anamnesis</h2>
          <p className="mt-1 text-sm text-sky-800">
            Completa o actualiza tu anamnesis desde aquí. Es parte de tu historia clínica, no una
            sección separada.
          </p>
        </div>
        <Link
          href="/anamnesis"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-800"
        >
          Abrir anamnesis
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {stats.map((item) => (
          <div key={item.key} className="rounded-lg border border-stone-200 bg-white p-6">
            <p className="text-sm text-stone-600">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-stone-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-stone-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando historial médico...
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto mb-4 h-16 w-16 text-stone-300" />
            <h3 className="mb-2 text-lg font-semibold text-stone-900">No fue posible cargar el historial</h3>
            <p className="text-stone-600">{error}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto mb-4 h-16 w-16 text-stone-300" />
            <h3 className="mb-2 text-lg font-semibold text-stone-900">No hay registros médicos</h3>
            <p className="text-stone-600">
              Tus registros aparecerán aquí a medida que avances en consultas y seguimiento.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-200">
            {records.map((record) => {
              const config = recordTypeConfig[record.kind];

              return (
                <div key={record.id} className="p-6 transition-colors hover:bg-stone-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${config.color}`}>
                          {config.label}
                        </span>
                        <span className="text-sm text-stone-600">
                          {new Date(record.createdAt).toLocaleDateString('es-AR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <h3 className="mb-1 font-semibold text-stone-900">{record.title}</h3>
                      {record.description ? (
                        <p className="text-sm text-stone-600">{record.description}</p>
                      ) : null}
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      <button className="rounded-lg p-2 transition-colors hover:bg-stone-200" type="button">
                        <Eye className="h-4 w-4 text-stone-600" />
                      </button>
                      <button className="rounded-lg p-2 transition-colors hover:bg-stone-200" type="button">
                        <Download className="h-4 w-4 text-stone-600" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
