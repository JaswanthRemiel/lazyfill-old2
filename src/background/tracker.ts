import { applicationIdFor, type JobInfo } from '../shared/job';
import { getItem } from '../shared/storage';
import type { Application, ApplicationStatus } from '../shared/types';
import { getCachedApplication, saveApplication } from './data';
import { getSession } from './firebase/auth';

const SESSION_KEY = 'lf_tab_jobs';
const TTL_MS = 6 * 60 * 60 * 1000;

type TabJobs = Record<string, { info: JobInfo; ts: number }>;

async function tabJobs(): Promise<TabJobs> {
  const r = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as TabJobs | undefined;
  const now = Date.now();
  return Object.fromEntries(Object.entries(r ?? {}).filter(([, v]) => now - v.ts < TTL_MS));
}
async function setTabJob(tabId: number, info: JobInfo | null) {
  const all = await tabJobs();
  if (info) all[tabId] = { info, ts: Date.now() };
  else delete all[tabId];
  await chrome.storage.session.set({ [SESSION_KEY]: all });
}
/** What this tab's job page told us earlier, which is often richer than the application form itself. */
export async function knownJob(tabId: number): Promise<JobInfo | undefined> {
  return (await tabJobs())[tabId]?.info;
}
export const forgetTab = (tabId: number) => setTabJob(tabId, null);

/** Fill in gaps (e.g. a confirmation page has no job title) from what we saw on the form page. */
function merge(base: JobInfo | undefined, latest: JobInfo): JobInfo {
  if (!base) return latest;
  const weak = (s: string) => !s || /^(untitled role|unknown company)$/i.test(s);
  return {
    ...latest,
    jobTitle: weak(base.jobTitle) ? latest.jobTitle : base.jobTitle,
    company: weak(base.company) ? latest.company : base.company,
    jobUrl: base.jobUrl,
    location: base.location ?? latest.location,
    description: base.description ?? latest.description,
    platform: base.platform !== 'generic' ? base.platform : latest.platform,
  };
}

async function sameJob(a: JobInfo | undefined, b: JobInfo): Promise<boolean> {
  return !!a && (await applicationIdFor(a.jobUrl, a.company, a.jobTitle)) === (await applicationIdFor(b.jobUrl, b.company, b.jobTitle));
}

export async function jobSeen(tabId: number, info: JobInfo) {
  const prev = (await tabJobs())[tabId]?.info;
  // keep the richer record when the same job re-reports; a different job replaces it
  await setTabJob(tabId, (await sameJob(prev, info)) ? merge(prev, info) : info);
}

type Stage = 'filled' | 'submitted';
const MANUAL: ApplicationStatus[] = ['interviewing', 'offer', 'rejected', 'ghosted', 'withdrawn'];

async function upsert(info: JobInfo, stage: Stage): Promise<Application> {
  const id = await applicationIdFor(info.jobUrl, info.company, info.jobTitle);
  const now = new Date().toISOString();
  const existing = await getCachedApplication(id);
  const profileId = await getItem('lf_active_profile_id');

  const base: Application = existing ?? {
    id, company: info.company, jobTitle: info.jobTitle, jobUrl: info.jobUrl, platform: info.platform,
    location: info.location, jobDescription: info.description, profileId,
    status: stage, createdAt: now, updatedAt: now,
  };
  const next: Application = { ...base };
  if (stage === 'filled') next.filledAt = base.filledAt ?? now;
  if (stage === 'submitted') {
    next.submittedAt = base.submittedAt ?? now;
    next.filledAt = base.filledAt;
  }
  // never undo a status the user set by hand
  if (!MANUAL.includes(base.status) && !(stage === 'filled' && base.status === 'submitted')) next.status = stage;
  next.location ||= info.location;
  next.jobDescription ||= info.description;
  next.profileId ||= profileId;
  await saveApplication(next);
  return next;
}

export async function trackFilled(tabId: number, info: JobInfo) {
  const known = (await tabJobs())[tabId]?.info;
  // only fold in what we saw earlier if it is the same job; the tab may have moved on
  const merged = (await sameJob(known, info)) ? merge(known, info) : info;
  await setTabJob(tabId, merged);
  return upsert(merged, 'filled');
}

export async function trackSubmitted(tabId: number, info: JobInfo, armed: boolean, tabTitle?: string) {
  const known = (await tabJobs())[tabId]?.info;
  // a confirmation with no earlier form in this tab, and no submit click, is not ours to track
  if (!known && !armed) return null;
  let merged = merge(known, info);
  if (!known) {
    // a reload of a confirmation page we already recorded: nothing new to say
    const prior = await getCachedApplication(await applicationIdFor(merged.jobUrl, merged.company, merged.jobTitle));
    if (prior?.submittedAt) return prior;
  }
  if (!known && tabTitle && /^untitled/i.test(merged.jobTitle)) merged = { ...merged, jobTitle: tabTitle };
  const app = await upsert(merged, 'submitted');
  await setTabJob(tabId, null); // so a reload of the confirmation page does not record twice

  if (await getSession()) {
    chrome.notifications.create(`lf-${app.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/128.png'),
      title: 'Application tracked',
      message: `${app.jobTitle} at ${app.company}`,
    });
  }
  return app;
}
