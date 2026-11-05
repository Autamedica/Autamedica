import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock3, FileCheck2, RefreshCcw, Receipt, ScanLine, TrendingUp } from 'lucide-react';

type Country = 'BR' | 'AR' | 'UNKNOWN';
type Group = { count: number; amount: number };
type Data = {
  generated_at: string;
  days: number;
  country: Country;
  operational: {
    requests: number; completed_requests: number; expired_requests: number; cancelled_requests: number;
    started_calls_with_timestamp: number; started_within_five_minutes: number;
    wait_p50_minutes: number | null; wait_p90_minutes: number | null;
  };
  appointments: { total: number; completed: number; no_show: number; cancelled: number };
  documents: {
    prescriptions_total: number; prescriptions_draft: number; prescriptions_issued: number;
    certificates_signed: number; completed_appointments_with_issued_prescription: number;
  };
  payments: {
    approved: number; pending: number; refunded: number; approved_without_paid_at: number;
    approved_amount_by_currency: Record<string, Group>;
  };
  referrals: {
    code: string; name: string; active: boolean; requests: number; operationally_completed: number;
    approved_payments: number; eligible_commissions: number;
    eligible_commission_by_currency: Record<string, number>;
  }[];
  quality: {
    unattributed_country_requests: number;
    unattributed_country_appointments: number;
    unattributed_country_appointment_payments: number;
    qr_scan_events_available: boolean;
    clinical_completion_verified: boolean;
  };
  unavailable: { metric: string; reason: string }[];
};

