'use client';

import { useSessionSync } from '@/hooks/patients/useSessionSync';

export function SessionSync() {
  useSessionSync();
  return null;
}
