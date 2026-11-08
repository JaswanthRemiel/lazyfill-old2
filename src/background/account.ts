import * as auth from './firebase/auth';
import { deleteDoc, listDocPaths } from './firebase/firestore';

/** Everything lazyfill stores for a user lives in these collections (see firestore.rules). */
export const USER_COLLECTIONS = ['profiles', 'applications', 'resumes', 'reports', 'learned', 'settings'];

/**
 * Permanently deletes the signed-in user's cloud data and their account, then wipes everything this browser holds.
 * The password is checked first, and if any step fails nothing further is deleted, so it is safe to try again.
 */
export async function deleteAccount(password: string): Promise<void> {
  if (!password) throw new Error('Enter your password to confirm.');
  const session = await auth.reauthenticate(password);

  // pending writes would recreate documents after they are deleted
  await chrome.storage.local.set({ lf_pending_writes: [], lf_failed_writes: [] });

  for (const collection of USER_COLLECTIONS) {
    for (const path of await listDocPaths(`users/${session.uid}/${collection}`)) await deleteDoc(path);
  }
  await auth.deleteAuthAccount(session.idToken);

  await Promise.all([chrome.storage.local.clear(), chrome.storage.session?.clear?.(), chrome.storage.sync?.clear?.()]);
}
