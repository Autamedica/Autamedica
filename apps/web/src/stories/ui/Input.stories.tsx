import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Input } from '../../../../../packages/ui/src/components/Input';

const inputClass = 'w-full rounded-xl border border-am-surface-200 bg-white px-4 py-2.5 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-primary-500 focus:outline-none focus:ring-2 focus:ring-am-primary-100 transition-all';
const searchClass = 'w-full rounded-xl border border-am-surface-200 bg-am-surface-50 px-4 py-2.5 pl-10 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-am-primary-500 focus:outline-none focus:ring-2 focus:ring-am-primary-100 focus:bg-white transition-all';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'search'],
    },
    placeholder: { control: 'text' },
  },
  args: {
    placeholder: 'Escribi aca...',
    type: 'text',
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
type Story = StoryObj<typeof Input>;

export const NombreCompleto: Story = {
  args: {
    placeholder: 'Nombre completo',
    className: inputClass,
  },
};

export const Email: Story = {
  args: {
    type: 'email',
    placeholder: 'paciente@email.com',
    className: inputClass,
  },
};

export const Contrasena: Story = {
  args: {
    type: 'password',
    placeholder: 'Minimo 8 caracteres',
    className: inputClass,
  },
};

export const Telefono: Story = {
  args: {
    type: 'tel',
    placeholder: '+54 11 1234-5678',
    className: inputClass,
  },
};

export const DNI: Story = {
  args: {
    type: 'text',
    placeholder: '32.456.789',
    className: inputClass,
  },
};

export const CUIL: Story = {
  args: {
    type: 'text',
    placeholder: '20-32456789-4',
    className: inputClass,
  },
};

export const BuscarMedico: Story = {
  render: () => (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-am-surface-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <Input
        type="search"
        placeholder="Buscar por nombre, especialidad o MP..."
        className={searchClass}
      />
    </div>
  ),
};

export const BuscarPaciente: Story = {
  render: () => (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-am-surface-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <Input
        type="search"
        placeholder="Buscar por nombre, DNI o historia clinica..."
        className={searchClass}
      />
    </div>
  ),
};

export const ConLabelYAyuda: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-am-surface-700">
          Correo electronico
        </label>
        <Input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="paciente@email.com"
          className={inputClass}
        />
        <p className="text-xs text-am-surface-400">Te enviaremos confirmaciones de turno a este email.</p>
      </div>
    );
  },
};

export const ConError: Story = {
  render: () => (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-am-surface-700">
        DNI
      </label>
      <Input
        type="text"
        value="123"
        className="w-full rounded-xl border border-red-300 bg-red-50/50 px-4 py-2.5 text-sm text-am-surface-900 placeholder:text-am-surface-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
      />
      <p className="text-xs text-red-500">El DNI debe tener entre 7 y 8 digitos.</p>
    </div>
  ),
};

export const FormularioDeRegistro: Story = {
  render: () => {
    const [form, setForm] = useState({ nombre: '', email: '', dni: '', tel: '' });
    const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-am-surface-700">Nombre completo</label>
          <Input value={form.nombre} onChange={update('nombre')} placeholder="Ej: Maria Laura Gonzalez" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-am-surface-700">Email</label>
          <Input type="email" value={form.email} onChange={update('email')} placeholder="paciente@email.com" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-am-surface-700">DNI</label>
            <Input value={form.dni} onChange={update('dni')} placeholder="32.456.789" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-am-surface-700">Telefono</label>
            <Input type="tel" value={form.tel} onChange={update('tel')} placeholder="+54 11 1234-5678" className={inputClass} />
          </div>
        </div>
      </div>
    );
  },
  decorators: [
    (Story) => (
      <div style={{ width: '400px' }}>
        <Story />
      </div>
    ),
  ],
};
