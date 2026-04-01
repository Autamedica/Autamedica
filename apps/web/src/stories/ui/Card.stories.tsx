import type React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Card, Badge, Button } from '@autamedica/ui';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  argTypes: {
    variant: {
      control: 'select',
      options: ['elevated', 'outlined', 'filled', 'glass'],
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
    },
    hover: {
      control: 'select',
      options: ['none', 'lift', 'glow'],
    },
    as: {
      control: 'select',
      options: ['div', 'article', 'section'],
    },
  },
  args: {
    variant: 'elevated',
    padding: 'md',
    hover: 'none',
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

// --- Variantes basicas ---

export const Elevated: Story = {
  render: (args) => (
    <Card {...args}>
      <h3 className="text-lg font-semibold text-am-surface-900 mb-2">Proxima consulta</h3>
      <p className="text-sm text-am-surface-500">Dr. Martinez -- Cardiologia</p>
      <p className="text-xs text-am-surface-400 mt-1">Lunes 14 de abril, 10:00 hs</p>
    </Card>
  ),
};

export const Outlined: Story = {
  args: { variant: 'outlined' },
  render: (args) => (
    <Card {...args}>
      <h3 className="text-lg font-semibold text-am-surface-900 mb-2">Resultado de laboratorio</h3>
      <p className="text-sm text-am-surface-500">Hemograma completo</p>
      <p className="text-xs text-am-surface-400 mt-1">Subido el 10/04/2026</p>
    </Card>
  ),
};

export const Filled: Story = {
  args: { variant: 'filled' },
  render: (args) => (
    <Card {...args}>
      <h3 className="text-lg font-semibold text-am-surface-900 mb-2">Medicacion activa</h3>
      <p className="text-sm text-am-surface-500">Enalapril 10mg - 1 comprimido/dia</p>
      <p className="text-xs text-am-surface-400 mt-1">Renovar antes del 30/04</p>
    </Card>
  ),
};

export const Glass: Story = {
  args: { variant: 'glass' },
  render: (args) => (
    <div className="p-8 bg-gradient-to-br from-am-primary-50 to-am-primary-100 rounded-3xl">
      <Card {...args}>
        <h3 className="text-lg font-semibold text-am-surface-900 mb-2">Tu plan de salud</h3>
        <p className="text-sm text-am-surface-500">Plan Premium - Cobertura completa</p>
        <p className="text-xs text-am-surface-400 mt-1">Vigente hasta 12/2026</p>
      </Card>
    </div>
  ),
};

// --- Hover ---

export const HoverLift: Story = {
  args: { variant: 'elevated', hover: 'lift' },
  render: (args) => (
    <Card {...args}>
      <h3 className="text-lg font-semibold text-am-surface-900 mb-2">Cardiologia</h3>
      <p className="text-sm text-am-surface-500">3 medicos disponibles hoy</p>
    </Card>
  ),
};

export const HoverGlow: Story = {
  args: { variant: 'elevated', hover: 'glow' },
  render: (args) => (
    <Card {...args}>
      <h3 className="text-lg font-semibold text-am-surface-900 mb-2">Telemedicina</h3>
      <p className="text-sm text-am-surface-500">Consulta desde donde estes</p>
    </Card>
  ),
};

// --- Cards de producto real ---

export const TarjetaDeTurno: Story = {
  render: () => (
    <Card variant="elevated" hover="lift" padding="md" as="article" className="w-[380px]">
      <div className="flex items-start justify-between mb-3">
        <Badge variant="primary">Programada</Badge>
        <span className="text-xs text-am-surface-400">14 abr 2026</span>
      </div>
      <h3 className="text-base font-semibold text-am-surface-900">
        Dra. Carolina Mendez
      </h3>
      <p className="text-sm text-am-surface-500 mt-0.5">Dermatologia</p>
      <div className="flex items-center gap-4 mt-3 text-xs text-am-surface-400">
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          10:30 hs
        </span>
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          Videoconsulta
        </span>
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="primary" size="sm">Unirme</Button>
        <Button variant="ghost" size="sm">Reprogramar</Button>
      </div>
    </Card>
  ),
  decorators: [(Story) => <div style={{ width: '400px' }}><Story /></div>],
};

export const TarjetaDePaciente: Story = {
  render: () => (
    <Card variant="outlined" padding="md" as="article">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-am-primary-100 text-sm font-bold text-am-primary-700">
          ML
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-am-surface-900 truncate">Maria Laura Gonzalez</h3>
          <p className="text-xs text-am-surface-400">DNI 32.456.789 -- 38 anos</p>
        </div>
        <Badge variant="success" dot>Activa</Badge>
      </div>
      <div className="mt-3 pt-3 border-t border-am-surface-100 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold text-am-surface-900">12</p>
          <p className="text-[10px] text-am-surface-400">Consultas</p>
        </div>
        <div>
          <p className="text-lg font-bold text-am-surface-900">3</p>
          <p className="text-[10px] text-am-surface-400">Recetas</p>
        </div>
        <div>
          <p className="text-lg font-bold text-am-surface-900">1</p>
          <p className="text-[10px] text-am-surface-400">Alerta</p>
        </div>
      </div>
    </Card>
  ),
  decorators: [(Story) => <div style={{ width: '340px' }}><Story /></div>],
};

export const TarjetaDeDoctor: Story = {
  render: () => (
    <Card variant="elevated" hover="glow" padding="md" as="article">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-am-doctor-50 text-base font-bold text-am-doctor-700">
          RM
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-am-surface-900 truncate">Dr. Roberto Martinez</h3>
          <p className="text-xs text-am-surface-500">Cardiologia -- MP 45.892</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="doctor" dot>Disponible</Badge>
        <Badge variant="default" size="xs">Telemedicina</Badge>
        <Badge variant="default" size="xs">Presencial</Badge>
      </div>
      <div className="flex items-center justify-between text-xs text-am-surface-400">
        <span>Proximo turno: Hoy 15:00</span>
        <span className="flex items-center gap-0.5">
          <svg className="h-3 w-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          4.9 (127 opiniones)
        </span>
      </div>
      <Button variant="doctor" fullWidth size="sm" className="mt-3">Agendar turno</Button>
    </Card>
  ),
  decorators: [(Story) => <div style={{ width: '360px' }}><Story /></div>],
};

export const TodasLasVariantes: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4" style={{ width: '600px' }}>
      <Card variant="elevated" padding="md">
        <h3 className="text-sm font-semibold text-am-surface-900 mb-1">Elevated</h3>
        <p className="text-xs text-am-surface-500">Consulta de cardiologia</p>
      </Card>
      <Card variant="outlined" padding="md">
        <h3 className="text-sm font-semibold text-am-surface-900 mb-1">Outlined</h3>
        <p className="text-xs text-am-surface-500">Resultado de laboratorio</p>
      </Card>
      <Card variant="filled" padding="md">
        <h3 className="text-sm font-semibold text-am-surface-900 mb-1">Filled</h3>
        <p className="text-xs text-am-surface-500">Medicacion activa</p>
      </Card>
      <Card variant="glass" padding="md">
        <h3 className="text-sm font-semibold text-am-surface-900 mb-1">Glass</h3>
        <p className="text-xs text-am-surface-500">Plan de cobertura</p>
      </Card>
    </div>
  ),
};
