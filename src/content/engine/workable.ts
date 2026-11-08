/**
 * Workable application forms. The "experience" and "education" sections each have an add button that opens an
 * inline editor; the editor is filled, saved, and the next entry is added once it has closed. Month fields are
 * react-datepicker inputs, driven through the shared picker in entries.ts.
 */
import { parseYearMonth } from '../../shared/dates';
import type { ProfileData } from '../../shared/profile';
import { pickReactDatepicker } from './entries';
import { emptyResult, findButton, isEnabled, norm, press, record, setText, until, workLabel, type SiteResult } from './siteKit';
import { tick } from './sites3Kit';

const field = <T extends HTMLElement>(root: ParentNode, ...sels: string[]): T | null => {
  for (const s of sels) { const e = root.querySelector<T>(s); if (e) return e; }
  return null;
};

/** Existing entries of a section: list items or groups that are not part of the open editor. */
function existingEntries(section: Element): Element[] {
  return Array.from(section.querySelectorAll('li, [data-ui="group"]'))
    .filter((e) => !e.closest('[data-ui="editor"]') && !e.querySelector('[data-ui="editor"]') && !e.matches('[data-ui="add-section"]'));
}

async function openEditor(section: Element, add: HTMLElement): Promise<HTMLElement | null> {
  press(add);
  return until(() => section.querySelector<HTMLElement>('[data-ui="editor"]') ?? document.querySelector<HTMLElement>('[data-ui="editor"]'), 3500, 60);
}

async function saveEditor(editor: HTMLElement): Promise<boolean> {
  const btn = field<HTMLElement>(editor, '[data-ui="save-section"]') ??
    findButton(editor, /^(save|update)$/) ??
    findButton(editor.parentElement ?? document, '[data-ui="save-section"]');
  if (!btn || !isEnabled(btn)) return false;
  press(btn);
  return !!(await until(() => !editor.isConnected || !!editor.closest('[hidden]'), 3500, 60));
}

async function setDate(editor: HTMLElement, name: 'start_date' | 'end_date', raw: string): Promise<HTMLInputElement | null> {
  const input = field<HTMLInputElement>(editor, `input[name="${name}"]`);
  const ym = parseYearMonth(raw);
  if (!input || !ym.year) return null;
  try {
    return (await pickReactDatepicker(input, ym)) ? input : null;
  } catch (e) {
    console.debug('workable date failed', name, e);
    return null;
  }
}

async function fillSection(
  kind: 'work' | 'edu', section: HTMLElement, p: ProfileData, res: SiteResult,
): Promise<void> {
  const items = kind === 'work' ? p.workExperience : p.education;
  for (const item of items) {
    const work = kind === 'work' ? (item as ProfileData['workExperience'][number]) : null;
    const edu = kind === 'edu' ? (item as ProfileData['education'][number]) : null;
    const name = work ? work.companyName : edu!.schoolName;
    if (!name.trim()) continue;
    const entries = existingEntries(section).map((e) => norm(e.textContent));
    const present = entries.some((t) => (work ? t.includes(norm(work.companyName)) && t.includes(norm(work.jobTitle)) : t.includes(norm(name))));
    if (present) continue;
    const add = section.querySelector<HTMLElement>('[data-ui="add-section"]');
    if (!add || !isEnabled(add)) return;
    const editor = await openEditor(section, add);
    if (!editor) return;
    const label = work ? workLabel(work) : name;
    const set = (key: `${'work' | 'edu'}.${string}`, el: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
      try { if (el && value && setText(el, value)) record(res, label, key, el); } catch (e) { console.debug('workable field failed', key, e); }
    };
    try {
      if (work) {
        set('work.title', field(editor, 'input#title', 'input[name="title"]'), work.jobTitle);
        set('work.company', field(editor, 'input#company', 'input[name="company"]'), work.companyName);
        set('work.description', field(editor, 'textarea#summary', 'textarea[name="summary"]'), work.description);
        const sd = await setDate(editor, 'start_date', work.startDate);
        if (sd) record(res, label, 'work.startDate', sd);
        const box = field<HTMLInputElement>(editor, 'input[type="checkbox"][name*="current" i]');
        if ((work.isCurrent || !work.endDate) && box) {
          if (tick(box)) record(res, label, 'work.current', box);
        } else if (work.endDate) {
          const ed = await setDate(editor, 'end_date', work.endDate);
          if (ed) record(res, label, 'work.endDate', ed);
        }
      } else if (edu) {
        set('edu.school', field(editor, 'input#school', 'input[name="school"]'), edu.schoolName);
        set('edu.field', field(editor, 'input#field_of_study', 'input[name="field_of_study"]'), edu.fieldOfStudy);
        set('edu.degree', field(editor, 'input#degree', 'input[name="degree"]'), edu.degree);
        const sd = await setDate(editor, 'start_date', edu.startDate);
        if (sd) record(res, label, 'edu.startDate', sd);
        if (!edu.currentlyEnrolled && edu.graduationDate) {
          const ed = await setDate(editor, 'end_date', edu.graduationDate);
          if (ed) record(res, label, 'edu.endDate', ed);
        }
      }
    } catch (e) {
      console.debug('workable entry failed', e);
    }
    if (!(await saveEditor(editor))) return; // leave an unsaved editor alone rather than stacking more
  }
}

export async function workableHandler(p: ProfileData): Promise<SiteResult | null> {
  const exp = document.querySelector<HTMLElement>('[data-ui="experience"]');
  const edu = document.querySelector<HTMLElement>('[data-ui="education"]');
  if (!exp && !edu) return null;
  const res = emptyResult('workable');
  if (exp) { res.work = true; await fillSection('work', exp, p, res); }
  if (edu) { res.edu = true; await fillSection('edu', edu, p, res); }
  return res;
}
