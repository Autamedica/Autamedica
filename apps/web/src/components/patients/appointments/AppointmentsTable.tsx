'use client';

import type { AppointmentWithDoctor } from '@/lib/patients/types/appointment';
import {
  buildPatientTelemedicineEntryUrl,
  isTelemedicineAppointment,
} from '@/lib/patients/lib/telemedicine-entry';
import { formatTime } from '@/lib/date-utils';
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  ExternalLink,
  Star,
  Stethoscope,
  UserRound,
  ArrowRight,
  Loader2,
} from 'lucide-react';

interface AppointmentsTableProps {
  appointments: AppointmentWithDoctor[];
  locale?: string;
  reviewedAppointmentIds?: Set<string>;
  onReviewClick?: (appointment: AppointmentWithDoctor) => void;
  onJoinTelemedicine?: (appointment: AppointmentWithDoctor) => void;
  joiningAppointmentId?: string | null;
}

const statusConfig: Record<string, { label: string; dot: string; bg: string }> = {
  scheduled: { label: 'Programada', dot: 'bg-sky-500', bg: 'bg-sky-50 text-sky-700' },
  confirmed: { label: 'Confirmada', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700' },
  'in-progress': { label: 'En curso', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700' },
  in_progress: { label: 'En curso', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completada', dot: 'bg-stone-400', bg: 'bg-stone-100 text-stone-600' },
  cancelled: { label: 'Cancelada', dot: 'bg-red-400', bg: 'bg-red-50 text-red-600' },
  no_show: { label: 'No asistió', dot: 'bg-stone-300', bg: 'bg-stone-100 text-stone-500' },
};

const typeConfig: Record<string, { label: string; icon: typeof Stethoscope; color: string }> = {
  consultation: { label: 'Consulta', icon: Stethoscope, color: 'text-sky-600 bg-sky-50' },
  in_person: { label: 'Presencial', icon: MapPin, color: 'text-emerald-600 bg-emerald-50' },
  follow_up: { label: 'Seguimiento', icon: ArrowRight, color: 'text-violet-600 bg-violet-50' },
  emergency: { label: 'Emergencia', icon: Clock, color: 'text-red-600 bg-red-50' },
  telemedicine: { label: 'Telemedicina', icon: Video, color: 'text-cyan-600 bg-cyan-50' },
  lab_test: { label: 'Laboratorio', icon: Stethoscope, color: 'text-amber-600 bg-amber-50' },
  checkup: { label: 'Chequeo', icon: UserRound, color: 'text-indigo-600 bg-indigo-50' },
};

export function AppointmentsTable({
  appointments,
  locale,
  reviewedAppointmentIds,
  onReviewClick,
  onJoinTelemedicine,
  joiningAppointmentId,
}: AppointmentsTableProps) {
  const intlLocale = locale === 'pt' ? 'pt-BR' : 'es-AR';

  const fmtTime = (dateString: string) =>
    formatTime(dateString, { locale: intlLocale });

  const fmtFullDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString(intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  return (
    <div className="space-y-3">
      {appointments.map((appointment) => {
        const statusKey = appointment.status ?? 'scheduled';
        const status = statusConfig[statusKey] ?? statusConfig.scheduled;
        const typeKey = appointment.type ?? 'consultation';
        const type = typeConfig[typeKey] ?? typeConfig.consultation;
        const TypeIcon = type.icon;
        const doctorName = appointment.doctor
          ? `Dr. ${appointment.doctor.first_name ?? ''} ${appointment.doctor.last_name ?? ''}`.trim()
          : null;
        const isActive =
          statusKey === 'scheduled' ||
          statusKey === 'confirmed' ||
          statusKey === 'in_progress';
        const isTelemedicine = isTelemedicineAppointment(appointment);
        const hasExternalMeetingUrl = Boolean(
          appointment.meeting_url && /^https?:\/\//i.test(appointment.meeting_url),
        );
        const entryUrl = buildPatientTelemedicineEntryUrl(appointment.id);
        const isJoining = joiningAppointmentId === appointment.id;

        return (
          <div
            key={appointment.id}
            className={`group rounded-2xl border bg-white transition-all duration-200 ${
              isActive
                ? 'border-stone-200 hover:border-stone-300 hover:shadow-md'
                : 'border-stone-100 opacity-75'
            }`}
          >
            <div className="p-5">
              {/* Top row: type + status */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${type.color}`}>
                    <TypeIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-stone-900">
                      {type.label}
                    </h3>
                    {doctorName && (
                      <p className="text-sm text-stone-500">{doctorName}</p>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.bg}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>

              {/* Date/time row */}
              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-600">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-stone-400" />
                  <span className="capitalize">{fmtFullDate(appointment.start_time)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-stone-400" />
                  {fmtTime(appointment.start_time)}
                  {appointment.end_time ? ` — ${fmtTime(appointment.end_time)}` : ''}
                </span>
                {appointment.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-stone-400" />
                    {appointment.location}
                  </span>
                )}
                {isTelemedicine && (
                  <span className="inline-flex items-center gap-1.5 text-cyan-600">
                    <Video className="h-3.5 w-3.5" />
                    Videoconsulta
                  </span>
                )}
              </div>

              {/* Notes */}
              {appointment.notes && (
                <div className="mb-4 rounded-xl bg-stone-50 px-4 py-3">
                  <p className="text-sm text-stone-600">{appointment.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {isTelemedicine && isActive && onJoinTelemedicine && (
                  <button
                    type="button"
                    onClick={() => onJoinTelemedicine(appointment)}
                    disabled={isJoining}
                    className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-stone-800 disabled:cursor-wait disabled:opacity-70 active:scale-[0.98]"
                  >
                    {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                    {isJoining ? 'Abriendo sala...' : 'Entrar a la videollamada'}
                  </button>
                )}
                {isTelemedicine && isActive && !onJoinTelemedicine && (
                  <a
                    href={hasExternalMeetingUrl ? appointment.meeting_url ?? entryUrl : entryUrl}
                    target={hasExternalMeetingUrl ? '_blank' : undefined}
                    rel={hasExternalMeetingUrl ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
                  >
                    <Video className="h-4 w-4" />
                    Entrar a la videollamada
                    {hasExternalMeetingUrl && <ExternalLink className="h-3 w-3 opacity-60" />}
                  </a>
                )}
                {appointment.status === 'scheduled' && (
                  <button className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-all hover:bg-stone-50 active:scale-[0.98]">
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-all hover:bg-amber-100 active:scale-[0.98]"
                  >
                    <Star className="h-4 w-4" />
                    Evaluar
                  </button>
                )}
                {appointment.status === 'completed' &&
                  reviewedAppointmentIds?.has(appointment.id) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                    <Star className="h-3.5 w-3.5 fill-emerald-500" />
                    Evaluado
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
