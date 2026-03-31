import type { Meta, StoryObj } from '@storybook/react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ScreenShare,
  MonitorUp,
  MessageSquare,
  Users,
} from 'lucide-react';
import { useState } from 'react';

function ControlButton({
  active,
  iconActive,
  iconInactive,
  label,
  onClick,
}: {
  active: boolean;
  iconActive: React.ReactNode;
  iconInactive: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
        active
          ? 'bg-stone-600 text-white shadow-lg shadow-stone-600/30 hover:bg-stone-500'
          : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
      }`}
      aria-label={label}
      title={label}
    >
      {active ? iconActive : iconInactive}
    </button>
  );
}

function VideoCallMockup({
  patientName = 'Maria Garcia Lopez',
  doctorName = 'Dr. Roberto Martinez',
  duration = '12:34',
  isMuted = false,
  isVideoOn = true,
  isScreenSharing = false,
}: {
  patientName?: string;
  doctorName?: string;
  duration?: string;
  isMuted?: boolean;
  isVideoOn?: boolean;
  isScreenSharing?: boolean;
}) {
  const [muted, setMuted] = useState(isMuted);
  const [videoOn, setVideoOn] = useState(isVideoOn);
  const [sharing, setSharing] = useState(isScreenSharing);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gray-900" style={{ width: '720px', height: '480px' }}>
      {/* Video principal (doctor) */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
        {videoOn ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-sky-900/50 text-3xl font-bold text-sky-300">
              RM
            </div>
            <p className="text-sm text-gray-400">{doctorName}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 text-3xl font-bold text-gray-400">
              <VideoOff className="h-10 w-10" />
            </div>
            <p className="text-sm text-gray-500">Camara desactivada</p>
          </div>
        )}
      </div>

      {/* PiP del paciente (esquina superior derecha) */}
      <div className="absolute right-4 top-4 h-32 w-44 overflow-hidden rounded-xl border-2 border-white/20 bg-gray-800 shadow-xl">
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-900/50 text-sm font-bold text-emerald-300">
              MG
            </div>
            <p className="text-[10px] text-gray-400">{patientName.split(' ')[0]}</p>
          </div>
        </div>
      </div>

      {/* Timer + estado */}
      <div className="absolute left-4 top-4 flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-white tabular-nums">{duration}</span>
        </div>
        <div className="rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-md">
          <span className="text-xs text-gray-300">{patientName}</span>
        </div>
      </div>

      {/* Indicador de mic muteado */}
      {muted && (
        <div className="absolute left-4 bottom-24 flex items-center gap-2 rounded-full bg-red-600/80 px-3 py-1.5 backdrop-blur-md">
          <MicOff className="h-3.5 w-3.5 text-white" />
          <span className="text-xs text-white">Microfono silenciado</span>
        </div>
      )}

      {/* Barra de controles */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-6">
        <div className="flex items-center gap-3 rounded-full border border-white/20 bg-black/70 px-6 py-3 shadow-xl backdrop-blur-md">
          <ControlButton
            active={!muted}
            iconActive={<Mic className="h-5 w-5" />}
            iconInactive={<MicOff className="h-5 w-5" />}
            label={muted ? 'Activar microfono' : 'Silenciar'}
            onClick={() => setMuted(!muted)}
          />
          <ControlButton
            active={videoOn}
            iconActive={<Video className="h-5 w-5" />}
            iconInactive={<VideoOff className="h-5 w-5" />}
            label={videoOn ? 'Ocultar video' : 'Mostrar video'}
            onClick={() => setVideoOn(!videoOn)}
          />
          <ControlButton
            active={sharing}
            iconActive={<ScreenShare className="h-5 w-5" />}
            iconInactive={<MonitorUp className="h-5 w-5" />}
            label={sharing ? 'Detener pantalla' : 'Compartir pantalla'}
            onClick={() => setSharing(!sharing)}
          />

          <div className="mx-1 h-8 w-px bg-white/20" />

          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            title="Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            title="Participantes"
          >
            <Users className="h-5 w-5" />
          </button>

          <div className="mx-1 h-8 w-px bg-white/20" />

          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-500 hover:scale-110"
            title="Terminar llamada"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof VideoCallMockup> = {
  title: 'Medical/Video Call UI',
  component: VideoCallMockup,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    patientName: { control: 'text' },
    doctorName: { control: 'text' },
    duration: { control: 'text' },
    isMuted: { control: 'boolean' },
    isVideoOn: { control: 'boolean' },
    isScreenSharing: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof VideoCallMockup>;

export const Default: Story = {
  args: {
    patientName: 'Maria Garcia Lopez',
    doctorName: 'Dr. Roberto Martinez',
    duration: '12:34',
    isMuted: false,
    isVideoOn: true,
    isScreenSharing: false,
  },
};

export const MicSilenciado: Story = {
  args: {
    ...Default.args,
    isMuted: true,
  },
};

export const CamaraApagada: Story = {
  args: {
    ...Default.args,
    isVideoOn: false,
  },
};

export const CompartiendoPantalla: Story = {
  args: {
    ...Default.args,
    isScreenSharing: true,
    duration: '45:12',
  },
};

export const ConsultaNeurologia: Story = {
  args: {
    patientName: 'Carmen Beatriz Diaz',
    doctorName: 'Dr. Fernando Alvarez',
    duration: '03:17',
    isMuted: false,
    isVideoOn: true,
    isScreenSharing: false,
  },
};
