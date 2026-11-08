/**
 * Google Careers application form, "work experience" part. The employer is a free-text box with a suggestion list,
 * months and the country are Material dropdowns (ul[role=listbox] of li[role=option]), the year is a text box.
 * Only active on google hosts, and only when the "Employer name" input is present; otherwise returns null.
 */
import { MONTHS, parseYearMonth } from '../../shared/dates';
import type { ProfileData, WorkExperience } from '../../shared/profile';
import { setNativeValue } from './fill';
import {
  cityOf, countryOf, emptyResult, findButton, fire, norm, pickOption, press, pressKey, record, setText, until, workLabel,
  type SiteResult,
} from './siteKit';
import { boxAround, driveEntries, guard, isTicked, labelOf, setTicked, wait } from './workDriver';

/** Poll budgets in milliseconds; exported so tests can shorten them. */
export const googleTiming = { suggestions: 1500, dropdown: 1800 };

const EMPLOYER = 'input[aria-label="Employer name"]';
const SCHOOL_STOP = '[jsname="ouDqDb"]';

export const onGoogleHost = (): boolean => /google\.com|careers\.google/i.test(location.hostname);

const visibleItems = (root: ParentNode, selector: string): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((o) => !o.closest('[aria-hidden="true"]') && norm(o.textContent));

/** Options of the list that belongs to `owner`: its aria-controls/owns target, then its widget, then the page. */
function optionsFor(owner: Element): HTMLElement[] {
  for (const attr of ['aria-controls', 'aria-owns']) {
    const list = owner.getAttribute(attr) ? document.getElementById(owner.getAttribute(attr)!) : null;
    if (list) { const o = visibleItems(list, '[role="option"]'); if (o.length) return o; }
  }
  const widget = owner.closest('[jscontroller]');
  if (widget) { const o = visibleItems(widget, '[role="option"]'); if (o.length) return o; }
  return visibleItems(document, 'ul[role="listbox"] [role="option"]');
}

/** Does the dropdown trigger already show one of the wanted texts? */
const shows = (trigger: Element, wanted: string[]): boolean => {
  const t = norm(trigger.textContent);
  return wanted.some((w) => norm(w) && t.includes(norm(w)));
};

/** Opens a Material dropdown and picks an option by text. True when the trigger then shows the choice. */
async function pickMaterial(trigger: HTMLElement, wanted: string[]): Promise<boolean> {
  if (shows(trigger, wanted)) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    press(trigger);
    const hit = await until(() => pickOption(optionsFor(trigger), wanted, { strict: true, click: false }), googleTiming.dropdown);
    if (hit) { press(hit); await wait(60); }
    if (shows(trigger, wanted)) {
      if (trigger.getAttribute('aria-expanded') === 'true') pressKey(trigger, 'Escape');
      return true;
    }
    pressKey(trigger, 'Escape');
    await wait(100);
  }
  return false;
}

/** Types the employer, asks for suggestions with ArrowDown and picks the exact one. */
async function fillEmployer(input: HTMLInputElement, company: string): Promise<boolean> {
  input.focus();
  setNativeValue(input, company);
  fire(input, ['input']);
  pressKey(input, 'ArrowDown');
  const hit = await until(() => pickOption(optionsFor(input), [company], { strict: true, click: false }), googleTiming.suggestions);
  if (hit) { press(hit); await wait(40); }
  fire(input, ['change']);
  input.dispatchEvent(new FocusEvent('blur', { composed: true }));
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
  if (!input.value.trim()) setText(input, company);
  const v = norm(input.value), c = norm(company);
  return !!v && (v === c || v.includes(c) || c.includes(v));
}

/** The element holding the month dropdown and year box under a "Start date" / "End date" caption. */
function dateGroup(box: ParentNode, which: 'start' | 'end'): HTMLElement | null {
  const other = which === 'start' ? 'end' : 'start';
  const captions = (w: string) => Array.from(box.querySelectorAll<HTMLElement>('*')).filter((e) => {
    const t = norm(e.textContent);
    return t.length < 24 && new RegExp(`^${w} date\\b`).test(t) && !Array.from(e.children).some((c) => new RegExp(`^${w} date\\b`).test(norm(c.textContent)));
  });
  const cap = captions(which)[0];
  if (!cap) return null;
  const otherCap = captions(other)[0];
  for (let p = cap.parentElement; p && box.contains(p); p = p.parentElement) {
    if (otherCap && p.contains(otherCap)) return null;
    if (p.querySelector('[role="combobox"]') && Array.from(p.querySelectorAll('input')).some((i) => /year/.test(labelOf(i)))) return p;
  }
  return null;
}

