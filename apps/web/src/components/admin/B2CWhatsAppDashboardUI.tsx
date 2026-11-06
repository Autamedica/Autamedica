import { useCallback, useEffect, useState } from 'react';

type Contact = {
  id: string; source_key: string; display_name: string; phone_e164: string | null;
  phone_status: string; consent_status: string; contact_status: string;
  consent_evidence: string | null; last_outbound_at: string | null;
  last_inbound_at: string | null; exclusion_reason: string | null; patient_id: string | null;
  can_contact: boolean; completed_consultations: number; reconsultations: number;
  approved_payments: number; approved_amount_ars_minor: number;
};
type ResponseData = {
  records: Contact[]; total: number; count: number; consent_verified: number;
  blocked: number; page: number; per_page: number; metrics_note: string;
};
const statusList = [
  ['all','Todos'], ['pending','Sin contactar'], ['contacted','Contactados'],
  ['replied','Respondieron'], ['interested','Interesados'], ['no_response','Sin respuesta'],
  ['not_interested','No interesados'], ['do_not_contact','No contactar'],
];
const outcomeList = [
  ['sent','Enviado'], ['replied','Respondió'], ['interested','Interesado'],
  ['not_interested','No interesa'], ['no_response','No respondió'], ['opt_out','BAJA'],
] as const;

function parseCsv(raw: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (quoted && raw[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && raw[i+1] === '\n') i++;
      row.push(cell); if (row.some(s => s.length)) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell); if (row.some(s => s.length)) rows.push(row);
  if (quoted) throw new Error('csv_unclosed_quote');
  return rows;
}

