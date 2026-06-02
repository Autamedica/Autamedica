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
  Star,
  Stethoscope,
  ArrowRight,
  Loader2,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { formatArsFromCents } from '@/lib/payments/money';

interface AppointmentsTableProps {
  appointments: AppointmentWithDoctor[];
  locale?: string;
  reviewedAppointmentIds?: Set<string>;
  onReviewClick?: (appointment: AppointmentWithDoctor) => void;
  onJoinTelemedicine?: (appointment: AppointmentWithDoctor) => void;
  onPayAppointment?: (appointment: AppointmentWithDoctor) => void;
  payingAppointmentId?: string | null;
  joiningAppointmentId?: string | null;
  walletSummary?: {
    balance: {
      available_credit_cents: number;
      locked_credit_cents: number;
      total_credit_cents: number;
      currency: string;
    };
  } | null;
}

const statusConfig: Record<string, { label: string; dot: string; bg: string }> = {
  payment_pending: { label: 'Pago pendiente', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700' },
  scheduled: { label: 'Programada', dot: 'bg-sky-500', bg: 'bg-sky-50 text-sky-700' },
  confirmed: { label: 'Confirmada', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700' },
  in_progress: { label: 'En curso', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completada', dot: 'bg-stone-400', bg: 'bg-stone-100 text-stone-600' },
  cancelled: { label: 'Cancelada', dot: 'bg-red-400', bg: 'bg-red-50 text-red-600' },
  no_show: { label: 'No asistió', dot: 'bg-stone-300', bg: 'bg-stone-100 text-stone-500' },
  expired: { label: 'No realizada', dot: 'bg-stone-300', bg: 'bg-stone-100 text-stone-500' },
};

const PAST_DUE_GRACE_MS = 2 * 60 * 60 * 1000;

function isAppointmentPastDue(appointment: AppointmentWithDoctor): boolean {
  const { status, start_time, end_time, duration_minutes } = appointment;
  if (status !== 'scheduled' && status !== 'confirmed') return false;
  if (!start_time) return false;

  const endMs = end_time
    ? Date.parse(end_time)
    : Date.parse(start_time) + (duration_minutes ?? 30) * 60 * 1000;

  return Date.now() > endMs + PAST_DUE_GRACE_MS;
}

const typeConfig: Record<string, { label: string; icon: typeof Stethoscope; color: string }> = {
  consultation: { label: 'Consulta', icon: Stethoscope, color: 'text-sky-700 bg-sky-50' },
  follow_up: { label: 'Seguimiento', icon: ArrowRight, color: 'text-violet-600 bg-violet-50' },
  emergency: { label: 'Emergencia', icon: Clock, color: 'text-red-600 bg-red-50' },
  telemedicine: { label: 'Telemedicina', icon: Video, color: 'text-cyan-700 bg-cyan-50' },
  lab_test: { label: 'Laboratorio', icon: Stethoscope, color: 'text-amber-700 bg-amber-50' },
};

export function AppointmentsTable({
  appointments,
  locale,
  reviewedAppointmentIds,
  onReviewClick,
  onJoinTelemedicine,
  onPayAppointment,
  payingAppointmentId,
  joiningAppointmentId,
  walletSummary,
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
        const rawStatusKey = appointment.status ?? 'scheduled';
        const isPastDue = isAppointmentPastDue(appointment);
        const statusKey = isPastDue ? 'expired' : rawStatusKey;
        const status = statusConfig[statusKey] ?? statusConfig.scheduled;
        const typeKey = appointment.type ?? 'consultation';
        const type = typeConfig[typeKey] ?? typeConfig.consultation;
        const TypeIcon = type.icon;
        const doctorName = appointment.doctor
          ? `Dr. ${appointment.doctor.first_name ?? ''} ${appointment.doctor.last_name ?? ''}`.trim()
          : null;
        const isActive =
          !isPastDue &&
          (rawStatusKey === 'scheduled' ||
          rawStatusKey === 'confirmed' ||
          rawStatusKey === 'in_progress');
        const isTelemedicine = isTelemedicineAppointment(appointment);
        const entryUrl = buildPatientTelemedicineEntryUrl(appointment.id);
        const isJoining = joiningAppointmentId === appointment.id;
        const isPaying = payingAppointmentId === appointment.id;

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
                  <Calendar className="h-3.5 w-3.5 text-stone-500" />
                  <span className="capitalize">{fmtFullDate(appointment.start_time)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-stone-500" />
                  {fmtTime(appointment.start_time)}
                  {appointment.end_time ? ` — ${fmtTime(appointment.end_time)}` : ''}
                </span>
                {appointment.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-stone-500" />
                    {typeof appointment.location === 'string' ? appointment.location : String(appointment.location)}
                  </span>
                )}
                {isTelemedicine && (
                  <span className="inline-flex items-center gap-1.5 text-cyan-700">
                    <Video className="h-3.5 w-3.5" />
                    Videoconsulta
                  </span>
                )}
                {appointment.doctor?.consultation_fee != null && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-stone-800">
                    {formatArsFromCents(appointment.doctor.consultation_fee)}
                  </span>
                )}
              </div>

              {/* Notes */}
              {appointment.notes && (
                <div className="mb-4 rounded-xl bg-stone-50 px-4 py-3">
                  <p className="text-sm text-stone-600">
                    {typeof appointment.notes === 'string' ? appointment.notes : String(appointment.notes)}
                  </p>
                </div>
              )}

              {appointment.status === 'payment_pending' && onPayAppointment && (
                (() => {
                  const fee = appointment.doctor?.consultation_fee ?? 0;
                  const availableCredit = walletSummary?.balance.available_credit_cents ?? 0;
                  const canPayWithWallet = availableCredit >= fee && fee > 0;

                  if (canPayWithWallet) {
                    return (
                      <div className="mb-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/30 via-white to-emerald-50/10 p-4 shadow-sm shadow-emerald-500/[0.02]">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/50 shadow-sm">
                              <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
                                Pago con Saldo AutaMedica
                              </p>
                              <p className="mt-1 text-base font-bold text-stone-950">
                                {formatArsFromCents(fee)}
                              </p>
                              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
                                Disponés de saldo a favor suficiente en tu billetera AutaMedica para confirmar esta consulta de forma inmediata.
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onPayAppointment(appointment)}
                            disabled={isPaying}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70 active:scale-[0.98] shadow-sm shadow-emerald-600/10 shrink-0"
                          >
                            {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                            {isPaying ? 'Confirmando...' : 'Confirmar con Saldo'}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="mb-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 shadow-sm shadow-amber-500/5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-100">
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                              Falta confirmar el pago
                            </p>
                            <p className="mt-1 text-base font-bold text-stone-950">
                              {appointment.doctor?.consultation_fee != null
                                ? formatArsFromCents(appointment.doctor.consultation_fee)
                                : 'Valor a confirmar'}
                            </p>
                            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
                              Al acreditarse en MercadoPago, el turno queda confirmado. Si tu caso necesita una revisión de cierre, ya está incluida.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPayAppointment(appointment)}
                          disabled={isPaying}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 disabled:cursor-wait disabled:opacity-70 active:scale-[0.98] shrink-0"
                        >
                          {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          {isPaying ? 'Abriendo MercadoPago...' : 'Pagar consulta'}
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {isTelemedicine && isActive && onJoinTelemedicine && (
                  <button
                    type="button"
                    onClick={() => onJoinTelemedicine(appointment)}
                    disabled={isJoining}
                    className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-stone-800 disabled:cursor-wait disabled:opacity-70 active:scale-[0.98]"
                  >
                    {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                    {isJoining ? 'Abriendo sala...' : 'Entrar a la videollamada'}
                  </button>
                )}
                {isTelemedicine && isActive && !onJoinTelemedicine && (
                  <a
                    href={entryUrl}
                    className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
                  >
                    <Video className="h-4 w-4" />
                    Entrar a la videollamada
                  </a>
                )}
                {appointment.status === 'scheduled' && !isPastDue && (
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
