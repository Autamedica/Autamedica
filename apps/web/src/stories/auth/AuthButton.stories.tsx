import type { Meta, StoryObj } from '@storybook/react';
import { AuthButton } from '../../components/auth/AuthButton';

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const meta: Meta<typeof AuthButton> = {
  title: 'Auth/AuthButton',
  component: AuthButton,
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost'],
    },
    fullWidth: { control: 'boolean' },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: {
    children: 'Iniciar sesion',
    variant: 'primary',
    fullWidth: false,
    loading: false,
    disabled: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '360px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AuthButton>;

export const AccederComoPaciente: Story = {
  args: { variant: 'primary', children: 'Acceder como Paciente', fullWidth: true },
};

export const ContinuarConGoogle: Story = {
  render: () => (
    <AuthButton variant="secondary" fullWidth>
      <GoogleIcon />
      Continuar con Google
    </AuthButton>
  ),
};

export const RegistrarseMedico: Story = {
  args: { variant: 'primary', children: 'Registrarme como Medico', fullWidth: true },
};

export const VolverAlInicio: Story = {
  args: { variant: 'ghost', children: 'Volver al inicio' },
};

export const Ingresando: Story = {
  args: { variant: 'primary', loading: true, children: 'Verificando credenciales...', fullWidth: true },
};

export const SesionExpirada: Story = {
  args: { variant: 'primary', children: 'Volver a iniciar sesion', fullWidth: true },
};

export const Deshabilitado: Story = {
  args: { variant: 'primary', disabled: true, children: 'Completa los campos requeridos', fullWidth: true },
};

export const FlujoDeLogin: Story = {
  render: () => (
    <div className="space-y-3">
      <AuthButton variant="primary" fullWidth>Acceder como Paciente</AuthButton>
      <AuthButton variant="secondary" fullWidth>
        <GoogleIcon />
        Continuar con Google
      </AuthButton>
      <div className="flex items-center gap-3 text-xs text-[var(--au-text-secondary)]">
        <div className="flex-1 h-px bg-[var(--au-border)]" />
        o
        <div className="flex-1 h-px bg-[var(--au-border)]" />
      </div>
      <AuthButton variant="ghost" fullWidth>Crear cuenta nueva</AuthButton>
    </div>
  ),
};

export const SelectorDeRol: Story = {
  render: () => (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--au-text-primary)] text-center mb-1">Accede a tu cuenta</p>
      <AuthButton variant="primary" fullWidth>Acceder como Paciente</AuthButton>
      <AuthButton variant="secondary" fullWidth>Acceder como Medico</AuthButton>
      <AuthButton variant="secondary" fullWidth>Acceder como Empresa</AuthButton>
    </div>
  ),
};
