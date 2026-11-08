import type { DetectInfo, FrameResult } from '../shared/frame';

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url ?? '')) throw new Error('Open a job application page first.');
  return tab.id;
}

async function frameIds(tabId: number): Promise<number[]> {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  return ((frames ?? [{ frameId: 0 }]) as { frameId: number; url?: string }[])
    .filter((f) => /^https?:/.test(f.url ?? 'https:'))
    .map((f) => f.frameId);
}

async function ask<T>(tabId: number, message: object): Promise<T[]> {
  const ids = await frameIds(tabId);
  const settled = await Promise.allSettled(ids.map((frameId) => chrome.tabs.sendMessage(tabId, message, { frameId })));
  return settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value as T] : []));
}

/** Content scripts only exist in tabs opened after install; inject into older tabs on demand. */
async function askWithInjection<T>(tabId: number, message: object): Promise<T[]> {
  let out = await ask<T>(tabId, message);
  if (!out.length) {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
      out = await ask<T>(tabId, message);
    } catch {
      /* page cannot be scripted */
    }
  }
  return out;
}

export async function detectOnActiveTab(): Promise<DetectInfo | null> {
  try {
    const infos = await askWithInjection<DetectInfo>(await activeTabId(), { action: 'detectPlatform' });
    if (!infos.length) return null;
    // the frame with the most recognised fields is the application form
    return infos.sort((a, b) => b.matched - a.matched)[0];
  } catch {
    return null;
  }
}

export async function autofillActiveTab(overwrite = false): Promise<FrameResult[]> {
  return askWithInjection<FrameResult>(await activeTabId(), { action: 'autofill', overwrite });
}
