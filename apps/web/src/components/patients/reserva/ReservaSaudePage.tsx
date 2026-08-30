'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, 
  Coins, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ArrowRight, 
  Stethoscope, 
  FlaskConical, 
  Pill, 
  Ticket,
  ChevronRight,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react'
import { PixCheckoutModal } from '@/components/payments/PixCheckoutModal'

interface HealthReserveData {
  patient_id: string
  benefit_balance: number
  max_cap_credits: number
  status: string
  subscription_tier: 'free' | 'cuidado'
  subscription_status: string
}

interface LedgerMovement {
  id: string
  amount_credits: number
  kind: string
  ref: string
  balance_after: number
  voucher_id?: string
  appointment_id?: string
  metadata: {
    reason?: string
    item_name?: string
    category?: string
    market_reference_price_cents?: number
  }
  created_at: string
}

interface BenefitVoucher {
  id: string
  voucher_code: string
  credits_spent: number
  copay_amount_cents: number
  status: 'issued' | 'redeemed' | 'settled' | 'cancelled' | 'expired'
  expires_at: string
  redeemed_at?: string
  created_at: string
  metadata: {
    item_name?: string
    partner_name?: string
  }
  catalog_item_id: string
}

interface CatalogItem {
  id: string
  category: 'consultation' | 'lab_exam' | 'imaging' | 'medication'
  name: string
  description?: string
  market_reference_price_cents: number
  redemption_credits: number
  partner_name: string
}

