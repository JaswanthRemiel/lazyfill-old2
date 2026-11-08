/**
 * Google Careers education section: school is a free-text input with suggestions, degree and status are Material
 * dropdowns, field of study and GPA are plain inputs. Only active on google hosts; work entries belong to another handler.
 */
import { parseYearMonth } from '../../shared/dates';
import type { Education, ProfileData } from '../../shared/profile';
import { degreeAlternatives } from './entries';
import { addNextEntry, emptyResult, findButton, fire, norm, pickOption, press, pressKey, record, setText, type SiteResult, until, visibleOptions } from './siteKit';
import { boxAround, guard, isFuture, noLayout, sameName, shown, sleep } from './sites2Kit';

const JS_SCHOOL = '[jsname="ouDqDb"]';
const FALLBACK_SCHOOL = 'input[aria-label*="school" i], input[aria-label*="institution" i], input[aria-label*="university" i]';
const FORBID = 'input[aria-label="Employer name"], input[aria-label="Job title"]';

const onGoogle = () => /google\.com|careers\.google/i.test(location.hostname);
const anchorSel = (): string => (document.querySelector(`${JS_SCHOOL} input`) ? JS_SCHOOL : FALLBACK_SCHOOL);
const inputOf = (a: Element): HTMLInputElement | null => (a instanceof HTMLInputElement ? a : a.querySelector<HTMLInputElement>('input'));
const anchors = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(anchorSel())).filter((a) => !!inputOf(a) && shown(a));

/** The Material dropdown trigger under a jsname region, or (fallback) a combobox whose surroundings mention `word`. */
function dropdown(box: HTMLElement, jsname: string, word: RegExp): HTMLElement | null {
  const region = box.querySelector(`[jsname="${jsname}"]`);
  const inRegion = region && (region.matches('[role="combobox"]') ? (region as HTMLElement) : region.querySelector<HTMLElement>('[role="combobox"]'));
  if (inRegion) return inRegion;
  return (
    Array.from(box.querySelectorAll<HTMLElement>('[role="combobox"]')).find((c) =>
      word.test(norm(c.getAttribute('aria-label') + ' ' + (c.closest('[jscontroller]')?.textContent ?? ''))),
    ) ?? null
  );
}

function listFor(trigger: HTMLElement, scope: ParentNode): HTMLElement | null {
  const ids = [trigger.getAttribute('aria-controls'), trigger.getAttribute('aria-owns')].filter(Boolean) as string[];
  for (const id of ids) {
    const e = document.getElementById(id);
    const l = e && (e.matches('[role="listbox"]') ? e : e.querySelector<HTMLElement>('[role="listbox"]'));
    if (l && visibleOptions(l, 'li[role="option"]', noLayout()).length) return l;
  }
  const usable = (l: HTMLElement) => l.getAttribute('aria-hidden') !== 'true' && visibleOptions(l, 'li[role="option"]', noLayout()).length > 0;
  const near = Array.from(scope.querySelectorAll<HTMLElement>('ul[role="listbox"]')).filter(usable);
  if (near.length) return near[near.length - 1];
  const any = Array.from(document.querySelectorAll<HTMLElement>('ul[role="listbox"]')).filter(usable);
  return any[any.length - 1] ?? null;
}

/** Opens a Material dropdown and chooses one of the wanted option texts; verified against the trigger's text. */
async function materialPick(trigger: HTMLElement, scope: ParentNode, wanted: string[]): Promise<boolean> {
  const showing = () => wanted.some((w) => norm(trigger.textContent).includes(norm(w)));
  if (showing()) return true;
  const before = norm(trigger.textContent);
  for (let attempt = 0; attempt < 2; attempt++) {
    press(trigger);
    const list = await until(() => listFor(trigger, scope), 1500);
    if (!list) { pressKey(trigger, 'Escape'); await sleep(60); continue; }
    const opt = pickOption(visibleOptions(list, 'li[role="option"]', noLayout()), wanted, { strict: true });
    if (!opt) { pressKey(trigger, 'Escape'); return false; }
    if (await until(() => showing() || (norm(trigger.textContent) !== before && norm(trigger.textContent)), 1200)) return true;
  }
  return false;
}

