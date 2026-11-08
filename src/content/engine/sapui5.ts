/**
 * SAP SuccessFactors "UI5" application forms (L3Harris and others): custom elements suffixed -xweb-dynamic-content,
 * one form per "Previous Employment N" heading, real inputs living inside (nested) shadow roots.
 */
import type { ProfileData, WorkExperience } from '../../shared/profile';
import { MONTH_ABBR, parseYearMonth } from '../../shared/dates';
import { setNativeValue } from './fill';
import { addNextEntry, deepQuery, deepQueryAll, emptyResult, fire, norm, record, type SiteResult, until, workLabel } from './siteKit';
import { guard } from './sites2Kit';

const SFX = '-xweb-dynamic-content';
const t = (name: string) => `${name}${SFX}`;
const TITLE = t('ui5-title');
const FORM = t('ui5-form');
const INPUTS = `${t('ui5-input')}, ${t('ui5-date-picker')}`;

interface Entry { title: Element; form: Element; n: number }

const titles = (): Element[] =>
  deepQueryAll<Element>(document, TITLE).filter((e) => /^previous employment\s+\d+$/i.test((e.textContent ?? '').trim()));

function entryOf(title: Element): Entry | null {
  const all = new Set(titles());
  let form: Element | null = null;
  for (let a: Element | null = title.parentElement; a && !form; a = a.parentElement) {
    if (Array.from(all).filter((x) => a!.contains(x)).length > 1) break;
    form = deepQueryAll<Element>(a, FORM)[0] ?? null;
  }
  if (!form) {
    // fall back to the first form that comes after the heading in document order
    form = deepQueryAll<Element>(document, FORM).find((f) => (title.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) ?? null;
  }
  const n = Number(/(\d+)\s*$/.exec((title.textContent ?? '').trim())?.[1] ?? 0);
  return form ? { title, form, n } : null;
}

const entries = (): Entry[] =>
  titles().map(entryOf).filter((e): e is Entry => !!e).sort((a, b) => a.n - b.n);

const cleanLabel = (s: string | null | undefined) => norm((s ?? '').replace(/[*:]/g, ''));

/** The ui5 input or date picker whose label is `label` (accessible-name first, then the form item's label). */
function fieldFor(form: Element, label: string): HTMLElement | null {
  const want = cleanLabel(label);
  const all = deepQueryAll<HTMLElement>(form, INPUTS);
  const byName = all.find((e) => cleanLabel(e.getAttribute('accessible-name')) === want);
  if (byName) return byName;
  for (const item of deepQueryAll<HTMLElement>(form, t('ui5-form-item'))) {
    const lab = deepQuery<HTMLElement>(item, t('ui5-label'));
    const text = cleanLabel(lab?.textContent);
    if (text === want || text.startsWith(want)) {
      const hit = deepQueryAll<HTMLElement>(item, INPUTS)[0];
      if (hit) return hit;
    }
  }
  return all.find((e) => cleanLabel(e.getAttribute('accessible-name')).startsWith(want)) ?? null;
}

function innerInput(host: HTMLElement): HTMLInputElement | null {
  if (!host.shadowRoot) return null;
  return (
    deepQuery<HTMLInputElement>(host.shadowRoot, 'input#inner, input[data-sap-focus-ref]') ??
    deepQuery<HTMLInputElement>(host.shadowRoot, 'input')
  );
}

const currentValue = (host: HTMLElement): string =>
  (innerInput(host)?.value || host.getAttribute('value') || (host as unknown as { value?: string }).value || '').trim();

function setValue(host: HTMLElement, value: string): boolean {
  const inner = innerInput(host);
  if (!inner) return false;
  inner.focus?.();
  setNativeValue(inner, value);
  fire(inner, ['input', 'change']);
  host.setAttribute('value', value);
  (host as unknown as { value: string }).value = value;
  fire(inner, ['blur', 'focusout']);
  return inner.value === value;
}

const uiDate = (raw: string): string => {
  const { year, month } = parseYearMonth(raw);
  return year && month ? `${MONTH_ABBR[month - 1]} 1, ${year}` : '';
};

function addButtons(): HTMLElement[] {
  return deepQueryAll<HTMLElement>(document, t('ui5-button')).filter((b) =>
    [b.textContent, b.getAttribute('aria-label'), b.getAttribute('tooltip'), b.getAttribute('accessible-name')].some((x) => norm(x) === 'add'),
  );
}

function distance(a: Element, b: Element): number {
  const up = new Map<Element, number>();
  let n = 0;
  for (let e: Element | null = a; e; e = e.parentElement) up.set(e, n++);
  n = 0;
  for (let e: Element | null = b; e; e = e.parentElement, n++) {
    const hit = up.get(e);
    if (hit !== undefined) return hit + n;
  }
  return Number.MAX_SAFE_INTEGER;
}

function clickable(host: HTMLElement): HTMLElement {
  return (host.shadowRoot && deepQuery<HTMLElement>(host.shadowRoot, 'button')) || host;
}

async function fillEntry(e: Entry, job: WorkExperience, res: SiteResult): Promise<void> {
  const label = workLabel(job);
  const put = async (what: string, field: string, value: string, key: 'work.company' | 'work.title' | 'work.startDate' | 'work.endDate') =>
    guard(`ui5 ${what}`, () => {
      const host = fieldFor(e.form, field);
      if (!host || !value || currentValue(host)) return;
      if (setValue(host, value)) record(res, label, key, host);
    });
  await put('company', 'Company Name', job.companyName.trim(), 'work.company');
  await put('title', 'Job Title', job.jobTitle.trim(), 'work.title');
  await put('from', 'From Date', uiDate(job.startDate), 'work.startDate');
  if (!job.isCurrent) await put('end', 'End Date', uiDate(job.endDate), 'work.endDate');
}

/** Fills the "Previous Employment N" forms. Null when the page has none or the profile has no jobs. */
export async function fillSapUi5(p: ProfileData): Promise<SiteResult | null> {
  const jobs = p.workExperience.filter((w) => w.companyName.trim());
  if (!jobs.length || !titles().length) return null;
  const res = emptyResult('sap-ui5');
  const claimed = new Set<Element>();
  const companyOf = (e: Entry) => fieldFor(e.form, 'Company Name');
  const companyValue = (e: Entry) => { const c = companyOf(e); return c ? currentValue(c) : ''; };

  for (const job of jobs) {
    await guard('ui5 entry', async () => {
      const name = norm(job.companyName);
      const same = entries().find((e) => !claimed.has(e.title) && norm(companyValue(e)) === name);
      if (same) { claimed.add(same.title); return; }
      const empty = entries().find((e) => {
        const c = companyOf(e);
        const ti = fieldFor(e.form, 'Job Title');
        return !claimed.has(e.title) && !!c && !currentValue(c) && !(ti && currentValue(ti));
      });
      if (empty) { claimed.add(empty.title); await fillEntry(empty, job, res); return; }

      const all = titles();
      const last = all[all.length - 1];
      const add = addButtons().sort((a, b) => distance(a, last) - distance(b, last))[0];
      if (!add) return;
      const fresh = await addNextEntry(clickable(add), titles, 4000);
      if (!fresh) return;
      const entry = await until(() => { const en = entryOf(fresh); return en && companyOf(en) ? en : null; }, 3000);
      if (!entry) return;
      claimed.add(fresh);
      await fillEntry(entry, job, res);
    });
  }
  res.work = res.filled.length > 0;
  return res;
}
