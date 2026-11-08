/**
 * Workday career sites (hosts like *.myworkdayjobs.com), "My Experience" step of an application.
 *
 * Workday builds every section out of role="group" containers with a heading and fills most things through
 * custom widgets: split month/year text boxes, search-as-you-type multi-selects that only search on Enter,
 * a button-driven degree list, a resume uploader and a list of website URLs. This module drives those widgets
 * for: work experience entries, education entries, the skills multi-select, the websites list and the resume
 * upload. Every function returns null when the page does not have the section it deals with, and touches
 * nothing in that case.
 */
import { parseYearMonth } from '../../shared/dates';
import type { Education, ProfileData, WorkExperience } from '../../shared/profile';
import type { DetectOptions } from './detect';
import { degreeAlternatives } from './entries';
import { fillFile, fillSelect } from './fill';
import {
  addNextEntry, emptyResult, isEnabled, isShown, norm, pickOption, press, pressKey, record, setText, until, workLabel,
} from './siteKit';
import type { FilledKey } from './types';

export interface WorkdayResult { filled: { label: string; key: FilledKey }[]; touched: Element[] }

// ---- timing (all bounded) ----

const LIST_WAIT_MS = 3500; // wait for a search result list to change
const LIST_SETTLE_MS = 150; // let a freshly changed list finish rendering
const ENTRY_WAIT_MS = 4000; // wait for a new entry after clicking Add
const UPLOAD_WAIT_MS = 20000;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 12;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- page and section lookup ----

/** Workday pages are full of data-automation-id / data-fkit-id attributes. */
const isWorkday = (): boolean => !!document.querySelector('[data-automation-id], [data-fkit-id]');

const GROUP = '[role="group"]';
const HEADING = 'h2, h3, h4, [role="heading"]';
const cleanHeading = (s: string | null | undefined): string => norm(s).replace(/[*:]+/g, '').trim();

/** Everything that names a group: its own heading (not one of a nested group) and its aria-labelledby targets. */
function headingsOf(group: Element): string[] {
  const out: string[] = [];
  const own = Array.from(group.querySelectorAll(HEADING)).find((h) => h.closest(GROUP) === group);
  if (own) out.push(cleanHeading(own.textContent));
  for (const id of (group.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)) {
    const ref = document.getElementById(id);
    if (ref) out.push(cleanHeading(ref.textContent));
  }
  return out.filter(Boolean);
}

/** The first group whose heading matches (headings of individual entries end in a number, so never match). */
function findSection(re: RegExp): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(GROUP)).find((g) => headingsOf(g).some((t) => re.test(t))) ?? null;
}

const WORK_HEADING = /^(work experience|work or other experience|professional experience|work history)$/;
const EDU_HEADING = /^education$/;

// ---- entries inside a section ----

/** How to find the one control every entry has once, and how to cut an entry's box out of the section. */
interface EntryScope { anchors: (root: ParentNode) => HTMLElement[] }

/** Drops elements that contain another element of the list (so a wrapper and the input inside it count once). */
function outermost(list: HTMLElement[]): HTMLElement[] {
  const uniq = Array.from(new Set(list));
  return uniq.filter((a) => !uniq.some((b) => b !== a && b.contains(a)));
}

/**
 * The box of one entry: the largest role="group" below the section that holds the anchor; without groups, the
 * largest ancestor below the section that still holds only this one anchor.
 */
function boxOf(anchor: HTMLElement, section: HTMLElement, scope: EntryScope): HTMLElement {
  let group: HTMLElement | null = null;
  let climbed: HTMLElement | null = null;
  let single = true;
  for (let p = anchor.parentElement; p && p !== section && section.contains(p); p = p.parentElement) {
    if (p.getAttribute('role') === 'group') group = p;
    if (single && scope.anchors(p).length === 1) climbed = p; else single = false;
  }
  return group ?? climbed ?? anchor.parentElement ?? anchor;
}

