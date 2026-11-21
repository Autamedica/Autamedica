type MemedEnvironment = Record<string, unknown> | undefined;

export function isMemedEnabled(env: MemedEnvironment): boolean {
  return env?.MEMED_RX_ENABLED === 'true';
}

export function isMemedMobileEnabled(env: MemedEnvironment): boolean {
  return env?.MEMED_RX_ENABLED === 'true' && env?.MEMED_MOBILE_ENABLED === 'true';
}

export function isMemedPilotDoctor(env: MemedEnvironment, doctorId: string | null | undefined): boolean {
  if (!doctorId) return false;
  const configuredIds = [env?.MEMED_PILOT_DOCTOR_ID, env?.MEMED_MOBILE_PILOT_DOCTOR_ID]
    .filter((configuredId): configuredId is string => typeof configuredId === 'string')
    .flatMap((configuredId) => configuredId.split(','))
    .map((configuredId) => configuredId.trim())
    .filter(Boolean);

  // MEMED_PILOT_DOCTOR_ID is strictly optional: when unset or blank, any active,
  // CFM-verified Brazilian CRM doctor may open Memed without a static allowlist.
  return configuredIds.length === 0 || configuredIds.includes(doctorId);
}
