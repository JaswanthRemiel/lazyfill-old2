import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobInfo } from '../shared/job';

const local: Record<string, unknown> = {};
const session: Record<string, unknown> = {};
const notifications: unknown[] = [];

beforeEach(() => {
  vi.resetModules();
  for (const o of [local, session]) for (const k of Object.keys(o)) delete o[k];
  notifications.length = 0;
  const area = (m: Record<string, unknown>) => ({
    get: async (k: string) => ({ [k]: m[k] }),
    set: async (o: object) => Object.assign(m, o),
    remove: async (k: string) => delete m[k],
  });
  vi.stubGlobal('chrome', {
    storage: { local: area(local), session: area(session) },
    notifications: { create: (id: string, o: unknown) => notifications.push({ id, o }) },
    runtime: { getURL: (p: string) => p },
  });
  // signed-in session so writes are queued; the Firestore calls themselves are stubbed below
  local.lf_session = { uid: 'u1', email: 'a@b.c', idToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 };
  local.lf_firebase_config = { apiKey: 'k', projectId: 'p' };
  local.lf_active_profile_id = 'prof1';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
});
afterEach(() => vi.unstubAllGlobals());

const job = (over: Partial<JobInfo> = {}): JobInfo => ({
  jobTitle: 'Backend Engineer', company: 'Acme', jobUrl: 'https://boards.greenhouse.io/acme/jobs/123', platform: 'greenhouse', ...over,
});
const apps = () => (local.lf_applications_cache as Array<Record<string, any>>) ?? [];

describe('tracker', () => {
  it('filled then submitted updates one record', async () => {
    const t = await import('./tracker');
    await t.trackFilled(7, job());
    expect(apps()).toHaveLength(1);
    expect(apps()[0]).toMatchObject({ status: 'filled', company: 'Acme', profileId: 'prof1' });
    expect(apps()[0].submittedAt).toBeUndefined();

    // the confirmation page has a different url and no title
    await t.trackSubmitted(7, job({ jobUrl: 'https://boards.greenhouse.io/acme/jobs/123/confirmation', jobTitle: 'Untitled role' }), true);
    expect(apps()).toHaveLength(1);
    expect(apps()[0]).toMatchObject({ status: 'submitted', jobTitle: 'Backend Engineer' });
    expect(apps()[0].submittedAt).toBeTruthy();
    expect(notifications).toHaveLength(1);
  });

  it('ignores a confirmation it has no reason to trust', async () => {
    const t = await import('./tracker');
    expect(await t.trackSubmitted(9, job(), false)).toBeNull();
    expect(apps()).toHaveLength(0);
  });

  it('links a submit to the job seen earlier in the tab even if never autofilled', async () => {
    const t = await import('./tracker');
    await t.jobSeen(3, job({ jobTitle: 'SRE', company: 'Globex', jobUrl: 'https://jobs.lever.co/globex/abc' }));
    await t.trackSubmitted(3, job({ jobTitle: 'Untitled role', company: 'Unknown company', jobUrl: 'https://jobs.lever.co/globex/abc/thanks' }), false);
    expect(apps()[0]).toMatchObject({ status: 'submitted', jobTitle: 'SRE', company: 'Globex' });
  });

  it('does not record or notify twice when the confirmation page is reloaded', async () => {
    const t = await import('./tracker');
    await t.trackFilled(5, job());
    await t.trackSubmitted(5, job(), true);
    const first = apps()[0].submittedAt;
    expect(notifications).toHaveLength(1);
    // reload: the tab's job was cleared and the page is armed again from sessionStorage
    await t.trackSubmitted(5, job(), true);
    expect(apps()).toHaveLength(1);
    expect(apps()[0].submittedAt).toBe(first);
    expect(notifications).toHaveLength(1);
  });

  it('never downgrades a status the user set by hand', async () => {
    const t = await import('./tracker');
    await t.trackFilled(1, job());
    const id = apps()[0].id;
    local.lf_applications_cache = apps().map((a) => (a.id === id ? { ...a, status: 'interviewing' } : a));
    await t.trackFilled(1, job());
    expect(apps()[0].status).toBe('interviewing');
    await t.trackSubmitted(1, job(), true);
    expect(apps()[0].status).toBe('interviewing');
    expect(apps()[0].submittedAt).toBeTruthy(); // but the submission is still recorded
  });

  it('a later fill does not move a submitted application back to filled', async () => {
    const t = await import('./tracker');
    await t.trackFilled(2, job());
    await t.trackSubmitted(2, job(), true);
    await t.trackFilled(2, job());
    expect(apps()[0].status).toBe('submitted');
  });

  it('different jobs get different records', async () => {
    const t = await import('./tracker');
    await t.trackFilled(1, job());
    await t.trackFilled(1, job({ jobUrl: 'https://boards.greenhouse.io/acme/jobs/999', jobTitle: 'Other' }));
    expect(apps()).toHaveLength(2);
  });

  it('same job with tracking params and /apply suffix maps to the same record', async () => {
    const { applicationIdFor } = await import('../shared/job');
    const a = await applicationIdFor('https://jobs.lever.co/globex/abc?lever-source=LinkedIn');
    const b = await applicationIdFor('https://jobs.lever.co/globex/abc/apply');
    expect(a).toBe(b);
    const c = await applicationIdFor('https://careers.x.com/job?gh_jid=1');
    const d = await applicationIdFor('https://careers.x.com/job?gh_jid=2');
    expect(c).not.toBe(d);
  });
});
