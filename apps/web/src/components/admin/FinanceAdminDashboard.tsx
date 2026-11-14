import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { fetchApi } from '@/lib/api-client';
import { ManualReceiptsIntake } from '@/components/admin/ManualReceiptsIntake';
import { PspAuditCard } from '@/components/admin/PspAuditCard';
import { AttendanceQualityCard } from '@/components/admin/AttendanceQualityCard';
import { PaymentGovernancePanel } from '@/components/admin/PaymentGovernancePanel';
import { AIGovernanceWorkbench } from '@/components/admin/AIGovernanceWorkbench';

type CurrencySummary = {
  grossApproved: number;
  grossRefunded: number;
  grossPending: number;
  platformFees: number;
  processorFees: number;
  pendingPayouts: number;
  paidPayouts: number;
};
type SummaryData = {
  byCurrency: Record<string, CurrencySummary>;
  amountsReconciledWithProvider: false;
  source: string;
};

type Transaction = {
  id: string;
  appointmentId: string;
  grossAmount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
  provider: string;
  providerPaymentId: string;
  providerStatus: string | null;
  providerStatusDetail: string | null;
  paidAt: string | null;
  createdAt: string;
  patient: {
    id: string;
    name: string;
    email: string;
  };
  doctor: {
    id: string;
    name: string;
    email: string;
    cbu: string | null;
    alias: string | null;
  };
  earning: {
    id: string;
    netAmount: number;
    platformFee: number;
    processorFee: number;
    status: 'pending' | 'paid' | 'cancelled' | 'refunded';
    paidAt: string | null;
  } | null;
};

