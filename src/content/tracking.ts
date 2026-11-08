import type { JobInfo } from '../shared/job';

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const titleCase = (s: string) =>
  decodeURIComponent(s).replace(/[-_+]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const stripHtml = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return clean(d.textContent);
};

interface LdJob {
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
}

function jsonLdJob(): LdJob | null {
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const walk = (v: unknown): LdJob | null => {
        if (Array.isArray(v)) { for (const x of v) { const r = walk(x); if (r) return r; } return null; }
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (o['@type'] === 'JobPosting' || (Array.isArray(o['@type']) && o['@type'].includes('JobPosting'))) return o as LdJob;
          if (o['@graph']) return walk(o['@graph']);
        }
        return null;
      };
      const hit = walk(JSON.parse(s.textContent ?? ''));
      if (hit) return hit;
    } catch { /* ignore malformed blocks */ }
  }
  return null;
}

function locationFrom(v: unknown): string | undefined {
  const first = Array.isArray(v) ? v[0] : v;
  if (!first || typeof first !== 'object') return undefined;
  const a = (first as { address?: Record<string, string> }).address;
  if (!a) return undefined;
  return [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ') || undefined;
}

/** Company from the URL for ATS hosts that put it there. */
function companyFromUrl(u: URL): string {
  const seg = u.pathname.split('/').filter(Boolean);
  const h = u.hostname;
  if (/greenhouse\.io$/.test(h)) return seg[0] && seg[0] !== 'embed' ? titleCase(seg[0]) : titleCase(u.searchParams.get('for') ?? '');
  if (/(^|\.)lever\.co$/.test(h) || /ashbyhq\.com$/.test(h) || /smartrecruiters\.com$/.test(h) || /workable\.com$/.test(h)) return seg[0] ? titleCase(seg[0]) : '';
  if (/myworkdayjobs\.com$/.test(h)) return titleCase(h.split('.')[0]);
  if (/(icims|bamboohr|recruitee|breezy|jobvite|teamtailor|personio)\./.test(h)) return titleCase(h.split('.')[0].replace(/^careers-?|^jobs-?/, ''));
  return '';
}

function companyFromSite(): string {
  const og = clean(document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content);
  if (og) return og;
  const host = location.hostname.replace(/^(www|careers|jobs|boards|apply)\./, '');
  return titleCase(host.split('.')[0]);
}

function cleanTitle(raw: string, company: string): string {
  let t = clean(raw);
  // "Software Engineer - Acme | Careers", "Job Application for Software Engineer at Acme"
  t = t.replace(/^job application for\s+/i, '').replace(/^apply (for|to)\s+/i, '');
  if (company) t = t.replace(new RegExp(`\\s*(?:at|@|[-\u2013\u2014|·])\\s*${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'i'), '');
  t = t.replace(/\s*[|·\u2013\u2014-]\s*(careers?|jobs?|apply|application).*$/i, '');
  return t.trim();
}

export function extractJobInfo(platform: string): JobInfo {
  const ld = jsonLdJob();
  const org = ld && (typeof ld.hiringOrganization === 'string' ? ld.hiringOrganization : ld.hiringOrganization?.name);
  const company = clean(org) || companyFromUrl(new URL(location.href)) || companyFromSite();

  const rawTitle =
    clean(ld?.title) ||
    clean(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content) ||
    clean(document.querySelector('h1')?.textContent) ||
    document.title;

  const descSource =
    (ld?.description && stripHtml(ld.description)) ||
    clean(document.querySelector<HTMLMetaElement>('meta[name="description"], meta[property="og:description"]')?.content);

  return {
    jobTitle: cleanTitle(rawTitle, company) || 'Untitled role',
    company: company || 'Unknown company',
    jobUrl: location.href.split('#')[0],
    platform,
    location: locationFrom(ld?.jobLocation),
    description: descSource ? descSource.slice(0, 8000) : undefined,
  };
}

// ---- submission detection ----

const CONFIRM_URL = /(\/|[?&=_-])(confirmation|confirmed|thanks?|thank-you|thankyou|application[-_]?(submitted|received|complete|success)|submitted|success)(\/|$|[?&=_.-])/i;
const CONFIRM_TEXT = new RegExp(
  [
    'thank you for (applying|your application|submitting)',
    'thanks for (applying|your application|submitting)',
    'your application (has been|was) (successfully )?(submitted|received|sent)',
    'application (successfully )?(submitted|received)',
    "we(?:'|’)ve received your application",
    'we have received your application',
    'application complete',
    'successfully applied',
  ].join('|'),
  'i',
);

export const urlLooksConfirmed = () => CONFIRM_URL.test(location.pathname + location.search);

export function textLooksConfirmed(): boolean {
  // only the top of the page: confirmations are headlines, and innerText on a long page is slow
  const text = (document.body?.innerText ?? document.body?.textContent ?? '').slice(0, 4000);
  return CONFIRM_TEXT.test(text);
}

export const looksConfirmed = () => urlLooksConfirmed() || textLooksConfirmed();

const SUBMIT_BUTTON = /^(submit( application)?|apply( now)?|send application|finish|complete application)$/i;

/**
 * Calls `onSubmitted` once when a confirmation appears after the user has tried to
 * submit (or on a page whose URL is itself a confirmation). The caller decides
 * whether it belongs to a tracked job.
 */
export function watchSubmissions(onSubmitted: (armed: boolean) => void, opts: { knownAts?: boolean } = {}) {
  let armed = false;
  let fired = false;
  let armTimer: number | undefined;
  let lastHref = location.href;
  const KEY = 'lf_armed';

  try {
    const prev = Number(sessionStorage.getItem(KEY));
    if (prev && Date.now() - prev < 120_000) armed = true;
  } catch { /* storage blocked */ }

  const fire = () => {
    if (fired) return;
    fired = true;
    onSubmitted(armed);
    obs?.disconnect();
    window.clearInterval(poll);
  };

  // Cheap on every tick: the URL. Expensive (reads page text): only while the user has just tried to submit.
  const check = () => {
    if (fired || document.visibilityState === 'hidden') return;
    if (urlLooksConfirmed()) return fire();
    if (armed && textLooksConfirmed()) fire();
  };

  let obs: MutationObserver | undefined;
  const arm = () => {
    armed = true;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
    window.clearTimeout(armTimer);
    armTimer = window.setTimeout(() => { armed = false; obs?.disconnect(); obs = undefined; }, 120_000);
    if (!obs) {
      let debounce: number | undefined;
      obs = new MutationObserver(() => { window.clearTimeout(debounce); debounce = window.setTimeout(check, 500); });
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    check();
  };

  document.addEventListener('submit', arm, true);
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest('button, input[type="submit"], [role="button"], a');
    const label = clean((el as HTMLInputElement | null)?.value || el?.textContent);
    if (el && label.length < 40 && SUBMIT_BUTTON.test(label)) arm();
  }, true);

  // single-page apps change the URL without a load event; comparing two strings is free
  const poll = window.setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; check(); }
  }, 1000);

  if (armed) arm(); // we arrived here straight after a submit
  // a known ATS may land directly on a "thanks" screen from a cross-origin redirect
  if (opts.knownAts) window.setTimeout(() => { if (!fired && textLooksConfirmed()) fire(); }, 2500);
  check();
}
