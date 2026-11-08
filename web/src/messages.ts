/**
 * The dashboard's Applications page talks to the extension through `send(...)`. On the web there is no
 * extension, so the same calls go straight to Firestore. The Vite config points the page's import here.
 */
import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import type { Application } from '../../src/shared/types';
import { auth, db } from './firebase';

export type MessageResponse<T = unknown> = { success: boolean; data?: T; error?: string };

type WebMessage =
  | { action: 'listApplications' }
  | { action: 'saveApplication'; application: Application }
  | { action: 'deleteApplication'; id: string };

const when = (a: Application) => a.submittedAt ?? a.filledAt ?? a.createdAt;
const sorted = (apps: Application[]) => [...apps].sort((a, b) => when(b).localeCompare(when(a)));

function col() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  return collection(db, 'users', uid, 'applications');
}

export async function send<T = unknown>(msg: WebMessage): Promise<MessageResponse<T>> {
  try {
    switch (msg.action) {
      case 'listApplications': {
        const snap = await getDocs(col());
        return { success: true, data: sorted(snap.docs.map((d) => d.data() as Application)) as T };
      }
      case 'saveApplication':
        await setDoc(doc(col(), msg.application.id), { ...msg.application, updatedAt: new Date().toISOString() });
        return { success: true };
      case 'deleteApplication':
        await deleteDoc(doc(col(), msg.id));
        return { success: true };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function onApplicationsChanged(cb: (apps: Application[]) => void): () => void {
  let stop = () => {};
  try {
    stop = onSnapshot(col(), (snap) => cb(sorted(snap.docs.map((d) => d.data() as Application))), () => {});
  } catch { /* signed out: nothing to watch */ }
  return stop;
}