async function fillDate(box: ParentNode, which: 'start' | 'end', raw: string): Promise<boolean> {
  const { year, month } = parseYearMonth(raw);
  const group = dateGroup(box, which);
  if (!group || !year) return false;
  let ok = true;
  const yearBox = Array.from(group.querySelectorAll<HTMLInputElement>('input')).find((i) => /year/.test(labelOf(i)));
  const monthBox = Array.from(group.querySelectorAll<HTMLElement>('[role="combobox"]')).find((c) => !(c instanceof HTMLInputElement && /year/.test(labelOf(c))));
  if (month && monthBox) ok = (await guard(() => pickMaterial(monthBox, [MONTHS[month - 1]]), false)) && ok;
  else if (month) ok = false;
  if (!yearBox || !setText(yearBox, year)) ok = false;
  return ok;
}

function countryDropdown(box: ParentNode): HTMLElement | null {
  return Array.from(box.querySelectorAll<HTMLElement>('[role="combobox"]')).find((c) => {
    if (norm(c.getAttribute('aria-label')).includes('country')) return true;
    const t = norm(c.closest('[jscontroller]')?.textContent);
    return t.includes('country') && !/start date|end date|employer|job title/.test(t);
  }) ?? null;
}

/** Google work-history handler. */
export async function fillGoogleWork(p: ProfileData): Promise<SiteResult | null> {
  if (!onGoogleHost() || !document.querySelector(EMPLOYER)) return null;
  const res = emptyResult('google');
  res.work = true;
  const jobs = p.workExperience.filter((w) => w.companyName.trim());

  const fillOne = async (input: HTMLInputElement, job: WorkExperience) => {
    const box: ParentNode = boxAround(input, EMPLOYER, SCHOOL_STOP) ?? input.parentElement ?? document;
    const label = workLabel(job);
    if (await guard(() => fillEmployer(input, job.companyName), false)) record(res, label, 'work.company', input);

    const title = box.querySelector<HTMLInputElement>('input[aria-label="Job title"]');
    if (title && job.jobTitle.trim() && setText(title, job.jobTitle)) record(res, label, 'work.title', title);

    const city = cityOf(job.location);
    const cityBox = Array.from(box.querySelectorAll<HTMLInputElement>('input')).find((i) => /city/.test(norm(i.getAttribute('aria-label'))));
    if (cityBox && city && setText(cityBox, city)) {
      record(res, label, 'work.location', cityBox);
      const country = countryOf(job.location);
      const dd = country ? countryDropdown(box) : null;
      if (dd) await guard(() => pickMaterial(dd, [country]), false);
    }

    if (job.startDate && (await guard(() => fillDate(box, 'start', job.startDate), false))) {
      record(res, label, 'work.startDate', dateGroup(box, 'start'));
    }

    const boxes = Array.from(box.querySelectorAll<HTMLElement>('input[type="checkbox"], [role="checkbox"]'));
    const cb = boxes.find((b) => norm(b.getAttribute('value')).includes('current job')) ?? boxes.find((b) => norm(b.id).includes('current')) ?? boxes[0];
    if (cb && (job.isCurrent || isTicked(cb))) {
      const ok = await guard(() => setTicked(cb, job.isCurrent), false);
      if (ok && job.isCurrent) record(res, label, 'work.current', cb);
    }

    if (!job.isCurrent && job.endDate && (await guard(() => fillDate(box, 'end', job.endDate), false))) {
      record(res, label, 'work.endDate', dateGroup(box, 'end'));
    }
  };

  await driveEntries(jobs, {
    entries: () => Array.from(document.querySelectorAll<HTMLInputElement>(EMPLOYER)),
    matches: (e, job) => {
      const v = norm((e as HTMLInputElement).value), c = norm(job.companyName);
      return !!v && (v === c || v.includes(c) || c.includes(v));
    },
    isEmpty: (e) => !(e as HTMLInputElement).value.trim(),
    add: () => findButton(document, [/(^|\s)add another job$/, /(^|\s)add (job|work|work experience|experience)$/, /(^|\s)add another (work|experience)$/]),
    fill: (e, job) => fillOne(e as HTMLInputElement, job),
  });
  return res;
}