const attrText = (el: Element) =>
  `${el.id} ${el.getAttribute('name') ?? ''} ${el.getAttribute('data-automation-id') ?? ''}`.toLowerCase();

/** Inputs of a box whose id/name/automation id contains the fragment (case-insensitive). */
function inputsWith(box: ParentNode, fragment: string): HTMLInputElement[] {
  const f = fragment.toLowerCase();
  return Array.from(box.querySelectorAll<HTMLInputElement>('input')).filter((i) => attrText(i).includes(f));
}

/** Runs a step; a failure in it is swallowed so the next step still runs. */
async function guard<T>(fn: () => T | Promise<T>): Promise<T | undefined> {
  try { return await fn(); } catch { return undefined; }
}

/** Clicks the control first (Workday widgets like that), then writes the value. True when it stuck. */
function writeText(el: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string): boolean {
  if (!el || !value) return false;
  try { press(el); } catch { /* clicking is only a courtesy */ }
  return setText(el, value);
}

/** The Add button of a section that is not part of an entry. */
function addButtonIn(section: HTMLElement, entryBoxes: HTMLElement[]): HTMLElement | null {
  const outside = (b: HTMLElement) => isEnabled(b) && !entryBoxes.some((e) => e.contains(b));
  const byId = Array.from(section.querySelectorAll<HTMLElement>('button[data-automation-id="add-button"]')).find(outside);
  if (byId) return byId;
  return Array.from(section.querySelectorAll<HTMLElement>('button'))
    .find((b) => outside(b) && (/\badd\b/i.test(b.getAttribute('aria-label') ?? '') || /^add\b/i.test((b.textContent ?? '').trim()))) ?? null;
}

// ---- Workday search lists (skills, school, field of study) ----

interface ListOption { el: HTMLElement; prompt: HTMLElement | null; label: string; none: boolean }

/** Every option of the open Workday result list(s). */
function listOptions(): ListOption[] {
  const out: ListOption[] = [];
  for (const box of Array.from(document.querySelectorAll('[data-automation-id="activeListContainer"][role="listbox"]'))) {
    for (const el of Array.from(box.querySelectorAll<HTMLElement>('[role="option"]'))) {
      const prompt = el.querySelector<HTMLElement>('[data-automation-id="promptOption"]');
      const none = /^no items/i.test(el.getAttribute('aria-label') ?? '');
      if (!prompt && !none) continue;
      const label = none ? '' : (prompt?.getAttribute('data-automation-label') ?? prompt?.textContent ?? '').trim();
      out.push({ el, prompt, label, none });
    }
  }
  return out;
}

const signature = (): string => listOptions().map((o) => (o.none ? '#none' : o.label)).join('|');

/** Is this result already ticked? Workday shows that in several different ways. */
function isChecked(o: ListOption): boolean {
  const labels = [o.el.getAttribute('aria-label'), o.prompt?.getAttribute('aria-label')].map((s) => norm(s));
  if (labels.some((l) => /\bchecked\b/.test(l) && !/not checked/.test(l))) return true;
  const root = o.el;
  if (root.querySelector('[data-automation-id="promptLeafNode"][data-automation-checked="checked"]')) return true;
  if (root.querySelector('input[type="checkbox"]:checked, [aria-checked="true"]') || root.getAttribute('aria-checked') === 'true') return true;
  return !!root.querySelector('[data-automation-id="checkbox"][data-automationcheckboxchecked="true"]');
}

/**
 * Types a term into a Workday search box, presses Enter (the list only searches on Enter) and waits for the list
 * to change from what it showed before, so results of the previous search are not mistaken for this one.
 */
async function searchList(input: HTMLInputElement, term: string): Promise<ListOption[]> {
  const before = signature();
  if (!setText(input, term)) return [];
  pressKey(input, 'Enter');
  const changed = await until(() => { const s = signature(); return !!s && s !== before; }, LIST_WAIT_MS);
  if (changed) await sleep(LIST_SETTLE_MS);
  return listOptions();
}

