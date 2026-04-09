'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
import { formatDate } from '@/lib/date-utils';

const RELEVANCE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  routine: { label: 'Rutina', color: 'text-stone-600', bg: 'bg-stone-100' },
  new_symptom: { label: 'Síntoma nuevo', color: 'text-red-700', bg: 'bg-red-50' },
  follow_up: { label: 'Seguimiento', color: 'text-amber-700', bg: 'bg-amber-50' },
  emergency: { label: 'Emergencia', color: 'text-red-800', bg: 'bg-red-100' },
};

export interface VersionEntry {
  id: string;
  version_number: number;
  trigger: string;
  relevance: string | null;
  changes_summary: { added: string[]; modified: string[]; unchanged: string[] } | null;
  pdf_filename: string | null;
  notes: string | null;
  created_at: string;
}

export function VersionTimeline({ onDownload }: { onDownload: (version?: number) => void }) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchApi<{ versions?: VersionEntry[] }>('/api/patients/anamnesis/versions', {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        const list = data?.versions ?? [];
        setVersions(Array.isArray(list) ? list : []);
        setLoaded(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        logger.warn('[VersionTimeline] Failed to load versions', err);
        setLoaded(true);
      });

    return () => controller.abort();
  }, []);

  if (!loaded || versions.length === 0) return null;

  return (
    <details className="group">
      <summary className="flex cursor-pointer items-center justify-between rounded-xl px-1 py-2 text-xs font-semibold text-stone-500 hover:text-stone-600">
        <span>Historial de versiones</span>
        <span className="text-[10px] group-open:hidden">{versions.length}</span>
      </summary>
      <div className="space-y-0 pt-2">
        {versions.map((v, i) => {
          const rel = RELEVANCE_CONFIG[v.relevance ?? 'routine'] ?? RELEVANCE_CONFIG.routine;
          const date = formatDate(v.created_at);
          const isFirst = v.version_number === 1;
          const isLast = i === 0;

          return (
            <div key={v.id} className="flex gap-3 relative">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className={`h-3 w-3 rounded-full ring-2 ring-white ${isLast ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                {i < versions.length - 1 && <div className="w-0.5 flex-1 bg-stone-200" />}
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-800">
                    V{v.version_number} — {date}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rel.bg} ${rel.color}`}>
                    {isFirst ? 'Primera consulta' : rel.label}
                  </span>
                </div>

                {v.changes_summary && !isFirst && (
                  <p className="mt-0.5 text-xs text-stone-500">
                    {[
                      v.changes_summary.added.length > 0 && `${v.changes_summary.added.length} nuevas`,
                      v.changes_summary.modified.length > 0 && `${v.changes_summary.modified.length} actualizadas`,
                    ].filter(Boolean).join(', ') || 'Sin cambios'}
                  </p>
                )}

                {v.notes && (
                  <p className="mt-0.5 text-xs text-stone-500 italic">"{v.notes}"</p>
                )}

                <button
                  onClick={() => onDownload(v.version_number)}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-700"
                >
                  <Download className="h-3 w-3" /> Descargar PDF
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
