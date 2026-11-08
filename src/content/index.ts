import './content.css';
import { detectAdapter } from './adapters/registry';
import { detectFields } from './engine/detect';
import { autofill } from './engine/run';
import { detect, handleToggle, initHost } from './host';
import { loadLearned, scanForLearning } from './learning';
import { startSelection } from './selection';
import { extractJobInfo, watchSubmissions } from './tracking';
import type { Profile } from '../shared/types';
import type { ResumeFile } from '../background/data';

import type { FrameResult } from '../shared/frame';

interface AutofillRequest { action: 'autofill'; overwrite?: boolean }

async function runHere(overwrite: boolean): Promise<FrameResult> {
  const url = location.href;
  // frames with nothing to fill stay silent so the popup can ignore them
  if (!detectFields().length) return { url, report: null };

  const r = await chrome.runtime.sendMessage({ action: 'getActiveProfile' });
  const profile = r?.data as Profile | null;
  if (!profile) return { url, report: null, error: 'No profile yet. Create one in the extension first.' };

  const adapter = detectAdapter(new URL(url));
  const report = await autofill({
    profile: profile.data,
    adapter,
    learned: await loadLearned(true),
    pageUrl: url,
    overwrite,
    getResume: async () => {
      const res = await chrome.runtime.sendMessage({ action: 'getResume', profileId: profile.id });
      return (res?.data as ResumeFile | null) ?? null;
    },
  });
  if (report.learnedKeys?.length) {
    chrome.runtime.sendMessage({ action: 'learnedUsed', profileId: profile.id, scope: adapter.id, labels: report.learnedKeys }).catch(() => {});
  }
  void scanForLearning(); // newly revealed questions get their hint too

  // remember the fill so the tracker can list it even if the user never submits
  if (report.filled.length > 0) {
    chrome.runtime.sendMessage({ action: 'trackFilled', info: extractJobInfo(report.platform), filledCount: report.filled.length }).catch(() => {});
  }
  return { url, report };
}

// the script can be injected twice (manifest + on-demand); only wire up once per frame
const w = window as unknown as { __lazyfill?: boolean };
if (!w.__lazyfill) {
  w.__lazyfill = true;
  initHost();
  const adapter = detectAdapter(new URL(location.href));
  watchSubmissions((armed) => {
    chrome.runtime.sendMessage({ action: 'trackSubmitted', info: extractJobInfo(adapter.id), armed }).catch(() => {});
  }, { knownAts: adapter.id !== 'generic' });
  chrome.runtime.onMessage.addListener((msg: AutofillRequest | { action: string }, _sender, sendResponse) => {
    switch (msg?.action) {
      case 'autofill':
        runHere(!!(msg as AutofillRequest).overwrite).then(sendResponse, (e) =>
          sendResponse({ url: location.href, report: null, error: e instanceof Error ? e.message : String(e) }),
        );
        return true;
      case 'startSelection':
        startSelection(); // only the frame that owns the selection shows a card
        return false;
      case 'detectPlatform':
        sendResponse(detect());
        return false;
      case 'togglePanel':
        return handleToggle() ? (sendResponse({ ok: true }), false) : false;
      default:
        return false;
    }
  });
}
