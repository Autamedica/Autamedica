import { isProduction } from '@autamedica/shared'
import {
  Activity,
  Brain,
  ChevronDown,
  ChevronUp,
  FileText,
  MonitorUp,
  Pill,
  X,
} from 'lucide-react'
import type { JSX } from 'react'

interface CompactActionProps {
  label: string
  icon: JSX.Element
  intent?: 'default' | 'primary' | 'success'
  onClick?: () => void
  disabled?: boolean
}

function CompactAction({ label, icon, intent = 'default', onClick, disabled }: CompactActionProps): JSX.Element {
  const intentStyles = {
    default: 'border-am-surface-200 bg-white text-am-surface-700 hover:bg-am-surface-50 hover:border-am-surface-300',
    primary: 'border-am-doctor-200 bg-am-doctor-50 text-am-doctor-700 hover:bg-am-doctor-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all duration-am-fast active:enabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${intentStyles[intent]}`}
    >
      <span className={intent === 'success' ? 'text-emerald-700' : intent === 'primary' ? 'text-am-doctor-600' : 'text-am-surface-500'}>
        {icon}
      </span>
      {label}
    </button>
  )
}

interface QuickActionsPanelProps {
  hasSession: boolean
  isBlocked: boolean
  isFocusMode: boolean
  isQuickActionsCollapsed: boolean
  isQuickActionsVisible: boolean
  showTelemedicinePanel: boolean
  aiProcessing: boolean
  patientId: string | undefined
  onToggleCollapsed: () => void
  onClose: () => void
  onTakeNotes: () => void
  onPrescribe: () => void
  onToggleTelemedicinePanel: () => void
  onAnalyzeWithAI: () => void
}

export function QuickActionsPanel({
  hasSession,
  isBlocked,
  isFocusMode,
  isQuickActionsCollapsed,
  isQuickActionsVisible,
  showTelemedicinePanel,
  aiProcessing,
  patientId,
  onToggleCollapsed,
  onClose,
  onTakeNotes,
  onPrescribe,
  onToggleTelemedicinePanel,
  onAnalyzeWithAI,
}: QuickActionsPanelProps): JSX.Element {
  return (
    <aside
      className={`right-drawer hidden h-full flex-col space-y-4 rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm ${
        hasSession ? 'lg:flex' : 'lg:hidden'
      } ${
        isFocusMode && isQuickActionsVisible ? 'right-drawer--open' : ''
      }`}
    >
      <div className="flex items-center justify-between px-1 pb-0">
        <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-am-surface-500">Acciones rápidas</h3>
        <div className="flex items-center gap-1">
          {isFocusMode && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-am-surface-500 transition-all duration-am-fast hover:bg-am-surface-100 hover:text-am-surface-800"
              aria-label="Cerrar acciones rápidas"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-lg p-1 text-am-surface-500 transition-all duration-am-fast hover:bg-am-surface-100 hover:text-am-surface-800"
            aria-expanded={!isQuickActionsCollapsed}
            aria-controls="quick-actions-panel"
          >
            {isQuickActionsCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!isQuickActionsCollapsed && (
        <div id="quick-actions-panel" className="space-y-3 px-1 pb-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <CompactAction
              label="Notas"
              icon={<FileText className="h-4 w-4" />}
              onClick={onTakeNotes}
              disabled={!hasSession || isBlocked}
            />
            <CompactAction
              label="Prescribir"
              icon={<Pill className="h-4 w-4" />}
              onClick={onPrescribe}
              disabled={!hasSession || isBlocked}
            />
            <CompactAction
              label="Signos vitales"
              icon={<Activity className="h-4 w-4" />}
              disabled
            />
            {!isProduction() && (
              <CompactAction
                label={hasSession && showTelemedicinePanel ? 'Ocultar señalización' : 'Señalización (dev)'}
                icon={<MonitorUp className="h-4 w-4" />}
                intent={hasSession && showTelemedicinePanel ? 'primary' : 'default'}
                onClick={onToggleTelemedicinePanel}
                disabled={!hasSession || isBlocked}
              />
            )}
            <CompactAction
              label={aiProcessing ? 'Procesando...' : 'Análisis IA'}
              icon={<Brain className="h-4 w-4" />}
              intent="success"
              onClick={onAnalyzeWithAI}
              disabled={isBlocked}
            />
          </div>

          {!patientId && (
            <div className="rounded-xl border border-am-surface-200 bg-am-surface-50 p-3">
              <p className="text-xs text-am-surface-500">Selecciona un paciente para habilitar acciones médicas</p>
            </div>
          )}
        </div>
      )}

      {isQuickActionsCollapsed && (
        <div className="px-1 pb-2">
          <div className="flex items-center justify-center gap-3 rounded-xl border border-am-surface-200 bg-am-surface-50 py-2.5">
            <FileText className="h-3 w-3 text-am-surface-500" />
            <Pill className="h-3 w-3 text-am-surface-500" />
            <Activity className="h-3 w-3 text-am-surface-500" />
            <Brain className="h-3 w-3 text-am-surface-500" />
            <span className="text-xs text-am-surface-500">5 acciones disponibles</span>
          </div>
        </div>
      )}
    </aside>
  )
}