/** Google offers Bachelor's, Master's, PhD and Associate; map the profile degree onto one of them. */
export function googleDegree(degree: string): string[] {
  const alts = degreeAlternatives(degree);
  const all = norm(alts.join(' | '));
  const mapped = /associate/.test(all) ? 'Associate' : /bachelor/.test(all) ? "Bachelor's" : /master/.test(all) ? "Master's" : /doctor|ph\.?d/.test(all) ? 'PhD' : '';
  return mapped ? [mapped, ...alts] : alts;
}

/** Types the school, asks for suggestions with ArrowDown and picks the exact match. */
async function fillSchool(input: HTMLInputElement, name: string): Promise<boolean> {
  if (!setText(input, name)) return false;
  input.focus();
  pressKey(input, 'ArrowDown');
  const list = await until(
    () => Array.from(document.querySelectorAll<HTMLElement>('ul[role="listbox"]')).find((l) => l.getAttribute('aria-hidden') !== 'true' && visibleOptions(l, 'li, [role="option"]', noLayout()).length),
    800,
  );
  if (list) {
    const exact = visibleOptions(list, 'li, [role="option"]', noLayout()).find((o) => norm(o.textContent) === norm(name));
    if (exact) press(exact);
  }
  fire(input, ['change']);
  input.dispatchEvent(new FocusEvent('blur', { composed: true }));
  return !!input.value.trim();
}

function statusWanted(edu: Education): string | null {
  if (edu.currentlyEnrolled) return 'Now attending';
  const { year, month } = parseYearMonth(edu.graduationDate);
  if (!year) return null; // never guess a status without a date
  return isFuture(year, month) ? 'Now attending' : 'Graduated';
}

async function fillEntry(anchor: HTMLElement, box: HTMLElement, edu: Education, res: SiteResult): Promise<void> {
  const label = edu.schoolName;
  const school = inputOf(anchor)!;
  await guard('google school', async () => {
    if (!school.value.trim() && (await fillSchool(school, edu.schoolName.trim()))) record(res, label, 'edu.school', school);
  });
  await guard('google degree', async () => {
    const d = dropdown(box, 'sFKGad', /degree/);
    if (d && edu.degree.trim() && (await materialPick(d, box, googleDegree(edu.degree)))) record(res, label, 'edu.degree', d);
  });
  await guard('google status', async () => {
    const want = statusWanted(edu);
    const s = dropdown(box, 'LrfOX', /status/);
    if (s && want && (await materialPick(s, box, [want]))) res.touched.push(s);
  });
  await guard('google field', () => {
    const f = box.querySelector(`[jsname="uS8Kcc"] input`) as HTMLInputElement | null ?? box.querySelector<HTMLInputElement>('input[aria-label*="field of study" i], input[aria-label*="major" i]');
    if (f && edu.fieldOfStudy.trim() && !f.value.trim() && setText(f, edu.fieldOfStudy.trim())) record(res, label, 'edu.field', f);
  });
  await guard('google gpa', () => {
    const g = box.querySelector<HTMLInputElement>('input[aria-label*="GPA" i]');
    if (g && edu.gpa.trim() && !g.value.trim() && setText(g, edu.gpa.trim())) record(res, label, 'edu.gpa', g);
  });
}

/** Fills Google's education entries. Null off google hosts or when the page has no school input. */
export async function fillGoogleEducation(p: ProfileData): Promise<SiteResult | null> {
  if (!onGoogle() || !anchors().length) return null;
  const res = emptyResult('google-edu');
  res.edu = true;
  const claimed = new Set<Element>();
  const addBtn = () => findButton(document, ['add another degree', 'add degree', 'add education'], { exact: true });
  const boxOf = (a: HTMLElement) => boxAround(a, anchorSel(), FORBID) ?? a.parentElement ?? a;

  for (const edu of p.education) {
    const name = edu.schoolName.trim();
    if (!name) continue;
    await guard('google entry', async () => {
      const present = anchors().find((a) => !claimed.has(a) && sameName(inputOf(a)!.value, name));
      if (present) { claimed.add(present); return; }
      let target: HTMLElement | null = anchors().find((a) => !claimed.has(a) && !inputOf(a)!.value.trim()) ?? null;
      if (!target) {
        const add = addBtn();
        if (!add) return;
        target = (await addNextEntry(add, anchors, 4000)) as HTMLElement | null;
      }
      if (!target) return;
      claimed.add(target);
      await fillEntry(target, boxOf(target), edu, res);
    });
  }
  return res;
}
