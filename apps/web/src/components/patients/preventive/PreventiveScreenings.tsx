'use client';

import { AlertCircle, CheckCircle, Clock, Calendar } from 'lucide-react';

/** UI view type for patient-specific screening data */
interface PreventiveScreeningView {
  id: string;
  title: string;
  description: string;
  recommended_frequency: string;
  status: 'overdue' | 'due_soon' | 'up_to_date';
  priority: 'high' | 'medium' | 'low';
  last_done_date?: string;
  next_due_date: string;
}

interface PreventiveScreeningsProps {
  screenings: PreventiveScreeningView[];
  locale?: string;
}

const statusConfig = {
  overdue: {
    label: 'Atrasado',
    color: 'border-red-100 bg-white',
    badgeColor: 'bg-red-50 text-red-700',
    icon: AlertCircle,
    iconColor: 'text-red-500',
  },
  due_soon: {
    label: 'Próximo',
    color: 'border-amber-100 bg-white',
    badgeColor: 'bg-amber-50 text-amber-700',
    icon: Clock,
    iconColor: 'text-amber-500',
  },
  up_to_date: {
    label: 'Al día',
    color: 'border-emerald-100 bg-white',
    badgeColor: 'bg-emerald-50 text-emerald-700',
    icon: CheckCircle,
    iconColor: 'text-emerald-500',
  },
};

const priorityConfig = {
  high: { label: 'Alta', color: 'text-red-600 bg-red-50' },
  medium: { label: 'Media', color: 'text-amber-600 bg-amber-50' },
  low: { label: 'Baja', color: 'text-gray-600 bg-gray-50' },
};

export function PreventiveScreenings({ screenings, locale }: PreventiveScreeningsProps) {
  const intlLocale = locale === 'pt' ? 'pt-BR' : 'es-AR';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(intlLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
      {screenings.map((screening) => {
        const status = statusConfig[screening.status];
        const Icon = status.icon;
        const priority = priorityConfig[screening.priority];

        return (
          <div
            key={screening.id}
            className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:border-gray-300 hover:shadow-sm ${status.color}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-4">
                <div className={`mt-1 rounded-full p-1 ${status.iconColor} bg-opacity-10`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 leading-tight">
                    {screening.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 leading-relaxed max-w-[280px]">
                    {screening.description}
                  </p>
                </div>
              </div>
              
              <div className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.badgeColor}`}>
                {status.label}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-y-3 border-t border-gray-50 pt-5">
              <div className="w-1/2 pr-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Frecuencia</p>
                <p className="mt-0.5 text-xs font-medium text-gray-700">{screening.recommended_frequency}</p>
              </div>
              
              <div className="w-1/2 pl-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Próximo</p>
                <p className="mt-0.5 text-xs font-semibold text-gray-900">{formatDate(screening.next_due_date)}</p>
              </div>

              <div className="flex w-full items-center justify-between mt-2">
                <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priority.color}`}>
                  Prioridad {priority.label}
                </div>
                
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-900 transition-colors hover:text-blue-600">
                  <Calendar className="h-3.5 w-3.5" />
                  Agendar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
