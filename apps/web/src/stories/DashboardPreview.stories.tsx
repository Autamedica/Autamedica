import type { Meta, StoryObj } from '@storybook/react';
import { Card, Badge, Button, StatCard } from '@autamedica/ui';

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

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const VideoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const FeatureIcon = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <div
    className="flex h-10 w-10 items-center justify-center rounded-xl"
    style={{ backgroundColor: `${color}10` }}
  >
    <div style={{ color }}>{children}</div>
  </div>
);

const TURNOS_EJEMPLO = [
  {
    id: 1,
    doctor: 'Dra. Carolina Mendez',
    specialty: 'Dermatologia',
    time: '10:30',
    date: 'Hoy',
    status: 'confirmed' as const,
    type: 'telemedicine' as const,
  },
  {
    id: 2,
    doctor: 'Dr. Roberto Martinez',
    specialty: 'Cardiologia',
    time: '15:00',
    date: 'Manana',
    status: 'scheduled' as const,
    type: 'consultation' as const,
  },
  {
    id: 3,
    doctor: 'Dra. Ana Lucia Torres',
    specialty: 'Clinica medica',
    time: '09:00',
    date: 'Vie 18 abr',
    status: 'scheduled' as const,
    type: 'telemedicine' as const,
  },
];

const statusMap = {
  confirmed: { label: 'Confirmada', variant: 'success' as const },
  scheduled: { label: 'Programada', variant: 'primary' as const },
  in_progress: { label: 'En curso', variant: 'doctor' as const },
};

