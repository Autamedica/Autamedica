import {
  fetchSessionData as fetchSessionDataShared,
  getLoginUrl as getLoginUrlShared,
  logout as logoutShared,
} from '@autamedica/session';

export type SessionData = NonNullable<Awaited<ReturnType<typeof fetchSessionDataShared>>>;

export async function fetchSessionData(): Promise<SessionData | null> {
  return fetchSessionDataShared('patients', 'patient');
}

export function getLoginUrl(returnTo?: string): string {
  return getLoginUrlShared('patients', returnTo);
}

export async function logout() {
  return logoutShared('patients');
}