/** Labels of the items already chosen in a multi-select. */
function chosenLabels(root: ParentNode): string[] {
  const out: string[] = [];
  root.querySelectorAll<HTMLElement>('[data-automation-id="multiSelectContainer"] [data-automation-id="selectedItem"]')
    .forEach((e) => out.push(e.getAttribute('title') ?? e.textContent ?? ''));
  root.querySelectorAll<HTMLElement>('[data-automation-id="selectedItemList"] [data-automation-id="promptOption"]')
    .forEach((e) => out.push(e.getAttribute('data-automation-label') ?? e.textContent ?? ''));
  // a selectedItem outside a multiSelectContainer wrapper of this root (root may itself be the container)
  if (!out.length) {
    root.querySelectorAll<HTMLElement>('[data-automation-id="selectedItem"]').forEach((e) => out.push(e.getAttribute('title') ?? e.textContent ?? ''));
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Search terms for a long name: a shortened form first, then everything. */
function searchTerms(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const terms: string[] = [];
  if (words.length > 2) terms.push(words.slice(0, 2).join(' '));
  else if (words.length === 2) terms.push(words[0]);
  terms.push(text);
  return Array.from(new Set(terms));
}

/** Searches the multi-select input and clicks the best result (exact, contains, first). True when something was clicked. */
async function searchAndChoose(input: HTMLInputElement, text: string): Promise<boolean> {
  const terms = text.length > 24 ? searchTerms(text) : [text];
  for (const term of terms) {
    const opts = (await searchList(input, term)).filter((o) => !o.none);
    if (!opts.length) continue;
    const hit = pickOption(opts.map((o) => o.el), text, { click: false });
    const opt = opts.find((o) => o.el === hit);
    if (opt) { press(opt.prompt ?? opt.el); return true; }
  }
  return false;
}

/** Closes an open list like a user: clear the box, Escape, blur, click elsewhere. */
function closeList(input: HTMLInputElement): void {
  try { setText(input, ''); } catch { /* ignore */ }
  pressKey(input, 'Escape');
  input.blur();
  press(document.body);
}

// ---- work experience ----

const titleAnchors = (root: ParentNode): HTMLElement[] => {
  const found: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>('input[id*="--jobTitle"], input[name*="jobTitle"]'));
  if (!found.length) {
    root.querySelectorAll<HTMLElement>('[data-automation-id*="jobTitle"]').forEach((e) => {
      found.push(e instanceof HTMLInputElement ? e : (e.querySelector<HTMLInputElement>('input') ?? e));
    });
  }
  return outermost(found);
};
const WORK_SCOPE: EntryScope = { anchors: titleAnchors };

const firstInput = (box: ParentNode, fragment: string) => inputsWith(box, fragment)[0] ?? null;

function companyInput(box: ParentNode): HTMLInputElement | null {
  return box.querySelector<HTMLInputElement>('input[id*="--companyName"]') ?? firstInput(box, 'companyName');
}
function titleInput(anchor: HTMLElement): HTMLInputElement | null {
  return anchor instanceof HTMLInputElement ? anchor : anchor.querySelector('input');
}

/** The month and year boxes of the start or end date of an entry. */
function dateBoxes(box: ParentNode, which: 'start' | 'end'): { month: HTMLInputElement | null; year: HTMLInputElement | null } {
  const mine = Array.from(box.querySelectorAll<HTMLInputElement>('input')).filter((i) => attrText(i).includes(`${which}date`));
  return {
    month: mine.find((i) => /month/.test(attrText(i))) ?? null,
    year: mine.find((i) => /year/.test(attrText(i))) ?? null,
  };
}

/** Writes a profile date into its month and year boxes. True when every box that exists took its part. */
function writeDate(res: ReturnType<typeof emptyResult>, label: string, key: 'work.startDate' | 'work.endDate', raw: string, box: ParentNode): void {
  const { year, month } = parseYearMonth(raw);
  const { month: m, year: y } = dateBoxes(box, key === 'work.startDate' ? 'start' : 'end');
  const parts: [HTMLInputElement | null, string][] = [];
  if (m && month) parts.push([m, String(month).padStart(2, '0')]);
  if (y && year) parts.push([y, year]);
  if (!parts.length) return;
  let ok = true;
  for (const [el, v] of parts) {
    let set = false;
    try { set = writeText(el, v); } catch { set = false; }
    if (set && el) { if (!res.touched.includes(el)) res.touched.push(el); } else ok = false;
  }
  if (ok) record(res, label, key);
}

async function fillJob(box: HTMLElement, anchor: HTMLElement, job: WorkExperience, res: ReturnType<typeof emptyResult>): Promise<void> {
  const label = workLabel(job);
  const text = async (key: 'work.company' | 'work.title' | 'work.location' | 'work.description', el: HTMLInputElement | HTMLTextAreaElement | null, v: string) => {
    await guard(() => { if (writeText(el, v)) record(res, label, key, el); });
  };
  await text('work.company', companyInput(box), job.companyName);
  await text('work.title', titleInput(anchor), job.jobTitle);
  await text('work.location', firstInput(box, '--location'), job.location);
  await text('work.description', box.querySelector<HTMLTextAreaElement>('textarea[id*="--roleDescription"], textarea[name*="roleDescription"]'), job.description);
  await guard(() => {
    const cb = inputsWith(box, 'currentlyWorkHere').find((i) => i.type === 'checkbox');
    if (!cb || !job.isCurrent) return;
    if (!cb.checked) press(cb);
    if (cb.checked) record(res, label, 'work.current', cb);
  });
  await guard(() => writeDate(res, label, 'work.startDate', job.startDate, box));
  if (!job.isCurrent) await guard(() => writeDate(res, label, 'work.endDate', job.endDate, box));
}

const sameCompany = (anchor: HTMLElement, section: HTMLElement, job: WorkExperience): boolean => {
  const box = boxOf(anchor, section, WORK_SCOPE);
  const company = companyInput(box);
  const have = norm(company ? company.value : titleInput(anchor)?.value);
  return !!have && have === norm(company ? job.companyName : job.jobTitle);
};

const emptyJob = (anchor: HTMLElement, section: HTMLElement): boolean => {
  const box = boxOf(anchor, section, WORK_SCOPE);
  return !norm(companyInput(box)?.value) && !norm(titleInput(anchor)?.value);
};

/** Work experience entries of Workday's My Experience page. */
export async function fillWorkdayExperience(p: ProfileData): Promise<WorkdayResult | null> {
  if (!p.workExperience.length || !isWorkday()) return null;
  const section = findSection(WORK_HEADING);
  if (!section) return null;
  const boxes = () => titleAnchors(section).map((a) => boxOf(a, section, WORK_SCOPE));
  if (!titleAnchors(section).length && !addButtonIn(section, boxes())) return null;

  const res = emptyResult('workday');
  const claimed = new Set<Element>();
  for (const job of p.workExperience) {
    await guard(async () => {
      const anchors = titleAnchors(section);
      const existing = anchors.find((a) => !claimed.has(a) && sameCompany(a, section, job));
      if (existing) { claimed.add(existing); return; }
      let target = anchors.find((a) => !claimed.has(a) && emptyJob(a, section)) ?? null;
      if (!target) {
        if (anchors.length >= MAX_ENTRIES) return;
        const add = addButtonIn(section, boxes());
        if (!add) return;
        target = (await addNextEntry(add, () => titleAnchors(section), ENTRY_WAIT_MS)) as HTMLElement | null;
      }
      if (!target) return;
      claimed.add(target);
      const box = boxOf(target, section, WORK_SCOPE);
      await until(() => !!companyInput(box) || !!dateBoxes(box, 'start').year, 1500);
      await fillJob(box, target, job, res);
    });
  }
  return { filled: res.filled, touched: res.touched };
}

// ---- education ----

const schoolAnchors = (root: ParentNode): HTMLElement[] =>
  outermost(Array.from(root.querySelectorAll<HTMLElement>(
    '[data-automation-id="formField-school"], input[name="schoolName"], input[id*="--schoolName"]',
  )));
const EDU_SCOPE: EntryScope = { anchors: schoolAnchors };

/** The search box inside a multi-select form field. */
const searchBox = (field: ParentNode): HTMLInputElement | null =>
  Array.from(field.querySelectorAll<HTMLInputElement>('input')).find((i) => !/^(radio|checkbox|hidden|file|button|submit)$/.test(i.type)) ?? null;

/** The school an entry currently shows: the chosen item of the multi-select, or the plain text box. */
function schoolOf(anchor: HTMLElement, box: HTMLElement): string {
  const field = box.querySelector<HTMLElement>('[data-automation-id="formField-school"]');
  if (field?.querySelector('[data-automation-id="multiSelectContainer"]')) return chosenLabels(field)[0] ?? '';
  const plain = box.querySelector<HTMLInputElement>('input[name="schoolName"], input[id*="--schoolName"]')
    ?? (anchor instanceof HTMLInputElement ? anchor : null) ?? (field ? searchBox(field) : null);
  return plain?.value.trim() ?? '';
}

const sameSchool = (a: string, b: string): boolean => !!norm(a) && norm(a).slice(0, 12) === norm(b).slice(0, 12);

/** Fills a school or field-of-study field, which is a search multi-select or (for school) a plain text box. */
async function fillSearchField(field: HTMLElement | null, text: string): Promise<boolean> {
  if (!field || !text) return false;
  const input = searchBox(field);
  if (!input) return false;
  if (!field.querySelector('[data-automation-id="multiSelectContainer"]')) return writeText(input, text);
  try {
    press(input);
    return await searchAndChoose(input, text);
  } finally {
    // a stray search term must not stay in the box if nothing was chosen
    if (input.value) { setText(input, ''); }
  }
}

/** The button (or select) that holds the degree. */
function degreeControl(box: ParentNode): HTMLButtonElement | HTMLSelectElement | null {
  const sel = box.querySelector<HTMLSelectElement>('select[id*="--degree"], select[name="degree"]');
  if (sel) return sel;
  return Array.from(box.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.getAttribute('name') === 'degree' || b.id.includes('--degree') || /degree/i.test(b.getAttribute('aria-label') ?? '')) ?? null;
}

async function pickDegree(ctl: HTMLButtonElement | HTMLSelectElement, degree: string): Promise<boolean> {
  const wants = degreeAlternatives(degree);
  if (ctl instanceof HTMLSelectElement) return wants.some((w) => fillSelect(ctl, w, 'custom'));
  press(ctl);
  const options = () => Array.from(document.querySelectorAll<HTMLElement>(
    '[data-automation-id="activeListContainer"] [role="option"], [role="listbox"] [role="option"]'));
  const opened = await until(() => options().length > 0, 2500);
  if (!opened) return false;
  await sleep(LIST_SETTLE_MS);
  const hit = pickOption(options(), wants, { strict: true, click: false });
  if (!hit) { pressKey(ctl, 'Escape'); return false; }
  press(hit.querySelector<HTMLElement>('[data-automation-id="promptOption"]') ?? hit);
  return true;
}

async function fillSchool(box: HTMLElement, anchor: HTMLElement, edu: Education, res: ReturnType<typeof emptyResult>): Promise<void> {
  const label = edu.schoolName;
  await guard(async () => {
    const field = box.querySelector<HTMLElement>('[data-automation-id="formField-school"]');
    const ok = field ? await fillSearchField(field, edu.schoolName) : writeText(anchor instanceof HTMLInputElement ? anchor : null, edu.schoolName);
    if (ok) record(res, label, 'edu.school', searchBox(field ?? box) ?? anchor);
  });
  await guard(async () => {
    const ctl = degreeControl(box);
    if (ctl && edu.degree && (await pickDegree(ctl, edu.degree))) record(res, label, 'edu.degree', ctl);
  });
  await guard(async () => {
    const field = box.querySelector<HTMLElement>('[data-automation-id="formField-fieldOfStudy"]');
    if (await fillSearchField(field, edu.fieldOfStudy)) record(res, label, 'edu.field', searchBox(field!));
  });
  await guard(() => {
    const gpa = box.querySelector<HTMLInputElement>('input[id*="gradeAverage"], input[name="gradeAverage"]');
    if (writeText(gpa, edu.gpa)) record(res, label, 'edu.gpa', gpa);
  });
  const year = (raw: string) => parseYearMonth(raw).year ?? '';
  const yearBox = (frag: string) =>
    inputsWith(box, frag).find((i) => /year/.test(attrText(i))) ?? inputsWith(box, frag)[0] ?? null;
  await guard(() => {
    const el = yearBox('firstYearAttended');
    if (writeText(el, year(edu.startDate))) record(res, label, 'edu.startYear', el);
  });
  await guard(() => {
    const el = yearBox('lastYearAttended');
    if (writeText(el, year(edu.graduationDate))) record(res, label, 'edu.endYear', el);
  });
}

/** Education entries of Workday's My Experience page. */
export async function fillWorkdayEducation(p: ProfileData): Promise<WorkdayResult | null> {
  if (!p.education.length || !isWorkday()) return null;
  const section = findSection(EDU_HEADING);
  if (!section) return null;
  const boxes = () => schoolAnchors(section).map((a) => boxOf(a, section, EDU_SCOPE));
  if (!schoolAnchors(section).length && !addButtonIn(section, boxes())) return null;

  const res = emptyResult('workday');
  const claimed = new Set<Element>();
  for (const edu of p.education) {
    await guard(async () => {
      const anchors = schoolAnchors(section);
      const schoolFor = (a: HTMLElement) => schoolOf(a, boxOf(a, section, EDU_SCOPE));
      const existing = anchors.find((a) => !claimed.has(a) && sameSchool(schoolFor(a), edu.schoolName));
      if (existing) { claimed.add(existing); return; }
      let target = anchors.find((a) => !claimed.has(a) && !schoolFor(a)) ?? null;
      if (!target) {
        if (anchors.length >= MAX_ENTRIES) return;
        const add = addButtonIn(section, boxes());
        if (!add) return;
        target = (await addNextEntry(add, () => schoolAnchors(section), ENTRY_WAIT_MS)) as HTMLElement | null;
      }
      if (!target) return;
      claimed.add(target);
      await fillSchool(boxOf(target, section, EDU_SCOPE), target, edu, res);
    });
  }
  return { filled: res.filled, touched: res.touched };
}

// ---- skills ----

/** The skills multi-select: type each skill, press Enter, tick the result that matches exactly. */
export async function fillWorkdaySkills(
  p: ProfileData,
  opts: DetectOptions = {},
  max = 15,
): Promise<{ count: number; input: Element } | null> {
  const input = document.querySelector<HTMLInputElement>('input#skills--skills, input[id$="--skills"]');
  if (!input || input.disabled || input.readOnly || !isShown(input, opts.skipVisibilityCheck)) return null;
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const s of p.skills) {
    const t = (s ?? '').trim();
    if (t && !seen.has(norm(t))) { seen.add(norm(t)); skills.push(t); }
  }
  const wanted = skills.slice(0, Math.max(0, max));
  if (!wanted.length) return null;

  const scope: ParentNode = input.closest(GROUP) ?? document;
  const already = new Set(chosenLabels(scope).map(norm));
  let count = 0;
  try {
    for (const skill of wanted) {
      if (already.has(norm(skill))) { count++; continue; }
      const outcome = await guard(async () => {
        for (const term of searchTerms(skill)) {
          const hit = (await searchList(input, term)).find((o) => !o.none && norm(o.label) === norm(skill));
          if (!hit) continue;
          if (!isChecked(hit)) press(hit.prompt ?? hit.el);
          return true;
        }
        return false;
      });
      if (outcome) { count++; already.add(norm(skill)); }
    }
  } finally {
    closeList(input);
  }
  return count ? { count, input } : null;
}

