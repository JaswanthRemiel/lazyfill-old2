/**
 * Avature "datasetField" application forms (Siemens, Jacobs, Epic and other tenants): repeating work-experience and
 * education rows that are added with an "add row" link, plus checkbox groups that ask which skills the candidate has.
 */
import type { ProfileData } from '../../shared/profile';
import { detectFields } from './detect';
import { entryKeyOf, fillEntryField, type EntryKind } from './entries';
import { hasValue, radioLabel, setNativeValue } from './fill';
import { isPlaceholderOption } from './options';
import type { FieldInfo } from './types';
import { addNextEntry, emptyResult, isEnabled, norm, record, type SiteResult, workLabel } from './siteKit';
import { guard, noLayout, sameName, shown, sleep } from './sites2Kit';

const ROW_SEL = '.datasetField__row';
const CONTAINER_SEL = '[id^="fieldSpecContainer"], fieldset, section';
const WORK_HEAD = /work|employ|experience/;
const EDU_HEAD = /educat|academic|qualif|school|degree/;
const SKILL_HEAD = /skill|tool|technolog|framework|language|database|which of these|have you used|proficien/;
const ADDISH = /^\+?\s*add( another| more| new)?( (job|position|employment|experience|education|degree|school|row|entry|record|work|item|qualification)s?){0,2}$/;

function hiddenByCss(el: Element): boolean {
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.hasAttribute('hidden')) return true;
    if (e instanceof HTMLElement && (e.style.display === 'none' || getComputedStyle(e).display === 'none')) return true;
  }
  return false;
}

/** Real rows under root: not the hidden template row, not hidden. */
function rowsIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(ROW_SEL)).filter(
    (r) => !r.closest('.datasetField__row--sample') && !hiddenByCss(r),
  );
}

function headingText(container: Element): string {
  const own = (e: Element) => e.closest(CONTAINER_SEL) === container && !e.closest(ROW_SEL);
  const strong = Array.from(container.querySelectorAll('legend, h1, h2, h3, h4, .sectionTitle')).filter(own);
  const pool = strong.length ? strong : Array.from(container.querySelectorAll('label')).filter((l) => own(l) && !l.querySelector('input, select, textarea'));
  return norm(pool[0]?.textContent);
}

function headingKind(text: string): EntryKind | null {
  if (!text) return null;
  if (/work|employ/.test(text)) return 'work';
  if (EDU_HEAD.test(text)) return 'edu';
  if (WORK_HEAD.test(text)) return 'work';
  return null;
}

interface Section { container: HTMLElement; kind: EntryKind }

function sections(): Section[] {
  const out: Section[] = [];
  for (const row of rowsIn(document)) {
    for (let a = row.parentElement; a; a = a.parentElement) {
      if (!a.matches(CONTAINER_SEL) || a.matches(ROW_SEL)) continue;
      const text = headingText(a);
      if (!text) continue; // no heading of its own: look further out
      const kind = headingKind(text);
      if (kind && !out.some((s) => s.container === a)) out.push({ container: a as HTMLElement, kind });
      break;
    }
  }
  return out;
}

function addControl(container: HTMLElement): HTMLElement | null {
  const ids = Array.from(container.querySelectorAll<HTMLElement>('[id^="addRowFor_"], .datasetField__addButton')).filter((e) => isEnabled(e));
  if (ids.length) return ids[0];
  const looks = Array.from(container.querySelectorAll<HTMLElement>('button, a, [role="button"]')).filter(
    (b) => !b.closest(ROW_SEL) && isEnabled(b) && ADDISH.test(norm(b.getAttribute('aria-label') || b.textContent)),
  );
  return looks[0] ?? null;
}

const detect = (root: ParentNode): FieldInfo[] => detectFields(root, { skipVisibilityCheck: noLayout() });
const CURRENT_Q = /\b(current(ly)?|present)\b/;
const NOT_CURRENT_Q = /date|salary|compensation|location|address|employer|company|title|school/;

function isCurrentQuestion(f: FieldInfo): boolean {
  if (f.kind !== 'select' && f.kind !== 'radio') return false;
  const sig = norm([f.label, f.aria, f.name, f.id].join(' '));
  return CURRENT_Q.test(sig) && !NOT_CURRENT_Q.test(sig);
}

/** Does the select show a real choice? (reads the selected index, which is reliable everywhere) */
function selectHasValue(sel: HTMLSelectElement): boolean {
  const o = sel.options[sel.selectedIndex];
  return !!o && o.value !== '' && !isPlaceholderOption(o.textContent ?? '', o.value);
}

const filled = (f: FieldInfo): boolean =>
  f.kind === 'checkbox' ? (f.el as HTMLInputElement).checked : f.el instanceof HTMLSelectElement ? selectHasValue(f.el) : hasValue(f.el);

const valueOf = (f: FieldInfo): string => {
  if (f.el instanceof HTMLSelectElement) return selectHasValue(f.el) ? (f.el.options[f.el.selectedIndex].textContent ?? '') : '';
  return f.el.value ?? '';
};

/** Answers a Yes/No "current position" question given as a select or a radio pair. True when it was set. */
function answerCurrent(f: FieldInfo, yes: boolean): boolean {
  const want = yes ? 'yes' : 'no';
  if (f.kind === 'select') {
    const sel = f.el as HTMLSelectElement;
    if (selectHasValue(sel)) return false;
    const opts = Array.from(sel.options);
    const i = opts.findIndex((o) => norm(o.textContent) === want || norm(o.value) === want);
    if (i < 0) return false;
    setNativeValue(sel, opts[i].value);
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.selectedIndex === i;
  }
  const group = f.group ?? [];
  if (group.some((r) => r.checked)) return false;
  const radio = group.find((r) => norm(radioLabel(r)) === want || norm(r.value) === want);
  if (!radio) return false;
  radio.click();
  return radio.checked;
}

