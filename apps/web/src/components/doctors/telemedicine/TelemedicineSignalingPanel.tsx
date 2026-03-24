'use client';

import { TelemedicineSignalingPanel as SharedPanel } from '@autamedica/ui';
import type { TelemedicineRole } from '@autamedica/telemedicine';

const DEFAULT_SIGNALING_URL = 'wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling';

interface TelemedicineSignalingPanelProps {
  roomId: string;
  userId: string;
  userType: TelemedicineRole;
  metadata?: Record<string, unknown>;
  className?: string;
}

export function TelemedicineSignalingPanel(props: TelemedicineSignalingPanelProps) {
  const signalingUrl = import.meta.env.PUBLIC_SIGNALING_URL ?? DEFAULT_SIGNALING_URL;
  const iceCandidateStyle = {
    bg: 'bg-purple-500/10',
    text: 'text-purple-200',
  };

  return <SharedPanel {...props} signalingUrl={signalingUrl} iceCandidateStyle={iceCandidateStyle} />;
}