function value(n: number): string {
  return new Intl.NumberFormat('es-AR').format(n);
}
function ratio(n: number, d: number): string {
  return d > 0 ? new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n * 100 / d) + '%' : 'Sin denominador';
}
function amount(n: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(n);
}
function Stat({ label, primary, detail, tone = 'normal' }: {
  label: string; primary: string; detail: string; tone?: 'normal' | 'warning';
}) {
  return (
    <article className={`rounded-xl border bg-white p-5 shadow-sm ${tone === 'warning' ? 'border-amber-200' : 'border-slate-200'}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{primary}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

export function ExecutiveKpiDashboard() {
  const [country, setCountry] = useState<Country>('BR');
  const [days, setDays] = useState(30);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetch(`/api/admin/executive-kpis?country=${country}&days=${days}`, {
        signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!result.ok) throw new Error(result.status === 403 ? 'Acceso administrativo requerido' : 'Los datos no pudieron validarse');
      const payload = await result.json() as Data;
      if (!signal.aborted) setData(payload);
    } catch (cause) {
      if (!signal.aborted) {
        setData(null);
        setError(cause instanceof Error ? cause.message : 'Error al consultar indicadores');
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [country, days]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  const countryOptions: { id: Country; label: string }[] = [
    { id: 'BR', label: 'Brasil' }, { id: 'AR', label: 'Argentina' },
    { id: 'UNKNOWN', label: 'Sin país (legado)' },
  ];
  const requested = data?.operational.requests ?? 0;
  const completed = data?.operational.completed_requests ?? 0;
  const tracked = data?.operational.started_calls_with_timestamp ?? 0;
  const startedFive = data?.operational.started_within_five_minutes ?? 0;
  const completedAppts = data?.appointments.completed ?? 0;
  const attributedIssued = data?.documents.completed_appointments_with_issued_prescription ?? 0;
  const issuedPrescriptions = data?.documents.prescriptions_issued ?? 0;
  const prescriptions = data?.documents.prescriptions_total ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Indicadores verificables</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Datos reales de producción, con denominadores visibles y separación explícita entre Brasil y Argentina.
            La falta de instrumentación se muestra como pendiente, no como cero.
          </p>
        </div>
        <button type="button" onClick={() => setRefresh(v => v + 1)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
          <RefreshCcw size={16} /> Actualizar
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="kpi-country">Jurisdicción clínica</label>
          <select id="kpi-country" value={country} onChange={e => setCountry(e.target.value as Country)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900">
            {countryOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="kpi-period">Ventana temporal</label>
          <select id="kpi-period" value={days} onChange={e => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900">
            <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option>
          </select>
        </div>
        <p className="pb-2 text-xs text-slate-500">
          {data && !loading ? `Actualizado: ${new Date(data.generated_at).toLocaleString('es-AR')}` : ' '}
        </p>
      </div>

      {loading && <p role="status" className="text-sm text-slate-600">Consultando registros…</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}

      {data && !loading && !error && (
        <>
          <section aria-label="Operación clínica" className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Clock3 size={20} /> Atención y disponibilidad</h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Solicitudes de farmacia" primary={value(requested)} detail="Solicitudes creadas en el período, por jurisdicción explícita" />
              <Stat label="Cierres operativos" primary={ratio(completed, requested)}
                detail={`${value(completed)} de ${value(requested)} solicitudes con estado completed; no prueba atención clínica`} />
              <Stat label="Inicio de llamada ≤5 min" primary={ratio(startedFive, tracked)}
                detail={`${value(startedFive)} de ${value(tracked)} llamadas con timestamp de inicio medible`} />
              <Stat label="Espera p90" primary={data.operational.wait_p90_minutes === null ? 'Sin datos' : `${data.operational.wait_p90_minutes} min`}
                detail={`Mediana: ${data.operational.wait_p50_minutes ?? 'sin datos'} min; muestra: ${value(tracked)}`} />
            </div>
            <p className="text-xs text-slate-500">
              {value(data.operational.expired_requests)} expiradas y {value(data.operational.cancelled_requests)} canceladas.
              Los tiempos solo incluyen solicitudes con timestamps coherentes; no constituyen una garantía de atención.
            </p>
          </section>

          <section aria-label="Documentos" className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><FileCheck2 size={20} /> Atención y documentos</h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Citas completadas" primary={value(completedAppts)}
                detail={`${value(data.appointments.total)} citas creadas; ${value(data.appointments.no_show)} no_show`} />
              <Stat label="Recetas emitidas" primary={value(issuedPrescriptions)}
                detail={`${value(prescriptions)} registradas en total; ${value(data.documents.prescriptions_draft)} borradores excluidos`} />
              <Stat label="Citas completadas con receta" primary={ratio(attributedIssued, completedAppts)}
                detail={`${value(attributedIssued)} de ${value(completedAppts)} citas completadas vinculadas a una receta emitida; no incluye consultas sin cita`} />
              <Stat label="Certificados firmados" primary={value(data.documents.certificates_signed)}
                detail="Documentos con estado signed; no presupone homologación externa" />
            </div>
            <p className="text-xs text-slate-500">
              La prescripción es una decisión médica independiente. Esta tasa es descriptiva, no un objetivo de productividad clínica.
            </p>
          </section>

          <section aria-label="Ingresos" className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Receipt size={20} /> Cobros</h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Pagos aprobados fechados" primary={value(data.payments.approved)}
                detail="Solo estado approved con paid_at dentro del período" />
              <Stat label="Pendientes" primary={value(data.payments.pending)}
                detail="No constituyen ingresos realizados" />
              <Stat label="Reembolsados" primary={value(data.payments.refunded)}
                detail="Eventos que requieren conciliación; no sumados al cobro aprobado" />
              <Stat label="Pagos aprobados sin paid_at" primary={value(data.payments.approved_without_paid_at)}
                detail="Fuera de la facturación mostrada: requiere saneamiento" tone="warning" />
            </div>
            {Object.keys(data.payments.approved_amount_by_currency).length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {Object.entries(data.payments.approved_amount_by_currency).map(([currency, group]) => (
                  <div className="rounded-lg border border-slate-200 bg-white px-5 py-4" key={currency}>
                    <p className="text-xs font-semibold text-slate-500">Cobrado en {currency}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">{amount(group.amount, currency)}</p>
                    <p className="text-xs text-slate-500">{value(group.count)} pagos; bruto, no margen</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">No hay cobros aprobados verificables en esta jurisdicción y período.</p>}
          </section>

          <section aria-label="Canales" className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><ScanLine size={20} /> Canal físico y referidos</h3>
            {data.referrals.length === 0 ? <p className="text-sm text-slate-600">Sin solicitudes atribuibles a un socio en esta selección.</p> : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600"><tr>
                    <th className="p-3">Socio</th><th className="p-3">Solicitudes</th>
                    <th className="p-3">Cierres operativos</th><th className="p-3">Pagos aprobados</th>
                    <th className="p-3">Comisiones elegibles</th>
                  </tr></thead>
                  <tbody>{data.referrals.map(p => (
                    <tr key={p.code} className="border-t border-slate-100">
                      <td className="p-3 font-medium text-slate-900">{p.name} ({p.code})</td>
                      <td className="p-3 tabular-nums">{value(p.requests)}</td>
                      <td className="p-3 tabular-nums">{value(p.operationally_completed)}</td>
                      <td className="p-3 tabular-nums">{value(p.approved_payments)}</td>
                      <td className="p-3 tabular-nums">{value(p.eligible_commissions)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500">La atribución utiliza referral_partner_id resuelto por el servidor; no implica registro de impresiones o escaneos del QR.</p>
          </section>

          <section aria-label="Calidad de datos" className="space-y-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><AlertTriangle size={20} /> Calidad y límites</h3>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              En la ventana seleccionada: {value(data.quality.unattributed_country_requests)} solicitudes de farmacia,
              {' '}{value(data.quality.unattributed_country_appointments)} citas y
              {' '}{value(data.quality.unattributed_country_appointment_payments)} pagos de citas sin país comprobable.
              Se muestran en «Sin país (legado)» y nunca se reasignan por moneda, teléfono o documento.
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {data.unavailable.map(item => (
                <article key={item.metric} className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><TrendingUp size={16} /> {item.metric}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">No calculable todavía</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
