import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeLabel, type LearnedEntry } from '../shared/learned';

const local: Record<string, unknown> = {};
let remoteDoc = null as { scopes: unknown } | null;
const writes: { path: string; body: any }[] = [];

beforeEach(() => {
  vi.resetModules();
  for (const k of Object.keys(local)) delete local[k];
  remoteDoc = null;
  writes.length = 0;
  vi.stubGlobal('chrome', { storage: { local: { get: async (k: string) => ({ [k]: local[k] }), set: async (o: object) => Object.assign(local, o), remove: async (k: string) => delete local[k] } } });
  local.lf_session = { uid: 'u1', email: 'a@b.c', idToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 };
  local.lf_firebase_config = { apiKey: 'k', projectId: 'p' };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      const doc = remoteDoc;
      if (!doc) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ fields: { scopes: encodeMap(doc.scopes) } }) };
    }
    writes.push({ path: url, body: JSON.parse(String(init?.body)) });
    return { ok: true, status: 200, json: async () => ({}) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

// minimal Firestore value encoder for the fake server
function encodeMap(v: unknown): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeMap) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, encodeMap(x)])) } };
}

const entry = (value: string, over: Partial<LearnedEntry> = {}) => ({
  originalLabel: 'Favourite language', value, fieldType: 'text' as const, selectedOptionText: null, selectedIndex: null, options: null, lastUrl: 'https://x.test/job', ...over,
});

describe('learned answers store', () => {
  it('saves per profile and platform, keyed by the normalised question', async () => {
    const L = await import('./learned');
    await L.saveLearned('p1', 'greenhouse', 'Favourite language?  *', entry('TypeScript'));
    await L.saveLearned('p1', 'lever', 'Favourite language', entry('Rust'));
    await L.saveLearned('p2', 'greenhouse', 'Favourite language', entry('Go'));
    const key = normalizeLabel('Favourite language');
    expect((await L.getLearned('p1', 'greenhouse'))[key].value).toBe('TypeScript');
    expect((await L.getLearned('p1', 'lever'))[key].value).toBe('Rust');
    expect((await L.getLearned('p2', 'greenhouse'))[key].value).toBe('Go');
    expect(await L.getLearned('p3', 'greenhouse')).toEqual({});
  });

  it('a second save of the same question updates the value but keeps firstSeen and usage', async () => {
    const L = await import('./learned');
    const key = normalizeLabel('Favourite language');
    await L.saveLearned('p1', 'x', 'Favourite language', entry('A'));
    const first = (await L.getLearned('p1', 'x'))[key];
    await L.learnedUsed('p1', 'x', [key, key]);
    await L.saveLearned('p1', 'x', 'Favourite language', entry('B'));
    const e = (await L.getLearned('p1', 'x'))[key];
    expect(e.value).toBe('B');
    expect(e.firstSeen).toBe(first.firstSeen);
    expect(e.timesUsed).toBe(2);
  });

  it('syncs the profile\'s answers to Firestore', async () => {
    const L = await import('./learned');
    await L.saveLearned('p1', 'x', 'Favourite language', entry('A'));
    const w = writes.find((x) => x.path.includes('/learned/p1'));
    expect(w).toBeTruthy();
    expect(JSON.stringify(w!.body)).toContain('Favourite language');
  });

  it('merges with the cloud copy so another device\'s answers are not erased', async () => {
    const L = await import('./learned');
    remoteDoc = { scopes: { x: { [normalizeLabel('Notice period')]: { originalLabel: 'Notice period', value: '2 weeks', fieldType: 'text', lastUsed: '2030-01-01T00:00:00.000Z', firstSeen: '2030-01-01T00:00:00.000Z', timesUsed: 0, lastUrl: '', source: 'manual', selectedOptionText: null, selectedIndex: null, options: null } } } };
    await L.saveLearned('p1', 'x', 'Favourite language', entry('A'));
    const map = await L.getLearned('p1', 'x');
    expect(Object.keys(map).sort()).toEqual([normalizeLabel('Favourite language'), normalizeLabel('Notice period')].sort());
  });

  it('mergeStores: newer lastUsed wins per question, both sides kept otherwise', async () => {
    const { mergeStores } = await import('./learned');
    const e = (v: string, t: string) => ({ ...entry(v), firstSeen: t, lastUsed: t, timesUsed: 0, source: 'manual' as const });
    const m = mergeStores({ s: { a: e('old', '2020'), b: e('only-local', '2020') } }, { s: { a: e('new', '2021'), c: e('only-remote', '2020') } });
    expect(m.s.a.value).toBe('new');
    expect(Object.keys(m.s).sort()).toEqual(['a', 'b', 'c']);
  });

  it('edits and deletes', async () => {
    const L = await import('./learned');
    const key = normalizeLabel('Favourite language');
    await L.saveLearned('p1', 'x', 'Favourite language', entry('A', { fieldType: 'select', selectedOptionText: 'A' }));
    await L.updateLearned('p1', 'x', key, 'Edited');
    const e = (await L.getLearned('p1', 'x'))[key];
    expect(e).toMatchObject({ value: 'Edited', selectedOptionText: 'Edited', source: 'edited' });
    await L.deleteLearned('p1', 'x', key);
    expect(await L.getLearned('p1', 'x')).toEqual({});
    expect((await L.listLearned()).p1?.x).toBeUndefined();
  });

  it('clearing a profile removes all its answers locally and in the cloud', async () => {
    const L = await import('./learned');
    await L.saveLearned('p1', 'x', 'Q one', entry('1', { originalLabel: 'Q one' }));
    await L.saveLearned('p1', 'y', 'Q two', entry('2', { originalLabel: 'Q two' }));
    writes.length = 0;
    await L.clearLearned('p1');
    expect((await L.listLearned()).p1).toBeUndefined();
    expect(writes.at(-1)?.path).toContain('/learned/p1');
  });

  it('keeps working offline: the local save succeeds even if the network is down', async () => {
    const L = await import('./learned');
    (fetch as any).mockRejectedValue(new Error('offline'));
    await expect(L.saveLearned('p1', 'x', 'Favourite language', entry('A'))).resolves.toBeUndefined();
    expect((await L.getLearned('p1', 'x'))[normalizeLabel('Favourite language')].value).toBe('A');
  });

  it('ignores an empty question', async () => {
    const L = await import('./learned');
    await L.saveLearned('p1', 'x', '   *  ', entry('A'));
    expect(await L.getLearned('p1', 'x')).toEqual({});
  });
});
