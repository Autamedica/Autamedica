import type { Meta, StoryObj } from '@storybook/react';
import {
  Users,
  Calendar,
  FileText,
  Activity,
  Bot,
  Star,
  Shield,
  Settings,
} from 'lucide-react';

interface SidebarItem {
  id: string;
  icon: typeof Users;
  label: string;
  count?: number;
  badge?: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'patients', icon: Users, label: 'Pacientes', count: 24 },
  { id: 'appointments', icon: Calendar, label: 'Citas', count: 8 },
  { id: 'records', icon: FileText, label: 'Historiales' },
  { id: 'vitals', icon: Activity, label: 'Signos Vitales', badge: '3' },
  { id: 'assistant', icon: Bot, label: 'Asistente Clinico', badge: 'IA' },
  { id: 'ranking', icon: Star, label: 'Ranking' },
  { id: 'coverage', icon: Shield, label: 'Cobertura' },
  { id: 'settings', icon: Settings, label: 'Configuracion' },
];

const CLINICAL_END = 3;
const TOOLS_END = 4;

function DoctorSidebarMockup({
  activeSection = 'patients',
  collapsed = false,
}: {
  activeSection?: string;
  collapsed?: boolean;
}) {
  return (
    <div
      className={`flex flex-col bg-white border-r border-gray-200 h-full ${collapsed ? 'w-16' : 'w-60'}`}
      style={{ minHeight: '520px' }}
    >
      {/* Header */}
      {!collapsed && (
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sm font-bold text-sky-700">
              RM
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Dr. Martinez</p>
              <p className="text-[11px] text-gray-400">Cardiologia</p>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="space-y-0.5 overflow-y-auto flex-1 p-2">
        {SIDEBAR_ITEMS.map(({ id, icon: Icon, label, count, badge }, index) => {
          const isActive = activeSection === id;
          const groupLabel = !collapsed && (
            index === 0 ? 'Clinica' :
            index === CLINICAL_END + 1 ? 'Herramientas' :
            index === TOOLS_END + 1 ? 'Plataforma' :
            null
          );

          return (
            <div key={id}>
              {groupLabel && (
                <p className={`px-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-gray-400 ${index > 0 ? 'mt-4 mb-1.5' : 'mb-1.5'}`}>
                  {groupLabel}
                </p>
              )}
              {!collapsed && index > 0 && (index === CLINICAL_END + 1 || index === TOOLS_END + 1) && (
                <div className="mx-2.5 mb-2 h-px bg-gray-100" />
              )}
              <button
                type="button"
                className={`relative flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                } ${collapsed ? 'flex-col gap-1 text-center' : 'gap-2'}`}
              >
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sky-500" />
                )}
                <span className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
                  <Icon className={`h-4 w-4 ${isActive ? 'text-sky-600' : 'text-gray-400'}`} />
                  {!collapsed && <span className="font-medium">{label}</span>}
                </span>
                {!collapsed && (
                  <span className="flex items-center gap-2">
                    {typeof count === 'number' && count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-600">{count}</span>
                    )}
                    {badge && (
                      <span className="rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
                    )}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

const meta: Meta<typeof DoctorSidebarMockup> = {
  title: 'Layout/Doctor Sidebar',
  component: DoctorSidebarMockup,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    activeSection: {
      control: 'select',
      options: SIDEBAR_ITEMS.map((i) => i.id),
    },
    collapsed: { control: 'boolean' },
  },
  args: {
    activeSection: 'patients',
    collapsed: false,
  },
};

export default meta;
type Story = StoryObj<typeof DoctorSidebarMockup>;

export const Pacientes: Story = {
  args: { activeSection: 'patients' },
};

export const Citas: Story = {
  args: { activeSection: 'appointments' },
};

export const AsistenteClinico: Story = {
  args: { activeSection: 'assistant' },
};

export const Colapsado: Story = {
  args: { collapsed: true, activeSection: 'patients' },
};

export const Configuracion: Story = {
  args: { activeSection: 'settings' },
};

export const EnContextoDesktop: Story = {
  args: { activeSection: 'appointments' },
  render: (args) => (
    <div className="flex rounded-2xl overflow-hidden shadow-xl border border-gray-200" style={{ width: '900px', height: '560px' }}>
      <DoctorSidebarMockup {...args} />
      <div className="flex-1 bg-gray-50 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Citas del dia</h2>
        <div className="space-y-3">
          {['Maria Garcia Lopez -- 10:00 -- Consulta', 'Juan Perez -- 11:30 -- Seguimiento', 'Ana Rodriguez -- 14:00 -- Telemedicina'].map((text) => (
            <div key={text} className="rounded-xl bg-white border border-gray-100 p-4 text-sm text-gray-700">
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
};
