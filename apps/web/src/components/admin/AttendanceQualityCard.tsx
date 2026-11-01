import { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api-client';

interface QualityReport {
  overdueUnverified: number;
  overdueWithApprovedPayment: number;
  historicNoShowWithApprovedPayment: number;
}

export function AttendanceQualityCard() {
  const [data, setData] = useState<QualityReport | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void fetchApi<QualityReport>('/api/admin/finance/attendance-quality')
      .then(setData).catch(() => setError(true));
  }, []);
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
    <h3 className="font-semibold text-amber-950">Control de ausencias y cobros</h3>
    {error ? <p className="text-sm text-amber-900">Datos no disponibles; comprobar acceso del administrador.</p>
      : !data ? <p className="text-sm text-amber-900">Consultando estado real…</p>
      : <div className="grid gap-2 sm:grid-cols-3">
        <div><strong className="text-xl block">{data.overdueUnverified}</strong><span className="text-sm">Citas vencidas pendientes de verificar asistencia</span></div>
        <div><strong className="text-xl block">{data.overdueWithApprovedPayment}</strong><span className="text-sm">De ellas con pago aprobado en base</span></div>
        <div><strong className="text-xl block">{data.historicNoShowWithApprovedPayment}</strong><span className="text-sm">No-show históricos con pago aprobado: revisar caso por caso</span></div>
      </div>}
    <p className="text-xs text-amber-900">No se modificaron citas pasadas. Una ausencia requiere comprobación; un pago aprobado en Supabase no equivale a liquidación bancaria.</p>
  </section>;
}
