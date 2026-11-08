import { detectAdapter, embeddedAtsLabel } from './adapters/registry';
import { detectFields } from './engine/detect';
import { matchField } from './engine/match';
import type { DetectInfo } from '../shared/frame';
import { startLearning } from './learning';
import { extractJobInfo } from './tracking';

const PANEL_ID = 'lazyfill-panel';
const RIBBON_ID = 'lazyfill-ribbon';
const Z = '2147483647';

/** Sites where a job form never lives; the toolbar button still works there. */
const NEVER_AUTO_OPEN = ['accounts.google.com', 'login.microsoftonline.com', 'github.com', 'gitlab.com', 'x.com', 'twitter.com', 'youtube.com', 'discord.com', 'slack.com'];

export function detect(deep = true): DetectInfo {
  const adapter = detectAdapter(new URL(location.href));
  const fields = detectFields(document, { deep });
  const matched = fields.filter((f) => matchField(f, adapter.keyFor?.(f)) !== null).length;
  let embeddedAts: string | undefined;
  if (window === window.top) {
    for (const frame of Array.from(document.querySelectorAll('iframe'))) {
      const label = embeddedAtsLabel(frame.src);
      if (label) { embeddedAts = label; break; }
    }
  }
  return { label: adapter.label, adapterId: adapter.id, matched, total: fields.length, embeddedAts };
}

/** Is this page a job application worth offering to fill? */
export function looksLikeApplication(info: DetectInfo): boolean {
  // a recognised platform on a job page needs no proof, so the panel does not wait for fields
  if (info.adapterId !== 'generic' && location.pathname.replace(/\/+$/, '').length > 1) return true;
  return info.matched >= 3 || !!info.embeddedAts;
}

// ---- the floating panel and ribbon (top frame only) ----

let panel: HTMLDivElement | null = null;
let ribbonDismissed = false;

function panelEl(): HTMLDivElement | null {
  return (panel = (document.getElementById(PANEL_ID) as HTMLDivElement | null) ?? panel);
}

function createPanel(): void {
  const existing = panelEl();
  if (existing) { showPanel(); return; }

  const box = document.createElement('div');
  box.id = PANEL_ID;
  box.style.cssText = [
    'all:initial', 'position:fixed', 'top:20px', 'right:20px', 'width:360px', 'height:467px',
    'max-height:calc(100vh - 40px)', `z-index:${Z}`, 'border-radius:22px', 'overflow:hidden',
    'background:transparent', 'box-shadow:0 0 0 1px rgba(0,0,0,.08),0 18px 48px rgba(0,0,0,.22)', 'pointer-events:auto',
  ].join(';') + ';';
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('panel.html');
  frame.title = 'lazyfill';
  frame.style.cssText = 'all:initial;display:block;width:100%;height:100%;border:0;background:transparent;color-scheme:normal;';
  box.appendChild(frame);
  document.documentElement.appendChild(box);
  panel = box;
  box.animate([{ opacity: 0, transform: 'translateY(-8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 250, easing: 'cubic-bezier(.4,0,.2,1)' });
  removeRibbon();
}

function showPanel(): void {
  const box = panelEl();
  if (!box) { createPanel(); return; }
  box.style.display = 'block';
  box.querySelector('iframe')?.contentWindow?.postMessage({ action: 'panelVisible' }, '*');
  removeRibbon();
}

function hidePanel(withRibbon: boolean) {
  const box = panelEl();
  if (box) box.style.display = 'none';
  if (withRibbon && !ribbonDismissed) showRibbon();
}

function togglePanel() {
  const box = panelEl();
  if (box && box.style.display !== 'none') hidePanel(applicable);
  else showPanel();
}

function removeRibbon() {
  document.getElementById(RIBBON_ID)?.remove();
}

function showRibbon() {
  if (document.getElementById(RIBBON_ID)) return;
  const el = document.createElement('div');
  el.id = RIBBON_ID;
  el.style.cssText = `all:initial;position:fixed;top:50%;right:0;z-index:${Z};transform:translateY(-50%) translateX(26px);transition:transform .4s cubic-bezier(.34,1.56,.64,1);cursor:pointer;`;
  el.innerHTML = `
    <div style="position:relative;width:76px;height:76px;display:flex;align-items:center;justify-content:center;">
      <div role="button" aria-label="Open lazyfill" tabindex="0" style="width:56px;height:56px;border-radius:50%;background:#111113;box-shadow:0 0 0 1.5px rgba(255,255,255,.9),0 8px 24px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M13.2 3.2 5.6 13.4h5.2l-1 7.4 8.6-10.6h-5.2l.4-7Z" fill="#fff"/></svg>
      </div>
      <button data-close aria-label="Dismiss" style="all:initial;position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#111113;color:#fff;box-shadow:0 0 0 1.5px #fff;font:600 12px/18px -apple-system,system-ui,sans-serif;text-align:center;cursor:pointer;opacity:0;transition:opacity .2s;">×</button>
    </div>`;
  const closeBtn = el.querySelector<HTMLElement>('[data-close]')!;
  el.addEventListener('mouseenter', () => { el.style.transform = 'translateY(-50%) translateX(0)'; closeBtn.style.opacity = '1'; });
  el.addEventListener('mouseleave', () => { el.style.transform = 'translateY(-50%) translateX(26px)'; closeBtn.style.opacity = '0'; });
  el.addEventListener('click', () => showPanel());
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); ribbonDismissed = true; removeRibbon(); });
  document.documentElement.appendChild(el);
}