const meta = {
  title: 'Dashboard',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const PanelPaciente: Story = {
  render: () => (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white shadow-sm shadow-sky-500/20">
              M
            </div>
            <div>
              <p className="font-heading text-sm font-semibold text-gray-900">
                Buenas tardes, Maria
              </p>
              <p className="text-xs text-gray-400">Tu salud, tu control</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600"
            >
              <BellIcon />
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                2
              </span>
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600"
            >
              <UserIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-28 pt-6">
        {/* Proxima cita destacada */}
        <section className="mb-8">
          <div className="group w-full rounded-2xl border border-sky-100 bg-sky-50/40 p-5 text-left transition-all hover:border-sky-200 hover:shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-sky-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                Proxima consulta
              </span>
              <ChevronRight />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              Dra. Carolina Mendez
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">Dermatologia</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <CalendarIcon />
                Hoy
              </span>
              <span className="flex items-center gap-1.5">
                <ClockIcon />
                10:30 hs
              </span>
              <span className="flex items-center gap-1.5">
                <VideoIcon />
                Videoconsulta
              </span>
            </div>
            <div className="mt-4">
              <Button variant="primary" size="sm">Unirme a la consulta</Button>
            </div>
          </div>
        </section>

        {/* Metricas rapidas */}
        <section className="mb-8">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<CalendarIcon />}
              label="Turnos pendientes"
              value={3}
            />
            <StatCard
              icon={<HeartIcon />}
              label="Consultas realizadas"
              value={12}
              iconBgColor="bg-emerald-50"
              iconColor="text-emerald-600"
            />
          </div>
        </section>

        {/* Accesos rapidos */}
        <section className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Consultas</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Videoconsulta', sub: 'Conecta con tu medico', color: '#0ea5e9' },
              { label: 'Mis turnos', sub: 'Agenda y gestiona citas', color: '#0ea5e9' },
              { label: 'Anamnesis', sub: 'Historia clinica', color: '#0ea5e9' },
            ].map((item) => (
              <Card key={item.label} variant="outlined" padding="sm" hover="lift">
                <FeatureIcon color={item.color}>
                  <CalendarIcon />
                </FeatureIcon>
                <p className="mt-2 text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{item.sub}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Tu salud</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Recetas', sub: 'Prescripciones medicas' },
              { label: 'Historial', sub: 'Registros clinicos' },
              { label: 'Comunidad', sub: 'Conecta con otros' },
            ].map((item) => (
              <Card key={item.label} variant="outlined" padding="sm" hover="lift">
                <FeatureIcon color="#0ea5e9">
                  <HeartIcon />
                </FeatureIcon>
                <p className="mt-2 text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{item.sub}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Lista de turnos */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Proximos turnos</h3>
            <button className="text-xs text-sky-500 font-medium hover:text-sky-600">Ver todos</button>
          </div>
          <div className="space-y-3">
            {TURNOS_EJEMPLO.map((turno) => (
              <Card key={turno.id} variant="outlined" padding="sm" hover="lift" as="article">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-am-primary-50 text-am-primary-600">
                    {turno.type === 'telemedicine' ? <VideoIcon /> : <UserIcon />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{turno.doctor}</p>
                    <p className="text-xs text-gray-400">{turno.specialty} -- {turno.date}, {turno.time} hs</p>
                  </div>
                  <Badge
                    variant={statusMap[turno.status].variant}
                    size="xs"
                    dot={turno.status === 'confirmed'}
                  >
                    {statusMap[turno.status].label}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-4 py-2">
          {['Inicio', 'Turnos', 'Salud', 'Perfil'].map((label, i) => (
            <button
              key={label}
              type="button"
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-medium ${
                i === 0 ? 'text-sky-500' : 'text-gray-400'
              }`}
            >
              {i === 0 && <CalendarIcon />}
              {i === 1 && <CalendarIcon />}
              {i === 2 && <HeartIcon />}
              {i === 3 && <UserIcon />}
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  ),
};

export const PanelDoctor: Story = {
  render: () => (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-bold text-gray-900">Buenos dias, Dr. Martinez</h1>
            <p className="text-xs text-gray-400">Lunes 14 de abril, 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="doctor" dot pulse>En linea</Badge>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-am-doctor-100 text-sm font-bold text-am-doctor-700">
              RM
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={<CalendarIcon />} label="Consultas hoy" value={8} trend={{ value: 12, direction: 'up' }} />
          <StatCard icon={<UsersIcon />} label="Pacientes activos" value={234} iconBgColor="bg-emerald-50" iconColor="text-emerald-600" />
          <StatCard icon={<ClockIcon />} label="Proximo turno" value="14:30" iconBgColor="bg-am-primary-50" iconColor="text-am-primary-600" />
          <StatCard icon={<VideoIcon />} label="Videoconsultas" value={3} iconBgColor="bg-purple-50" iconColor="text-purple-600" />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Agenda del dia */}
          <div className="col-span-2 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Agenda de hoy</h3>
            {[
              { time: '09:00', patient: 'Maria Laura Gonzalez', type: 'Presencial', specialty: 'Control cardiologico', status: 'completed' as const },
              { time: '10:30', patient: 'Juan Carlos Perez', type: 'Videoconsulta', specialty: 'Primera consulta', status: 'in_progress' as const },
              { time: '11:30', patient: 'Ana Rodriguez', type: 'Videoconsulta', specialty: 'Seguimiento', status: 'scheduled' as const },
              { time: '14:30', patient: 'Carlos Alberto Diaz', type: 'Presencial', specialty: 'Control mensual', status: 'scheduled' as const },
              { time: '16:00', patient: 'Laura Beatriz Sosa', type: 'Videoconsulta', specialty: 'Resultado de estudios', status: 'scheduled' as const },
            ].map((apt) => (
              <Card key={apt.time} variant="outlined" padding="sm" hover="lift" as="article">
                <div className="flex items-center gap-4">
                  <div className="text-center min-w-[50px]">
                    <p className="text-sm font-bold text-gray-900">{apt.time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{apt.patient}</p>
                    <p className="text-xs text-gray-400">{apt.specialty} -- {apt.type}</p>
                  </div>
                  <Badge
                    variant={apt.status === 'completed' ? 'success' : apt.status === 'in_progress' ? 'doctor' : 'primary'}
                    dot={apt.status === 'in_progress'}
                    pulse={apt.status === 'in_progress'}
                    size="xs"
                  >
                    {apt.status === 'completed' ? 'Completada' : apt.status === 'in_progress' ? 'En curso' : 'Pendiente'}
                  </Badge>
                  {apt.status === 'in_progress' && (
                    <Button variant="doctor" size="sm">Continuar</Button>
                  )}
                  {apt.status === 'scheduled' && (
                    <Button variant="secondary" size="sm">Iniciar</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Panel lateral */}
          <div className="space-y-4">
            <Card variant="filled" padding="md">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Paciente en consulta</h4>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-am-primary-100 text-sm font-bold text-am-primary-700">
                  JP
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Juan Carlos Perez</p>
                  <p className="text-xs text-gray-400">42 anos -- DNI 28.456.123</p>
                </div>
              </div>
              <div className="space-y-2">
                <Button variant="doctor" fullWidth size="sm">Abrir videoconsulta</Button>
                <Button variant="secondary" fullWidth size="sm">Notas clinicas</Button>
                <Button variant="secondary" fullWidth size="sm">Prescribir</Button>
              </div>
            </Card>

            <Card variant="outlined" padding="md">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Alertas</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Badge variant="danger" size="xs" dot pulse>Urgente</Badge>
                  <p className="text-xs text-gray-500">Maria Gonzalez: TA 180/110 reportada</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="warning" size="xs" dot>Pendiente</Badge>
                  <p className="text-xs text-gray-500">3 resultados de lab sin revisar</p>
                </div>
              </div>
            </Card>

            {/* Acciones rapidas */}
            <Card variant="outlined" padding="md">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Acciones rapidas</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" size="sm">Nueva consulta</Button>
                <Button variant="secondary" size="sm">Ver agenda</Button>
                <Button variant="secondary" size="sm">Recetas</Button>
                <Button variant="secondary" size="sm">Historial</Button>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  ),
};
