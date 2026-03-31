import type { Meta, StoryObj } from '@storybook/react';
import { Calendar, Home, MessageCircle, FileText, Video } from 'lucide-react';

type PatientTab = 'inicio' | 'agenda' | 'consultar' | 'historial' | 'comunidad';

const TABS: Array<{ key: PatientTab; label: string; icon: typeof Home; center?: boolean }> = [
  { key: 'inicio', label: 'Inicio', icon: Home },
  { key: 'agenda', label: 'Turnos', icon: Calendar },
  { key: 'consultar', label: 'Consultar', icon: Video, center: true },
  { key: 'historial', label: 'Historial', icon: FileText },
  { key: 'comunidad', label: 'Comunidad', icon: MessageCircle },
];

function BottomNavMockup({ activeTab = 'inicio' }: { activeTab?: PatientTab }) {
  return (
    <nav className="border-t border-gray-100 bg-white/90 backdrop-blur-xl" style={{ width: '375px' }}>
      <div className="mx-auto flex max-w-lg items-end justify-around px-2 pb-2">
        {TABS.map(({ key, label, icon: Icon, center }) => {
          const isActive = activeTab === key;

          if (center) {
            return (
              <button
                key={key}
                type="button"
                className="group -mt-5 flex flex-col items-center gap-0.5"
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 shadow-lg transition-transform active:scale-95"
                  style={{
                    boxShadow: isActive
                      ? '0 0 20px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.2)'
                      : '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  {label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={key}
              type="button"
              className="flex flex-col items-center gap-0.5 px-3 py-2"
            >
              <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`} />
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const meta: Meta<typeof BottomNavMockup> = {
  title: 'Layout/Patient Bottom Nav',
  component: BottomNavMockup,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'surface' },
  },
  argTypes: {
    activeTab: {
      control: 'select',
      options: ['inicio', 'agenda', 'consultar', 'historial', 'comunidad'],
    },
  },
  args: {
    activeTab: 'inicio',
  },
};

export default meta;
type Story = StoryObj<typeof BottomNavMockup>;

export const Inicio: Story = {
  args: { activeTab: 'inicio' },
};

export const Turnos: Story = {
  args: { activeTab: 'agenda' },
};

export const Consultar: Story = {
  args: { activeTab: 'consultar' },
};

export const Historial: Story = {
  args: { activeTab: 'historial' },
};

export const Comunidad: Story = {
  args: { activeTab: 'comunidad' },
};

export const EnContextoMobile: Story = {
  args: { activeTab: 'inicio' },
  render: (args) => (
    <div className="flex flex-col bg-gray-50 rounded-3xl overflow-hidden shadow-xl" style={{ width: '375px', height: '667px' }}>
      <div className="flex-1 p-6">
        <p className="text-sm text-gray-400 mb-1">Buenos dias,</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Maria</h1>
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Proximo turno</p>
          <p className="text-sm font-semibold text-gray-900">Dr. Martinez -- Cardiologia</p>
          <p className="text-xs text-gray-500 mt-1">Hoy 15:00 -- Videoconsulta</p>
        </div>
      </div>
      <BottomNavMockup {...args} />
    </div>
  ),
};
