'use client';

import { doctorsEnv } from '@/lib/env';
import { TelemedicineSignalingPanel as SharedPanel } from '@autamedica/ui';
import type { TelemedicineRole } from '@autamedica/telemedicine';

interface TelemedicineSignalingPanelProps {
  roomId: string;
  userId: string;
  userType: TelemedicineRole;
  metadata?: Record<string, unknown>;
  className?: string;
}

export function TelemedicineSignalingPanel(props: TelemedicineSignalingPanelProps) {
  const iceCandidateStyle = {
    bg: 'bg-purple-500/10',
    text: 'text-purple-200',
  };

  return (
    <SharedPanel
      {...props}
      signalingUrl={doctorsEnv.signalingUrl}
      iceCandidateStyle={iceCandidateStyle}
    />
  );
}
