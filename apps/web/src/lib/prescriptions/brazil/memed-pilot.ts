type MemedEnvironment = Record<string, unknown> | undefined;

export function isMemedEnabled(env: MemedEnvironment): boolean {
  return env?.MEMED_RX_ENABLED === 'true' || env?.MEMED_MOBILE_ENABLED === 'true';
}

export function isMemedPilotDoctor(env: MemedEnvironment, doctorId: string | null | undefined): boolean {
  if (!doctorId) return false;
  const configuredIds = [env?.MEMED_PILOT_DOCTOR_ID, env?.MEMED_MOBILE_PILOT_DOCTOR_ID]
    .filter((configuredId): configuredId is string => typeof configuredId === 'string')
    .map((configuredId) => configuredId.trim())
    .filter(Boolean);

  // An empty allowlist enables the BR CRM pilot for active, CFM-verified
  // doctors only; every endpoint still enforces that server-side credential gate.
  return configuredIds.length === 0 || configuredIds.includes(doctorId);
}
