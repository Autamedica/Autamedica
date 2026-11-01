import { useEffect, useState } from 'react';

type PaymentSummary = {
  currency: 'BRL' | 'ARS';
  approved_records: number;
  pending_records: number;
  refunded_records: number;
  approved_with_provider_id: number;
  approved_without_provider_id: number;
  approved_minor_units: number | null;
  settled_revenue_minor_units: null;
};
type CommercialMetrics = {
  snapshot_at: string;
  patient_records: number;
  patient_records_30d: number;
  appointments_total: number;
  appointments_30d: number;
  appointments_by_status: { completed: number; no_show: number; cancelled: number; payment_pending: number };
  crm_accounts: number;
  crm_opportunities: number;
  lead_records: number;
  payment_rows_total: number;
  payment_summaries: PaymentSummary[] | null;
  measurement_status: Record<string, string>;
  warnings: string[];
};

function currencyLabel(currency: PaymentSummary['currency'], amount: number | null) {
  if (amount === null) return 'NO MEDIBLE';
  const locale = currency === 'BRL' ? 'pt-BR' : 'es-AR';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
}

function Metric({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <dt className="text-sm font-semibold text-slate-600">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{typeof value === 'number' ? value.toLocaleString('es-AR') : value}</dd>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

export function CommercialIntelligenceDashboard() {
  const [metrics, setMetrics] = useState<CommercialMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/commercial-intelligence', {
        credentials: 'same-origin', cache: 'no-store',
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Acceso reservado a administradores.' : 'No se pudieron consultar los indicadores.');
      setMetrics(await res.json() as CommercialMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron consultar los indicadores.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Estados operativos. No equivalen a ingresos conciliados ni a pacientes adquiridos por publicidad.</p>
        <button onClick={() => void refresh()} disabled={loading} type="button"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {!metrics && loading && <p role="status" className="text-slate-600">Consultando indicadores…</p>}
      {metrics && (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Pacientes registrados" value={metrics.patient_records} note={`Altas en tabla patients, no atribuibles a un canal. Últimos 30 días: ${metrics.patient_records_30d}.`} />
            <Metric label="Citas registradas" value={metrics.appointments_total} note={`Histórico sin eliminadas. Últimos 30 días: ${metrics.appointments_30d}.`} />
            <Metric label="Citas completadas" value={metrics.appointments_by_status.completed} note="Estado completed, no implica automáticamente pago confirmado." />
            <Metric label="Oportunidades B2B" value={metrics.crm_opportunities} note={`${metrics.crm_accounts} cuentas importadas; no equivalen a decisores contactados.`} />
          </dl>
          <section aria-labelledby="status-title" className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 id="status-title" className="text-xl font-semibold text-slate-900">Estados actuales de las citas</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-4">
              {([
                ['Completadas', metrics.appointments_by_status.completed],
                ['No asistió (sin validar)', metrics.appointments_by_status.no_show],
                ['Canceladas', metrics.appointments_by_status.cancelled],
                ['Pago pendiente', metrics.appointments_by_status.payment_pending],
              ] as const).map(([label, amount]) => (
                <div key={label} className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{amount.toLocaleString('es-AR')}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-600">
              La función automática de ausencias puede marcar citas por vencimiento horario.
              Revisar actividad médica y transacciones antes de interpretar esto como abandono del paciente.
            </p>
          </section>
          <section aria-labelledby="payments-title" className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 id="payments-title" className="text-xl font-semibold text-slate-900">Pagos por moneda — sin mezclar BRL y ARS</h2>
            <p className="mt-2 text-sm text-amber-800">Aprobado en base de datos ≠ liquidación bancaria verificada. No declarar estos importes como facturación ni margen.</p>
            {metrics.payment_summaries ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700"><tr>
                    <th scope="col" className="px-4 py-3">Moneda</th>
                    <th scope="col" className="px-4 py-3">Aprobados</th>
                    <th scope="col" className="px-4 py-3">Sin ID de proveedor</th>
                    <th scope="col" className="px-4 py-3">Pendientes</th>
                    <th scope="col" className="px-4 py-3">Devueltos</th>
                    <th scope="col" className="px-4 py-3">Importe aprobado no conciliado</th>
                  </tr></thead>
                  <tbody>
                    {metrics.payment_summaries.map(p => <tr key={p.currency} className="border-b border-slate-100">
                      <th scope="row" className="px-4 py-3 font-semibold">{p.currency}</th>
                      <td className="px-4 py-3">{p.approved_records}</td>
                      <td className="px-4 py-3">{p.approved_without_provider_id}</td>
                      <td className="px-4 py-3">{p.pending_records}</td>
                      <td className="px-4 py-3">{p.refunded_records}</td>
                      <td className="px-4 py-3 font-medium">{currencyLabel(p.currency, p.approved_minor_units)}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-4 text-sm font-semibold text-amber-800">NO MEDIBLE: el volumen superó el límite de consulta segura; requiere agregación SQL en servidor.</p>}
          </section>
          <section aria-labelledby="metrics-title" className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 id="metrics-title" className="text-xl font-semibold text-slate-900">Indicadores no conciliados</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(metrics.measurement_status).map(([metric]) => (
                <div key={metric} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm">
                  <span className="text-slate-700">{metric.replaceAll('_', ' ')}</span>
                  <span className="font-semibold text-amber-800">NO MEDIBLE</span>
                </div>
              ))}
            </div>
          </section>
          <p className="text-xs text-slate-500">
            Última consulta: {new Date(metrics.snapshot_at).toLocaleString('es-AR')}. Origen: Supabase.
            Sin datos clínicos individuales ni identificadores de pacientes.
          </p>
        </>
      )}
    </div>
  );
}
