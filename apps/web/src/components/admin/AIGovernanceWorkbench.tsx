import { useState, type FormEvent } from 'react';

type GovernanceAssessment = {
  id: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  risk_reason: string;
  impact_scope: string;
  recommendation: string;
  requires_admin: true;
  status: 'PENDING_HUMAN_APPROVAL';
};

const DOMAINS = [
  { value: 'money', label: 'Pagos y dinero' },
  { value: 'operations', label: 'Operaciones' },
  { value: 'clinical', label: 'Flujos clínicos (solo riesgos operativos, no decisiones médicas)' },
  { value: 'infra', label: 'Infraestructura y seguridad' },
  { value: 'data', label: 'Datos y privacidad' },
  { value: 'comms', label: 'Comunicaciones' },
] as const;

export function AIGovernanceWorkbench() {
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]['value']>('operations');
  const [request, setRequest] = useState('');
  const [assessment, setAssessment] = useState<GovernanceAssessment | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.trim().length < 12) {
      setError('Describí la operación con al menos 12 caracteres.');
      return;
    }
    setLoading(true);
    setError('');
    setAssessment(null);
    try {
      const response = await fetch('/api/admin/ai/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, request: request.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const message = typeof result.error === 'string' ? result.error : result.error?.message || result.error?.code;
        throw new Error(message === 'openai_api_key_not_configured'
          ? 'Falta configurar OPENAI_API_KEY en el secreto de Cloudflare de autamedica-web.'
          : message || 'No se pudo analizar la solicitud.');
      }
      setAssessment(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo analizar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  const riskClass = assessment?.risk_level === 'critical' || assessment?.risk_level === 'high'
    ? 'border-rose-300 bg-rose-50 text-rose-900'
    : assessment?.risk_level === 'medium'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-emerald-300 bg-emerald-50 text-emerald-900';

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Autamedica AI Governance</h2>
          <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">OpenAI API</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Analiza una solicitud operativa, clasifica el riesgo y crea una autorización pendiente en la bandeja Admin.
          No ejecuta pagos, cambios de configuración ni acciones clínicas.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Dominio
          <select value={domain} onChange={(event) => setDomain(event.target.value as typeof domain)}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {DOMAINS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Solicitud que debe analizar la IA
          <textarea value={request} onChange={(event) => setRequest(event.target.value)} maxLength={2000}
            rows={4} required minLength={12}
            placeholder="Ej.: Un agente solicita habilitar los pagos QR de Jordan para aumentar las conversiones..."
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <p className="text-xs text-slate-500">
          No incluyas nombres, CPF/DNI, diagnósticos, correos ni información identificable de pacientes.
        </p>
        <button type="submit" disabled={loading || request.trim().length < 12}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'Analizando con OpenAI…' : 'Analizar riesgo y enviar a Admin'}
        </button>
      </form>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {assessment && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Evaluación de OpenAI</h3>
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold uppercase ${riskClass}`}>
              Riesgo {assessment.risk_level}
            </span>
          </div>
          <p className="font-medium text-slate-900">{assessment.summary}</p>
          <div><strong className="text-sm">Riesgo identificado</strong><p className="text-sm text-slate-600">{assessment.risk_reason}</p></div>
          <div><strong className="text-sm">Alcance</strong><p className="text-sm text-slate-600">{assessment.impact_scope}</p></div>
          <div><strong className="text-sm">Recomendación</strong><p className="text-sm text-slate-600">{assessment.recommendation}</p></div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Solicitud creada en la bandeja de autorizaciones. Requiere decisión humana. La IA no ejecutó la operación.
          </div>
          <p className="text-xs text-slate-500">Referencia: {assessment.id} · Estado: pendiente de Admin</p>
        </div>
      )}
    </section>
  );
}
