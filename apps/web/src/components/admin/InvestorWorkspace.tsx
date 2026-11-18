import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

type Investor = {
  id: string;
  organization_name: string;
  contact_name: string | null;
  role_title: string | null;
  country_code: string | null;
  thesis: string | null;
  stage_focus: string[] | null;
  ticket_range: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  source_url: string | null;
  fit_score: number;
  priority: 'A' | 'B' | 'C';
  status: string;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  outreach_message: string | null;
  notes: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  discovered: 'Descubierto',
  qualified: 'Calificado',
  researching: 'Investigando',
  ready_to_connect: 'Listo para conectar',
  invitation_sent: 'Invitación enviada',
  connected: 'Conectado',
  replied: 'Respondió',
  meeting: 'Reunión',
  passed: 'Descartado',
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS);

const EMPTY_FORM = {
  organization_name: '',
  contact_name: '',
  role_title: '',
  country_code: 'AR',
  thesis: 'Healthtech, telemedicina, digital health y tecnología médica',
  stage_focus: 'Pre-seed, Seed, Serie A',
  ticket_range: '',
  fit_score: '70',
  priority: 'B',
  linkedin_url: '',
  website_url: '',
  source_url: '',
  notes: '',
};

function dateLabel(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR');
}

function connectionDraft(investor: Investor): string {
  const name = investor.contact_name?.split(' ')[0] || 'Hola';
  const firm = investor.organization_name;
  return `Hola ${name}, estoy construyendo AutaMedica, una plataforma de salud digital con foco en telemedicina y operación en Latinoamérica. Vi el trabajo de ${firm} en inversión y quería conectar para compartir nuestra propuesta y explorar un posible encaje. ¡Gracias!`;
}

async function readJson(response: Response): Promise<any> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message || 'No se pudo completar la operación.');
  }
  return payload?.data;
}

