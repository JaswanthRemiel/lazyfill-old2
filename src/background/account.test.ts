import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const local: Record<string, unknown> = {};
let calls: { method: string; url: string }[];
let responses: (url: string, method: string) => { ok: boolean; status?: number; body: unknown };

const area = (m: Record<string, unknown>) => ({
  get: async (k: string) => ({ [k]: m[k] }),
  set: async (o: object) => Object.assign(m, o),
  remove: async (k: string) => delete m[k],
  clear: async () => { for (const k of Object.keys(m)) delete m[k]; },
});

beforeEach(() => {
  vi.resetModules();
  for (const k of Object.keys(local)) delete local[k];
  local.lf_session = { uid: 'u1', email: 'a@b.c', idToken: 'old', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 };
  local.lf_pending_writes = [{ id: 'x', op: 'set', path: 'users/u1/profiles/p', data: {}, createdAt: 0, attempts: 0 }];
  calls = [];
  vi.stubGlobal('chrome', { storage: { local: area(local), session: area({}), sync: area({}) } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    const r = responses(url, method);
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body };
  }));
});
afterEach(() => vi.unstubAllGlobals());

const doc = (path: string) => ({ name: `projects/p/databases/(default)/documents/${path}` });

describe('deleteAccount', () => {
  it('checks the password, deletes every document, deletes the account, then wipes the browser', async () => {
    responses = (url, method) => {
      if (url.includes('signInWithPassword')) return { ok: true, body: { localId: 'u1', email: 'a@b.c', idToken: 'fresh', refreshToken: 'r2', expiresIn: '3600' } };
      if (url.includes('accounts:delete')) return { ok: true, body: {} };
      if (method === 'DELETE') return { ok: true, body: {} };
      const col = url.match(/documents\/users\/u1\/(\w+)/)?.[1];
      return { ok: true, body: col === 'profiles' ? { documents: [doc('users/u1/profiles/p1'), doc('users/u1/profiles/p2')] } : col === 'applications' ? { documents: [doc('users/u1/applications/a1')] } : {} };
    };
    const { deleteAccount, USER_COLLECTIONS } = await import('./account');
    await deleteAccount('correct horse');

    const deleted = calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/documents/')[1]);
    expect(deleted).toEqual(['users/u1/profiles/p1', 'users/u1/profiles/p2', 'users/u1/applications/a1']);
    expect(USER_COLLECTIONS.every((c) => calls.some((x) => x.url.includes(`/users/u1/${c}`)))).toBe(true);
    const order = calls.map((c) => (c.url.includes('accounts:delete') ? 'account' : c.url.includes('signIn') ? 'auth' : c.method === 'DELETE' ? 'doc' : 'list'));
    expect(order[0]).toBe('auth');
    expect(order.at(-1)).toBe('account'); // the account goes last, once the data is gone
    expect(Object.keys(local)).toEqual([]); // nothing left in the browser, including the pending writes
  });

  it('deletes nothing when the password is wrong', async () => {
    responses = () => ({ ok: false, body: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } });
    const { deleteAccount } = await import('./account');
    await expect(deleteAccount('nope')).rejects.toThrow(/Wrong email or password/);
    expect(calls.every((c) => c.url.includes('signInWithPassword'))).toBe(true);
    expect(local.lf_session).toBeTruthy();
  });

  it('keeps the account if deleting data fails, so it can be retried', async () => {
    responses = (url, method) => {
      if (url.includes('signInWithPassword')) return { ok: true, body: { localId: 'u1', email: 'a@b.c', idToken: 'fresh', refreshToken: 'r2', expiresIn: '3600' } };
      if (method === 'DELETE') return { ok: false, status: 500, body: { error: { message: 'boom' } } };
      return { ok: true, body: { documents: [doc('users/u1/profiles/p1')] } };
    };
    const { deleteAccount } = await import('./account');
    await expect(deleteAccount('correct horse')).rejects.toThrow();
    expect(calls.some((c) => c.url.includes('accounts:delete'))).toBe(false);
  });

  it('refuses to start without a password, and for a different account', async () => {
    responses = () => ({ ok: true, body: { localId: 'someone-else', email: 'x@y.z', idToken: 't', refreshToken: 'r', expiresIn: '3600' } });
    const { deleteAccount } = await import('./account');
    await expect(deleteAccount('')).rejects.toThrow(/Enter your password/);
    await expect(deleteAccount('pw')).rejects.toThrow(/different account/);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});
