"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { fetchApi } from "@/lib/api-client";
import { DoctorsPortalFrame } from "./DoctorsPortalFrame";
import { Card, Button, Badge } from "@autamedica/ui";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeft,
  RefreshCw,
  Receipt,
  PiggyBank,
  Scale,
  Save,
  Loader2,
} from "lucide-react";
import type {
  DoctorFiscalProfile,
  IncomeRecord,
  ExpenseRecord,
  TaxObligation,
  FiscalSummary,
  TaxRegime,
  MonotributoCategory,
  IncomeSource,
  ExpenseCategory,
} from "@/lib/doctors/types/accounting.types";
import { MONOTRIBUTO_CATEGORIES_2026 } from "@/lib/doctors/types/accounting.types";

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

export function DoctorsAccountingPage({ locale: _locale }: { locale?: string }) {
  const { user } = useAuthenticatedUser();
  useCurrentDoctor(user?.id);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState<ActiveView>("dashboard");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Setup form state ──
  const [setupRegime, setSetupRegime] = useState<TaxRegime>("monotributo");
  const [setupCuit, setSetupCuit] = useState("");
  const [setupCategory, setSetupCategory] = useState<MonotributoCategory>("A");
  const [setupInvoiceType, setSetupInvoiceType] = useState("C");

  // ── Income form state ──
  const [incomeSource, setIncomeSource] = useState<IncomeSource>("consulta_particular");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDescription, setIncomeDescription] = useState("");

  // ── Expense form state ──
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("insumos");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseSupplier, setExpenseSupplier] = useState("");

  const saveProfile = async () => {
    setSaving(true);
    try {
      await fetchApi("/api/doctors/accounting/profile", {
        method: "PUT",
        body: {
          taxRegime: setupRegime,
          cuit: setupCuit.replace(/\D/g, ""),
          monotributoCategory: setupRegime === "monotributo" ? setupCategory : null,
          invoiceType: setupInvoiceType,
        },
      });
      setView("dashboard");
      void fetchDashboard(year, month);
    } catch {
      setError("Error al guardar perfil fiscal");
    } finally {
      setSaving(false);
    }
  };

  const saveIncome = async () => {
    if (!incomeAmount || !incomeDescription) return;
    setSaving(true);
    try {
      await fetchApi("/api/doctors/accounting/income", {
        method: "POST",
        body: {
          source: incomeSource,
          grossAmount: Math.round(parseFloat(incomeAmount) * 100),
          description: incomeDescription,
          periodYear: year,
          periodMonth: month,
        },
      });
      setIncomeAmount("");
      setIncomeDescription("");
      setView("dashboard");
      void fetchDashboard(year, month);
    } catch {
      setError("Error al registrar ingreso");
    } finally {
      setSaving(false);
    }
  };

  const saveExpense = async () => {
    if (!expenseAmount || !expenseDescription) return;
    setSaving(true);
    try {
      await fetchApi("/api/doctors/accounting/expenses", {
        method: "POST",
        body: {
          category: expenseCategory,
          amount: Math.round(parseFloat(expenseAmount) * 100),
          description: expenseDescription,
          supplierName: expenseSupplier || null,
          periodYear: year,
          periodMonth: month,
        },
      });
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseSupplier("");
      setView("dashboard");
      void fetchDashboard(year, month);
    } catch {
      setError("Error al registrar gasto");
    } finally {
      setSaving(false);
    }
  };

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

  // ── SETUP VIEW ──
  if (view === "setup") {
    return (
      <DoctorsPortalFrame activeSection="accounting" title="Configurar perfil fiscal" description="Configurá tu régimen tributario para empezar a registrar ingresos y gastos.">
        <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
          <button type="button" onClick={() => setView("dashboard")} className="inline-flex items-center gap-2 text-[13px] text-neutral-400 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="size-3.5" /> Volver
          </button>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Régimen tributario</label>
              <div className="grid grid-cols-2 gap-3">
                {(["monotributo", "responsable_inscripto"] as const).map((regime) => (
                  <button
                    key={regime}
                    type="button"
                    onClick={() => setSetupRegime(regime)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      setupRegime === regime
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 hover:border-neutral-300"
                    }`}
                  >
                    <p className="text-sm font-medium">{regime === "monotributo" ? "Monotributo" : "Responsable Inscripto"}</p>
                    <p className={`mt-1 text-[11px] ${setupRegime === regime ? "text-white/60" : "text-neutral-400"}`}>
                      {regime === "monotributo" ? "Régimen simplificado" : "IVA + Ganancias + IIBB"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">CUIT</label>
              <input
                type="text"
                value={setupCuit}
                onChange={(e) => setSetupCuit(e.target.value)}
                placeholder="XX-XXXXXXXX-X"
                maxLength={13}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              />
            </div>

            {setupRegime === "monotributo" && (
              <div>
                <label className="mb-2 block text-[13px] font-medium text-neutral-700">Categoría</label>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {MONOTRIBUTO_CATEGORIES_2026.map((info) => (
                    <button
                      key={info.category}
                      type="button"
                      onClick={() => setSetupCategory(info.category)}
                      className={`rounded-lg border-2 px-3 py-2 text-center transition-all ${
                        setupCategory === info.category
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-200 hover:border-neutral-300"
                      }`}
                    >
                      <p className="text-sm font-semibold">{info.category}</p>
                      <p className={`text-[10px] ${setupCategory === info.category ? "text-white/60" : "text-neutral-400"}`}>
                        ${Math.round(info.monthlyFee / 100).toLocaleString("es-AR")}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Tipo de factura</label>
              <select
                value={setupInvoiceType}
                onChange={(e) => setSetupInvoiceType(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              >
                {setupRegime === "monotributo" ? (
                  <option value="C">Factura C</option>
                ) : (
                  <>
                    <option value="A">Factura A</option>
                    <option value="B">Factura B</option>
                    <option value="M">Factura M</option>
                  </>
                )}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={saving || !setupCuit.replace(/\D/g, "")}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" strokeWidth={1.5} />}
              Guardar perfil fiscal
            </button>
          </div>
        </div>
      </DoctorsPortalFrame>
    );
  }

  // ── INCOME VIEW ──
  if (view === "income") {
    const SOURCE_LABELS: Record<IncomeSource, string> = {
      consulta_particular: "Consulta particular",
      obra_social: "Obra social",
      prepaga: "Prepaga",
      clinica: "Clínica/Sanatorio",
      otro: "Otro ingreso",
    };

    return (
      <DoctorsPortalFrame activeSection="accounting" title="Registrar ingreso" description="Agregá un nuevo ingreso a tu contabilidad mensual.">
        <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
          <button type="button" onClick={() => setView("dashboard")} className="inline-flex items-center gap-2 text-[13px] text-neutral-400 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="size-3.5" /> Volver
          </button>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Origen del ingreso</label>
              <div className="space-y-2">
                {(Object.entries(SOURCE_LABELS) as [IncomeSource, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIncomeSource(key)}
                    className={`w-full rounded-xl border-2 px-4 py-3 text-left text-sm transition-all ${
                      incomeSource === key
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 hover:border-neutral-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Monto bruto (ARS)</label>
              <input
                type="number"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
                placeholder="Ej: 25000"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Descripción</label>
              <input
                type="text"
                value={incomeDescription}
                onChange={(e) => setIncomeDescription(e.target.value)}
                placeholder="Ej: Consulta paciente García"
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={() => void saveIncome()}
              disabled={saving || !incomeAmount || !incomeDescription}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={1.5} />}
              Registrar ingreso
            </button>
          </div>
        </div>
      </DoctorsPortalFrame>
    );
  }

  // ── EXPENSES VIEW ──
  if (view === "expenses") {
    const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
      alquiler: "Alquiler consultorio",
      insumos: "Insumos médicos",
      equipamiento: "Equipamiento",
      formacion: "Formación / Congresos",
      seguros: "Seguros",
      transporte: "Transporte",
      servicios: "Servicios (luz, internet)",
      honorarios_contador: "Honorarios contador",
      otro: "Otro gasto",
    };

    return (
      <DoctorsPortalFrame activeSection="accounting" title="Registrar gasto" description="Agregá un gasto deducible a tu contabilidad.">
        <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
          <button type="button" onClick={() => setView("dashboard")} className="inline-flex items-center gap-2 text-[13px] text-neutral-400 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="size-3.5" /> Volver
          </button>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Categoría</label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              >
                {(Object.entries(EXPENSE_LABELS) as [ExpenseCategory, string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Monto (ARS)</label>
              <input
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="Ej: 15000"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Descripción</label>
              <input
                type="text"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
                placeholder="Ej: Compra de guantes descartables"
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="mb-2 block text-[13px] font-medium text-neutral-700">Proveedor (opcional)</label>
              <input
                type="text"
                value={expenseSupplier}
                onChange={(e) => setExpenseSupplier(e.target.value)}
                placeholder="Ej: Droguería del Centro"
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:border-neutral-900 focus:outline-none transition-colors"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={() => void saveExpense()}
              disabled={saving || !expenseAmount || !expenseDescription}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={1.5} />}
              Registrar gasto
            </button>
          </div>
        </div>
      </DoctorsPortalFrame>
    );
  }

  // ── DASHBOARD VIEW ──
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
                      <Badge variant="danger" size="xs" dot pulse>{overview?.overdueCount ?? 0} vencidas</Badge>
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
                  {(dashboard?.obligations ?? []).map((obl) => (
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
