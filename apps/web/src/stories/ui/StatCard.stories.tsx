import type { Meta, StoryObj } from '@storybook/react';
import { StatCard } from '@autamedica/ui';

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const VideoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const meta: Meta<typeof StatCard> = {
  title: 'UI/StatCard',
  component: StatCard,
  argTypes: {
    value: { control: 'text' },
    label: { control: 'text' },
    placeholder: { control: 'boolean' },
  },
  args: {
    label: 'Consultas hoy',
    value: 12,
    icon: <CalendarIcon />,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '280px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StatCard>;

export const ConsultasHoy: Story = {
  args: {
    label: 'Consultas hoy',
    value: 12,
    icon: <CalendarIcon />,
    trend: { value: 8, direction: 'up' },
  },
};

export const PacientesActivos: Story = {
  args: {
    label: 'Pacientes activos',
    value: 847,
    icon: <UsersIcon />,
    iconBgColor: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    trend: { value: 12, direction: 'up' },
  },
};

export const ProximoTurno: Story = {
  args: {
    label: 'Proximo turno',
    value: '14:30',
    icon: <ClockIcon />,
    iconBgColor: 'bg-am-primary-50',
    iconColor: 'text-am-primary-600',
  },
};

export const VideoconsultasActivas: Story = {
  args: {
    label: 'Videoconsultas activas',
    value: 3,
    icon: <VideoIcon />,
    iconBgColor: 'bg-sky-50',
    iconColor: 'text-sky-600',
  },
};

export const TiempoPromedioEspera: Story = {
  args: {
    label: 'Tiempo promedio espera',
    value: '8 min',
    icon: <ClockIcon />,
    iconBgColor: 'bg-amber-50',
    iconColor: 'text-amber-600',
    trend: { value: 15, direction: 'down' },
  },
};

export const AlertasPendientes: Story = {
  args: {
    label: 'Alertas pendientes',
    value: 5,
    icon: <AlertIcon />,
    iconBgColor: 'bg-red-50',
    iconColor: 'text-red-500',
  },
};

export const Satisfaccion: Story = {
  args: {
    label: 'Satisfaccion pacientes',
    value: '4.8',
    icon: <HeartIcon />,
    iconBgColor: 'bg-red-50',
    iconColor: 'text-red-500',
    trend: { value: 3, direction: 'up' },
  },
};

export const Cargando: Story = {
  args: {
    label: 'Cargando...',
    value: 0,
    icon: <HeartIcon />,
    placeholder: true,
  },
};

export const DashboardMedico: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '620px' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <StatCard
        icon={<CalendarIcon />}
        label="Consultas hoy"
        value={12}
        trend={{ value: 8, direction: 'up' }}
      />
      <StatCard
        icon={<UsersIcon />}
        label="Pacientes activos"
        value={847}
        iconBgColor="bg-emerald-50"
        iconColor="text-emerald-600"
        trend={{ value: 12, direction: 'up' }}
      />
      <StatCard
        icon={<ClockIcon />}
        label="Proximo turno"
        value="14:30"
        iconBgColor="bg-am-primary-50"
        iconColor="text-am-primary-600"
      />
      <StatCard
        icon={<HeartIcon />}
        label="Satisfaccion"
        value="4.8"
        iconBgColor="bg-red-50"
        iconColor="text-red-500"
        trend={{ value: 3, direction: 'up' }}
      />
    </div>
  ),
};

export const DashboardAdministrativo: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '940px' }}>
        <Story />
      </div>
    ),
  ],
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        icon={<CalendarIcon />}
        label="Turnos programados"
        value={45}
        trend={{ value: 15, direction: 'up' }}
      />
      <StatCard
        icon={<UsersIcon />}
        label="Pacientes registrados"
        value={2340}
        iconBgColor="bg-emerald-50"
        iconColor="text-emerald-600"
        trend={{ value: 22, direction: 'up' }}
      />
      <StatCard
        icon={<VideoIcon />}
        label="Videoconsultas hoy"
        value={8}
        iconBgColor="bg-sky-50"
        iconColor="text-sky-600"
      />
      <StatCard
        icon={<ClockIcon />}
        label="Espera promedio"
        value="8 min"
        iconBgColor="bg-amber-50"
        iconColor="text-amber-600"
        trend={{ value: 15, direction: 'down' }}
      />
      <StatCard
        icon={<AlertIcon />}
        label="Alertas activas"
        value={5}
        iconBgColor="bg-red-50"
        iconColor="text-red-500"
      />
      <StatCard
        icon={<HeartIcon />}
        label="Satisfaccion"
        value="4.8"
        iconBgColor="bg-red-50"
        iconColor="text-red-500"
        trend={{ value: 3, direction: 'up' }}
      />
    </div>
  ),
};
