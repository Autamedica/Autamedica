type MemedEnvironment = Record<string, unknown> | undefined;

export function isMemedEnabled(env: MemedEnvironment): boolean {
  return env?.MEMED_RX_ENABLED === 'true' || env?.MEMED_MOBILE_ENABLED === 'true';
}

export function isMemedPilotDoctor(env: MemedEnvironment, doctorId: string | null | undefined): boolean {
  if (!doctorId) return false;
  return [env?.MEMED_PILOT_DOCTOR_ID, env?.MEMED_MOBILE_PILOT_DOCTOR_ID]
    .some((configuredId) => typeof configuredId === 'string' && configuredId.trim() === doctorId);
}
