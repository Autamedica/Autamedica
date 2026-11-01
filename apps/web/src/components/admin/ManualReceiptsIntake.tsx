import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchApi } from '@/lib/api-client';

type Currency = 'BRL' | 'ARS';
type Country = 'BR' | 'AR';
type Channel = 'whatsapp' | 'phone' | 'website' | 'referral' | 'walk_in' | 'other';
type Method = 'pix_external' | 'bank_transfer' | 'cash' | 'card_external' | 'other';

interface ReportedReceipt {
  id: string;
  currency: Currency;
  amount_minor: number;
  channel: Channel;
  payment_method: Method;
  occurred_at: string;
  reconciliation_status: 'reported';
}

function displayAmount(cents: number, currency: string) {
  return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'es-AR', {
    style: 'currency', currency,
  }).format(cents / 100);
}

export function ManualReceiptsIntake() {
  const [country, setCountry] = useState<Country>('BR');
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [method, setMethod] = useState<Method>('pix_external');
  const [reference, setReference] = useState('');
  const [records, setRecords] = useState<ReportedReceipt[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    const payload = await fetchApi<{ records: ReportedReceipt[] }>('/api/admin/finance/manual-receipts');
    setRecords(payload.records);
  };

  useEffect(() => {
    void refresh().catch(() => setError('No se pudo consultar el registro de ventas. Verifique los permisos de administración.'));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');

    const entered = amount.trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(entered)) {
      setError('Ingrese un importe positivo con hasta dos decimales.');
      return;
    }
    const minor = Math.round(Number(entered) * 100);
    if (!Number.isSafeInteger(minor) || minor < 1 || minor > 100000000) {
      setError('El importe está fuera del rango admitido.');
      return;
    }
    if (reference && !/^[A-Za-z0-9_-]{6,128}$/.test(reference)) {
      setError('La referencia bancaria debe contener entre 6 y 128 caracteres alfanuméricos, guiones o guiones bajos.');
      return;
    }
    setPending(true);
    try {
      await fetchApi('/api/admin/finance/manual-receipts', {
        method: 'POST',
        body: {
          country_code: country,
          currency: country === 'BR' ? 'BRL' : 'ARS',
          amount_minor: minor,
          channel,
          payment_method: method,
          external_reference: reference || null,
          occurred_at: new Date().toISOString(),
        },
      });
      setMessage('Venta registrada como REPORTADA. No se contabiliza como cobro verificado hasta contrastarla con el banco.');
      setAmount('');
      setReference('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible registrar la operación.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Registrar venta directa B2C</h3>
        <p className="text-sm text-slate-600 mt-1">
          Para ventas fuera del checkout (PIX directo, transferencia, efectivo).
          Cada registro queda pendiente de conciliación y no incrementa la facturación verificada.
          No incluya nombres de pacientes, diagnósticos ni documentos clínicos.
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm text-slate-700">País
          <select value={country} onChange={e => setCountry(e.target.value as Country)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2">
            <option value="BR">Brasil (BRL)</option><option value="AR">Argentina (ARS)</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">Importe
          <input value={amount} onChange={e => setAmount(e.target.value)} required
            inputMode="decimal" placeholder="150,00" className="mt-1 w-full rounded-md border border-slate-300 p-2" />
        </label>
        <label className="text-sm text-slate-700">Canal de origen
          <select value={channel} onChange={e => setChannel(e.target.value as Channel)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2">
            <option value="whatsapp">WhatsApp</option><option value="phone">Teléfono</option>
            <option value="website">Sitio web</option><option value="referral">Recomendación</option>
            <option value="walk_in">Presencial</option><option value="other">Otro</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">Medio de cobro
          <select value={method} onChange={e => setMethod(e.target.value as Method)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2">
            <option value="pix_external">PIX externo</option><option value="bank_transfer">Transferencia bancaria</option>
            <option value="cash">Efectivo</option><option value="card_external">Tarjeta externa</option>
            <option value="other">Otro</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">Referencia externa (opcional)
          <input value={reference} onChange={e => setReference(e.target.value)}
            maxLength={128} placeholder="ID bancario, sin datos personales"
            className="mt-1 w-full rounded-md border border-slate-300 p-2" />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={pending}
            className="w-full rounded-md bg-slate-900 p-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? 'Registrando…' : 'Registrar para conciliación'}
          </button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      <div className="border-t border-slate-100 pt-3">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Últimas ventas reportadas (no verificadas)</h4>
        {records.length === 0 ? <p className="text-sm text-slate-500">No existen ventas registradas en este libro.</p> : (
          <ul className="space-y-1 text-sm text-slate-700">
            {records.slice(0, 10).map(item => (
              <li key={item.id} className="flex flex-wrap gap-3 justify-between border-b border-slate-100 py-1">
                <span>{new Date(item.occurred_at).toLocaleDateString('es-AR')} · {item.channel}</span>
                <span className="font-medium">{displayAmount(item.amount_minor, item.currency)} · No conciliado</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
