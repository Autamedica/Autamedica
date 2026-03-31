import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@autamedica/ui';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'doctor'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
  },
  args: {
    children: 'Agendar turno',
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    fullWidth: false,
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// --- Variantes ---

export const Primary: Story = {
  args: { variant: 'primary', children: 'Buscar medico' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Cancelar turno' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ver historial clinico' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Eliminar paciente' },
};

export const Doctor: Story = {
  args: { variant: 'doctor', children: 'Iniciar videoconsulta' },
};

// --- Tamanos ---

export const Small: Story = {
  args: { size: 'sm', children: 'Ver mas' },
};

export const Large: Story = {
  args: { size: 'lg', children: 'Agendar turno' },
};

// --- Estados ---

export const Loading: Story = {
  args: { loading: true, children: 'Confirmando turno...' },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Sin disponibilidad' },
};

export const FullWidth: Story = {
  args: { fullWidth: true, children: 'Iniciar sesion' },
  decorators: [
    (Story) => (
      <div style={{ width: '360px' }}>
        <Story />
      </div>
    ),
  ],
};

// --- Con iconos ---

export const ConIconoIzquierdo: Story = {
  args: {
    children: 'Nuevo paciente',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
    iconPosition: 'left',
  },
};

export const ConIconoDerecho: Story = {
  args: {
    children: 'Ver recetas',
    variant: 'secondary',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    ),
    iconPosition: 'right',
  },
};

// --- Composicion: flujo real ---

export const FlujoPaciente: Story = {
  render: () => (
    <div className="flex flex-col gap-3" style={{ width: '320px' }}>
      <Button variant="primary" fullWidth>Buscar medico</Button>
      <Button variant="primary" fullWidth>Agendar turno</Button>
      <Button variant="doctor" fullWidth>Iniciar videoconsulta</Button>
      <Button variant="secondary" fullWidth>Ver historial</Button>
      <Button variant="ghost" fullWidth>Cerrar sesion</Button>
    </div>
  ),
};

export const AccionesDoctor: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="doctor">Iniciar consulta</Button>
      <Button variant="primary">Prescribir</Button>
      <Button variant="secondary">Notas clinicas</Button>
      <Button variant="danger" size="sm">Finalizar atencion</Button>
    </div>
  ),
};

export const TodasLasVariantes: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-am-surface-500 mb-2">Variantes</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Buscar medico</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Ver mas</Button>
          <Button variant="danger">Eliminar</Button>
          <Button variant="doctor">Consulta</Button>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-am-surface-500 mb-2">Tamanos</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Pequeno</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-am-surface-500 mb-2">Estados</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button loading>Cargando...</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </div>
    </div>
  ),
};
