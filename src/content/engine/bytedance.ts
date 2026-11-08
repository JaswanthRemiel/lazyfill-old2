/**
 * TikTok / ByteDance careers application form. Experience and education are "formily" lists of cards; every field in
 * a card is wrapped in an element carrying data-form-field-id. Recognised by the three list container ids.
 */
import { toYearMonth } from '../../shared/dates';
import type { Education, ProfileData, WorkExperience } from '../../shared/profile';
import { degreeAlternatives } from './entries';
import {
  emptyResult, norm, pickOption, press, record, setText, until, workLabel, type SiteResult,
} from './siteKit';
import { driveEntries, guard, wait } from './workDriver';

/** Poll budgets in milliseconds; exported so tests can shorten them. */
export const bytedanceTiming = { present: 700, options: 1500 };

const LISTS = { career: '#formily-item-career_list', internship: '#formily-item-internship_list', education: '#formily-item-education_list' };
const CARD = '[class*="apply-form-array-card__"]';
const ADD = '[class*="apply-form-array-card-add-float-right"]';
const OPTION = '[role="option"], .ud__select__option, .ud__select-option';

const field = (card: ParentNode, id: string): HTMLElement | null => card.querySelector<HTMLElement>(`[data-form-field-id="${id}"]`);
const textBox = (card: ParentNode, id: string) =>
  field(card, id)?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea') ?? null;

/** Outermost cards of a list that contain at least one form field. */
function cardsOf(list: Element): Element[] {
  const all = Array.from(list.querySelectorAll(CARD)).filter((c) => c.querySelector('[data-form-field-id]'));
  return all.filter((c) => !all.some((o) => o !== c && o.contains(c)));
}

const cardValue = (card: Element, id: string) => norm(textBox(card, id)?.value);

/** Writes one start/end pair into a card's date range picker. "Present" is clicked in the opened panel or typed. */
async function fillRange(card: Element, start: string, end: string | 'present'): Promise<{ start: boolean; end: boolean; inputs: HTMLInputElement[] }> {
  const inputs = Array.from(field(card, 'start_end_time')?.querySelectorAll<HTMLInputElement>('.throne-biz-date-range-picker-input input') ?? []);
  const out = { start: false, end: false, inputs };
  const [s, e] = inputs;
  if (s && start) {
    press(s);
    out.start = setText(s, start);
  }
  if (e && end) {
    press(e);
    if (end === 'present') {
      const cell = await until(() => Array.from(document.querySelectorAll<HTMLElement>('body *')).find(
        (x) => x.children.length === 0 && !(x instanceof HTMLInputElement) && norm(x.textContent) === 'present' && !x.closest('textarea'),
      ), bytedanceTiming.present);
      if (cell) { press(cell); await wait(40); }
      out.end = norm(e.value) === 'present' || (!!e.value.trim() && !!cell);
      if (!out.end) out.end = setText(e, 'Present');
    } else {
      out.end = setText(e, end);
    }
  }
  return out;
}

async function fillDegree(card: Element, degree: string): Promise<boolean> {
  const sel = field(card, 'degree')?.querySelector<HTMLElement>('.ud__select__selector') ?? null;
  if (!sel || !degree.trim()) return false;
  press(sel);
  const hit = await until(
    () => pickOption(Array.from(document.querySelectorAll<HTMLElement>(OPTION)).filter((o) => !o.closest('[aria-hidden="true"]')), degreeAlternatives(degree), { strict: true, click: false }),
    bytedanceTiming.options,
  );
  if (!hit) return false;
  press(hit);
  await wait(40);
  return true;
}

/** Fills the lists on a ByteDance / TikTok careers form. */
export async function fillBytedance(p: ProfileData): Promise<SiteResult | null> {
  const career = document.querySelector(LISTS.career);
  const intern = document.querySelector(LISTS.internship);
  const eduList = document.querySelector(LISTS.education);
  if (!career && !intern && !eduList) return null;
  const res = emptyResult('bytedance');
  res.work = !!career;
  res.edu = !!eduList;

  const isIntern = (w: WorkExperience) => /intern|trainee/i.test(w.jobTitle);
  const jobs = p.workExperience.filter((w) => w.companyName.trim());
  const forList = (list: Element | null): WorkExperience[] => {
    if (!list) return [];
    if (!intern) return list === career ? jobs : [];
    return list === intern ? jobs.filter(isIntern) : jobs.filter((w) => !isIntern(w));
  };

  const addIn = (list: Element) => () => {
    const b = list.querySelector<HTMLElement>(ADD);
    return b && !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null;
  };

  const fillJob = async (card: Element, w: WorkExperience) => {
    const label = workLabel(w);
    for (const [id, value, key] of [['company', w.companyName, 'work.company'], ['title', w.jobTitle, 'work.title']] as const) {
      const el = textBox(card, id);
      if (el && value.trim() && setText(el, value)) record(res, label, key, el);
    }
    const desc = textBox(card, 'desc');
    if (desc && w.description.trim() && setText(desc, w.description)) record(res, label, 'work.description', desc);
    const start = toYearMonth(w.startDate);
    const end = w.isCurrent ? 'present' : toYearMonth(w.endDate);
    const r = await guard(() => fillRange(card, start.length === 7 ? start : '', end.length === 7 || end === 'present' ? end : ''), null);
    if (r?.start) record(res, label, 'work.startDate', r.inputs[0]);
    if (r?.end) record(res, label, w.isCurrent ? 'work.current' : 'work.endDate', r.inputs[1]);
  };

  for (const list of [career, intern]) {
    if (!list) continue;
    await driveEntries(forList(list), {
      entries: () => cardsOf(list),
      matches: (c, w) => !!cardValue(c, 'company') && cardValue(c, 'company') === norm(w.companyName),
      isEmpty: (c) => !cardValue(c, 'company') && !cardValue(c, 'title'),
      add: addIn(list),
      fill: fillJob,
    });
  }

  if (eduList) {
    const fillSchool = async (card: Element, e: Education) => {
      const label = e.schoolName;
      for (const [id, value, key] of [['school', e.schoolName, 'edu.school'], ['field_of_study', e.fieldOfStudy, 'edu.field']] as const) {
        const el = textBox(card, id);
        if (el && value.trim() && setText(el, value)) record(res, label, key, el);
      }
      if (e.degree.trim() && (await guard(() => fillDegree(card, e.degree), false))) record(res, label, 'edu.degree', field(card, 'degree'));
      const start = toYearMonth(e.startDate);
      const end = e.currentlyEnrolled ? 'present' : toYearMonth(e.graduationDate);
      const r = await guard(() => fillRange(card, start.length === 7 ? start : '', end.length === 7 || end === 'present' ? end : ''), null);
      if (r?.start) record(res, label, 'edu.startDate', r.inputs[0]);
      if (r?.end) record(res, label, 'edu.endDate', r.inputs[1]);
    };
    await driveEntries(p.education.filter((e) => e.schoolName.trim()), {
      entries: () => cardsOf(eduList),
      matches: (c, e) => !!cardValue(c, 'school') && cardValue(c, 'school') === norm(e.schoolName),
      isEmpty: (c) => !cardValue(c, 'school'),
      add: addIn(eduList),
      fill: fillSchool,
    });
  }
  return res;
}
