import type { Meta, StoryObj } from '@storybook/react';
import { Badge, Button } from '@autamedica/ui';
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Stethoscope,
  ArrowRight,
} from 'lucide-react';

interface MockAppointment {
  id: string;
  patient: string;
  initials: string;
  date: string;
  time: string;
  type: 'consulta' | 'telemedicina' | 'seguimiento' | 'presencial' | 'emergencia';
  status: 'programada' | 'confirmada' | 'en_curso' | 'completada' | 'cancelada';
  doctor: string;
  specialty: string;
  notes?: string;
}

const TYPE_CONFIG = {
  consulta: { label: 'Consulta', icon: Stethoscope, color: 'text-sky-700 bg-sky-50' },
  telemedicina: { label: 'Telemedicina', icon: Video, color: 'text-cyan-700 bg-cyan-50' },
  seguimiento: { label: 'Seguimiento', icon: ArrowRight, color: 'text-violet-600 bg-violet-50' },
  presencial: { label: 'Presencial', icon: MapPin, color: 'text-emerald-700 bg-emerald-50' },
  emergencia: { label: 'Emergencia', icon: Clock, color: 'text-red-600 bg-red-50' },
};

const STATUS_CONFIG = {
  programada: { label: 'Programada', variant: 'primary' as const },
  confirmada: { label: 'Confirmada', variant: 'success' as const },
  en_curso: { label: 'En curso', variant: 'doctor' as const },
  completada: { label: 'Completada', variant: 'default' as const },
  cancelada: { label: 'Cancelada', variant: 'danger' as const },
};

const MOCK_APPOINTMENTS: MockAppointment[] = [
  {
    id: '1',
    patient: 'Maria Garcia Lopez',
    initials: 'MG',
    date: 'Lunes 14 de abril',
    time: '09:00',
    type: 'telemedicina',
    status: 'confirmada',
    doctor: 'Dr. Roberto Martinez',
    specialty: 'Cardiologia',
    notes: 'Control post-operatorio. Traer estudios de ecocardiograma.',
  },
  {
    id: '2',
    patient: 'Juan Carlos Perez',
    initials: 'JP',
    date: 'Lunes 14 de abril',
    time: '10:30',
    type: 'consulta',
    status: 'programada',
    doctor: 'Dra. Carolina Mendez',
    specialty: 'Dermatologia',
  },
  {
    id: '3',
    patient: 'Ana Sofia Rodriguez',
    initials: 'AR',
    date: 'Lunes 14 de abril',
    time: '11:00',
    type: 'seguimiento',
    status: 'en_curso',
    doctor: 'Dr. Roberto Martinez',
    specialty: 'Cardiologia',
    notes: 'Paciente con diabetes tipo 2. Ajuste de medicacion.',
  },
  {
    id: '4',
    patient: 'Luis Alberto Fernandez',
    initials: 'LF',
    date: 'Martes 15 de abril',
    time: '14:00',
    type: 'presencial',
    status: 'completada',
    doctor: 'Dra. Lucia Gomez',
    specialty: 'Traumatologia',
  },
  {
    id: '5',
    patient: 'Carmen Beatriz Diaz',
    initials: 'CD',
    date: 'Martes 15 de abril',
    time: '16:30',
    type: 'telemedicina',
    status: 'cancelada',
    doctor: 'Dr. Fernando Alvarez',
    specialty: 'Neurologia',
    notes: 'Cancelada por la paciente. Reprogramar.',
  },
];

function AppointmentsListMockup({ appointments = MOCK_APPOINTMENTS }: { appointments?: MockAppointment[] }) {
  return (
    <div className="space-y-3" style={{ width: '520px' }}>
      {appointments.map((appt) => {
        const type = TYPE_CONFIG[appt.type];
        const status = STATUS_CONFIG[appt.status];
        const TypeIcon = type.icon;
        const isActive = appt.status === 'programada' || appt.status === 'confirmada' || appt.status === 'en_curso';

        return (
          <div
            key={appt.id}
            className={`rounded-2xl border bg-white transition-all duration-200 ${
              isActive
                ? 'border-stone-200 hover:border-stone-300 hover:shadow-md'
                : 'border-stone-100 opacity-75'
            }`}
          >
            <div className="p-5">
              {/* Top: tipo + estado */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${type.color}`}>
                    <TypeIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-stone-900">{type.label}</h3>
                    <p className="text-sm text-stone-500">{appt.doctor} -- {appt.specialty}</p>
                  </div>
                </div>
                <Badge
                  variant={status.variant}
                  dot={appt.status === 'confirmada' || appt.status === 'en_curso'}
                  pulse={appt.status === 'en_curso'}
                >
                  {status.label}
                </Badge>
              </div>

              {/* Paciente */}
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-600">
                  {appt.initials}
                </div>
                <span className="text-sm font-medium text-stone-700">{appt.patient}</span>
              </div>

              {/* Fecha y hora */}
              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-600">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-stone-400" />
                  {appt.date}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-stone-400" />
                  {appt.time} hs
                </span>
                {appt.type === 'telemedicina' && (
                  <span className="inline-flex items-center gap-1.5 text-cyan-700">
                    <Video className="h-3.5 w-3.5" />
                    Videoconsulta
                  </span>
                )}
              </div>

              {/* Notas */}
              {appt.notes && (
                <div className="mb-4 rounded-xl bg-stone-50 px-4 py-3">
                  <p className="text-sm text-stone-600">{appt.notes}</p>
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-wrap items-center gap-2">
                {appt.type === 'telemedicina' && isActive && (
                  <Button variant="primary" size="sm">
                    Entrar a la videollamada
                  </Button>
                )}
                {appt.status === 'programada' && (
                  <Button variant="secondary" size="sm">
                    Reprogramar
                  </Button>
                )}
                {appt.status === 'completada' && (
                  <Button variant="ghost" size="sm">
                    Ver resumen
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const meta: Meta<typeof AppointmentsListMockup> = {
  title: 'Medical/Appointments List',
  component: AppointmentsListMockup,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'surface' },
  },
};

export default meta;
type Story = StoryObj<typeof AppointmentsListMockup>;

export const Default: Story = {};

export const SoloActivas: Story = {
  args: {
    appointments: MOCK_APPOINTMENTS.filter(
      (a) => a.status === 'programada' || a.status === 'confirmada' || a.status === 'en_curso',
    ),
  },
};

export const SoloTelemedicina: Story = {
  args: {
    appointments: MOCK_APPOINTMENTS.filter((a) => a.type === 'telemedicina'),
  },
};

export const ListaVacia: Story = {
  render: () => (
    <div className="flex flex-col items-center justify-center py-12 text-center" style={{ width: '520px' }}>
      <Calendar className="h-12 w-12 text-stone-300 mb-4" />
      <h3 className="text-lg font-semibold text-stone-700 mb-1">Sin turnos pendientes</h3>
      <p className="text-sm text-stone-400 mb-4">No tenes citas programadas por el momento.</p>
      <Button variant="primary">Agendar turno</Button>
    </div>
  ),
};
