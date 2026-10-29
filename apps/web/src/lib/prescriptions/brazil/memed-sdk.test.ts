// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ observe: vi.fn() }));
vi.mock('@/lib/supabase-browser', () => ({ getBrowserSupabaseClient: () => ({ auth: { onAuthStateChange: mocks.observe } }) }));

let initialized: (module: { name: string }) => void;
let events: Record<string, (payload: Record<string, unknown>) => void>;
let authChanged: (event: string, session: { user: { id: string } } | null) => void;
const command = vi.fn(async () => undefined);

beforeEach(() => {
  vi.resetModules(); vi.restoreAllMocks(); vi.clearAllMocks();
  vi.spyOn(HTMLScriptElement.prototype, 'src', 'set').mockImplementation(() => undefined); document.head.innerHTML = ''; events = {};
  mocks.observe.mockImplementation((callback) => { authChanged = callback; });
  Object.assign(window, {
    MdSinapsePrescricao: { event: { add: (_event: string, callback: typeof initialized) => { initialized = callback; } } },
    MdHub: { command: { send: command }, module: { show: vi.fn(), hide: vi.fn(async () => undefined) },
      event: { add: (name: string, callback: (payload: Record<string, unknown>) => void) => { events[name] = callback; } } },
  });
});

async function ready() {
  const sdk = await import('./memed-sdk');
  const loading = sdk.ensureMemedScript('synthetic-token', 'https://partners.memed.com.br/integration.js', 'doctor-user');
  document.querySelector('script')?.dispatchEvent(new Event('load'));
  initialized({ name: 'plataforma.prescricao' }); await loading;
  return sdk;
}

describe('Memed SDK lifecycle', () => {
  it('loads one script and installs one auth observer across repeated opens', async () => {
    const sdk = await ready();
    await sdk.ensureMemedScript('synthetic-token', 'https://partners.memed.com.br/integration.js', 'doctor-user');
    expect(document.querySelectorAll('#memed-prescricao-script')).toHaveLength(1);
    expect(mocks.observe).toHaveBeenCalledTimes(1);
  });
  it('routes events only to the latest mounted widget and clears callbacks on close', async () => {
    const sdk = await ready(); const previous = vi.fn(); const current = vi.fn();
    const clearOld = sdk.setMemedCallbacks(previous, vi.fn());
    const clearCurrent = sdk.setMemedCallbacks(current, vi.fn()); clearOld();
    events.prescricaoImpressa({ prescricao: { prescriptionUuid: 'rx-test' } });
    expect(current).toHaveBeenCalledWith('rx-test'); expect(previous).not.toHaveBeenCalled();
    clearCurrent(); events.prescricaoImpressa({ prescricao: { id: 'other-rx' } });
    expect(current).toHaveBeenCalledTimes(1);
    await sdk.ensureMemedScript('synthetic-token', 'https://partners.memed.com.br/integration.js', 'doctor-user');
  });
  it('clears provider storage on actual logout and blocks reuse until reload', async () => {
    const sdk = await ready(); authChanged('SIGNED_OUT', null);
    expect(command).toHaveBeenCalledWith('plataforma.sdk', 'logout');
    await expect(sdk.ensureMemedScript('synthetic-token', 'https://partners.memed.com.br/integration.js', 'doctor-user'))
      .rejects.toThrow('Sessão encerrada');
  });
  it('rejects account switches and token rotation rather than reusing stale identity', async () => {
    const sdk = await ready();
    await expect(sdk.ensureMemedScript('synthetic-token', 'https://partners.memed.com.br/integration.js', 'other-user'))
      .rejects.toThrow('sessão Memed foi alterada');
    await expect(sdk.ensureMemedScript('rotated-token', 'https://partners.memed.com.br/integration.js', 'doctor-user'))
      .rejects.toThrow('sessão Memed foi alterada');
  });
  it('never loads scripts from arbitrary Memed paths', async () => {
    const sdk = await import('./memed-sdk');
    await expect(sdk.ensureMemedScript('synthetic-token', 'https://partners.memed.com.br/other.js', 'doctor-user'))
      .rejects.toThrow('não autorizada');
    expect(document.querySelector('script')).toBeNull();
  });
});
