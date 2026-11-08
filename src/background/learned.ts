import { normalizeLabel, type LearnedEntry, type LearnedMap, type LearnedStore } from '../shared/learned';
import { getItem, setItem } from '../shared/storage';
import { getValidSession } from './firebase/auth';
import { getDoc } from './firebase/firestore';
import { enqueue } from './firebase/queue';

const MAX_DOC_BYTES = 900_000; // Firestore documents cap at 1 MiB

const read = async (): Promise<LearnedStore> => (await getItem('lf_learned_fields')) ?? {};

// chrome.storage has no transactions; serialise read-modify-write so two quick saves cannot lose one
let chain: Promise<unknown> = Promise.resolve();
const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
};

export async function getLearned(profileId: string, scope: string): Promise<LearnedMap> {
  return (await read())[profileId]?.[scope] ?? {};
}

export async function listLearned(): Promise<LearnedStore> {
  return read();
}

/** Newer `lastUsed` wins per question; used when merging this device with the cloud copy. */
export function mergeStores(a: LearnedStore['x'] | undefined, b: LearnedStore['x'] | undefined): LearnedStore['x'] {
  const out: LearnedStore['x'] = {};
  for (const src of [a ?? {}, b ?? {}]) {
    for (const [scope, map] of Object.entries(src)) {
      out[scope] ??= {};
      for (const [k, e] of Object.entries(map)) {
        const cur = out[scope][k];
        if (!cur || e.lastUsed > cur.lastUsed) out[scope][k] = e;
      }
    }
  }
  return out;
}

async function pushProfile(profileId: string, store: LearnedStore): Promise<void> {
  try {
    const { uid } = await getValidSession();
    const scopes = store[profileId] ?? {};
    if (JSON.stringify(scopes).length > MAX_DOC_BYTES) return; // keep it local rather than fail the write
    await enqueue({
      op: 'set',
      path: `users/${uid}/learned/${profileId}`,
      data: { profileId, updatedAt: new Date().toISOString(), scopes: scopes as unknown as Record<string, unknown> },
    });
  } catch {
    /* signed out: stays local */
  }
}

/** Pull the cloud copy of one profile's answers into this device. */
export async function pullLearned(profileId: string): Promise<void> {
  try {
    const { uid } = await getValidSession();
    const remote = (await getDoc(`users/${uid}/learned/${profileId}`)) as { scopes?: LearnedStore['x'] } | null;
    if (!remote?.scopes) return;
    await exclusive(async () => {
      const store = await read();
      store[profileId] = mergeStores(store[profileId], remote.scopes);
      await setItem('lf_learned_fields', store);
    });
  } catch {
    /* offline: local copy is still good */
  }
}

type NewEntry = Omit<LearnedEntry, 'firstSeen' | 'lastUsed' | 'timesUsed' | 'source'>;

export async function saveLearned(profileId: string, scope: string, label: string, entry: NewEntry): Promise<void> {
  const key = normalizeLabel(label);
  if (!key) return;
  await pullLearned(profileId); // so a save on this device does not erase another device's answers
  await exclusive(async () => {
    const store = await read();
    const map = ((store[profileId] ??= {})[scope] ??= {});
    const prev = map[key];
    const now = new Date().toISOString();
    map[key] = { ...entry, originalLabel: entry.originalLabel.trim(), firstSeen: prev?.firstSeen ?? now, lastUsed: now, timesUsed: prev?.timesUsed ?? 0, source: 'manual' };
    await setItem('lf_learned_fields', store);
    await pushProfile(profileId, store);
  });
}

/** Count a replay. Local only: a counter is not worth a network write. */
export async function learnedUsed(profileId: string, scope: string, keys: string[]): Promise<void> {
  await exclusive(async () => {
    const store = await read();
    const map = store[profileId]?.[scope];
    if (!map) return;
    const now = new Date().toISOString();
    for (const k of keys) if (map[k]) map[k] = { ...map[k], timesUsed: map[k].timesUsed + 1, lastUsed: now };
    await setItem('lf_learned_fields', store);
  });
}

/** Edit an answer from the dashboard; it becomes a plain text answer. */
export async function updateLearned(profileId: string, scope: string, key: string, value: string): Promise<void> {
  await exclusive(async () => {
    const store = await read();
    const e = store[profileId]?.[scope]?.[key];
    if (!e) return;
    store[profileId][scope][key] = { ...e, value, selectedOptionText: value, lastUsed: new Date().toISOString(), source: 'edited' };
    await setItem('lf_learned_fields', store);
    await pushProfile(profileId, store);
  });
}

export async function deleteLearned(profileId: string, scope: string, key: string): Promise<void> {
  await exclusive(async () => {
    const store = await read();
    const map = store[profileId]?.[scope];
    if (!map?.[key]) return;
    delete map[key];
    if (!Object.keys(map).length) delete store[profileId][scope];
    await setItem('lf_learned_fields', store);
    await pushProfile(profileId, store);
  });
}

export async function clearLearned(profileId: string): Promise<void> {
  await exclusive(async () => {
    const store = await read();
    delete store[profileId];
    await setItem('lf_learned_fields', store);
    await pushProfile(profileId, { ...store, [profileId]: {} });
  });
}
