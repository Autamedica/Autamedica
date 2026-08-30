'use client'

import { useState, useEffect } from 'react'
import { 
  Shield, 
  Sparkles, 
  Check, 
  ArrowRight, 
  Stethoscope, 
  FlaskConical, 
  Pill, 
  Calculator, 
  ChevronRight, 
  Lock, 
  QrCode, 
  Zap, 
  CheckCircle2 
} from 'lucide-react'

interface CatalogItem {
  id: string
  category: 'consultation' | 'lab_exam' | 'imaging' | 'medication'
  name: string
  description?: string
  market_reference_price_cents: number
  redemption_credits: number
  partner_name: string
}

export default function ReservaSaudePublicPage() {
  const [months, setMonths] = useState<number>(3)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  useEffect(() => {
    fetch('/api/reserva-saude/catalog')
      .then(res => res.json())
      .then(data => {
        if (data.catalog && Array.isArray(data.catalog)) {
          setCatalog(data.catalog)
        }
      })
      .catch(err => console.error('Erro ao carregar catálogo:', err))
      .finally(() => setLoadingCatalog(false))
  }, [])

  const accumulatedCredits = Math.min(months * 22, 600)
  
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

  return (
    <div className="bg-neutral-50 text-neutral-900 selection:bg-neutral-900 selection:text-white antialiased">
      {/* ── 1. HERO SECTION (HIGH ELEGANCE & HIGH CONTRAST) ────────────────── */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-24 bg-gradient-to-b from-white via-white to-neutral-50/80 border-b border-neutral-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6 relative z-10">
          
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-cyan-600" strokeWidth={2} />
            Programa de Benefícios & Reserva de Saúde
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-light tracking-tight text-neutral-950 leading-[1.1] max-w-3xl mx-auto">
            Precisou? Use. <br />
            <span className="font-semibold text-neutral-950">Não usou? Acumule.</span>
          </h1>

          <p className="max-w-xl mx-auto text-base sm:text-xl text-neutral-600 leading-relaxed font-normal">
            Por <strong className="text-neutral-950 font-semibold">R$ 49,90/mês</strong> você tem 1 consulta médica mensal. 
            Se estiver saudável e não usar, o valor vira créditos para especialistas, exames e farmácia.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <a
              href="/auth/register?portal=patient&plan=cuidado"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 px-8 py-4 text-sm font-semibold text-white shadow-md transition hover:bg-neutral-800 active:scale-[0.99]"
            >
              Assinar Plano Cuidado (R$ 49,90/mês)
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/auth/register?portal=patient"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 py-4 text-sm font-semibold text-neutral-800 shadow-xs transition hover:bg-neutral-100 active:scale-[0.99]"
            >
              Começar Grátis
            </a>
          </div>

          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-xs font-medium text-neutral-700">
            <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-3 py-1 rounded-full">
              <QrCode className="h-3.5 w-3.5 text-emerald-700" strokeWidth={2} /> Pagamento via Pix ou Cartão
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} /> Sem carência
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} /> Cancele quando quiser
            </span>
          </div>
        </div>
      </section>

      {/* ── 2. COMPARADOR DE PLANOS (SHARP CONTRASTS) ──────────────────────── */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 space-y-12">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Transparência
          </div>
          <h2 className="text-3xl sm:text-4xl font-light tracking-tight text-neutral-950">
            Compare os Planos
          </h2>
          <p className="text-neutral-600 text-sm max-w-md mx-auto">
            Escolha entre o acesso gratuito avulso ou a proteção contínua com acúmulo de créditos.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-stretch">
          {/* PLANO FREE */}
          <div className="flex flex-col justify-between rounded-3xl border border-neutral-300 bg-white p-8 shadow-xs hover:border-neutral-400 transition-all space-y-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-neutral-100 border border-neutral-200 px-3 py-1 text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                  Acesso Avulso
                </span>
                <span className="text-3xl font-light text-neutral-950">R$ 0</span>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-neutral-950">AutaMedica Free</h3>
                <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                  Cadastre-se gratuitamente e pague apenas o valor de cada consulta quando precisar.
                </p>
              </div>

              <ul className="space-y-3.5 pt-4 text-sm text-neutral-700 border-t border-neutral-200">
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-neutral-950 shrink-0 mt-0.5" strokeWidth={2} />
                  <span>Prontuário digital e receitas válidas em todo o Brasil</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-neutral-950 shrink-0 mt-0.5" strokeWidth={2} />
                  <span>Consultas avulsas a partir de R$ 49 via <strong>Pix</strong></span>
                </li>
                <li className="flex items-start gap-3 text-neutral-400">
                  <Lock className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" strokeWidth={1.5} />
                  <span>Sem acúmulo de créditos na Reserva de Saúde</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <a
                href="/auth/register?portal=patient"
                className="w-full inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white py-3.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-50 shadow-xs"
              >
                Criar Conta Gratuita
              </a>
            </div>
          </div>

          {/* PLANO CUIDADO (HERO CARD DESTACADO) */}
          <div className="relative flex flex-col justify-between rounded-3xl border-2 border-neutral-950 bg-white p-8 shadow-xl space-y-8">
            <div className="absolute -top-3.5 right-8">
              <span className="rounded-full bg-neutral-950 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
                Mais Recomendado
              </span>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-cyan-50 border border-cyan-300 px-3 py-1 text-[11px] font-bold text-cyan-900 uppercase tracking-wider">
                    Reserva Ativa
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <QrCode className="w-3.5 h-3.5 text-emerald-700" /> Pix
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-light text-neutral-950">R$ 49,90</span>
                  <span className="text-xs text-neutral-500 font-medium block">/mês</span>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-neutral-950">AutaMedica Cuidado</h3>
                <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                  1 teleconsulta clínica mensal incluída + acúmulo de créditos nos meses sem uso.
                </p>
              </div>

              <ul className="space-y-3.5 pt-4 text-sm text-neutral-900 border-t border-neutral-200">
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span><strong>1 consulta médica mensal</strong> de telemedicina incluída</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span><strong>Não usou no mês?</strong> Ganhe <strong>+22 créditos</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span>Troque por <strong>cardiologistas, exames de sangue e farmácia</strong></span>
                </li>
                <li className="flex items-start gap-3 text-xs text-neutral-600 pt-1">
                  <Zap className="h-4 w-4 text-cyan-700 shrink-0" strokeWidth={2} />
                  <span>Cobrança automática sem burocracia via <strong>Pix</strong> ou cartão</span>
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <a
                href="/auth/register?portal=patient&plan=cuidado"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-950 py-4 text-sm font-semibold text-white transition hover:bg-neutral-850 shadow-md active:scale-[0.99]"
              >
                Assinar com Pix ou Cartão
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. SIMULADOR DE RESERVA (HIGH ELEGANCE) ─────────────────────────── */}
      <section className="py-20 bg-white border-y border-neutral-200/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-700 uppercase tracking-wider">
              <Calculator className="h-4 w-4 text-cyan-600" strokeWidth={2} />
              Simulador de Economia
            </div>
            <h2 className="text-2xl sm:text-3xl font-light text-neutral-950">
              Quanto você acumula na sua Reserva?
            </h2>
            <p className="text-neutral-600 text-sm">
              Arraste a barra para ver os serviços desbloqueados nos meses saudáveis:
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-300 bg-neutral-50/80 p-8 shadow-xs space-y-8">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm font-medium text-neutral-800">
                <span>Tempo sem consultas clínicas:</span>
                <span className="text-lg font-bold text-neutral-950 bg-white px-3 py-1 rounded-lg border border-neutral-200 shadow-xs">
                  {months} {months === 1 ? 'mês' : 'meses'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="12"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="w-full h-2.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-950"
              />
              <div className="flex justify-between text-xs font-semibold text-neutral-500">
                <span>1 mês (22 pts)</span>
                <span>6 meses (132 pts)</span>
                <span>12 meses (264 pts)</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5 pt-4 border-t border-neutral-200">
              <div className="rounded-2xl border border-neutral-300 bg-white p-5 space-y-1 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Saldo Disponível</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-light text-neutral-950 tracking-tight">{accumulatedCredits}</span>
                  <span className="text-xs font-bold text-cyan-800 uppercase">AUTA Créditos</span>
                </div>
                <p className="text-xs text-neutral-500 pt-1">
                  Válidos por até 24 meses sem expirar
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-300 bg-white p-5 space-y-2 shadow-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Serviços Desbloqueados:</span>
                <div className="text-xs font-medium space-y-1.5 pt-0.5">
                  {accumulatedCredits >= 100 && (
                    <p className="text-emerald-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>1 Consulta com Cardiologista</span>
                    </p>
                  )}
                  {accumulatedCredits >= 60 && (
                    <p className="text-cyan-800 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-cyan-600 shrink-0" />
                      <span>1 Check-up de Sangue Completo</span>
                    </p>
                  )}
                  {accumulatedCredits >= 55 && (
                    <p className="text-neutral-900 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-neutral-800 shrink-0" />
                      <span>1 Voucher para Farmácia</span>
                    </p>
                  )}
                  {accumulatedCredits < 55 && (
                    <p className="text-neutral-500 text-xs">
                      Acumule mais 1 mês saudável para desbloquear seu primeiro voucher.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. CATÁLOGO OFICIAL DE RESGATES ─────────────────────────────────── */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Rede Conveniada
          </div>
          <h2 className="text-3xl font-light text-neutral-950">Catálogo de Resgates</h2>
          <p className="text-neutral-600 text-sm">
            Preço particular de mercado vs. créditos necessários para emissão direta de voucher.
          </p>
        </div>

        {loadingCatalog ? (
          <div className="p-8 text-center text-neutral-500 text-xs">Carregando catálogo oficial...</div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-6">
            {catalog.map((item) => (
              <div 
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-neutral-300 bg-white p-6 shadow-xs space-y-5 hover:border-neutral-400 hover:shadow-md transition-all duration-200"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-neutral-100 text-neutral-800">
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-neutral-400 line-through block font-medium">
                        {formatBrl(item.market_reference_price_cents)}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-neutral-500">Valor Mercado</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-neutral-950 leading-snug">{item.name}</h3>
                    <p className="text-xs text-cyan-800 font-medium mt-1">📍 {item.partner_name}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block">Custo de Resgate</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold text-neutral-950">{item.redemption_credits}</span>
                      <span className="text-xs font-semibold text-neutral-600">créditos</span>
                    </div>
                  </div>
                  <a
                    href="/auth/register?portal=patient&plan=cuidado"
                    className="inline-flex items-center gap-1 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 transition shadow-xs"
                  >
                    Resgatar
                    <ChevronRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 5. PERGUNTAS FREQUENTES (ALTA LEGIBILIDAD) ───────────────────────── */}
      <section className="py-16 bg-white border-t border-neutral-200/80">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-6">
          <h3 className="text-2xl font-light text-neutral-950 text-center">Dúvidas Frequentes</h3>

          <div className="space-y-4 text-sm text-neutral-700">
            <div className="rounded-2xl border border-neutral-300 bg-neutral-50 p-5 space-y-1.5 shadow-xs">
              <strong className="text-neutral-950 block font-semibold text-base">Como posso pagar?</strong>
              <p className="text-neutral-600 leading-relaxed">
                Você pode pagar via <strong>Pix instantâneo (QR Code / Copia e Cola)</strong> ou cartão de crédito com renovação mensal sem burocracia.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-300 bg-neutral-50 p-5 space-y-1.5 shadow-xs">
              <strong className="text-neutral-950 block font-semibold text-base">O que acontece se eu não usar a consulta no mês?</strong>
              <p className="text-neutral-600 leading-relaxed">
                Você ganha automaticamente <strong>22 AUTA Créditos</strong> na sua Reserva de Saúde para usar quando precisar.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-300 bg-neutral-50 p-5 space-y-1.5 shadow-xs">
              <strong className="text-neutral-950 block font-semibold text-base">Os créditos expiram?</strong>
              <p className="text-neutral-600 leading-relaxed">
                Seus créditos ficam válidos por até 24 meses enquanto sua assinatura estiver ativa, com teto de até 600 créditos.
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-300 bg-neutral-50 p-5 space-y-1.5 shadow-xs">
              <strong className="text-neutral-950 block font-semibold text-base">Posso cancelar quando quiser?</strong>
              <p className="text-neutral-600 leading-relaxed">
                Sim. Cancelamento direto pelo aplicativo em 1 clique, sem taxas nem multas contratuais.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. DISCLAIMER INSTITUCIONAL ────────────────────────────────────── */}
      <div className="py-8 bg-neutral-100/60 text-center text-xs text-neutral-500 px-4 border-t border-neutral-200">
        A AutaMedica é uma plataforma tecnológica de telemedicina e programa de benefícios em rede conveniada. Não é operadora de plano de saúde.
      </div>
    </div>
  )
}
