/**
 * SmartRecruiters application form (Oracle-style web components `oc-*` wrapping `spl-*` components with open
 * shadow roots). Fills the "experience" and "education" entry boxes: autocompletes for employer, title, location
 * and school, plain text for degree and major, the MM/YYYY date fields and the "current" checkbox.
 */
import { parseYearMonth } from '../../shared/dates';
import type { ProfileData } from '../../shared/profile';
import {
  addNextEntry, dateString, emptyResult, fire, isEnabled, locationParts, pickOption,
  pressKey, press, record, typeInto, until, workLabel, type SiteResult,
} from './siteKit';
import { setNativeValue } from './fill';
import { deepAll, deepFirst, setComposed, sameName, sleep, tick } from './sites3Kit';

const EXP = '[data-test="experience-entry"]';
const EDU = '[data-test="education-entry"]';
const ADD_EXP = 'oc-button[data-test="add-experience"]';
const ADD_EDU = 'oc-button[data-test="add-education"]';

const entriesOf = (sel: string): HTMLElement[] => deepAll<HTMLElement>(document, sel);

const inputIn = (host: ParentNode | null, sel = 'input'): HTMLInputElement | null =>
  host ? deepFirst<HTMLInputElement>(host, sel) : null;

/** First element under `entry` for one of the selectors (searching shadow roots too). */
function find(entry: ParentNode, ...sels: string[]): HTMLElement | null {
  for (const s of sels) { const e = deepFirst(entry, s); if (e) return e; }
  return null;
}

/** The autocomplete host for a field name fragment, tolerant of the data-test sitting on a wrapper. */
const autocomplete = (entry: ParentNode, frag: string): HTMLElement | null =>
  find(entry, `spl-autocomplete[data-test*="${frag}"]`, `[data-test*="${frag}"] spl-autocomplete`, `oc-autocomplete[data-test*="${frag}"]`);

const valueOf = (host: ParentNode | null): string => inputIn(host)?.value ?? '';

/** Visible text of an option host: its own text, else the text of its dropdown item inside the shadow roots. */
function optionText(opt: HTMLElement): string {
  const own = opt.textContent?.trim();
  if (own) return own;
  const item = deepFirst(opt, '.c-spl-dropdown-item') ?? deepFirst(opt, 'spl-dropdown-item');
  return item?.textContent?.trim() || opt.getAttribute('label') || opt.getAttribute('value') || '';
}

/** Types into an autocomplete and picks its first (best) suggestion. True when the input ends up with a value. */
async function fillAutocomplete(host: HTMLElement | null, text: string): Promise<{ ok: boolean; el: HTMLInputElement | null }> {
  const input = inputIn(host);
  if (!host || !input || !text) return { ok: false, el: input };
  input.focus();
  setNativeValue(input, '');
  input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  setNativeValue(input, text);
  input.dispatchEvent(new InputEvent('input', { data: text, inputType: 'insertText', bubbles: true, composed: true }));
  for (const t of ['keydown', 'keyup']) input.dispatchEvent(new KeyboardEvent(t, { key: text.slice(-1), bubbles: true, composed: true }));

  const options = () => deepAll<HTMLElement>(host, 'spl-select-option').filter((o) => optionText(o));
  const found = await until(() => options().length > 0 && options(), 2500, 60);
  if (found) {
    const list = found.map((o) => ({ o, t: optionText(o) }));
    // pickOption works on textContent, so hand it stand-ins carrying the computed text
    const stand: HTMLElement[] = list.map(({ t }) => { const d = document.createElement('div'); d.textContent = t; return d; });
    const chosen = pickOption(stand, text, { click: false });
    const opt = (chosen ? list[stand.indexOf(chosen)] : list[0]).o;
    const target = deepFirst(opt, '.c-spl-dropdown-item') ?? opt;
    press(target);
    await sleep(60);
    if (!input.value.trim()) {
      pressKey(input, 'ArrowDown');
      await sleep(60);
      pressKey(input, 'Enter');
      await sleep(60);
    }
  }
  fire(input, ['change']);
  input.dispatchEvent(new FocusEvent('blur', { composed: true }));
  // typed text without a suggestion list stays in the box, which is still the best we can offer
  return { ok: input.value.trim() !== '', el: input };
}

async function fillDate(field: HTMLElement | undefined, raw: string): Promise<HTMLInputElement | null> {
  const text = dateString(raw, 'MM/YYYY');
  if (!field || !text) return null;
  const input = inputIn(field, 'input.c-spl-date-picker-input') ?? inputIn(field, 'input');
  if (!input) return null;
  if (input.value === text) return input;
  let ok = await typeInto(input, text);
  if (!ok || !/\d/.test(input.value)) ok = setComposed(input, text);
  return ok ? input : null;
}

function checkboxOf(entry: ParentNode): HTMLInputElement | null {
  const host = find(entry, 'spl-checkbox');
  return host ? deepFirst<HTMLInputElement>(host, 'input[type="checkbox"]') : null;
}

/** Is the entry box blank (no text and no typed values)? */
function isEmptyEntry(entry: HTMLElement, anchors: string[]): boolean {
  const vals = anchors.map((a) => valueOf(find(entry, a)));
  if (vals.some((v) => v.trim())) return false;
  return !entry.textContent?.trim();
}

function addButton(sel: string): HTMLElement | null {
  const oc = deepFirst(document, sel);
  if (!oc) return null;
  const sp = deepFirst(oc, 'spl-button');
  const btn = (sp && deepFirst(sp, 'button')) ?? deepFirst(oc, 'button') ?? oc;
  return isEnabled(btn) && isEnabled(oc) ? btn : null;
}

