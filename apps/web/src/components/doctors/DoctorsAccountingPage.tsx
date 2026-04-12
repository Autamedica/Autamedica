"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { fetchApi } from "@/lib/api-client";
import { DoctorsPortalFrame } from "./DoctorsPortalFrame";
import { Card, Button, Badge } from "@autamedica/ui";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Receipt,
  PiggyBank,
  Scale,
} from "lucide-react";
import type {
  DoctorFiscalProfile,
  IncomeRecord,
  ExpenseRecord,
  TaxObligation,
  FiscalSummary,
  TaxRegime,
  MonotributoCategory,
} from "@/lib/doctors/types/accounting.types";

interface DashboardData {
  profile: DoctorFiscalProfile | null;
  income: IncomeRecord[];
  expenses: ExpenseRecord[];
  obligations: TaxObligation[];
  summary: FiscalSummary | null;
}

interface RegimeComparison {
  monotributo: { category: MonotributoCategory | null; annualCost: number; feasible: boolean };
  responsableInscripto: { iva: number; ganancias: number; iibb: number; autonomos: number; annualCost: number };
  recommendation: TaxRegime;
  savings: number;
}

interface OverviewData {
  totalIncome: number;
  totalExpenses: number;
  netResult: number;
  totalObligationsPaid: number;
  totalObligationsPending: number;
  overdueCount: number;
  regimeComparison: RegimeComparison;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(cents / 100);
}

