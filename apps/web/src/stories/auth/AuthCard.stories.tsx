import type { Meta, StoryObj } from '@storybook/react';
import { AuthCard } from '../../components/auth/AuthCard';

const PatientIcon = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const DoctorIcon = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const CompanyIcon = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const PharmacyIcon = () => (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2v20M2 12h20" />
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
  </svg>
);

const meta: Meta<typeof AuthCard> = {
  title: 'Auth/AuthCard',
  component: AuthCard,
  args: {
    selected: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '400px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AuthCard>;

export const Paciente: Story = {
  render: (args) => (
    <AuthCard {...args} icon={<PatientIcon />}>
      <h3 className="font-semibold text-[var(--au-text-primary)]">Paciente</h3>
      <p className="text-sm text-[var(--au-text-secondary)] mt-1">Accede a tu historial medico, turnos y videoconsultas</p>
    </AuthCard>
  ),
};

export const PacienteSeleccionado: Story = {
  args: { selected: true },
  render: (args) => (
    <AuthCard {...args} icon={<PatientIcon />}>
      <h3 className="font-semibold text-[var(--au-text-primary)]">Paciente</h3>
      <p className="text-sm text-[var(--au-text-secondary)] mt-1">Accede a tu historial medico, turnos y videoconsultas</p>
    </AuthCard>
  ),
};

export const Profesional: Story = {
  render: (args) => (
    <AuthCard {...args} icon={<DoctorIcon />}>
      <h3 className="font-semibold text-[var(--au-text-primary)]">Profesional de la salud</h3>
      <p className="text-sm text-[var(--au-text-secondary)] mt-1">Gestiona tu agenda, pacientes y telemedicina</p>
    </AuthCard>
  ),
};

export const ProfesionalSeleccionado: Story = {
  args: { selected: true, accentColor: '#10b981' },
  render: (args) => (
    <AuthCard {...args} icon={<DoctorIcon />}>
      <h3 className="font-semibold text-[var(--au-text-primary)]">Profesional de la salud</h3>
      <p className="text-sm text-[var(--au-text-secondary)] mt-1">Gestiona tu agenda, pacientes y telemedicina</p>
    </AuthCard>
  ),
};

export const Empresa: Story = {
  render: (args) => (
    <AuthCard {...args} icon={<CompanyIcon />}>
      <h3 className="font-semibold text-[var(--au-text-primary)]">Empresa</h3>
      <p className="text-sm text-[var(--au-text-secondary)] mt-1">Administra los beneficios de salud de tu equipo</p>
    </AuthCard>
  ),
};

export const SelectorDeRolCompleto: Story = {
  render: () => (
    <div className="space-y-3">
      <h2 className="font-heading text-xl font-bold text-[var(--au-text-primary)] text-center mb-4">
        Selecciona tu perfil
      </h2>
      <AuthCard icon={<PatientIcon />} selected>
        <h3 className="font-semibold text-[var(--au-text-primary)]">Paciente</h3>
        <p className="text-sm text-[var(--au-text-secondary)] mt-1">Accede a tu historial medico, turnos y videoconsultas</p>
      </AuthCard>
      <AuthCard icon={<DoctorIcon />}>
        <h3 className="font-semibold text-[var(--au-text-primary)]">Profesional de la salud</h3>
        <p className="text-sm text-[var(--au-text-secondary)] mt-1">Gestiona tu agenda, pacientes y telemedicina</p>
      </AuthCard>
      <AuthCard icon={<CompanyIcon />}>
        <h3 className="font-semibold text-[var(--au-text-primary)]">Empresa</h3>
        <p className="text-sm text-[var(--au-text-secondary)] mt-1">Administra los beneficios de salud de tu equipo</p>
      </AuthCard>
      <AuthCard icon={<PharmacyIcon />}>
        <h3 className="font-semibold text-[var(--au-text-primary)]">Farmacia</h3>
        <p className="text-sm text-[var(--au-text-secondary)] mt-1">Recibe recetas digitales y gestiona dispensacion</p>
      </AuthCard>
    </div>
  ),
};