export function FinanceAdminDashboard() {
  const [activeTab, setActiveTab] = useState<'reconcile' | 'payouts' | 'disputes'>('reconcile');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Payout action state
  const [selectedPayout, setSelectedPayout] = useState<Transaction | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // Refund action state
  const [selectedRefund, setSelectedRefund] = useState<Transaction | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const bypassParam = isDev ? '?dev_admin=1' : '';

  const getChargeStatusLabel = (transaction: Transaction): string => {
    if (transaction.status === 'approved' && transaction.providerStatus === 'in_mediation') return 'En mediación';
    if (transaction.status === 'approved') return 'Aprobado';
    if (transaction.status === 'refunded') return 'Reembolsado';
    if (transaction.status === 'pending') return 'Pendiente';
    if (transaction.status === 'rejected') return 'Rechazado';
    if (transaction.status === 'cancelled') return 'Cancelado';
    return transaction.status;
  };

  const getChargeStatusClassName = (transaction: Transaction): string => {
    if (transaction.status === 'approved' && transaction.providerStatus === 'in_mediation') {
      return 'bg-sky-50 text-sky-700 border border-sky-200';
    }
    if (transaction.status === 'approved') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (transaction.status === 'refunded') return 'bg-rose-50 text-rose-700 border border-rose-200';
    if (transaction.status === 'pending') return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-stone-50 text-stone-600 border border-stone-200';
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch summary
      const sumRes = await fetchApi<{ success: boolean; summary: SummaryData }>(`/api/admin/finance/summary${bypassParam}`);
      if (sumRes?.summary) {
        setSummary(sumRes.summary);
      }

      // 2. Fetch transactions
      const filter = statusFilter ? `&status=${statusFilter}` : '';
      const txData = await fetchApi<Transaction[]>(`/api/admin/finance/transactions?q=${encodeURIComponent(searchQuery)}${filter}${isDev ? '&dev_admin=1' : ''}`);
      if (Array.isArray(txData)) {
        setTransactions(txData);
      }
    } catch (err) {
      console.error('[FinanceAdminDashboard] Error fetching financial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [searchQuery, statusFilter]);

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handlePayoutSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPayout?.earning) return;

    setPayoutLoading(true);
    setPayoutError(null);
    setPayoutSuccess(null);

    try {
      await fetchApi<{ success: boolean; message: string }>(`/api/admin/finance/payouts${bypassParam}`, {
        method: 'POST',
        body: {
          earningId: selectedPayout.earning.id,
          paymentReference,
        },
      });

      setPayoutSuccess('Liquidación registrada con éxito.');
      setPaymentReference('');
      setTimeout(() => {
        setSelectedPayout(null);
        setPayoutSuccess(null);
        void fetchData();
      }, 1500);
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Error al procesar la liquidación.';
      setPayoutError(errorMsg);
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleRefundSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRefund) return;

    setRefundLoading(true);
    setRefundError(null);
    setRefundSuccess(null);

    try {
      await fetchApi<{ success: boolean; message: string }>(`/api/admin/finance/refunds${bypassParam}`, {
        method: 'POST',
        body: {
          paymentId: selectedRefund.id,
          reason: refundReason,
        },
      });

      setRefundSuccess('Reembolso efectuado e ingresos del médico revertidos.');
      setRefundReason('');
      setTimeout(() => {
        setSelectedRefund(null);
        setRefundSuccess(null);
        void fetchData();
      }, 1500);
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Error al efectuar el reembolso.';
      setRefundError(errorMsg);
    } finally {
      setRefundLoading(false);
    }
  };

  const formatMoney = (amount: number, currency: string = 'ARS') => {
    return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount / 100);
  };

  const moneyByCurrency = (field: keyof CurrencySummary) => {
    if (!summary) return 'Sin datos';
    const rows = Object.entries(summary.byCurrency).sort(([a], [b]) => a.localeCompare(b));
    if (!rows.length) return 'Sin registros';
    return rows.map(([currency, values]) =>
      <span key={currency} className="block">{formatMoney(values[field], currency)}</span>
    );
  };

  // Group pending earnings by doctor for the Payout tab
  const pendingPayouts = transactions.filter(t => t.status === 'approved' && t.earning?.status === 'pending');

  return (
    <div className="space-y-8">
      <PaymentGovernancePanel />
      <AIGovernanceWorkbench />
      {/* Visual Metric KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-stone-900 text-stone-100 rounded-xl p-5 border border-stone-850 shadow-md">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Ingresos Brutos</p>
          <p className="text-2xl font-bold mt-2">{moneyByCurrency('grossApproved')}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400">
            <span>Estados aprobados en base (sin conciliación bancaria)</span>
          </div>
        </div>

        <div className="bg-white text-stone-900 rounded-xl p-5 border border-stone-200 shadow-sm">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Comisiones AutaMedica</p>
          <p className="text-2xl font-bold mt-2">{moneyByCurrency('platformFees')}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-stone-500">
            <span>Comisiones registradas, no beneficio neto</span>
          </div>
        </div>

        <div className="bg-amber-50 text-amber-950 rounded-xl p-5 border border-amber-250 shadow-sm">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Falta Liquidar (CBU)</p>
          <p className="text-2xl font-bold mt-2">{moneyByCurrency('pendingPayouts')}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-amber-700">
            <span>● Retiros manuales pendientes</span>
          </div>
        </div>

        <div className="bg-emerald-50 text-emerald-950 rounded-xl p-5 border border-emerald-250 shadow-sm">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Liquidado a Médicos</p>
          <p className="text-2xl font-bold mt-2">{moneyByCurrency('paidPayouts')}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-emerald-700">
            <span>Transferencias ya verificadas</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Saldos separados por ARS y BRL. Los registros aprobados y las liquidaciones no prueban cobro efectivo ni conciliación con el proveedor o banco; no incluir ventas PIX manuales sin comprobante.
      </p>

      <AttendanceQualityCard />
      <PspAuditCard />
      <ManualReceiptsIntake />

      {/* Tabs Menu */}
      <div className="border-b border-stone-200">
        <nav className="flex space-x-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('reconcile')}
            className={`pb-4 transition-colors ${activeTab === 'reconcile' ? 'border-b-2 border-stone-900 text-stone-900' : 'text-stone-500 hover:text-stone-900'}`}
          >
            Reconciliación de Pagos
          </button>
          <button
            onClick={() => setActiveTab('payouts')}
            className={`pb-4 transition-colors relative ${activeTab === 'payouts' ? 'border-b-2 border-stone-900 text-stone-900' : 'text-stone-500 hover:text-stone-900'}`}
          >
            Aprobación de Retiros / Liquidación
            {pendingPayouts.length > 0 && (
              <span className="absolute -top-1 -right-4 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-3xs font-bold leading-none">
                {pendingPayouts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('disputes')}
            className={`pb-4 transition-colors ${activeTab === 'disputes' ? 'border-b-2 border-stone-900 text-stone-900' : 'text-stone-500 hover:text-stone-900'}`}
          >
            Reembolsos & Disputas
          </button>
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === 'reconcile' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-stone-50">
            <div>
              <h3 className="font-semibold text-stone-900 text-base">Auditoría General de Cobros</h3>
              <p className="text-xs text-stone-500">Mapeo del flujo completo de dinero: Pagos ➔ Comisiones ➔ Neto Médico.</p>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Buscar paciente, médico o trans..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-xs text-stone-900 w-64 focus:outline-hidden"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden"
              >
                <option value="">Todos los estados</option>
                <option value="approved">Aprobado</option>
                <option value="refunded">Reembolsado</option>
                <option value="pending">Pendiente</option>
                <option value="rejected">Rechazado</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-stone-500">Cargando transacciones...</div>
            ) : transactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">No se encontraron transacciones financieras.</div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-stone-600 font-bold uppercase tracking-wider border-b border-stone-250">
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-5 py-3">Paciente</th>
                    <th className="px-5 py-3">Médico</th>
                    <th className="px-5 py-3 text-right">Cobro Bruto</th>
                    <th className="px-5 py-3 text-right text-stone-500">Comisión AM</th>
                    <th className="px-5 py-3 text-right text-amber-700">Neto Médico</th>
                    <th className="px-5 py-3 text-center">Estado Cobro</th>
                    <th className="px-5 py-3 text-center">Liquidación</th>
                    <th className="px-5 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap text-stone-500">
                        {new Date(t.createdAt).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-stone-900">{t.patient.name}</p>
                        <p className="text-3xs text-stone-400">{t.patient.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-stone-900">{t.doctor.name}</p>
                        <p className="text-3xs text-stone-400">{t.doctor.email}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-stone-900">
                        {formatMoney(t.grossAmount, t.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-stone-500">
                        {t.earning ? formatMoney(t.earning.platformFee, t.currency) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-amber-800">
                        {t.earning ? formatMoney(t.earning.netAmount, t.currency) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-3xs font-semibold leading-5 ${getChargeStatusClassName(t)}`}>
                          {getChargeStatusLabel(t)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {t.earning ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-3xs font-semibold leading-5 ${
                            t.earning.status === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                            t.earning.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                            t.earning.status === 'cancelled' ? 'bg-rose-50 text-rose-700' :
                            'bg-stone-50 text-stone-500'
                          }`}>
                            {t.earning.status === 'paid' ? 'Liquidado' :
                             t.earning.status === 'pending' ? 'Pendiente' :
                             t.earning.status === 'cancelled' ? 'Cancelado' : t.earning.status}
                          </span>
                        ) : (
                          <span className="text-stone-400">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        {t.status === 'approved' && (
                          <button
                            onClick={() => setSelectedRefund(t)}
                            className="text-3xs bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 px-2 py-1 rounded font-medium transition"
                          >
                            Reembolsar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'payouts' && (
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-stone-100 bg-stone-50">
              <h3 className="font-semibold text-stone-900 text-base">Aprobación Manual de Liquidaciones</h3>
              <p className="text-xs text-stone-500">Listado de honorarios de consultas aprobadas pendientes de transferir a la cuenta bancaria del médico.</p>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-8 text-center text-xs text-stone-500">Cargando liquidaciones...</div>
              ) : pendingPayouts.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-500">Excelente. No hay liquidaciones pendientes de pago.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-100 text-stone-600 font-bold uppercase border-b border-stone-250">
                      <th className="px-5 py-3">Fecha Consulta</th>
                      <th className="px-5 py-3">Médico</th>
                      <th className="px-5 py-3">Datos Bancarios (CBU / Alias)</th>
                      <th className="px-5 py-3 text-right">Monto Neto</th>
                      <th className="px-5 py-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {pendingPayouts.map((t) => (
                      <tr key={t.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-5 py-3.5 text-stone-500">
                          {new Date(t.createdAt).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-stone-900">{t.doctor.name}</p>
                          <p className="text-3xs text-stone-400">{t.doctor.email}</p>
                        </td>
                        <td className="px-5 py-3.5 max-w-sm">
                          {t.doctor.cbu ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-3xs bg-stone-100 border border-stone-200 px-2 py-0.5 rounded text-stone-800">
                                CBU: {t.doctor.cbu}
                              </span>
                              <button
                                onClick={() => handleCopy(t.doctor.cbu ?? '', `cbu-${t.id}`)}
                                className="text-3xs font-semibold text-stone-500 hover:text-stone-900 border border-stone-200 rounded px-1.5 py-0.5 transition"
                              >
                                {copiedId === `cbu-${t.id}` ? 'Copiado!' : 'Copiar'}
                              </button>
                            </div>
                          ) : t.doctor.alias ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-3xs bg-stone-100 border border-stone-200 px-2 py-0.5 rounded text-stone-850">
                                ALIAS: {t.doctor.alias}
                              </span>
                              <button
                                onClick={() => handleCopy(t.doctor.alias ?? '', `alias-${t.id}`)}
                                className="text-3xs font-semibold text-stone-500 hover:text-stone-900 border border-stone-200 rounded px-1.5 py-0.5 transition"
                              >
                                {copiedId === `alias-${t.id}` ? 'Copiado!' : 'Copiar'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-rose-600 font-semibold italic text-3xs">Faltan datos de transferencia</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-stone-900">
                          {t.earning ? formatMoney(t.earning.netAmount, t.currency) : '$0,00'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            disabled={!t.doctor.cbu && !t.doctor.alias}
                            onClick={() => setSelectedPayout(t)}
                            className="bg-stone-900 hover:bg-stone-800 disabled:opacity-40 disabled:hover:bg-stone-900 text-stone-100 text-3xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition"
                          >
                            Aprobar Pago
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'disputes' && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-stone-100 bg-stone-50">
            <h3 className="font-semibold text-stone-900 text-base">Historial de Reembolsos & Auditoría</h3>
            <p className="text-xs text-stone-500">Registro histórico de transacciones canceladas y devueltas a pacientes.</p>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-stone-500">Cargando historial...</div>
            ) : transactions.filter(t => t.status === 'refunded').length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">No hay transacciones reembolsadas registradas.</div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-stone-600 font-bold uppercase border-b border-stone-250">
                    <th className="px-5 py-3">Fecha Reembolso</th>
                    <th className="px-5 py-3">Paciente</th>
                    <th className="px-5 py-3">Médico</th>
                    <th className="px-5 py-3 text-right">Monto Devuelto</th>
                    <th className="px-5 py-3">Motivo Reembolso</th>
                    <th className="px-5 py-3 text-center">Estado Médico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {transactions.filter(t => t.status === 'refunded').map((t) => (
                    <tr key={t.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-5 py-3.5 text-stone-500">
                        {t.paidAt ? new Date(t.paidAt).toLocaleDateString('es-AR') : 'N/A'}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-stone-900">{t.patient.name}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-stone-900">{t.doctor.name}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-rose-700">
                        {formatMoney(t.grossAmount, t.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-stone-600">
                        {/* @ts-ignore */}
                        {t.metadata?.refund_reason || 'Reembolso administrativo'}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full text-3xs font-semibold leading-5 border border-rose-200">
                          Ingreso Cancelado
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal: Approve Payout Manual Transfer */}
      {selectedPayout && (
        <div className="fixed inset-0 bg-stone-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-stone-250 rounded-xl max-w-md w-full shadow-2xl p-6 relative">
            <h4 className="text-base font-bold text-stone-900 border-b border-stone-100 pb-3">Registrar Transferencia a Médico</h4>
            <button
              onClick={() => setSelectedPayout(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 text-sm font-bold"
            >
              ✕
            </button>

            <form onSubmit={handlePayoutSubmit} className="space-y-4 mt-4">
              <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-xs space-y-1.5">
                <p className="text-stone-500">Destinatario: <span className="font-bold text-stone-900">{selectedPayout.doctor.name}</span></p>
                <p className="text-stone-500">Monto Neto: <span className="font-bold text-amber-800">{selectedPayout.earning ? formatMoney(selectedPayout.earning.netAmount, selectedPayout.currency) : '$0,00'}</span></p>
                <p className="text-stone-500">CBU Destino: <span className="font-mono font-bold text-stone-900">{selectedPayout.doctor.cbu || selectedPayout.doctor.alias || 'N/A'}</span></p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-600 block">Referencia de Transferencia Bancaria *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: TRANS-192837 o ID de transacción del banco"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 focus:outline-hidden"
                />
              </div>

              {payoutError && <p className="text-rose-600 text-3xs font-semibold">{payoutError}</p>}
              {payoutSuccess && <p className="text-emerald-600 text-3xs font-semibold">{payoutSuccess}</p>}

              <div className="flex gap-3 justify-end pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedPayout(null)}
                  className="bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-bold px-4 py-2 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={payoutLoading}
                  className="bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-stone-100 text-xs font-bold px-4 py-2 rounded-lg transition"
                >
                  {payoutLoading ? 'Procesando...' : 'Confirmar Liquidación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Process Refund */}
      {selectedRefund && (
        <div className="fixed inset-0 bg-stone-900/60 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-stone-250 rounded-xl max-w-md w-full shadow-2xl p-6 relative">
            <h4 className="text-base font-bold text-rose-900 border-b border-rose-100 pb-3">Efectuar Reembolso Administrativo</h4>
            <button
              onClick={() => setSelectedRefund(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 text-sm font-bold"
            >
              ✕
            </button>

            <form onSubmit={handleRefundSubmit} className="space-y-4 mt-4">
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-xs space-y-1.5">
                <p className="text-rose-950">Monto a devolver al Paciente: <span className="font-bold text-rose-800">{formatMoney(selectedRefund.grossAmount, selectedRefund.currency)}</span></p>
                <p className="text-rose-950">Paciente: <span className="font-bold text-rose-900">{selectedRefund.patient.name}</span></p>
                <p className="text-rose-950 font-semibold italic">Aviso: Esta acción cancelará inmediatamente de forma automática e irreversible el honorario pendiente de liquidar al médico.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-600 block">Motivo de Reembolso *</label>
                <textarea
                  required
                  placeholder="Detalla el motivo del reembolso para los registros de auditoría..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-900 h-20 focus:outline-hidden"
                />
              </div>

              {refundError && <p className="text-rose-600 text-3xs font-semibold">{refundError}</p>}
              {refundSuccess && <p className="text-emerald-600 text-3xs font-semibold">{refundSuccess}</p>}

              <div className="flex gap-3 justify-end pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedRefund(null)}
                  className="bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-bold px-4 py-2 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={refundLoading}
                  className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                >
                  {refundLoading ? 'Procesando...' : 'Confirmar Reembolso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
