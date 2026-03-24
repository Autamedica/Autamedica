'use client';

import type { AppointmentWithDoctor } from '@/lib/patients/types/appointment';
import { formatDate, formatTime } from '@/lib/date-utils';
import { Calendar, Clock, Video, MapPin, ExternalLink, Star } from 'lucide-react';

interface AppointmentsTableProps {
  appointments: AppointmentWithDoctor[];
  locale?: string;
  reviewedAppointmentIds?: Set<string>;
  onReviewClick?: (appointment: AppointmentWithDoctor) => void;
}

const statusConfig = {
  scheduled: { label: 'Programada', color: 'bg-blue-50 text-blue-700 border-blue-300' },
  confirmed: { label: 'Confirmada', color: 'bg-green-50 text-green-700 border-green-300' },
  'in-progress': { label: 'En curso', color: 'bg-amber-50 text-amber-700 border-amber-300' },
  completed: { label: 'Completada', color: 'bg-stone-100 text-stone-700 border-stone-300' },
  cancelled: { label: 'Cancelada', color: 'bg-red-50 text-red-700 border-red-300' },
  no_show: { label: 'No asistió', color: 'bg-stone-100 text-stone-600 border-stone-300' },
};

const typeConfig = {
  consultation: { label: 'Consulta', icon: '🩺' },
  follow_up: { label: 'Seguimiento', icon: '🔄' },
  emergency: { label: 'Emergencia', icon: '🚨' },
  telemedicine: { label: 'Telemedicina', icon: '💻' },
  lab_test: { label: 'Laboratorio', icon: '🧪' },
  checkup: { label: 'Chequeo', icon: '✅' },
};

export function AppointmentsTable({ appointments, locale, reviewedAppointmentIds, onReviewClick }: AppointmentsTableProps) {
  const intlLocale = locale === 'pt' ? 'pt-BR' : 'es-AR';

  const fmtDate = (dateString: string) =>
    formatDate(dateString, { weekday: 'short', day: '2-digit', locale: intlLocale });

  const fmtTime = (dateString: string) =>
    formatTime(dateString, { locale: intlLocale });

  return (
    <div className="space-y-4">
      {appointments.map((appointment) => {
        const statusKey = appointment.status ?? 'scheduled';
        const status = statusConfig[statusKey];
        const typeKey = appointment.type ?? 'consultation';
        const type = typeConfig[typeKey];

        return (
          <div
            key={appointment.id}
            className="bg-white border-2 border-stone-200 rounded-xl p-6 hover:border-stone-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{type?.icon}</div>
                <div>
                  <h3 className="text-lg font-bold text-stone-900">
                    {type?.label}
                  </h3>
                  {appointment.notes && (
                    <p className="text-sm text-stone-600">{appointment.notes}</p>
                  )}
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${status?.color}`}
              >
                {status?.label}
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-stone-700">
                <Calendar className="h-4 w-4 text-stone-500" />
                <span>{fmtDate(appointment.start_time)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-stone-700">
                <Clock className="h-4 w-4 text-stone-500" />
                <span>
                  {fmtTime(appointment.start_time)}{appointment.end_time ? ` - ${fmtTime(appointment.end_time)}` : ''}
                </span>
              </div>
              {appointment.location && (
                <div className="flex items-center gap-2 text-sm text-stone-700">
                  <MapPin className="h-4 w-4 text-stone-500" />
                  <span>{appointment.location}</span>
                </div>
              )}
              {appointment.meeting_url && (
                <div className="flex items-center gap-2 text-sm text-stone-700">
                  <Video className="h-4 w-4 text-stone-500" />
                  <span>Videoconsulta</span>
                </div>
              )}
            </div>

            {appointment.notes && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-900">
                  <strong>Nota:</strong> {appointment.notes}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {appointment.meeting_url && appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                <a
                  href={appointment.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary-ivory px-4 py-2 text-sm inline-flex items-center gap-2"
                >
                  <Video className="h-4 w-4" />
                  Unirse a videollamada
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {appointment.status === 'scheduled' && (
                <button className="btn-secondary-ivory px-4 py-2 text-sm">
                  Reprogramar
                </button>
              )}
              {appointment.status === 'completed' &&
                onReviewClick &&
                !reviewedAppointmentIds?.has(appointment.id) &&
                (() => {
                  const daysSince = Math.floor(
                    (Date.now() - new Date(appointment.start_time).getTime()) / (1000 * 60 * 60 * 24),
                  );
                  return daysSince >= 1 && daysSince <= 30;
                })() && (
                <button
                  onClick={() => onReviewClick(appointment)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Star className="h-4 w-4" />
                  Evaluar
                </button>
              )}
              {appointment.status === 'completed' &&
                reviewedAppointmentIds?.has(appointment.id) && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg">
                  <Star className="h-3.5 w-3.5 fill-green-600" />
                  Evaluado
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