export function InvestorWorkspace() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activeInvestor, setActiveInvestor] = useState<Investor | null>(null);
  const [messageDraft, setMessageDraft] = useState('');

  const loadInvestors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/admin/social-agents/investors', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      }));
      setInvestors(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el CRM.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadInvestors(); }, [loadInvestors]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return investors.filter((investor) => {
      const matchesSearch = !needle || [
        investor.organization_name,
        investor.contact_name,
        investor.role_title,
        investor.country_code,
        investor.thesis,
      ].some((value) => value?.toLowerCase().includes(needle));
      return matchesSearch &&
        (statusFilter === 'all' || investor.status === statusFilter) &&
        (priorityFilter === 'all' || investor.priority === priorityFilter);
    });
  }, [investors, search, statusFilter, priorityFilter]);

  const metrics = useMemo(() => ({
    total: investors.length,
    priority: investors.filter((item) => item.priority === 'A').length,
    ready: investors.filter((item) => ['ready_to_connect', 'invitation_sent', 'connected'].includes(item.status)).length,
    followUps: investors.filter((item) => item.next_follow_up_at && new Date(item.next_follow_up_at).getTime() <= Date.now()).length,
  }), [investors]);

  const createInvestor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body = {
        ...form,
        fit_score: Number(form.fit_score),
        stage_focus: form.stage_focus.split(',').map((value) => value.trim()).filter(Boolean),
        source: 'admin_manual',
      };
      await readJson(await fetch('/api/admin/social-agents/investors', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      }));
      setForm(EMPTY_FORM);
      setShowForm(false);
      setNotice('Inversor agregado al CRM.');
      await loadInvestors();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el inversor.');
    } finally {
      setSaving(false);
    }
  };

  const patchInvestor = async (id: string, patch: Record<string, unknown>) => {
    setError('');
    setNotice('');
    try {
      const updated = await readJson(await fetch('/api/admin/social-agents/investors', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      }));
      setInvestors((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item));
      if (activeInvestor?.id === id) setActiveInvestor((current) => current ? { ...current, ...updated } : current);
      setNotice('CRM actualizado.');
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo actualizar el inversor.');
      return false;
    }
  };

  const exportXlsx = async () => {
    setError('');
    setNotice('');
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('export', 'xlsx');
      const response = await fetch(`/api/admin/social-agents/investors?${params.toString()}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('No se pudo generar el Excel.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `autamedica-inversores-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice('Excel generado con los filtros seleccionados.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Falló la exportación.');
    }
  };

  const openDraft = (investor: Investor) => {
    setActiveInvestor(investor);
    setMessageDraft(investor.outreach_message || connectionDraft(investor));
  };

  const saveDraft = async () => {
    if (!activeInvestor) return;
    const saved = await patchInvestor(activeInvestor.id, { outreach_message: messageDraft });
    if (saved) setNotice('Borrador guardado. Todavía no se envió ninguna invitación.');
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(messageDraft);
      setNotice('Mensaje copiado. Abrí el perfil para enviarlo desde LinkedIn.');
    } catch {
      setError('No se pudo copiar automáticamente. Seleccioná el texto y copialo manualmente.');
    }
  };

  const openLinkedIn = () => {
    if (!activeInvestor?.linkedin_url) return;
    window.open(activeInvestor.linkedin_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Autamedica · Social Agents</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Inversores y conexiones</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Descubrí fondos, organizá responsables, prepará mensajes y gestioná el pipeline de inversión desde un solo lugar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void loadInvestors()} className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Actualizar</button>
            <button onClick={() => void exportXlsx()} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-300">Descargar Excel</button>
            <button onClick={() => setShowForm((value) => !value)} className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-slate-100">Agregar inversor</button>
          </div>
        </div>
      </section>

      {(error || notice) && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {error || notice}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['En el CRM', metrics.total],
          ['Prioridad A', metrics.priority],
          ['En conexión', metrics.ready],
          ['Seguimientos vencidos', metrics.followUps],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {showForm && (
        <form onSubmit={createInvestor} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Nuevo inversor</h3>
              <p className="text-sm text-slate-500">Registrá el fondo y el responsable de inversión.</p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Cerrar</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Fondo / organización *"><input required value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} className={inputClass} placeholder="Kaszek" /></Field>
            <Field label="Responsable"><input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className={inputClass} placeholder="Nombre y apellido" /></Field>
            <Field label="Cargo"><input value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} className={inputClass} placeholder="Partner, Investment Director..." /></Field>
            <Field label="País (ISO)"><input maxLength={2} value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} className={inputClass} placeholder="AR" /></Field>
            <Field label="Etapas"><input value={form.stage_focus} onChange={(e) => setForm({ ...form, stage_focus: e.target.value })} className={inputClass} placeholder="Pre-seed, Seed, Serie A" /></Field>
            <Field label="Ticket estimado"><input value={form.ticket_range} onChange={(e) => setForm({ ...form, ticket_range: e.target.value })} className={inputClass} placeholder="USD 100k–1M" /></Field>
            <Field label="Encaje (0–100)"><input type="number" min="0" max="100" value={form.fit_score} onChange={(e) => setForm({ ...form, fit_score: e.target.value })} className={inputClass} /></Field>
            <Field label="Prioridad"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputClass}><option value="A">A — Alta</option><option value="B">B — Media</option><option value="C">C — Exploratoria</option></select></Field>
            <Field label="LinkedIn"><input type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} className={inputClass} placeholder="https://www.linkedin.com/in/..." /></Field>
            <Field label="Sitio web"><input type="url" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} className={inputClass} placeholder="https://..." /></Field>
            <Field label="Fuente"><input type="url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} className={inputClass} placeholder="URL de la investigación" /></Field>
            <Field label="Tesis"><input value={form.thesis} onChange={(e) => setForm({ ...form, thesis: e.target.value })} className={inputClass} /></Field>
          </div>
          <Field label="Notas"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} /></Field>
          <div className="mt-5 flex justify-end">
            <button disabled={saving} type="submit" className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar inversor'}</button>
          </div>
        </form>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_190px_150px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} placeholder="Buscar fondo, persona, cargo o tesis…" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            <option value="all">Todos los estados</option>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={inputClass}>
            <option value="all">Toda prioridad</option><option value="A">Prioridad A</option><option value="B">Prioridad B</option><option value="C">Prioridad C</option>
          </select>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Cargando pipeline de inversores…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-semibold text-slate-900">Todavía no hay inversores en este filtro</h3>
            <p className="mt-1 text-sm text-slate-500">Agregá un fondo para iniciar el pipeline.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-white text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Fondo / responsable</th><th className="px-4 py-3">Encaje</th><th className="px-4 py-3">Prioridad</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Seguimiento</th><th className="px-4 py-3 text-right">Acciones</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((investor) => (
                  <tr key={investor.id} className="align-middle hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-950">{investor.organization_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{investor.contact_name || 'Responsable sin identificar'}{investor.role_title ? ` · ${investor.role_title}` : ''}{investor.country_code ? ` · ${investor.country_code}` : ''}</div>
                      <div className="mt-1 max-w-sm truncate text-xs text-slate-500">{investor.thesis || investor.stage_focus?.join(', ') || 'Sin tesis registrada'}</div>
                    </td>
                    <td className="px-4 py-4"><span className="font-semibold tabular-nums text-slate-900">{investor.fit_score}/100</span></td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${investor.priority === 'A' ? 'bg-emerald-100 text-emerald-800' : investor.priority === 'B' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{investor.priority}</span></td>
                    <td className="px-4 py-4">
                      <select aria-label={`Estado de ${investor.organization_name}`} value={investor.status} onChange={(e) => void patchInvestor(investor.id, { status: e.target.value })} className="max-w-[190px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700">
                        {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600">{dateLabel(investor.next_follow_up_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {investor.linkedin_url && <a href={investor.linkedin_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-800">LinkedIn</a>}
                        <button onClick={() => openDraft(investor)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Preparar conexión</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Mostrando {filtered.length} de {investors.length} registros. El estado “Invitación enviada” se registra al confirmarlo manualmente después del envío real.</div>
      </section>

      {activeInvestor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="connection-title">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-700">LinkedIn · preparación de conexión</p>
                <h3 id="connection-title" className="mt-1 text-xl font-semibold text-slate-950">{activeInvestor.contact_name || activeInvestor.organization_name}</h3>
                <p className="text-sm text-slate-500">{activeInvestor.role_title ? `${activeInvestor.role_title} · ` : ''}{activeInvestor.organization_name}</p>
              </div>
              <button onClick={() => setActiveInvestor(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">Cerrar</button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-700" htmlFor="connection-message">Mensaje de conexión</label>
            <textarea id="connection-message" rows={7} maxLength={2000} value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} className={`${inputClass} mt-2 resize-y`} />
            <div className="mt-2 flex justify-between text-xs text-slate-500"><span>Personalizá el mensaje antes de usarlo.</span><span>{messageDraft.length}/2000</span></div>
            <Field label="Próximo seguimiento">
              <input type="date" value={activeInvestor.next_follow_up_at?.slice(0, 10) || ''} onChange={(e) => void patchInvestor(activeInvestor.id, { next_follow_up_at: e.target.value || null })} className={inputClass} />
            </Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button onClick={() => void saveDraft()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Guardar borrador</button>
              <button onClick={() => void copyDraft()} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Copiar mensaje</button>
              <button onClick={openLinkedIn} disabled={!activeInvestor.linkedin_url} className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40">Abrir perfil de LinkedIn</button>
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">El mensaje se prepara y guarda en el CRM. LinkedIn se abre para que realices la conexión desde tu cuenta; el sistema registra “Invitación enviada” solo cuando lo confirmes en el estado del contacto.</p>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="mt-4 block text-xs font-semibold text-slate-600">{label}<div className="mt-1.5">{children}</div></label>;
}