// ---- websites ----

const WEBSITES_HEADING = /^(websites?|professional websites?(\(s\))?)$/;
const PORTFOLIO_HEADING = /^portfolio$/;

function websitesSection(): { section: HTMLElement; portfolioOnly: boolean } | null {
  const byLabel = document.querySelector<HTMLElement>(
    '[aria-labelledby="Websites-section"], [aria-labelledby="Professional-Websites(s)-section"], [aria-labelledby="Professional-Website(s)-section"]',
  );
  if (byLabel) return { section: byLabel, portfolioOnly: false };
  const named = findSection(WEBSITES_HEADING);
  if (named) return { section: named, portfolioOnly: false };
  const folio = findSection(PORTFOLIO_HEADING);
  return folio ? { section: folio, portfolioOnly: true } : null;
}

/** A URL reduced to what identifies it: no scheme, no www., no trailing slash, lower case. */
const urlKey = (u: string): string => u.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

const urlInputs = (section: ParentNode): HTMLInputElement[] =>
  Array.from(section.querySelectorAll<HTMLInputElement>('input[name="url"], input[id*="webAddress"][id$="--url"]'));

/** The delete button of the row that holds exactly this URL box, if there is one. */
function deleteButtonFor(input: HTMLInputElement, section: HTMLElement): HTMLElement | null {
  for (let p = input.parentElement; p && p !== section && section.contains(p); p = p.parentElement) {
    if (urlInputs(p).length !== 1) break;
    const trash = p.querySelector<HTMLElement>('.wd-icon-trash, svg[data-automation-id="trashIcon"]');
    const byIcon = trash?.closest<HTMLElement>('button, [role="button"]') ?? null;
    if (byIcon && isEnabled(byIcon)) return byIcon;
    const byText = Array.from(p.querySelectorAll<HTMLElement>('button, [role="button"]')).find((b) => isEnabled(b) && /^delete$/i.test((b.textContent ?? '').trim()));
    if (byText) return byText;
  }
  return null;
}

