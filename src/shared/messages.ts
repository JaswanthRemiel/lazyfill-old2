import type { Application, Profile } from './types';
import type { ResumeFile } from '../background/data';
import type { JobInfo } from './job';
import type { ResumeSource } from './resumeImport';
import type { LearnedEntry } from './learned';

// Messages sent to the service worker via chrome.runtime.sendMessage.
export type Message =
  | { action: 'ping' }
  | { action: 'togglePanel' }
  | { action: 'testConnection' }
  | { action: 'signIn'; email: string; password: string }
  | { action: 'signUp'; email: string; password: string }
  | { action: 'resendVerification'; email: string; password: string }
  | { action: 'sendPasswordReset'; email: string }
  | { action: 'signOut' }
  | { action: 'deleteAccount'; password: string }
  | { action: 'getSession' }
  | { action: 'listProfiles' }
  | { action: 'saveProfile'; profile: Profile }
  | { action: 'deleteProfile'; id: string }
  | { action: 'setActiveProfile'; id: string }
  | { action: 'getActiveProfile' }
  | { action: 'listApplications' }
  | { action: 'saveApplication'; application: Application }
  | { action: 'deleteApplication'; id: string }
  | { action: 'saveResume'; profileId: string; file: ResumeFile }
  | { action: 'getResume'; profileId: string }
  | { action: 'deleteResume'; profileId: string }
  | { action: 'importResume'; source: ResumeSource }
  | { action: 'testAi' }
  | { action: 'generateAnswer'; question: string; job: { title: string; company: string; description: string } }
  | { action: 'getPromptTemplate' }
  | { action: 'savePromptTemplate'; template: string }
  | { action: 'submitReport'; description: string; screenshot?: { fileName: string; mimeType: string; base64: string } }
  | { action: 'getLearned'; profileId: string; scope: string }
  | { action: 'saveLearned'; profileId: string; scope: string; label: string; entry: Omit<LearnedEntry, 'firstSeen' | 'lastUsed' | 'timesUsed' | 'source'> }
  | { action: 'learnedUsed'; profileId: string; scope: string; labels: string[] }
  | { action: 'updateLearned'; profileId: string; scope: string; key: string; value: string }
  | { action: 'deleteLearned'; profileId: string; scope: string; key: string }
  | { action: 'clearLearned'; profileId: string }
  | { action: 'listLearned' }
  | { action: 'jobSeen'; info: JobInfo }
  | { action: 'trackFilled'; info: JobInfo; filledCount: number }
  | { action: 'trackSubmitted'; info: JobInfo; armed: boolean }
  | { action: 'flushQueue' };

export type MessageResponse<T = unknown> = { success: boolean; data?: T; error?: string };

export function send<T = unknown>(msg: Message): Promise<MessageResponse<T>> {
  return chrome.runtime.sendMessage(msg);
}

/** Calls `cb` with the full application list whenever another part of the extension changes it. */
export function onApplicationsChanged(cb: (apps: Application[]) => void): () => void {
  const on = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && c.lf_applications_cache?.newValue) cb(c.lf_applications_cache.newValue as Application[]);
  };
  chrome.storage.onChanged.addListener(on);
  return () => chrome.storage.onChanged.removeListener(on);
}