async function fillRow(row: HTMLElement, kind: EntryKind, index: number, p: ProfileData, res: SiteResult): Promise<void> {
  const work = kind === 'work' ? p.workExperience[index] : null;
  const edu = kind === 'edu' ? p.education[index] : null;
  const label = work ? workLabel(work) : edu?.schoolName ?? '';
  const isCurrent = work ? work.isCurrent : !!edu?.currentlyEnrolled;
  for (let pass = 0; pass < 2; pass++) {
    let did = false;
    for (const f of detect(row)) {
      await guard('avature field', async () => {
        if (isCurrentQuestion(f)) {
          if (answerCurrent(f, isCurrent)) {
            did = true;
            record(res, label, `${kind}.current`, f.kind === 'radio' ? f.group?.[0] : f.el);
          }
          return;
        }
        const key = entryKeyOf(f, kind);
        if (!key || f.kind === 'radio' || f.kind === 'file') return;
        if (filled(f)) return;
        if ((await fillEntryField({ f, kind, key, index }, p)) === 'ok') {
          did = true;
          record(res, label, key, f.el);
        }
      });
    }
    if (!did) break;
    await sleep(60); // choosing one value can reveal more fields
  }
}

async function processSection(sec: Section, p: ProfileData, res: SiteResult): Promise<void> {
  const { container, kind } = sec;
  const list = kind === 'work' ? p.workExperience : p.education;
  const anchorKey = kind === 'work' ? 'work.company' : 'edu.school';
  const anchorOf = (row: HTMLElement): string => {
    for (const f of detect(row)) {
      if (!isCurrentQuestion(f) && entryKeyOf(f, kind) === anchorKey) return valueOf(f).trim();
    }
    return '';
  };
  const rows = () => (container.isConnected ? rowsIn(container) : []);
  const claimed = new Set<Element>();

  for (let i = 0; i < list.length; i++) {
    const name = kind === 'work' ? p.workExperience[i].companyName : p.education[i].schoolName;
    if (!name.trim()) continue;
    await guard('avature entry', async () => {
      const existing = rows().find((r) => !claimed.has(r) && sameName(anchorOf(r), name));
      if (existing) { claimed.add(existing); await fillRow(existing, kind, i, p, res); return; }
      const empty = rows().find((r) => !claimed.has(r) && !anchorOf(r));
      if (empty) { claimed.add(empty); await fillRow(empty, kind, i, p, res); return; }
      const add = addControl(container);
      if (!add) return;
      const fresh = await addNextEntry(add, rows, 4000);
      if (fresh) { claimed.add(fresh); await fillRow(fresh as HTMLElement, kind, i, p, res); }
    });
  }
}

// ---- skills as checkbox groups ----

function groupHeading(g: Element): string {
  const own = g.querySelector(':scope > legend, :scope > .sectionTitle');
  if (own) return norm(own.textContent);
  const aria = g.getAttribute('aria-label');
  if (aria) return norm(aria);
  const by = g.getAttribute('aria-labelledby');
  if (by) return norm(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
  const lab = Array.from(g.querySelectorAll('label, legend, h1, h2, h3, h4')).find((l) => !l.querySelector('input'));
  return norm(lab?.textContent);
}

function boxText(box: HTMLInputElement): string {
  const lab = box.labels?.[0] ?? box.closest('label');
  const t = lab?.textContent || box.getAttribute('aria-label') || box.nextSibling?.textContent || box.value;
  return norm(t);
}

const wordIn = (needle: string, hay: string): boolean => {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(hay);
};

function skillMatches(box: string, skill: string): boolean {
  if (!box || !skill) return false;
  if (box === skill) return true;
  if (skill.length >= 2 && wordIn(skill, box)) return true;
  return box.length >= 2 && wordIn(box, skill);
}

function fillSkillGroups(p: ProfileData, res: SiteResult): boolean {
  const groups = Array.from(document.querySelectorAll<HTMLElement>('fieldset, [role="group"], [role="checkboxgroup"]')).filter((g) => {
    if (g.matches(ROW_SEL)) return false;
    const boxes = g.querySelectorAll('input[type="checkbox"]');
    return boxes.length >= 3 && SKILL_HEAD.test(groupHeading(g));
  });
  const skills = p.skills.map(norm).filter(Boolean);
  for (const g of groups) {
    for (const box of Array.from(g.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) {
      if (box.checked || box.disabled) continue;
      const text = boxText(box);
      if (!skills.some((s) => skillMatches(text, s))) continue;
      box.click();
      if (!box.checked) box.labels?.[0]?.click();
      if (box.checked) record(res, boxText(box) || 'skill', 'skills', box);
    }
  }
  return groups.length > 0;
}

/** Fills Avature rows and skill checkbox groups. Null when the page has neither. */
export async function fillAvature(p: ProfileData): Promise<SiteResult | null> {
  const secs = sections();
  const hasRows = rowsIn(document).length > 0;
  const skillGroups = Array.from(document.querySelectorAll('fieldset, [role="group"], [role="checkboxgroup"]')).some(
    (g) => !g.matches(ROW_SEL) && g.querySelectorAll('input[type="checkbox"]').length >= 3 && SKILL_HEAD.test(groupHeading(g)),
  );
  if (!hasRows && !skillGroups) return null;
  const res = emptyResult('avature');
  for (const sec of secs) {
    if (!shown(sec.container)) continue;
    await guard('avature section', () => processSection(sec, p, res));
    if (sec.kind === 'work') res.work = true;
    else res.edu = true;
  }
  await guard('avature skills', () => fillSkillGroups(p, res));
  return res;
}