/** The websites list: LinkedIn, GitHub, portfolio and website URLs, replacing whatever was listed. */
export async function fillWorkdayWebsites(p: ProfileData): Promise<{ count: number; touched: Element[] } | null> {
  if (!isWorkday()) return null;
  const found = websitesSection();
  if (!found) return null;
  const { section, portfolioOnly } = found;
  const l = p.links;
  const candidates = portfolioOnly ? [l.portfolioUrl, l.websiteUrl] : [l.linkedinUrl, l.githubUrl, l.portfolioUrl, l.websiteUrl];
  const urls: string[] = [];
  for (const u of candidates.map((s) => (s ?? '').trim()).filter(Boolean)) if (!urls.some((x) => urlKey(x) === urlKey(u))) urls.push(u);
  if (!urls.length) return null;

  const have = urlInputs(section).filter((i) => i.value.trim());
  const haveKeys = new Set(have.map((i) => urlKey(i.value)));
  if (have.length === urls.length && urls.every((u) => haveKeys.has(urlKey(u)))) return { count: urls.length, touched: have };

  // clear what is listed (bounded), keeping boxes that have no delete button to reuse
  for (let i = 0; i < MAX_ENTRIES * 2; i++) {
    const victim = urlInputs(section).find((inp) => inp.value.trim() && deleteButtonFor(inp, section));
    if (!victim) break;
    const del = deleteButtonFor(victim, section)!;
    press(del);
    const gone = await until(() => !victim.isConnected || !section.contains(victim), 1500);
    if (!gone) break;
  }

  const touched: Element[] = [];
  const used = new Set<HTMLInputElement>();
  let count = 0;
  for (const url of urls) {
    await guard(async () => {
      const slots = urlInputs(section).filter((i) => !used.has(i));
      let slot: HTMLInputElement | null = slots.find((i) => !i.value) ?? slots[0] ?? null;
      if (!slot) {
        const add = Array.from(section.querySelectorAll<HTMLElement>('button[data-automation-id="add-button"]')).find(isEnabled)
          ?? Array.from(section.querySelectorAll<HTMLElement>('button')).find((b) => isEnabled(b) && /\badd\b/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
        if (!add) return;
        const row = await addNextEntry(add, () => urlInputs(section), ENTRY_WAIT_MS);
        slot = row instanceof HTMLInputElement ? row : null;
      }
      if (!slot) return;
      used.add(slot);
      if (writeText(slot, url)) { count++; touched.push(slot); }
    });
  }
  return count ? { count, touched } : null;
}

// ---- resume ----

const base64Bytes = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** Is `attached` the same upload as `name` (Workday renames repeats name_2.pdf, name_3.pdf)? */
function sameFile(attached: string, name: string): boolean {
  const a = norm(attached);
  const n = norm(name);
  if (a === n) return true;
  const dot = n.lastIndexOf('.');
  const base = dot > 0 ? n.slice(0, dot) : n;
  const ext = dot > 0 ? n.slice(dot) : '';
  return a.startsWith(`${base}_`) && a.endsWith(ext) && /^\d+$/.test(a.slice(base.length + 1, a.length - ext.length));
}

function resumeSection(): HTMLElement | null {
  const byLabel = document.querySelector<HTMLElement>('[aria-labelledby="Resume/CV-section"]');
  if (byLabel) return byLabel;
  return document.querySelector('[data-fkit-id="resumeAttachments--null"]')?.closest<HTMLElement>(GROUP) ?? null;
}

/** The resume / CV uploader: replaces a different attached file, leaves the same one alone. */
export async function uploadWorkdayResume(
  getResume: () => Promise<{ fileName: string; mimeType: string; base64: string } | null>,
): Promise<{ ok: boolean; input: Element } | null> {
  if (!isWorkday()) return null;
  const section = resumeSection();
  const input = section?.querySelector<HTMLInputElement>('input[data-automation-id="file-upload-input-ref"]');
  if (!section || !input) return null;
  const file = await getResume();
  if (!file) return null;
  if (base64Bytes(file.base64) > MAX_UPLOAD_BYTES) return { ok: false, input };

  const names = () => Array.from(section.querySelectorAll('[data-fkit-id="resumeAttachments--attachments"] [data-automation-id="file-upload-file-name"]'))
    .map((e) => (e.textContent ?? '').trim()).filter(Boolean);
  if (names().some((n) => sameFile(n, file.fileName))) return { ok: true, input };

  for (let i = 0; i < 6; i++) {
    const del = section.querySelector<HTMLElement>('button[data-automation-id="delete-file"]');
    if (!del) break;
    const before = section.querySelectorAll('button[data-automation-id="delete-file"]').length;
    press(del);
    const gone = await until(() => section.querySelectorAll('button[data-automation-id="delete-file"]').length < before, 2500);
    if (!gone) break;
  }

  const successes = () => Array.from(section.querySelectorAll('[data-automation-id="file-upload-successful"]'));
  const priorSuccess = new Set(successes());
  if (!fillFile(input, file)) return { ok: false, input };
  const outcome = await until(() => {
    if (section.querySelector('[data-automation-id="file-upload-error"], [data-automation-id="errorMessage"]')) return 'error';
    const now = successes();
    if (now.some((s) => !priorSuccess.has(s)) || (now.length && names().some((n) => sameFile(n, file.fileName)))) return 'success';
    return null;
  }, UPLOAD_WAIT_MS);
  return { ok: outcome === 'success', input };
}
