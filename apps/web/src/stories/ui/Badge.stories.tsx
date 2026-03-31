import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '@autamedica/ui';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'doctor', 'success', 'warning', 'danger'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
    dot: { control: 'boolean' },
    pulse: { control: 'boolean' },
  },
  args: {
    children: 'Estado',
    variant: 'default',
    size: 'sm',
    dot: false,
    pulse: false,
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

// --- Estados de turnos ---

export const Programada: Story = {
  args: { variant: 'primary', children: 'Programada' },
};

export const Confirmada: Story = {
  args: { variant: 'success', dot: true, children: 'Confirmada' },
};

export const EnCurso: Story = {
  args: { variant: 'doctor', dot: true, pulse: true, children: 'En curso' },
};

export const Completada: Story = {
  args: { variant: 'success', children: 'Completada' },
};

export const Cancelada: Story = {
  args: { variant: 'danger', children: 'Cancelada' },
};

export const EnEspera: Story = {
  args: { variant: 'warning', dot: true, children: 'En espera' },
};

export const Urgente: Story = {
  args: { variant: 'danger', dot: true, pulse: true, children: 'Urgente' },
};

// --- Roles y estados de usuario ---

export const MedicoDisponible: Story = {
  args: { variant: 'doctor', dot: true, children: 'Disponible' },
};

export const PacienteEnLinea: Story = {
  args: { variant: 'success', dot: true, pulse: true, children: 'En linea' },
};

// --- Tamanos ---

export const ExtraSmall: Story = {
  args: { size: 'xs', variant: 'primary', children: 'Nuevo' },
};

export const Medium: Story = {
  args: { size: 'md', variant: 'primary', children: 'Telemedicina' },
};

// --- Composicion: estados de turno en una lista ---

export const EstadosDeTurno: Story = {
  render: () => (
    <div className="space-y-4" style={{ width: '300px' }}>
      <p className="text-xs font-medium text-am-surface-500">Estados de turno</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">Programada</Badge>
        <Badge variant="success" dot>Confirmada</Badge>
        <Badge variant="doctor" dot pulse>En curso</Badge>
        <Badge variant="success">Completada</Badge>
        <Badge variant="warning" dot>En espera</Badge>
        <Badge variant="danger">Cancelada</Badge>
        <Badge variant="danger" dot pulse>Urgente</Badge>
      </div>
    </div>
  ),
};

export const PrioridadesTriaje: Story = {
  render: () => (
    <div className="space-y-4" style={{ width: '300px' }}>
      <p className="text-xs font-medium text-am-surface-500">Prioridades de triaje</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Badge variant="danger" dot pulse size="md">P1 - Emergencia</Badge>
          <span className="text-xs text-am-surface-400">Atencion inmediata</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="warning" dot size="md">P2 - Urgencia</Badge>
          <span className="text-xs text-am-surface-400">Menos de 30 min</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="primary" size="md">P3 - Prioritario</Badge>
          <span className="text-xs text-am-surface-400">Menos de 60 min</span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="default" size="md">P4 - General</Badge>
          <span className="text-xs text-am-surface-400">Orden de llegada</span>
        </div>
      </div>
    </div>
  ),
};
