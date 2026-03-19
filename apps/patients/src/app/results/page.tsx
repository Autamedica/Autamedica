'use client'

import { useState } from 'react'
import {
  FileText,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Download,
  Upload,
  Filter,
  Calendar,
  Activity,
  Microscope,
  Image as ImageIcon
} from 'lucide-react'
import { DashboardPageShell } from '@/components/layout/DashboardPageShell'

type ResultCategory = 'all' | 'lab' | 'imaging' | 'reports'

export default function ResultsPage() {
  const [activeCategory, setActiveCategory] = useState<ResultCategory>('all')

  return (
    <DashboardPageShell aside="none">
      <div>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-stone-900">📊 Mis Hallazgos</h1>
          <p className="mt-2 text-sm text-stone-600 leading-relaxed max-w-2xl">
            Una visión clara de tu evolución clínica. Accede a tus estudios recientes, analiza tendencias históricas y comprende el significado de cada indicador junto a tu equipo médico.
          </p>
        </div>

        {/* Acciones rápidas */}
        <div className="mb-6 flex flex-wrap gap-3">
          <button className="flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800">
            <Upload className="h-4 w-4" />
            Añadir nuevo estudio
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50">
            <Download className="h-4 w-4" />
            Descargar mi reporte clínico
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50">
            <Filter className="h-4 w-4" />
            Filtrar por tipo
          </button>
        </div>

        {/* Categorías */}
        <div className="mb-6 flex flex-wrap gap-2">
          <CategoryTab
            active={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
            icon={<FileText className="h-4 w-4" />}
            label="Vista General"
          />
          <CategoryTab
            active={activeCategory === 'lab'}
            onClick={() => setActiveCategory('lab')}
            icon={<Microscope className="h-4 w-4" />}
            label="Bioquímica"
          />
          <CategoryTab
            active={activeCategory === 'imaging'}
            onClick={() => setActiveCategory('imaging')}
            icon={<ImageIcon className="h-4 w-4" />}
            label="Diagnóstico Visual"
          />
          <CategoryTab
            active={activeCategory === 'reports'}
            onClick={() => setActiveCategory('reports')}
            icon={<FileText className="h-4 w-4" />}
            label="Evolución Médica"
          />
        </div>

        {/* Alertas de valores anormales */}
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-amber-900">Atención: 2 indicadores requieren seguimiento</p>
              <p className="mt-1 text-sm text-amber-800 leading-relaxed">
                Detectamos valores de glucosa y colesterol LDL fuera del rango óptimo. Tu médico ya ha sido notificado para revisar tu plan de seguimiento.
              </p>
            </div>
            <button className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700">
              Ver detalles clínicos
            </button>
          </div>
        </div>

        {/* Resultados recientes */}
        <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold text-stone-900">🧪 Bioquímica Reciente</h2>
          <div className="space-y-3">
            <LabResultItem
              name="Glucosa"
              value="115"
              unit="mg/dL"
              normalRange="70-100"
              trend="up"
              status="high"
              date="Hace 2 días"
            />
            <LabResultItem
              name="Colesterol Total"
              value="195"
              unit="mg/dL"
              normalRange="<200"
              trend="stable"
              status="normal"
              date="Hace 2 días"
            />
            <LabResultItem
              name="Colesterol LDL"
              value="135"
              unit="mg/dL"
              normalRange="<100"
              trend="up"
              status="high"
              date="Hace 2 días"
            />
            <LabResultItem
              name="Colesterol HDL"
              value="55"
              unit="mg/dL"
              normalRange=">40"
              trend="stable"
              status="normal"
              date="Hace 2 días"
            />
            <LabResultItem
              name="Triglicéridos"
              value="140"
              unit="mg/dL"
              normalRange="<150"
              trend="down"
              status="normal"
              date="Hace 2 días"
            />
          </div>
        </div>

        {/* Comparativa temporal */}
        <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold text-stone-900">📈 Tu Salud en Perspectiva</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <TrendCard
              parameter="Glucosa"
              currentValue="115 mg/dL"
              previousValue="108 mg/dL"
              change="+6.5%"
              trend="up"
              period="vs hace 3 meses"
            />
            <TrendCard
              parameter="Triglicéridos"
              currentValue="140 mg/dL"
              previousValue="165 mg/dL"
              change="-15.2%"
              trend="down"
              period="vs hace 3 meses"
            />
          </div>
        </div>

        {/* Estudios de imagen */}
        <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold text-stone-900">🔬 Diagnóstico Visual</h2>
          <div className="space-y-3">
            <ImagingResultItem
              type="Radiografía de Tórax"
              date="10 Enero 2025"
              doctor="Dr. Rodríguez"
              findings="Sin hallazgos patológicos"
              status="normal"
            />
            <ImagingResultItem
              type="Ecografía Abdominal"
              date="15 Diciembre 2024"
              doctor="Dra. López"
              findings="Hígado graso leve"
              status="review"
            />
          </div>
        </div>

        {/* Informes médicos */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-bold text-stone-900">📋 Evolución Médica</h2>
          <div className="space-y-3">
            <ReportItem
              title="Informe Cardiológico"
              doctor="Dr. García"
              date="20 Enero 2025"
              summary="Control de hipertensión. Ajuste de medicación."
            />
            <ReportItem
              title="Epicrisis Hospitalaria"
              doctor="Dr. Martínez"
              date="5 Diciembre 2024"
              summary="Alta hospitalaria post-cirugía. Evolución favorable."
            />
          </div>
        </div>
      </div>
    </DashboardPageShell>
  )
}

interface CategoryTabProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function CategoryTab({ active, onClick, icon, label }: CategoryTabProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
        active
          ? 'bg-stone-800 text-white shadow-md'
          : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-800'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

interface LabResultItemProps {
  name: string
  value: string
  unit: string
  normalRange: string
  trend: 'up' | 'down' | 'stable'
  status: 'normal' | 'high' | 'low'
  date: string
}

function LabResultItem({ name, value, unit, normalRange, trend, status, date }: LabResultItemProps) {
  const statusConfig = {
    normal: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
    high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
    low: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' }
  }

  const trendIcons = {
    up: <TrendingUp className="h-4 w-4 text-red-500" />,
    down: <TrendingDown className="h-4 w-4 text-green-500" />,
    stable: <Activity className="h-4 w-4 text-stone-400" />
  }

  const config = statusConfig[status]

  return (
    <div className={`flex items-center justify-between rounded-lg border p-4 ${config.bg} ${config.border}`}>
      <div className="flex-1">
        <p className="font-semibold text-stone-900">{name}</p>
        <p className="text-xs text-stone-600">Rango normal: {normalRange}</p>
        <p className="mt-1 text-xs text-stone-500">
          <Calendar className="mr-1 inline-block h-3 w-3" />
          {date}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className={`text-2xl font-bold ${config.text}`}>
            {value} <span className="text-sm font-normal">{unit}</span>
          </p>
        </div>
        {trendIcons[trend]}
      </div>
    </div>
  )
}

interface TrendCardProps {
  parameter: string
  currentValue: string
  previousValue: string
  change: string
  trend: 'up' | 'down'
  period: string
}

function TrendCard({ parameter, currentValue, previousValue, change, trend, period }: TrendCardProps) {
  const isPositive = trend === 'down'
  const trendColor = isPositive ? 'text-green-600' : 'text-red-600'
  const bgColor = isPositive ? 'bg-green-50' : 'bg-red-50'

  return (
    <div className={`rounded-lg border border-stone-200 p-4 ${bgColor}`}>
      <p className="font-semibold text-stone-900">{parameter}</p>
      <p className="mt-2 text-2xl font-bold text-stone-900">{currentValue}</p>
      <div className="mt-2 flex items-center gap-2">
        {trend === 'up' ? (
          <TrendingUp className={`h-4 w-4 ${trendColor}`} />
        ) : (
          <TrendingDown className={`h-4 w-4 ${trendColor}`} />
        )}
        <span className={`text-sm font-medium ${trendColor}`}>{change}</span>
        <span className="text-xs text-stone-600">{period}</span>
      </div>
      <p className="mt-1 text-xs text-stone-500">Anterior: {previousValue}</p>
    </div>
  )
}

interface ImagingResultItemProps {
  type: string
  date: string
  doctor: string
  findings: string
  status: 'normal' | 'review'
}

function ImagingResultItem({ type, date, doctor, findings, status }: ImagingResultItemProps) {
  const statusConfig = {
    normal: { icon: '✅', color: 'text-green-600' },
    review: { icon: '⚠️', color: 'text-amber-600' }
  }

  const config = statusConfig[status]

  return (
    <div className="rounded-lg bg-stone-50 border border-stone-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-semibold text-stone-900">{type}</p>
          <p className="mt-1 text-sm text-stone-700">{doctor}</p>
          <p className="mt-2 text-sm text-stone-600">
            <span className={config.color}>{config.icon}</span> {findings}
          </p>
          <p className="mt-2 text-xs text-stone-500">
            <Calendar className="mr-1 inline-block h-3 w-3" />
            {date}
          </p>
        </div>
        <button className="rounded bg-stone-700 px-3 py-1 text-xs font-semibold text-white hover:bg-stone-600">
          <Download className="mr-1 inline-block h-3 w-3" />
          Ver
        </button>
      </div>
    </div>
  )
}

interface ReportItemProps {
  title: string
  doctor: string
  date: string
  summary: string
}

function ReportItem({ title, doctor, date, summary }: ReportItemProps) {
  return (
    <div className="rounded-lg bg-stone-50 border border-stone-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-semibold text-stone-900">{title}</p>
          <p className="mt-1 text-sm text-stone-700">{doctor}</p>
          <p className="mt-2 text-sm text-stone-600">{summary}</p>
          <p className="mt-2 text-xs text-stone-500">
            <Calendar className="mr-1 inline-block h-3 w-3" />
            {date}
          </p>
        </div>
        <button className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500">
          <Download className="mr-1 inline-block h-3 w-3" />
          PDF
        </button>
      </div>
    </div>
  )
}
