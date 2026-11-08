/**
 * Meta Careers education section: school and degree are popover comboboxes (button with role=combobox), field of study
 * and dates are plain text inputs. Work entries on the same page belong to another handler.
 */
import type { ProfileData } from '../../shared/profile';
import { degreeAlternatives } from './entries';
import {
  addNextEntry, dateString, emptyResult, findButton, norm, pickOption, press, pressKey, record, setText, type SiteResult, typeInto,
  until, visibleOptions,
} from './siteKit';
import { boxAround, ctlText, guard, noLayout, sameName, shown, sleep } from './sites2Kit';

const SCHOOL = 'button[role="combobox"][aria-label="School name"]';
const FORBID = 'button[role="combobox"][aria-label="Employer name"], button[role="combobox"][aria-label="Position"]';

const schools = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(SCHOOL)).filter(shown);

/** A combobox shows its placeholder (the aria-label) until a value is chosen. */
function isSet(c: HTMLElement): boolean {
  if (c instanceof HTMLInputElement) return !!c.value.trim();
  const text = norm(c.textContent);
  return !!text && text !== norm(c.getAttribute('aria-label'));
}

function popoverFor(btn: HTMLElement): HTMLElement | null {
  const id = btn.getAttribute('aria-controls');
  const direct = id ? document.getElementById(id) : null;
  if (direct && shown(direct)) return direct;
  const cands = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="listbox"]')).filter((e) => !btn.contains(e) && shown(e));
  return cands[cands.length - 1] ?? null;
}

const searchBox = (pop: HTMLElement): HTMLInputElement | null =>
  pop.querySelector<HTMLInputElement>('input[type="text"], input[type="search"], input:not([type]), [role="searchbox"]');

const escape = (btn: HTMLElement) => {
  pressKey(btn, 'Escape');
  pressKey(document.body, 'Escape');
};

/** Opens a popover combobox, searches for each phrase in `typed` and clicks an option matching one of `accept`. */
async function choose(btn: HTMLElement, typed: string[], accept: string[]): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    press(btn);
    const pop = await until(() => popoverFor(btn), 1500);
    if (!pop) { escape(btn); await sleep(80); continue; }
    const box = searchBox(pop);
    const queries = box ? typed.slice(0, 3) : [''];
    for (const q of queries) {
      if (box && q) setText(box, q);
      const hit = await until(() => pickOption(visibleOptions(pop, '[role="option"]', noLayout()), accept, { strict: true, click: false }), 1200);
      if (!hit) continue;
      press(hit);
      if (await until(() => isSet(btn), 1000)) return true;
    }
    escape(btn);
    await sleep(80);
  }
  return false;
}

/** A combobox that is a real text input with a suggestion list (aria-controls). */
async function chooseInInput(input: HTMLInputElement, typed: string[], accept: string[]): Promise<boolean> {
  for (const q of typed.slice(0, 3)) {
    setText(input, q);
    const ids = (input.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean);
    const root = (): ParentNode => ids.map((id) => document.getElementById(id)).find((e) => !!e) ?? document;
    const hit = await until(() => pickOption(visibleOptions(root(), '[role="option"]', noLayout()), accept, { strict: true, click: false }), 1500);
    if (hit) { press(hit); await sleep(50); return true; }
  }
  setText(input, '');
  return false;
}

interface Parts { school: HTMLElement; box: HTMLElement }
const partsOf = (school: HTMLElement): Parts => ({ school, box: boxAround(school, SCHOOL, FORBID) ?? school.parentElement ?? school });

async function fillEntry(school: HTMLElement, box: HTMLElement, p: ProfileData, index: number, res: SiteResult): Promise<void> {
  const edu = p.education[index];
  const label = edu.schoolName;
  await guard('meta school', async () => {
    if (!isSet(school) && (await choose(school, [edu.schoolName], [edu.schoolName]))) record(res, label, 'edu.school', school);
  });
  if (!isSet(school)) return; // a degree for an unknown school would be misleading

  await guard('meta degree', async () => {
    const deg = box.querySelector<HTMLElement>('[role="combobox"][aria-label="Degree"]');
    if (!deg || !edu.degree.trim() || isSet(deg)) return;
    const alts = degreeAlternatives(edu.degree);
    const ok = deg instanceof HTMLInputElement ? await chooseInInput(deg, alts, alts) : await choose(deg, alts, alts);
    if (ok) record(res, label, 'edu.degree', deg);
  });

  const texts = Array.from(box.querySelectorAll<HTMLInputElement>('input[type="text"][autocomplete="on"]'));
  const isDate = (i: HTMLInputElement) => /mm\s*\/\s*yyyy|start|end|from|\bto\b/.test(ctlText(i)) || (i.getAttribute('placeholder') ?? '').includes('/');
  const dates = texts.filter(isDate);

  await guard('meta field', () => {
    const f = texts.find((i) => !isDate(i) && i.getAttribute('role') !== 'combobox');
    if (f && edu.fieldOfStudy.trim() && !f.value.trim() && setText(f, edu.fieldOfStudy.trim())) record(res, label, 'edu.field', f);
  });

  const startIn = dates.find((i) => /start|from/.test(ctlText(i))) ?? (dates.length >= 2 ? dates[0] : undefined);
  const endIn = dates.find((i) => /end|\bto\b|graduat/.test(ctlText(i))) ?? (dates.length >= 2 ? dates[1] : undefined);
  const typeDate = async (el: HTMLInputElement | undefined, raw: string, key: 'edu.startDate' | 'edu.endDate') => {
    const want = dateString(raw, 'MM/YYYY');
    if (!el || !want || el.value.trim()) return;
    if ((await typeInto(el, want)) || setText(el, want)) record(res, label, key, el);
  };
  await guard('meta start', () => typeDate(startIn, edu.startDate, 'edu.startDate'));

  const cur = Array.from(box.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((c) => /current|present|enrolled|studying|attending/.test(ctlText(c) + ' ' + norm(c.closest('label')?.textContent)));
  await guard('meta current', () => {
    if (cur && edu.currentlyEnrolled && !cur.checked) {
      cur.click();
      if (!cur.checked) cur.labels?.[0]?.click();
    }
    if (cur?.checked && edu.currentlyEnrolled) record(res, label, 'edu.current', cur);
  });
  if (!edu.currentlyEnrolled) await guard('meta end', () => typeDate(endIn, edu.graduationDate, 'edu.endDate'));
}

/** Fills Meta's education entries. Null when the page has no "School name" combobox. */
export async function fillMetaEducation(p: ProfileData): Promise<SiteResult | null> {
  if (!schools().length) return null;
  const res = emptyResult('meta-edu');
  res.edu = true;
  const claimed = new Set<Element>();
  const addBtn = () => findButton(document, ['add another degree', 'add degree'], { exact: true });

  for (let i = 0; i < p.education.length; i++) {
    const name = p.education[i].schoolName.trim();
    if (!name) continue;
    await guard('meta entry', async () => {
      const present = schools().find((s) => !claimed.has(s) && isSet(s) && sameName(norm(s.textContent), name));
      if (present) { claimed.add(present); return; }
      const empty = schools().find((s) => !claimed.has(s) && !isSet(s));
      let target: HTMLElement | null = empty ?? null;
      if (!target) {
        const add = addBtn();
        if (!add) return;
        target = (await addNextEntry(add, schools, 4000)) as HTMLElement | null;
      }
      if (!target) return;
      claimed.add(target);
      const { school, box } = partsOf(target);
      await fillEntry(school, box, p, i, res);
    });
  }
  return res;
}
