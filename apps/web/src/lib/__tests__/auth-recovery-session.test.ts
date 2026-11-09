import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  event: 'PASSWORD_RECOVERY',
  session: { access_token: 'test-access-token', user: { id: 'test-user' } },
  subscription: { unsubscribe: vi.fn() },
  authClient: {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
  resetAuthCircuitBreaker: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@autamedica/auth', () => ({
  createBrowserClient: () => mocks.authClient,
  resetAuthCircuitBreaker: mocks.resetAuthCircuitBreaker,
}));

vi.mock('@autamedica/shared', () => ({
  logger: mocks.logger,
}));

vi.mock('../auth/browser-storage', () => ({
  markManualSignout: vi.fn(),
}));

import {
  initializePasswordRecoverySession,
  verifyPasswordRecoveryToken,
} from '../auth/service';

describe('initializePasswordRecoverySession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.event = 'PASSWORD_RECOVERY';
    mocks.session = { access_token: 'test-access-token', user: { id: 'test-user' } };

    mocks.authClient.auth.onAuthStateChange.mockImplementation((callback) => {
      callback(mocks.event, mocks.session);
      return { data: { subscription: mocks.subscription } };
    });
    mocks.authClient.auth.getSession.mockResolvedValue({
      data: { session: mocks.session },
      error: null,
    });
    mocks.authClient.auth.verifyOtp.mockResolvedValue({
      data: { session: mocks.session, user: mocks.session.user },
      error: null,
    });
  });

  it('redeems a recovery token hash only through the recovery OTP type', async () => {
    await expect(verifyPasswordRecoveryToken('  opaque-hash  ')).resolves.toEqual({
      ok: true,
      errorMessage: null,
    });
    expect(mocks.authClient.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'opaque-hash',
      type: 'recovery',
    });
  });

  it('does not accept a verified token response without a session', async () => {
    mocks.authClient.auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    await expect(verifyPasswordRecoveryToken('opaque-hash')).resolves.toEqual({
      ok: false,
      errorMessage: 'Password recovery session could not be established',
    });
  });

  it('returns a rejected or expired recovery token error', async () => {
    mocks.authClient.auth.verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Token has expired or is invalid' },
    });
    await expect(verifyPasswordRecoveryToken('expired-hash')).resolves.toEqual({
      ok: false,
      errorMessage: 'Token has expired or is invalid',
    });
  });

  it('accepts a session only after Supabase confirms PASSWORD_RECOVERY', async () => {
    await expect(initializePasswordRecoverySession()).resolves.toEqual({
      ok: true,
      errorMessage: null,
    });
    expect(mocks.resetAuthCircuitBreaker).toHaveBeenCalledOnce();
    expect(mocks.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('rejects an existing session that was not created by password recovery', async () => {
    mocks.event = 'SIGNED_IN';

    await expect(initializePasswordRecoverySession()).resolves.toEqual({
      ok: false,
      errorMessage: 'Password recovery session could not be established',
    });
    expect(mocks.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('rejects a recovery event without a session', async () => {
    mocks.session = null as never;

    await expect(initializePasswordRecoverySession()).resolves.toEqual({
      ok: false,
      errorMessage: 'Password recovery session could not be established',
    });
    expect(mocks.subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('returns the Supabase session error and always unsubscribes', async () => {
    mocks.authClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Session initialization failed' },
    });

    await expect(initializePasswordRecoverySession()).resolves.toEqual({
      ok: false,
      errorMessage: 'Session initialization failed',
    });
    expect(mocks.subscription.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.logger.warn).toHaveBeenCalledOnce();
  });
});
