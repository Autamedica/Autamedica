import type { Meta, StoryObj } from '@storybook/react';
import { AuthAlert } from '../../components/auth/AuthAlert';

const meta: Meta<typeof AuthAlert> = {
  title: 'Auth/AuthAlert',
  component: AuthAlert,
  argTypes: {
    tone: {
      control: 'select',
      options: ['error', 'success', 'info'],
    },
  },
  args: {
    tone: 'error',
    children: 'Mensaje de alerta',
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
type Story = StoryObj<typeof AuthAlert>;

export const Error: Story = {
  args: {
    tone: 'error',
    children: 'Credenciales incorrectas. Verificá tu email y contraseña.',
  },
};

export const Success: Story = {
  args: {
    tone: 'success',
    children: 'Cuenta creada exitosamente. Revisá tu correo para confirmar.',
  },
};

export const Info: Story = {
  args: {
    tone: 'info',
    children: 'Tu sesión está por expirar. Ingresá nuevamente para continuar.',
  },
};

export const AllTones: Story = {
  render: () => (
    <div className="space-y-3">
      <AuthAlert tone="error">Error: credenciales inválidas.</AuthAlert>
      <AuthAlert tone="success">Registro completado con éxito.</AuthAlert>
      <AuthAlert tone="info">Verificá tu casilla de correo.</AuthAlert>
    </div>
  ),
};
