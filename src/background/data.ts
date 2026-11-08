import { getItem, setItem } from '../shared/storage';
import type { Application, Profile } from '../shared/types';
import { normaliseProfileData } from '../shared/profile';
import { getValidSession } from './firebase/auth';
import { getDoc, listDocs } from './firebase/firestore';
import { enqueue } from './firebase/queue';
import { pullLearned } from './learned';

async function uidPath(sub: string): Promise<string> {
  const { uid } = await getValidSession();
  return `users/${uid}/${sub}`;
}

/** Older or partial documents are upgraded to the current shape on read. */
const withData = (p: Profile): Profile => ({ ...p, data: normaliseProfileData(p.data) });

// ---- profiles: Firestore is the source of truth, local cache is the offline copy ----

export async function listProfiles(): Promise<Profile[]> {
  try {
    const profiles = ((await listDocs(await uidPath('profiles'))) as unknown as Profile[]).map(withData);
    profiles.sort((a, b) => a.name.localeCompare(b.name));
    await setItem('lf_profile_cache', profiles);
    // answers you taught lazyfill on another device
    void Promise.all(profiles.map((p) => pullLearned(p.id)));
    return profiles;
  } catch {
    return (await getItem('lf_profile_cache')) ?? [];
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  const path = await uidPath(`profiles/${profile.id}`); // throws "Not signed in." before anything is cached
  const next = { ...profile, updatedAt: new Date().toISOString() };
  // update the cache first so autofill sees the change immediately, even offline
  const cache = (await getItem('lf_profile_cache')) ?? [];
  await setItem('lf_profile_cache', [...cache.filter((p) => p.id !== next.id), next]);
  await enqueue({ op: 'set', path, data: next as unknown as Record<string, unknown> });
}

export async function deleteProfile(id: string): Promise<void> {
  const cache = (await getItem('lf_profile_cache')) ?? [];
  await setItem('lf_profile_cache', cache.filter((p) => p.id !== id));
  if ((await getItem('lf_active_profile_id')) === id) await chrome.storage.local.remove('lf_active_profile_id');
  await enqueue({ op: 'delete', path: await uidPath(`profiles/${id}`) });
  await deleteResume(id);
}

export async function setActiveProfile(id: string): Promise<void> {
  await setItem('lf_active_profile_id', id);
}

/** Reads from the local cache only, so autofill never waits on the network. */
export async function getActiveProfile(): Promise<Profile | null> {
  const [cache, id] = await Promise.all([getItem('lf_profile_cache'), getItem('lf_active_profile_id')]);
  if (!cache?.length) return null;
  return withData(cache.find((p) => p.id === id) ?? cache[0]);
}

// ---- applications: Firestore is the source of truth, the local cache keeps the tracker usable offline ----

const sortApps = (apps: Application[]) =>
  [...apps].sort((a, b) => (b.submittedAt ?? b.filledAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.filledAt ?? a.createdAt));

export async function listApplications(): Promise<Application[]> {
  try {
    const apps = sortApps((await listDocs(await uidPath('applications'))) as unknown as Application[]);
    await setItem('lf_applications_cache', apps);
    return apps;
  } catch {
    return sortApps((await getItem('lf_applications_cache')) ?? []);
  }
}

export async function getCachedApplication(id: string): Promise<Application | undefined> {
  return ((await getItem('lf_applications_cache')) ?? []).find((a) => a.id === id);
}

export async function saveApplication(application: Application): Promise<void> {
  const next = { ...application, updatedAt: new Date().toISOString() };
  const cache = (await getItem('lf_applications_cache')) ?? [];
  await setItem('lf_applications_cache', sortApps([...cache.filter((a) => a.id !== next.id), next]));
  await enqueue({ op: 'set', path: await uidPath(`applications/${next.id}`), data: next as unknown as Record<string, unknown> });
}

export async function deleteApplication(id: string): Promise<void> {
  const cache = (await getItem('lf_applications_cache')) ?? [];
  await setItem('lf_applications_cache', cache.filter((a) => a.id !== id));
  await enqueue({ op: 'delete', path: await uidPath(`applications/${id}`) });
}

// ---- resumes: one file per profile, base64 in its own document (Firestore caps a document at 1 MiB) ----

export const MAX_RESUME_BYTES = 700 * 1024;
const resumeKey = (profileId: string) => `lf_resume_${profileId}`;

export interface ResumeFile {
  fileName: string;
  mimeType: string;
  base64: string;
}

export interface SaveResumeResult {
  /** false when the file is kept on this device only (too large to sync, or not signed in) */
  synced: boolean;
  reason?: string;
}

/** Always stored locally so autofill works; synced to Firestore only when it fits and you are signed in. */
export async function saveResume(profileId: string, file: ResumeFile): Promise<SaveResumeResult> {
  await chrome.storage.local.set({ [resumeKey(profileId)]: file });
  if (file.base64.length * 0.75 > MAX_RESUME_BYTES) {
    return { synced: false, reason: `Larger than ${Math.round(MAX_RESUME_BYTES / 1024)} KB, so it is kept on this device only.` };
  }
  try {
    await enqueue({ op: 'set', path: await uidPath(`resumes/${profileId}`), data: { ...file } });
    return { synced: true };
  } catch {
    return { synced: false, reason: 'Not signed in, so it is kept on this device only.' };
  }
}

/** Local copy first so file inputs can be filled offline; falls back to Firestore. */
export async function getResume(profileId: string): Promise<ResumeFile | null> {
  const key = resumeKey(profileId);
  const local = (await chrome.storage.local.get(key))[key] as ResumeFile | undefined;
  if (local) return local;
  const remote = (await getDoc(await uidPath(`resumes/${profileId}`)).catch(() => null)) as ResumeFile | null;
  if (remote) await chrome.storage.local.set({ [key]: remote });
  return remote;
}

export async function deleteResume(profileId: string): Promise<void> {
  await chrome.storage.local.remove(resumeKey(profileId));
  await enqueue({ op: 'delete', path: await uidPath(`resumes/${profileId}`) });
}

// ---- issue reports: stored in your own Firestore so you can review them ----

export async function saveReport(
  description: string,
  screenshot?: { fileName: string; mimeType: string; base64: string },
): Promise<void> {
  if (screenshot && screenshot.base64.length * 0.75 > MAX_RESUME_BYTES) throw new Error('Screenshot is too large (limit 700 KB).');
  const id = crypto.randomUUID();
  await enqueue({
    op: 'set',
    path: await uidPath(`reports/${id}`),
    data: { id, description, createdAt: new Date().toISOString(), version: chrome.runtime.getManifest().version, ...(screenshot ? { screenshot } : {}) },
  });
}