// ---- deciding when to offer ----

let applicable = false;
let lastInfoKey = '';

/** Hand the panel what we found, so it never has to ask. */
function pushInfo(info: DetectInfo, force = false) {
  const key = `${info.adapterId}|${info.matched}|${info.total}|${info.embeddedAts ?? ''}`;
  if (!force && key === lastInfoKey) return;
  lastInfoKey = key;
  panelEl()?.querySelector('iframe')?.contentWindow?.postMessage({ action: 'detectInfo', info }, '*');
}
let reportedUrl = '';

/** Tell the service worker which job this tab is on, so a later submit can be linked to it. */
function reportJob(platform: string) {
  const url = location.href.split('#')[0];
  if (url === reportedUrl) return;
  reportedUrl = url;
  chrome.runtime.sendMessage({ action: 'jobSeen', info: extractJobInfo(platform) }).catch(() => {});
}
let autoOpened = false;

function evaluate() {
  if (window !== window.top) return;
  if (document.hidden) return;
  // background probe: light DOM only, and skip pages with no form controls at all
  const adapterKnown = detectAdapter(new URL(location.href)).id !== 'generic';
  const info = adapterKnown || document.querySelector('input, select, textarea, iframe') ? detect(false) : null;
  const now = !!info && looksLikeApplication(info);
  if (info) pushInfo(info);
  if (info && now) { reportJob(info.adapterId); startLearning(); } // also on in-page navigation between jobs
  if (now === applicable) return;
  applicable = now;
  if (!applicable) { removeRibbon(); return; }
  if (NEVER_AUTO_OPEN.some((h) => location.hostname === h || location.hostname.endsWith(`.${h}`))) return;
  if (!autoOpened) { autoOpened = true; createPanel(); }
  else if (panelEl()?.style.display === 'none') showRibbon();
}

function startWatching() {
  if (window !== window.top) return;
  evaluate();
  let timer: number | undefined;
  const debounced = () => { window.clearTimeout(timer); timer = window.setTimeout(evaluate, 350); };
  // application forms mount late on SPA career sites
  new MutationObserver(debounced).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', debounced);
  window.addEventListener('hashchange', debounced);
  document.addEventListener('visibilitychange', () => !document.hidden && evaluate());
  window.addEventListener('load', evaluate);
  // forms on single-page sites mount late: look often at first, then let DOM changes drive it
  const early = window.setInterval(evaluate, 600);
  window.setTimeout(() => { window.clearInterval(early); window.setInterval(evaluate, 3000); }, 20_000);
}

export function initHost() {
  if (window === window.top) {
    window.addEventListener('message', (e) => {
      const frame = panelEl()?.querySelector('iframe');
      if (e.source !== frame?.contentWindow) return; // only our own panel may drive the host
      if (e.data?.action === 'closePanel') hidePanel(applicable);
      if (e.data?.action === 'panelReady') pushInfo(detect(true), true); // the panel just booted: answer at once
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWatching);
  else startWatching();
}

/** Handles the message sent when the toolbar button is clicked. */
export function handleToggle(): boolean {
  if (window !== window.top) return false;
  togglePanel();
  return true;
}
