import { getItem, setItem } from '../../shared/storage';
import type { PendingWrite } from '../../shared/types';
import { AuthError } from './auth';
import { deleteDoc, FirestoreError, setDoc } from './firestore';

const MAX_ATTEMPTS = 8;

// chrome.storage has no transactions, so serialise every queue mutation.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

/** Queue a write and try to flush right away. Never throws for network reasons. */
export function enqueue(w: Omit<PendingWrite, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
  return exclusive(async () => {
    const q = (await getItem('lf_pending_writes')) ?? [];
    // a newer write to the same document supersedes older pending ones
    const rest = q.filter((p) => p.path !== w.path);
    rest.push({ ...w, id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0 });
    await setItem('lf_pending_writes', rest);
  }).then(() => flushQueue()).then(
    () => undefined,
    () => undefined,
  );
}

export function pendingCount(): Promise<number> {
  return getItem('lf_pending_writes').then((q) => q?.length ?? 0);
}

export function flushQueue(): Promise<{ sent: number; remaining: number }> {
  return exclusive(async () => {
    const queue = (await getItem('lf_pending_writes')) ?? [];
    const failed = (await getItem('lf_failed_writes')) ?? [];
    const keep: PendingWrite[] = [];
    let sent = 0;
    let stop = false;
    for (const w of queue) {
      if (stop) {
        keep.push(w);
        continue;
      }
      try {
        if (w.op === 'set') await setDoc(w.path, w.data ?? {});
        else await deleteDoc(w.path);
        sent++;
      } catch (e) {
        if (e instanceof AuthError) {
          // signed out or token refresh failed: pause without burning attempts
          keep.push(w);
          stop = true;
          continue;
        }
        const err = e instanceof FirestoreError ? e : null;
        const retryable = !err || err.retryable;
        const attempts = w.attempts + 1;
        if (retryable && attempts < MAX_ATTEMPTS) {
          keep.push({ ...w, attempts });
          // offline or signed out: no point hammering the rest
          if (err && (err.status === 0 || err.status === 401)) stop = true;
        } else {
          failed.push({ ...w, attempts });
        }
      }
    }
    await setItem('lf_pending_writes', keep);
    await setItem('lf_failed_writes', failed.slice(-50));
    return { sent, remaining: keep.length };
  });
}
