import { useEffect, useMemo, useState } from "react";

type Account = {
  id: string;
  name: string;
  account_type: string;
  status: string;
  main_phone_e164: string | null;
  main_email: string | null;
  whatsapp_url: string | null;
  address: string | null;
  city: string | null;
  website: string | null;
  priority: number;
  score: number;
  tags: string[];
  last_contacted_at: string | null;
  next_action_at: string | null;
  created_at: string;
};

type ApiData = {
  accounts: Account[];
  count: number;
  status_counts: Record<string, number>;
};

const statuses = [
  "prospect",
  "qualified",
  "contacted",
  "meeting_scheduled",
  "proposal_sent",
  "won",
  "lost",
  "do_not_contact",
  "all",
];

const outcomes = [
  { id: "no_answer", label: "No atiende", status: "contacted" },
  { id: "connected", label: "Hablé", status: "contacted" },
  { id: "interested", label: "Interesado", status: "qualified" },
  { id: "meeting_scheduled", label: "Reunión", status: "meeting_scheduled" },
  { id: "not_interested", label: "No interesa", status: "lost" },
  { id: "do_not_contact", label: "No contactar", status: "do_not_contact" },
];

export function CrmDashboardUI({ devBypass = false }: { devBypass?: boolean }) {
  const [status, setStatus] = useState("prospect");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({ status, limit: "150" });
    if (query.trim()) params.set("q", query.trim());
    if (devBypass) params.set("dev_admin", "1");
    return `/api/admin/crm?${params.toString()}`;
  }, [devBypass, query, status]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(apiUrl);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "crm_load_failed");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "crm_load_failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [apiUrl]);

  async function registerOutcome(account: Account, outcome: (typeof outcomes)[number]) {
    setSavingId(account.id);
    setError(null);
    try {
      const params = devBypass ? "?dev_admin=1" : "";
      const response = await fetch(`/api/admin/crm${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: account.id,
          outcome: outcome.id,
          status: outcome.status,
          note: `Resultado rapido: ${outcome.label}`,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "crm_save_failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "crm_save_failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Outbound CRM</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Pipeline B2B AutaMedica</h2>
          <p className="mt-1 text-sm text-slate-500">Cola de llamadas, WhatsApp, estados y trazabilidad por cuenta.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cuenta"
            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-sky-500"
          >
            {statuses.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
      </section>

      {data && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(data.status_counts).map(([key, value]) => (
            <div key={key} className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase text-slate-500">{key}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </section>
      )}

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando CRM...</div>}

      {!loading && data && (
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
            {data.count} cuentas en vista actual
          </div>
          {data.accounts.length === 0 ? (
            <div className="px-4 py-10 text-sm text-slate-500">
              No hay cuentas para el filtro actual. Cambia el estado a "all" o "prospect".
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Cuenta</th>
                  <th className="px-4 py-3 text-left">Contacto</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-left">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.accounts.map((account) => (
                  <tr key={account.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{account.name}</div>
                      <div className="mt-1 max-w-md text-xs text-slate-500">{account.address || account.city || "-"}</div>
                      {account.website && (
                        <a href={account.website} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-700 hover:underline">
                          Web
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {account.main_phone_e164 ? (
                        <div className="space-y-1">
                          <a href={`tel:${account.main_phone_e164}`} className="block font-medium text-slate-800 hover:text-sky-700">
                            {account.main_phone_e164}
                          </a>
                          
                          {account.main_email && (
                            <a href={"mailto:" + account.main_email} className="text-xs font-medium text-blue-700 hover:underline block">
                              {account.main_email}
                            </a>
                          )}
                          {account.whatsapp_url && (
                            <a href={account.whatsapp_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline">
                              WhatsApp
                            </a>
                          )}
                        </div>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{account.account_type}</span>
                      <div className="mt-2 text-xs text-slate-500">{account.status}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">
                        {account.score}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {outcomes.map((outcome) => (
                          <button
                            key={outcome.id}
                            disabled={savingId === account.id}
                            onClick={() => void registerOutcome(account, outcome)}
                            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-400 hover:text-sky-700 disabled:opacity-50"
                          >
                            {outcome.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}
    </div>
  );
}
