/**
 * Meta Careers application form, "work experience" part. Employer and position are button-style comboboxes that
 * open a popover with a search box, the location is a typeahead, and the dates are masked MM/YYYY text boxes.
 * Recognised only by the presence of the "Employer name" combobox button; any other page gets null.
 */
import type { ProfileData, WorkExperience } from '../../shared/profile';
import { setNativeValue } from './fill';
import {
  cityOf, dateString, emptyResult, findButton, fire, norm, pickOption, pressKey, press, record, setText, typeInto, until,
  visibleOptions, workLabel, type SiteResult,
} from './siteKit';
import { boxAround, driveEntries, guard, labelOf, setTicked, wait } from './workDriver';

/** Poll budgets in milliseconds; exported so tests can shorten them. */
export const metaTiming = { open: 1800, results: 2800, set: 1200 };

const EMPLOYER = 'button[role="combobox"][aria-label="Employer name"]';
const POSITION = 'button[role="combobox"][aria-label="Position"]';
const SCHOOL = '[role="combobox"][aria-label="School name"]';

const isUnset = (btn: Element, placeholder: string): boolean => {
  const t = norm(btn.textContent);
  return !t || t === placeholder;
};

function popoverFor(btn: Element): HTMLElement | null {
  const id = btn.getAttribute('aria-controls');
  const byId = id ? document.getElementById(id) : null;
  if (byId) return byId;
  const all = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="listbox"]'));
  return all[all.length - 1] ?? null;
}

function searchBoxIn(pop: HTMLElement): HTMLInputElement | null {
  const sel = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"])';
  const own = pop.querySelector<HTMLInputElement>(sel) ?? pop.closest('[role="dialog"]')?.querySelector<HTMLInputElement>(sel) ?? null;
  if (own) return own;
  const active = document.activeElement;
  return active instanceof HTMLInputElement && active.type !== 'checkbox' ? active : null;
}

/** Opens a combobox button, searches `text`, clicks the matching option. Retries; true when the button shows a value. */
async function pickFromPopover(btn: HTMLElement, text: string, placeholder: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    press(btn);
    const pop = await until(() => popoverFor(btn), metaTiming.open);
    if (pop) {
      const box = searchBoxIn(pop);
      if (box) setText(box, text);
      const hit = await until(() => {
        const scope: ParentNode = pop.isConnected ? pop : document;
        return pickOption(visibleOptions(scope, '[role="option"]', true), [text], { strict: true, click: false });
      }, metaTiming.results);
      if (hit) {
        press(hit);
        if (await until(() => !isUnset(btn, placeholder), metaTiming.set)) return true;
      }
    }
    for (const target of [document.activeElement, btn, document.body]) if (target) pressKey(target, 'Escape');
    await wait(150);
  }
  return !isUnset(btn, placeholder);
}

/** Types a character at a time without blurring, so a suggestion list stays open. */
async function typeKeepFocus(el: HTMLInputElement, text: string): Promise<void> {
  el.focus();
  setNativeValue(el, '');
  fire(el, ['input']);
  for (const ch of text) {
    for (const t of ['keydown', 'keypress']) el.dispatchEvent(new KeyboardEvent(t, { key: ch, bubbles: true, cancelable: true, composed: true }));
    setNativeValue(el, el.value + ch);
    el.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true, composed: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true, composed: true }));
    await wait(2);
  }
}

function dateInputsOf(box: ParentNode): { start?: HTMLInputElement; end?: HTMLInputElement; all: HTMLInputElement[] } {
  const all = Array.from(box.querySelectorAll<HTMLInputElement>('input[type="text"][autocomplete="on"]')).filter((i) => {
    const l = labelOf(i);
    return (i.getAttribute('placeholder') ?? '').includes('/') || /mm\s*\/\s*yyyy/.test(l) || /\b(start|end)\b/.test(l);
  });
  let start = all.find((i) => /\bstart/.test(labelOf(i)));
  let end = all.find((i) => i !== start && /\bend\b/.test(labelOf(i)));
  if (!start && !end && all.length) { start = all[0]; end = all[1]; }
  return { start, end, all };
}

/** Meta work-history handler. */
export async function fillMetaWork(p: ProfileData): Promise<SiteResult | null> {
  if (!document.querySelector(EMPLOYER)) return null;
  const res = emptyResult('meta');
  res.work = true;
  const jobs = p.workExperience.filter((w) => w.companyName.trim());
  const anchors = () => Array.from(document.querySelectorAll<HTMLElement>(EMPLOYER));
  const boxOf = (a: Element): ParentNode => boxAround(a, EMPLOYER, SCHOOL) ?? a.parentElement ?? document;

  const fillOne = async (anchor: HTMLElement, job: WorkExperience) => {
    const box = boxOf(anchor);
    const label = workLabel(job);
    if (await guard(() => pickFromPopover(anchor, job.companyName, 'employer name'), false)) record(res, label, 'work.company', anchor);

    const pos = box.querySelector<HTMLElement>(POSITION);
    if (pos && job.jobTitle.trim() && (await guard(() => pickFromPopover(pos, job.jobTitle, 'position'), false))) {
      record(res, label, 'work.title', pos);
    }

    const city = cityOf(job.location);
    const loc = Array.from(box.querySelectorAll<HTMLInputElement>('input[role="combobox"][type="text"]'))
      .find((i) => !(i.getAttribute('placeholder') ?? '').includes('/') && !dateInputsOf(box).all.includes(i));
    if (loc && city) {
      await guard(async () => {
        await typeKeepFocus(loc, city);
        const hit = await until(() => pickOption(visibleOptions(document, '[role="option"]', true), [job.location, city], { strict: true, click: false }), metaTiming.results);
        if (hit) {
          press(hit);
          if (await until(() => loc.value.trim(), metaTiming.set)) record(res, label, 'work.location', loc);
        }
        fire(loc, ['change']);
      }, undefined);
    }

    const dates = dateInputsOf(box);
    const start = dateString(job.startDate, 'MM/YYYY');
    if (dates.start && start && (await guard(() => typeInto(dates.start!, start), false))) record(res, label, 'work.startDate', dates.start);

    const cb = box.querySelector<HTMLElement>('input[type="checkbox"], [role="checkbox"]');
    if (job.isCurrent && cb && (await guard(() => setTicked(cb, true), false))) record(res, label, 'work.current', cb);

    const end = dateString(job.endDate, 'MM/YYYY');
    if (!job.isCurrent && dates.end && end && (await guard(() => typeInto(dates.end!, end), false))) record(res, label, 'work.endDate', dates.end);

    const area = box.querySelector<HTMLTextAreaElement>('textarea');
    if (area && job.description.trim() && setText(area, job.description)) record(res, label, 'work.description', area);
  };

  await driveEntries(jobs, {
    entries: anchors,
    matches: (a, job) => {
      const t = norm(a.textContent), c = norm(job.companyName);
      return !isUnset(a, 'employer name') && (t === c || t.includes(c) || c.includes(t));
    },
    isEmpty: (a) => isUnset(a, 'employer name'),
    add: () => findButton(document, [/add another job$/]),
    fill: (a, job) => fillOne(a as HTMLElement, job),
  });
  return res;
}
