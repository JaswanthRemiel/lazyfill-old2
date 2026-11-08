import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const local: Record<string, unknown> = {};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  for (const k of Object.keys(local)) delete local[k];
  vi.stubGlobal('chrome', {
    storage: { local: { get: async (k: string) => ({ [k]: local[k] }), set: async (o: object) => Object.assign(local, o), remove: async (k: string) => delete local[k] } },
  });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (message: string) => ({ ok: false, status: 400, json: async () => ({ error: { message } }) });
const endpoint = (call: unknown[]) => String(call[0]).match(/accounts:(\w+)/)?.[1];
const signedIn = { localId: 'uid1', email: 'a@b.c', idToken: 'tok', refreshToken: 'ref', expiresIn: '3600' };

describe('signIn', () => {
  it('stores the session when the address is verified', async () => {
    fetchMock.mockResolvedValueOnce(ok(signedIn)).mockResolvedValueOnce(ok({ users: [{ emailVerified: true }] }));
    const { signIn, getSession } = await import('./auth');
    expect(await signIn(' a@b.c ', 'correct horse')).toBe('ok');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ email: 'a@b.c', password: 'correct horse', returnSecureToken: true });
    expect(await getSession()).toMatchObject({ uid: 'uid1', email: 'a@b.c', idToken: 'tok', refreshToken: 'ref' });
  });

  it('saves nothing until the address is verified', async () => {
    fetchMock.mockResolvedValueOnce(ok(signedIn)).mockResolvedValueOnce(ok({ users: [{ emailVerified: false }] }));
    const { signIn, getSession } = await import('./auth');
    expect(await signIn('a@b.c', 'correct horse')).toBe('unverified');
    expect(await getSession()).toBeUndefined();
  });

  it('explains a wrong password and an unsupported provider', async () => {
    const { signIn } = await import('./auth');
    fetchMock.mockResolvedValue(fail('INVALID_LOGIN_CREDENTIALS'));
    await expect(signIn('a@b.c', 'nope')).rejects.toThrow(/Wrong email or password/);
    fetchMock.mockResolvedValue(fail('OPERATION_NOT_ALLOWED'));
    await expect(signIn('a@b.c', 'nope')).rejects.toThrow(/not enabled/);
  });
});

describe('signUp', () => {
  it('creates the account and sends a verification email, without signing in', async () => {
    fetchMock.mockResolvedValueOnce(ok(signedIn)).mockResolvedValueOnce(ok({}));
    const { signUp, getSession } = await import('./auth');
    expect(await signUp('a@b.c', 'correct horse')).toBe('unverified');
    expect(fetchMock.mock.calls.map(endpoint)).toEqual(['signUp', 'sendOobCode']);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ requestType: 'VERIFY_EMAIL', idToken: 'tok' });
    expect(await getSession()).toBeUndefined();
  });

  it('refuses a short password before calling Firebase', async () => {
    const { signUp } = await import('./auth');
    await expect(signUp('a@b.c', 'short')).rejects.toThrow(/at least 8/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the address is already registered', async () => {
    fetchMock.mockResolvedValue(fail('EMAIL_EXISTS'));
    const { signUp } = await import('./auth');
    await expect(signUp('a@b.c', 'correct horse')).rejects.toThrow(/already exists/);
  });
});

describe('verification and reset emails', () => {
  it('resends the verification email after proving the password', async () => {
    fetchMock.mockResolvedValueOnce(ok(signedIn)).mockResolvedValueOnce(ok({}));
    const { resendVerification } = await import('./auth');
    await resendVerification('a@b.c', 'correct horse');
    expect(fetchMock.mock.calls.map(endpoint)).toEqual(['signInWithPassword', 'sendOobCode']);
  });

  it('asks for a password reset, and never reveals whether the address has an account', async () => {
    const { sendPasswordReset } = await import('./auth');
    fetchMock.mockResolvedValueOnce(ok({}));
    await sendPasswordReset('a@b.c');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ requestType: 'PASSWORD_RESET', email: 'a@b.c' });
    fetchMock.mockResolvedValueOnce(fail('EMAIL_NOT_FOUND'));
    await expect(sendPasswordReset('ghost@b.c')).resolves.toBeUndefined();
    await expect(sendPasswordReset('  ')).rejects.toThrow(/Enter your email/);
  });
});
