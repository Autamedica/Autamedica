'use client';

interface OrderCardProps {
  order: {
    id: string;
    medication: string | null;
    formulation: string | null;
    dose_mg_per_day: number | null;
    quantity_units: number | null;
    duration_days: number | null;
    prescription_type: string;
    status: string;
    clinical_semaphore: string | null;
    extraordinary_dose_flag: boolean;
    requires_clarification: boolean;
    dispense_window_start: string | null;
    dispense_window_end: string | null;
    created_at: string;
  };
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  onSelect: () => void;
}

const SEMAPHORE_COLORS: Record<string, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  red: 'bg-red-500',
};

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  standard: { label: 'Estándar', color: 'bg-gray-100 text-gray-600' },
  transition_bridge: { label: 'Bridge', color: 'bg-purple-100 text-purple-700' },
  continuation: { label: 'Continuación', color: 'bg-blue-100 text-blue-700' },
  emergency: { label: 'Emergencia', color: 'bg-red-100 text-red-700' },
};

export function OrderCard({ order, statusColors, statusLabels, onSelect }: OrderCardProps) {
  const typeBadge = TYPE_BADGES[order.prescription_type] ?? TYPE_BADGES.standard;
  const windowEnd = order.dispense_window_end
    ? new Date(order.dispense_window_end).toLocaleDateString('es-AR')
    : null;

  return (
    <button
      onClick={onSelect}
      className="w-full bg-white rounded-xl shadow-am-sm border border-am-surface-200 p-4 hover:border-emerald-300 hover:shadow-am-md transition text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Semaphore */}
            {order.clinical_semaphore && (
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEMAPHORE_COLORS[order.clinical_semaphore] ?? 'bg-gray-400'}`} />
            )}
            <h3 className="text-sm font-semibold text-am-surface-900 truncate">
              {order.medication ?? 'Medicamento sin especificar'}
            </h3>
            {order.extraordinary_dose_flag && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 shrink-0">
                DOSIS EXTRA
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-am-surface-500">
            {order.formulation && <span>{order.formulation}</span>}
            {order.dose_mg_per_day != null && <span>{order.dose_mg_per_day} mg/día</span>}
            {order.quantity_units != null && <span>{order.quantity_units} unidades</span>}
            {order.duration_days != null && <span>{order.duration_days} días</span>}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {statusLabels[order.status] ?? order.status}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${typeBadge.color}`}>
              {typeBadge.label}
            </span>
            {windowEnd && (
              <span className="text-[10px] text-am-surface-400">
                Vence: {windowEnd}
              </span>
            )}
          </div>
        </div>

        <svg className="w-5 h-5 text-am-surface-300 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