export function B2CWhatsAppDashboardUI() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), status });
    if (query.trim()) params.set('q', query.trim());
    try {
      const response = await fetch('/api/admin/b2c-whatsapp?' + params, { credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar la base');
      setData(result as ResponseData); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error de lectura'); }
  }, [status, query, page]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(input: Record<string, unknown>): Promise<void> {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/b2c-whatsapp', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error de escritura');
      setNotice(result.warning ? 'Acción guardada, pero falló la auditoría de eventos.' : 'Actualizado correctamente');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error'); }
    finally { setBusy(false); }
  }

  async function verify(contact: Contact) {
    const evidence = window.prompt(
      'Indica dónde está documentado el consentimiento comercial para WhatsApp (referencia y fecha).',
      contact.consent_evidence || '',
    );
    if (!evidence) return;
    await mutate({ action: 'verify_consent', id: contact.id, evidence });
  }

  async function linkPatient(contact: Contact) {
    const patientId = window.prompt('UUID del paciente de AutaMedica, verificado por el administrador:');
    if (!patientId) return;
    await mutate({ action: 'link_patient', id: contact.id, patient_id: patientId.trim() });
  }

  async function record(contact: Contact, outcome: (typeof outcomeList)[number][0]) {
    if (['no_response','not_interested','opt_out'].includes(outcome) &&
        !window.confirm('Esta acción excluirá el contacto de futuros envíos. ¿Continuar?')) return;
    await mutate({ action: 'outcome', id: contact.id, outcome });
  }

  async function importCsv(file: File) {
    setBusy(true); setError(''); setNotice('');
    try {
      const content = await file.text();
      const rows = parseCsv(content);
      const headers = rows.shift()?.map(h => h.replace(/^\uFEFF/, '').trim().toLowerCase()) || [];
      for (const required of ['source_key', 'display_name', 'phone']) {
        if (!headers.includes(required)) throw new Error('CSV necesita: source_key,display_name,phone');
      }
      const mapped = rows.map(parts => {
        const get = (key: string) => parts[headers.indexOf(key)] || '';
        return { source_key: get('source_key'), display_name: get('display_name'), phone: get('phone'),
          crossed_out: ['true','1','si','sí'].includes(get('crossed_out').toLowerCase()),
          excluded: ['true','1','si','sí'].includes(get('excluded').toLowerCase()),
          exclusion_reason: get('exclusion_reason') };
      });
      if (!mapped.length) throw new Error('CSV vacío');
      let inserted = 0;
      for (let i=0; i<mapped.length; i+=100) {
        const response = await fetch('/api/admin/b2c-whatsapp', {
          method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({action:'import', rows:mapped.slice(i,i+100)}),
        });
        const result = await response.json();
        if (!response.ok) throw new Error('Importación interrumpida (fila ' + (i+1) + '): ' + (result.error || 'error'));
        inserted += Number(result.imported || 0);
      }
      setNotice(inserted + ' contactos importados como consentimiento pendiente. No se enviaron mensajes.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error CSV'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">Argentina · B2C · WhatsApp Business</p>
          <h2 className="text-2xl font-bold text-slate-900">Conversaciones y conversión</h2>
          <p className="text-sm text-slate-600">WhatsApp manual, sin créditos. Los eventos automáticos requieren coexistencia oficial configurada.</p>
        </div>
        <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
          {busy ? 'Procesando…' : 'Importar CSV depurado'}
          <input className="sr-only" type="file" accept=".csv,text/csv" disabled={busy}
            onChange={e => { const file = e.target.files?.[0]; if (file) void importCsv(file); e.target.value = ''; }} />
        </label>
      </section>
      {data && <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Inventariados',data.total], ['Permiso verificado',data.consent_verified],
          ['No contactar',data.blocked], ['Filtro actual',data.count],
        ].map(([name,value]) => <div key={name} className="rounded-lg border bg-white p-4">
          <p className="text-xs text-slate-500">{name}</p>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
        </div>)}
      </section>}
      <section className="flex flex-col gap-3 md:flex-row">
        <input className="w-full rounded-md border p-2 text-sm" value={query} placeholder="Buscar nombre"
          onChange={e => {setQuery(e.target.value);setPage(1);}} />
        <select className="rounded-md border p-2 text-sm" value={status}
          onChange={e => {setStatus(e.target.value);setPage(1);}}>
          {statusList.map(([id,label])=><option key={id} value={id}>{label}</option>)}
        </select>
      </section>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <section className="space-y-3">
        {data?.records.length === 0 && <p className="rounded-md border p-5 text-slate-500">Sin registros en este filtro.</p>}
        {data?.records.map(contact => <article key={contact.id} className="rounded-lg border bg-white p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900">{contact.display_name}</h3>
              <p className="text-xs text-slate-500">{contact.source_key}</p>
              <p className="text-sm text-slate-700">{contact.phone_e164 || 'Sin teléfono validado'} · {contact.contact_status}</p>
              <p className="text-xs text-slate-600">Consentimiento: {contact.consent_status} · Teléfono: {contact.phone_status}</p>
              {contact.exclusion_reason && <p className="text-xs font-medium text-red-700">Excluido: {contact.exclusion_reason}</p>}
              {contact.last_inbound_at && <p className="text-xs text-slate-600">Última respuesta: {new Date(contact.last_inbound_at).toLocaleString('es-AR')}</p>}
            </div>
            <div className="text-xs text-slate-700 md:text-right">
              <p>Pagos aprobados vinculados: <strong>{contact.approved_payments}</strong></p>
              <p>Importe ARS registrado: <strong>{(contact.approved_amount_ars_minor/100).toLocaleString('es-AR')}</strong></p>
              <p>Consultas completadas: <strong>{contact.completed_consultations}</strong></p>
              <p>Reconsultas: <strong>{contact.reconsultations}</strong></p>
              <button className="mt-2 text-sky-700 underline disabled:opacity-50" disabled={busy}
                onClick={() => void linkPatient(contact)}>Vincular paciente verificado</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            {contact.can_contact
              ? <a className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
                  target="_blank" rel="noreferrer" href={'https://wa.me/' + contact.phone_e164?.replace('+','')}>
                  Abrir WhatsApp
                </a>
              : <span className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">WhatsApp bloqueado hasta validar elegibilidad</span>}
            {contact.consent_status === 'pending' && contact.contact_status !== 'do_not_contact' &&
              <button className="rounded-md border px-3 py-2 text-xs text-sky-800" disabled={busy}
                onClick={() => void verify(contact)}>Verificar consentimiento</button>}
            {outcomeList.map(([id,label])=><button key={id} disabled={busy || (id==='sent' && !contact.can_contact)
              || (contact.contact_status === 'do_not_contact' && id !== 'opt_out')}
              className="rounded-md border px-3 py-2 text-xs text-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
              onClick={() => void record(contact,id)}>{label}</button>)}
          </div>
        </article>)}
      </section>
      {data && <footer className="flex items-center justify-between gap-4 border-t pt-3">
        <p className="text-xs text-slate-500">{data.metrics_note}</p>
        <div className="flex items-center gap-3">
          <button disabled={page===1 || busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => setPage(p => Math.max(1,p-1))}>Anterior</button>
          <span className="text-sm">{page}</span>
          <button disabled={page*data.per_page>=data.count || busy} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => setPage(p => p+1)}>Siguiente</button>
        </div>
      </footer>}
    </div>
  );
}