/**
 * Finds the entry to work on for a job/school: one that already shows it (returns null to skip), an empty one,
 * or a fresh one made with the add button. `done` is the set of boxes this run already used.
 */
async function nextEntry(
  sel: string, addSel: string, name: string, anchors: string[], done: Set<Element>,
): Promise<{ entry: HTMLElement | null; skip: boolean }> {
  const all = entriesOf(sel);
  if (all.some((e) => {
    const shown = anchors.map((a) => valueOf(find(e, a))).join(' ') + ' ' + (e.textContent ?? '');
    return sameName(shown, name);
  })) return { entry: null, skip: true };
  const empty = all.find((e) => !done.has(e) && isEmptyEntry(e, anchors));
  if (empty) return { entry: empty, skip: false };
  const btn = addButton(addSel);
  if (!btn) return { entry: null, skip: false };
  const fresh = await addNextEntry(btn, () => entriesOf(sel), 4000);
  return { entry: fresh as HTMLElement | null, skip: false };
}

const twoParts = (loc: string) => locationParts(loc).slice(0, 2).join(', ');

async function fillWork(p: ProfileData, res: SiteResult): Promise<void> {
  const done = new Set<Element>();
  for (const job of p.workExperience) {
    if (!job.companyName.trim()) continue;
    try {
      const { entry, skip } = await nextEntry(EXP, ADD_EXP, job.companyName, ['spl-autocomplete[data-test*="company"]'], done);
      if (skip || !entry) continue;
      done.add(entry);
      const label = workLabel(job);
      const step = async (fn: () => Promise<Element | null | undefined> | Element | null | undefined, key: `work.${string}`) => {
        try { const el = await fn(); if (el) record(res, label, key, el); } catch (e) { console.debug('smartrecruiters work step failed', key, e); }
      };
      await step(async () => { const r = await fillAutocomplete(autocomplete(entry, 'company'), job.companyName); return r.ok ? r.el : null; }, 'work.company');
      if (job.jobTitle) {
        await step(async () => {
          const r = await fillAutocomplete(autocomplete(entry, 'title') ?? autocomplete(entry, 'job-title'), job.jobTitle);
          return r.ok ? r.el : null;
        }, 'work.title');
      }
      if (twoParts(job.location)) {
        await step(async () => { const r = await fillAutocomplete(autocomplete(entry, 'location'), twoParts(job.location)); return r.ok ? r.el : null; }, 'work.location');
      }
      const dates = deepAll<HTMLElement>(entry, 'spl-date-field');
      await step(() => fillDate(dates[0], job.startDate), 'work.startDate');
      const box = checkboxOf(entry);
      if (job.isCurrent && box) await step(() => (tick(box) ? box : null), 'work.current');
      if (!job.isCurrent && job.endDate) await step(() => fillDate(dates[1], job.endDate), 'work.endDate');
      if (job.description) {
        await step(() => {
          const ta = inputIn(find(entry, 'oc-textarea[data-test="experience-description"] spl-textarea', '[data-test="experience-description"]'), 'textarea');
          return ta && setComposed(ta, job.description) ? ta : null;
        }, 'work.description');
      }
    } catch (e) {
      console.debug('smartrecruiters work entry failed', e);
    }
  }
}

async function fillEdu(p: ProfileData, res: SiteResult): Promise<void> {
  const done = new Set<Element>();
  const anchor = 'spl-autocomplete[data-test="institution-autocomplete"]';
  for (const ed of p.education) {
    if (!ed.schoolName.trim()) continue;
    try {
      const { entry, skip } = await nextEntry(EDU, ADD_EDU, ed.schoolName, [anchor], done);
      if (skip || !entry) continue;
      done.add(entry);
      const label = ed.schoolName;
      const step = async (fn: () => Promise<Element | null | undefined> | Element | null | undefined, key: `edu.${string}`) => {
        try { const el = await fn(); if (el) record(res, label, key, el); } catch (e) { console.debug('smartrecruiters edu step failed', key, e); }
      };
      await step(async () => { const r = await fillAutocomplete(autocomplete(entry, 'institution') ?? find(entry, anchor), ed.schoolName); return r.ok ? r.el : null; }, 'edu.school');
      const plain = (sel: string, value: string) => () => {
        const input = inputIn(find(entry, `${sel} spl-input`, sel), 'input.c-spl-input') ?? inputIn(find(entry, sel), 'input');
        return value && input && setComposed(input, value) ? input : null;
      };
      await step(plain('oc-input[data-test="education-degree"]', ed.degree), 'edu.degree');
      await step(plain('oc-input[data-test="education-major"]', ed.fieldOfStudy), 'edu.field');
      const dates = deepAll<HTMLElement>(entry, 'spl-date-field');
      await step(() => fillDate(dates[0], ed.startDate), 'edu.startDate');
      const box = checkboxOf(entry);
      if (ed.currentlyEnrolled && box) tick(box);
      if (!ed.currentlyEnrolled && ed.graduationDate && parseYearMonth(ed.graduationDate).year) {
        await step(() => fillDate(dates[1], ed.graduationDate), 'edu.endDate');
      }
    } catch (e) {
      console.debug('smartrecruiters education entry failed', e);
    }
  }
}

export async function smartRecruitersHandler(p: ProfileData): Promise<SiteResult | null> {
  const hasWork = !!deepFirst(document, ADD_EXP) || entriesOf(EXP).length > 0;
  const hasEdu = !!deepFirst(document, ADD_EDU) || entriesOf(EDU).length > 0;
  if (!hasWork && !hasEdu) return null;
  const res = emptyResult('smartrecruiters');
  if (hasWork) { res.work = true; await fillWork(p, res); }
  if (hasEdu) { res.edu = true; await fillEdu(p, res); }
  return res;
}
