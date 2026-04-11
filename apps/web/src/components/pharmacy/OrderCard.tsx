'use client';

import { Badge } from '@autamedica/ui';
import { Card } from '@autamedica/ui';
import { ChevronRight } from 'lucide-react';

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

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  pending: 'default',
  assigned: 'primary',
  under_review: 'warning',
  clarification_requested: 'warning',
  clarification_provided: 'primary',
  approved_for_dispensation: 'success',
  dispensed: 'success',
  partially_dispensed: 'success',
  blocked: 'danger',
  cancelled: 'default',
  expired: 'default',
};

const TYPE_BADGE_VARIANT: Record<string, 'default' | 'primary' | 'danger'> = {
  standard: 'default',
  transition_bridge: 'primary',
  continuation: 'primary',
  emergency: 'danger',
};

const TYPE_LABELS: Record<string, string> = {
  standard: 'Estándar',
  transition_bridge: 'Bridge',
  continuation: 'Continuación',
  emergency: 'Emergencia',
};

export function OrderCard({ order, statusLabels, onSelect }: OrderCardProps) {
  const windowEnd = order.dispense_window_end
    ? new Date(order.dispense_window_end).toLocaleDateString('es-AR')
    : null;

  return (
    <Card variant="elevated" padding="sm" hover="lift" onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {order.clinical_semaphore && (
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEMAPHORE_COLORS[order.clinical_semaphore] ?? 'bg-gray-400'}`} />
            )}
            <h3 className="text-sm font-semibold text-am-surface-900 truncate">
              {order.medication ?? 'Medicamento sin especificar'}
            </h3>
            {order.extraordinary_dose_flag && (
              <Badge variant="danger" size="xs">DOSIS EXTRA</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-am-surface-500">
            {order.formulation && <span>{order.formulation}</span>}
            {order.dose_mg_per_day != null && <span>{order.dose_mg_per_day} mg/día</span>}
            {order.quantity_units != null && <span>{order.quantity_units} unidades</span>}
            {order.duration_days != null && <span>{order.duration_days} días</span>}
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Badge variant={STATUS_BADGE_VARIANT[order.status] ?? 'default'} size="xs">
              {statusLabels[order.status] ?? order.status}
            </Badge>
            <Badge variant={TYPE_BADGE_VARIANT[order.prescription_type] ?? 'default'} size="xs">
              {TYPE_LABELS[order.prescription_type] ?? order.prescription_type}
            </Badge>
            {windowEnd && (
              <span className="text-[10px] text-am-surface-400">
                Vence: {windowEnd}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-am-surface-300 shrink-0 mt-1" />
      </div>
    </Card>
  );
}