function MonthSelector({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={(e) => onChange(year, parseInt(e.target.value))}
        className="rounded-lg border border-am-surface-200 px-3 py-1.5 text-sm focus:border-am-doctor-500 focus:outline-none"
      >
        {months.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => onChange(parseInt(e.target.value), month)}
        className="rounded-lg border border-am-surface-200 px-3 py-1.5 text-sm focus:border-am-doctor-500 focus:outline-none"
      >
        {[2024, 2025, 2026, 2027].map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

type ActiveView = "dashboard" | "income" | "expenses" | "compare" | "setup";

export function DoctorsAccountingPage({ locale }: { locale?: string }) {
  const { user } = useAuthenticatedUser();
  const { doctor } = useCurrentDoctor(user?.id);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState<ActiveView>("dashboard");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const [dashData, overviewData] = await Promise.all([
        fetchApi<DashboardData>(`/api/doctors/accounting/dashboard?year=${y}&month=${m}`),
        fetchApi<OverviewData>(`/api/doctors/accounting/overview?year=${y}`),
      ]);
      setDashboard(dashData);
      setOverview(overviewData);
    } catch (err) {
      setError("Error al cargar datos contables");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) fetchDashboard(year, month);
  }, [user?.id, year, month, fetchDashboard]);

  const handlePeriodChange = (y: number, m: number) => {
    setYear(y);
    setMonth(m);
  };

  const profile = dashboard?.profile;
  const summary = dashboard?.summary;

  return (
    <DoctorsPortalFrame activeSection="accounting" title="Contabilidad" description="Gestión fiscal para médicos">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-am-surface-900">Contabilidad</h1>
            <p className="text-sm text-am-surface-500">
              Gestión fiscal — {profile?.taxRegime === "responsable_inscripto" ? "Responsable Inscripto" : "Monotributo"}
              {profile?.monotributoCategory && ` (Cat. ${profile.monotributoCategory})`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <MonthSelector year={year} month={month} onChange={handlePeriodChange} />
            <Button variant="ghost" size="sm" onClick={() => fetchDashboard(year, month)} icon={<RefreshCw className="h-4 w-4" />}>
              Actualizar
            </Button>
          </div>
        </div>

        {/* Setup prompt if no profile */}
        {!loading && !profile && (
          <Card variant="outlined" padding="lg" className="border-amber-200 bg-amber-50 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            <h2 className="text-lg font-semibold text-am-surface-900">Perfil fiscal no configurado</h2>
            <p className="mt-1 text-sm text-am-surface-600">
              Configurá tu régimen (Monotributo o Responsable Inscripto), CUIT y categoría para empezar.
            </p>
            <Button variant="primary" className="mt-4 bg-am-doctor-500 hover:bg-am-doctor-600" onClick={() => setView("setup")}>
              Configurar ahora
            </Button>
          </Card>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} variant="elevated" padding="md">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-20 rounded bg-am-surface-200" />
                  <div className="h-8 w-32 rounded bg-am-surface-100" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Stats cards */}
        {!loading && profile && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card variant="elevated" padding="md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-am-surface-500">Ingresos del mes</p>
                    <p className="text-lg font-bold text-am-surface-900">{formatCurrency(summary?.totalIncome ?? 0)}</p>
                  </div>
                </div>
              </Card>

              <Card variant="elevated" padding="md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-am-surface-500">Gastos del mes</p>
                    <p className="text-lg font-bold text-am-surface-900">{formatCurrency(summary?.totalExpenses ?? 0)}</p>
                  </div>
                </div>
              </Card>

              <Card variant="elevated" padding="md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                    <DollarSign className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-am-surface-500">Resultado neto</p>
                    <p className={`text-lg font-bold ${(summary?.netResult ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(summary?.netResult ?? 0)}
                    </p>
                  </div>
                </div>
              </Card>

              <Card variant="elevated" padding="md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                    <Receipt className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-am-surface-500">Obligaciones pendientes</p>
                    <p className="text-lg font-bold text-am-surface-900">{formatCurrency(overview?.totalObligationsPending ?? 0)}</p>
                    {(overview?.overdueCount ?? 0) > 0 && (
                      <Badge variant="danger" size="xs" dot pulse>{overview!.overdueCount} vencidas</Badge>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {/* Recategorization alert */}
            {summary?.recategorizationNeeded && (
              <Card variant="outlined" padding="sm" className="border-amber-300 bg-amber-50">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Recategorización necesaria</p>
                    <p className="text-xs text-amber-700">
                      Tu facturación acumulada ({formatCurrency(summary.accumulatedAnnualIncome)}) sugiere categoría{" "}
                      <strong>{summary.monotributoCategorySuggested}</strong> en lugar de <strong>{profile.monotributoCategory}</strong>.
                      Próximo vencimiento: enero o julio.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Two columns: Income + Expenses */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Income */}
              <Card variant="elevated" padding="sm">
                <div className="flex items-center justify-between border-b border-am-surface-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-green-600" />
                    <h3 className="text-sm font-semibold text-am-surface-900">Ingresos</h3>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setView("income")}>
                    Agregar
                  </Button>
                </div>
                <div className="divide-y divide-am-surface-100">
                  {(dashboard?.income ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-am-surface-400">Sin ingresos registrados este mes</p>
                  ) : (
                    (dashboard?.income ?? []).slice(0, 5).map((inc) => (
                      <div key={inc.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-am-surface-900">{inc.sourceName ?? inc.source}</p>
                          <p className="text-xs text-am-surface-400">{inc.description}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-green-600">{formatCurrency(inc.grossAmount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Expenses */}
              <Card variant="elevated" padding="sm">
                <div className="flex items-center justify-between border-b border-am-surface-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                    <h3 className="text-sm font-semibold text-am-surface-900">Gastos</h3>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setView("expenses")}>
                    Agregar
                  </Button>
                </div>
                <div className="divide-y divide-am-surface-100">
                  {(dashboard?.expenses ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-am-surface-400">Sin gastos registrados este mes</p>
                  ) : (
                    (dashboard?.expenses ?? []).slice(0, 5).map((exp) => (
                      <div key={exp.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-am-surface-900">{exp.description}</p>
                          <p className="text-xs text-am-surface-400">{exp.category}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-red-600">-{formatCurrency(exp.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* Regime comparison card */}
            {overview?.regimeComparison && (
              <Card variant="elevated" padding="md">
                <div className="flex items-center gap-2 mb-4">
                  <Scale className="h-5 w-5 text-am-doctor-500" />
                  <h3 className="text-sm font-semibold text-am-surface-900">Comparador: Monotributo vs Responsable Inscripto</h3>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className={`rounded-xl border p-4 ${overview.regimeComparison.recommendation === "monotributo" ? "border-green-300 bg-green-50" : "border-am-surface-200"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-am-surface-900">Monotributo</h4>
                      {overview.regimeComparison.recommendation === "monotributo" && (
                        <Badge variant="success" size="xs">Recomendado</Badge>
                      )}
                    </div>
                    {overview.regimeComparison.monotributo.feasible ? (
                      <>
                        <p className="text-xs text-am-surface-500">Categoría sugerida: <strong>{overview.regimeComparison.monotributo.category}</strong></p>
                        <p className="mt-1 text-lg font-bold text-am-surface-900">{formatCurrency(overview.regimeComparison.monotributo.annualCost)}<span className="text-xs font-normal text-am-surface-500">/año</span></p>
                      </>
                    ) : (
                      <p className="text-sm text-red-600">No elegible — ingresos exceden tope</p>
                    )}
                  </div>

                  <div className={`rounded-xl border p-4 ${overview.regimeComparison.recommendation === "responsable_inscripto" ? "border-green-300 bg-green-50" : "border-am-surface-200"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-am-surface-900">Resp. Inscripto</h4>
                      {overview.regimeComparison.recommendation === "responsable_inscripto" && (
                        <Badge variant="success" size="xs">Recomendado</Badge>
                      )}
                    </div>
                    <p className="text-lg font-bold text-am-surface-900">{formatCurrency(overview.regimeComparison.responsableInscripto.annualCost)}<span className="text-xs font-normal text-am-surface-500">/año</span></p>
                    <div className="mt-1 space-y-0.5 text-xs text-am-surface-500">
                      <p>IVA: {formatCurrency(overview.regimeComparison.responsableInscripto.iva)}</p>
                      <p>Ganancias: {formatCurrency(overview.regimeComparison.responsableInscripto.ganancias)}</p>
                      <p>IIBB: {formatCurrency(overview.regimeComparison.responsableInscripto.iibb)}</p>
                      <p>Autónomos: {formatCurrency(overview.regimeComparison.responsableInscripto.autonomos)}</p>
                    </div>
                  </div>
                </div>
                {overview.regimeComparison.savings > 0 && (
                  <p className="mt-3 text-center text-sm text-am-surface-600">
                    <PiggyBank className="mr-1 inline h-4 w-4 text-green-500" />
                    Ahorro estimado con {overview.regimeComparison.recommendation === "monotributo" ? "Monotributo" : "Resp. Inscripto"}: <strong className="text-green-600">{formatCurrency(overview.regimeComparison.savings)}/año</strong>
                  </p>
                )}
              </Card>
            )}

            {/* Obligations list */}
            {(dashboard?.obligations ?? []).length > 0 && (
              <Card variant="elevated" padding="sm">
                <div className="flex items-center gap-2 border-b border-am-surface-100 px-4 py-3">
                  <FileText className="h-4 w-4 text-am-surface-500" />
                  <h3 className="text-sm font-semibold text-am-surface-900">Obligaciones fiscales del mes</h3>
                </div>
                <div className="divide-y divide-am-surface-100">
                  {dashboard!.obligations.map((obl) => (
                    <div key={obl.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-am-surface-900">{obl.obligationType.replace(/_/g, " ")}</p>
                        <p className="text-xs text-am-surface-400">Vence: {obl.dueDate}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-am-surface-900">{formatCurrency(obl.amount)}</span>
                        <Badge variant={obl.status === "paid" ? "success" : obl.status === "overdue" ? "danger" : "warning"} size="xs">
                          {obl.status === "paid" ? "Pagado" : obl.status === "overdue" ? "Vencido" : "Pendiente"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {error && (
          <Card variant="outlined" padding="sm" className="border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}
      </div>
    </DoctorsPortalFrame>
  );
}