export default function ReservaSaudePage() {
  const [reserve, setReserve] = useState<HealthReserveData | null>(null)
  const [movements, setMovements] = useState<LedgerMovement[]>([])
  const [vouchers, setVouchers] = useState<BenefitVoucher[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [_error, setError] = useState<string | null>(null)
  
  // Redeem state
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemSuccessVoucher, setRedeemSuccessVoucher] = useState<{ voucher_code: string; credits_spent: number } | null>(null)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [copiedVoucherCode, setCopiedVoucherCode] = useState<string | null>(null)
  const [selectedLedgerFilter, setSelectedLedgerFilter] = useState<'all' | 'accrual' | 'redemption'>('all')
  const [showPixModal, setShowPixModal] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reserveRes, catalogRes] = await Promise.all([
        fetch('/api/patients/reserva-saude'),
        fetch('/api/patients/reserva-saude/catalog'),
      ])

      if (!reserveRes.ok || !catalogRes.ok) {
        throw new Error('Falha ao carregar dados da Reserva de Saúde')
      }

      const reserveJson = await reserveRes.json()
      const catalogJson = await catalogRes.json()

      setReserve(reserveJson.reserve)
      setMovements(reserveJson.movements || [])
      setVouchers(reserveJson.vouchers || [])
      setCatalog(catalogJson.catalog || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedVoucherCode(code)
    setTimeout(() => setCopiedVoucherCode(null), 2500)
  }

  const handleRedeem = async () => {
    if (!selectedItem || !reserve) return
    setRedeeming(true)
    setRedeemError(null)

    try {
      const idempotencyKey = `${selectedItem.id}_${Date.now()}`
      const res = await fetch('/api/patients/reserva-saude/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogItemId: selectedItem.id, idempotencyKey }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Falha ao realizar resgate')
      }

      setRedeemSuccessVoucher({
        voucher_code: data.data.voucher_code,
        credits_spent: data.data.credits_spent,
      })
      
      await fetchData()
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Erro ao processar resgate')
    } finally {
      setRedeeming(false)
    }
  }

  const filteredMovements = useMemo(() => {
    if (selectedLedgerFilter === 'all') return movements
    if (selectedLedgerFilter === 'accrual') {
      return movements.filter(m => m.kind === 'monthly_benefit_accrual' || m.kind === 'benefit_consumed')
    }
    return movements.filter(m => m.kind.startsWith('redeem_'))
  }, [movements, selectedLedgerFilter])

  const formatBrl = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'consultation':
        return <Stethoscope className="w-5 h-5 text-cyan-600" strokeWidth={1.5} />
      case 'lab_exam':
        return <FlaskConical className="w-5 h-5 text-emerald-600" strokeWidth={1.5} />
      case 'medication':
        return <Pill className="w-5 h-5 text-indigo-600" strokeWidth={1.5} />
      default:
        return <Shield className="w-5 h-5 text-neutral-600" strokeWidth={1.5} />
    }
  }

  if (loading && !reserve) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-neutral-900 animate-spin" />
          <p className="text-neutral-500 text-sm font-medium">Carregando sua Reserva de Saúde...</p>
        </div>
      </div>
    )
  }

  const balance = reserve?.benefit_balance ?? 0
  const maxCap = reserve?.max_cap_credits ?? 600
  const progressPercent = Math.min(Math.round((balance / maxCap) * 100), 100)
  const isCuidado = reserve?.subscription_tier === 'cuidado'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* ── HEADER CARD ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-neutral-900 text-white p-6 md:p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${
              isCuidado
                ? reserve?.subscription_status === 'past_due'
                  ? 'bg-amber-500/20 border-amber-400/30 text-amber-200'
                  : 'bg-white/10 border-white/15 text-neutral-200'
                : 'bg-white/10 border-white/15 text-neutral-300'
            }`}>
              {isCuidado ? (
                reserve?.subscription_status === 'past_due' ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    Plano Cuidado • Pagamento Pendente
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Plano AUTAMÉDICA Cuidado (R$ 49,90/mês)
                  </>
                )
              ) : (
                <>
                  <Coins className="w-3.5 h-3.5 text-neutral-300" />
                  AUTAMÉDICA Free
                </>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-light tracking-tight text-white">
              Minha Reserva de Saúde
            </h1>
            <p className="text-neutral-300 text-sm md:text-base max-w-xl font-normal leading-relaxed">
              Você tem acesso ao benefício de atendimento clínico. 
              <strong className="text-white font-semibold"> Precisou? Use. </strong> 
              <strong className="text-emerald-400 font-semibold">Não precisou? Acumule (+22 créditos/mês) </strong> 
              para especialistas, exames e farmácia.
            </p>
          </div>

          {/* BALANCE DISPLAY CARD */}
          <div className="w-full md:w-auto min-w-[280px] bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Saldo Disponível</span>
              <Coins className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-light text-white tracking-tight">{balance}</span>
              <span className="text-sm font-semibold text-cyan-400">AUTA Créditos</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-neutral-400">
                <span>Capacidade acumulada</span>
                <span>{balance} / {maxCap} pts</span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PAST DUE WARNING BANNER ───────────────────────────────────────────── */}
      {isCuidado && reserve?.subscription_status === 'past_due' && (
        <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-100 text-amber-900">
              <AlertCircle className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-amber-950">Pagamento Pendente / Vencido</h3>
              <p className="text-xs text-amber-800 mt-1 max-w-xl">
                A renovação mensal do seu Plano Cuidado não foi confirmada. Regularize seu pagamento via Pix para continuar acumulando seus +22 AUTA Créditos mensais e manter o resgate de benefícios ativo.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPixModal(true)}
            className="w-full md:w-auto px-6 py-3 rounded-xl bg-amber-900 text-white font-semibold text-sm hover:bg-amber-800 transition-all shadow-sm shrink-0 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            Regularizar com Pix
          </button>
        </div>
      )}

      {/* ── NOT CUIDADO ALERT (UPSELL) ────────────────────────────────────────── */}
      {!isCuidado && (
        <div className="p-6 rounded-2xl bg-white border border-neutral-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-neutral-100 text-neutral-900">
              <Shield className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-neutral-900">Ative o Plano Cuidado por R$ 49,90/mês</h3>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Pix ou Cartão
                </span>
              </div>
              <p className="text-neutral-500 text-sm mt-0.5">
                Garanta 1 atendimento clínico mensal e acumule 22 AUTA Créditos todo mês que não precisar de consulta.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowPixModal(true)}
            className="w-full md:w-auto px-6 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 shrink-0"
          >
            Assinar com Pix (R$ 49,90)
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── SECCIÓN: VOUCHERS ATIVOS ─────────────────────────────────────────── */}
      {vouchers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
              <Ticket className="w-5 h-5 text-emerald-600" />
              Seus Vouchers Ativos
            </h2>
            <span className="text-xs text-neutral-500 font-medium">{vouchers.length} disponível(is)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vouchers.map((v) => (
              <div 
                key={v.id} 
                className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-sm space-y-3 relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                      Voucher de Atendimento
                    </span>
                    <h4 className="text-base font-semibold text-neutral-900 mt-0.5">
                      {v.metadata.item_name || 'Serviço em Rede Credenciada'}
                    </h4>
                    <p className="text-xs text-neutral-500">{v.metadata.partner_name}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {v.status === 'issued' ? 'Pronto para Uso' : v.status}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-50 border border-dashed border-neutral-300 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Código do Voucher</span>
                    <span className="text-lg font-mono font-bold text-neutral-900 tracking-wider">
                      {v.voucher_code}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyCode(v.voucher_code)}
                    className="p-2 rounded-lg bg-white border border-neutral-200 hover:bg-neutral-100 text-neutral-600 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    {copiedVoucherCode === v.voucher_code ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-neutral-500" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
                  <span>Válido até: {new Date(v.expires_at).toLocaleDateString('pt-BR')}</span>
                  <span>{v.credits_spent} créditos resgatados</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECCIÓN: CATÁLOGO DE RESGATE ─────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
            <Coins className="w-5 h-5 text-cyan-600" />
            Catálogo de Resgate em Rede Credenciada
          </h2>
          <p className="text-neutral-500 text-sm">
            Troque seus AUTA Créditos por consultas especializadas, check-ups laboratoriais e medicamentos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {catalog.map((item) => {
            const canAfford = balance >= item.redemption_credits
            return (
              <div 
                key={item.id}
                className={`flex flex-col justify-between p-6 rounded-2xl border transition-all ${
                  canAfford 
                    ? 'bg-white border-neutral-200 shadow-sm hover:shadow-md' 
                    : 'bg-white/60 border-neutral-200/60 opacity-80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-neutral-100 text-neutral-700">
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-neutral-400 line-through block">
                        {formatBrl(item.market_reference_price_cents)}
                      </span>
                      <span className="text-[11px] font-semibold text-neutral-500 uppercase">Preço Mercado</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-neutral-900 leading-snug">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                    )}
                  </div>
                  <p className="text-xs text-cyan-700 font-medium">📍 {item.partner_name}</p>
                </div>

                <div className="pt-4 border-t border-neutral-100 mt-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">Custo de Resgate</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-semibold text-neutral-900">{item.redemption_credits}</span>
                      <span className="text-xs font-semibold text-neutral-500">créditos</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedItem(item)
                      setRedeemError(null)
                      setRedeemSuccessVoucher(null)
                    }}
                    disabled={!canAfford}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      canAfford
                        ? 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm'
                        : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                    }`}
                  >
                    {canAfford ? 'Resgatar' : 'Saldo Insuficiente'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── SECCIÓN: LEDGER INMUTABLE (EXTRATO) ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-neutral-500" />
            Extrato da Reserva de Saúde
          </h2>

          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'accrual', label: 'Acumulações' },
              { id: 'redemption', label: 'Resgates' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedLedgerFilter(tab.id as 'all' | 'accrual' | 'redemption')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  selectedLedgerFilter === tab.id
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm">
          {filteredMovements.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 text-sm">
              Nenhuma movimentação registrada na sua Reserva de Saúde até o momento.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredMovements.map((m) => {
                const isPositive = m.amount_credits > 0
                const isZero = m.amount_credits === 0
                return (
                  <div key={m.id} className="p-4 flex items-center justify-between gap-4 hover:bg-neutral-50/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${
                        isPositive 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : isZero 
                            ? 'bg-cyan-50 text-cyan-700' 
                            : 'bg-neutral-100 text-neutral-700'
                      }`}>
                        {isPositive ? <Sparkles className="w-4 h-4" /> : isZero ? <CheckCircle2 className="w-4 h-4" /> : <Ticket className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {m.kind === 'monthly_benefit_accrual' && 'Acumulação Mensal de Reserva (+22)'}
                          {m.kind === 'benefit_consumed' && 'Benefício de Atendimento Clínico Utilizado'}
                          {m.kind === 'redeem_specialist' && `Resgate: Especialista (${m.metadata.item_name || 'Consulta'})`}
                          {m.kind === 'redeem_laboratory' && `Resgate: Exame Laboratorial`}
                          {m.kind === 'redeem_pharmacy' && `Resgate: Voucher Farmácia`}
                          {!['monthly_benefit_accrual', 'benefit_consumed', 'redeem_specialist', 'redeem_laboratory', 'redeem_pharmacy'].includes(m.kind) && m.kind}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-sm font-semibold ${
                        isPositive 
                          ? 'text-emerald-700' 
                          : isZero 
                            ? 'text-neutral-500' 
                            : 'text-neutral-900'
                      }`}>
                        {isPositive ? `+${m.amount_credits}` : isZero ? '0' : m.amount_credits} pts
                      </span>
                      <span className="text-xs text-neutral-400 block font-normal">
                        Saldo: {m.balance_after} pts
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL DE RESGATE ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white border border-neutral-200 rounded-3xl p-6 shadow-2xl space-y-5"
            >
              {!redeemSuccessVoucher ? (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-cyan-700 uppercase tracking-wider">Confirmar Resgate</span>
                      <h3 className="text-xl font-semibold text-neutral-900 mt-1">{selectedItem.name}</h3>
                      <p className="text-xs text-neutral-500">{selectedItem.partner_name}</p>
                    </div>
                    <button 
                      onClick={() => setSelectedItem(null)}
                      className="text-neutral-400 hover:text-neutral-900 text-lg font-bold p-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Custo do benefício:</span>
                      <span className="font-semibold text-neutral-900">{selectedItem.redemption_credits} AUTA Créditos</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-500">Seu saldo atual:</span>
                      <span className="font-semibold text-neutral-900">{balance} créditos</span>
                    </div>
                    <div className="border-t border-neutral-200 pt-2 flex justify-between text-sm">
                      <span className="text-neutral-500">Saldo após o resgate:</span>
                      <span className="font-bold text-cyan-700">{balance - selectedItem.redemption_credits} créditos</span>
                    </div>
                  </div>

                  {redeemError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {redeemError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setSelectedItem(null)}
                      className="flex-1 px-4 py-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-sm transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleRedeem}
                      disabled={redeeming}
                      className="flex-1 px-4 py-3 rounded-xl bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition-all flex items-center justify-center gap-2"
                    >
                      {redeeming ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirmar Resgate'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-4 py-2">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-neutral-900">Voucher Emitido com Sucesso!</h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      Apresente o código abaixo no prestador parceiro para utilizar seu benefício.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-neutral-50 border border-dashed border-neutral-300">
                    <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block">Código do Voucher</span>
                    <span className="text-2xl font-mono font-bold text-neutral-900 tracking-widest block mt-1">
                      {redeemSuccessVoucher.voucher_code}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-400">
                    Validade de 60 dias. O voucher já está disponível na sua lista de vouchers ativos.
                  </p>

                  <button
                    onClick={() => {
                      setSelectedItem(null)
                      setRedeemSuccessVoucher(null)
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-sm transition-all"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PIX CHECKOUT MODAL ──────────────────────────────────────────────── */}
      <PixCheckoutModal
        isOpen={showPixModal}
        onClose={() => setShowPixModal(false)}
        type="subscription"
        onSuccess={() => {
          setShowPixModal(false)
          fetchData()
        }}
      />
    </div>
  )
}
