/**
 * Repeating "work experience" and "education" sections on application forms.
 *
 * Given the controls found by the generic detector this module decides which belong to a job or a school entry,
 * which field of the entry each one is, and which entry (0-based) it belongs to. It then writes profile values into
 * them, and can click the page's "add another" control until there are enough entries.
 *
 * Nothing here knows about a specific site except the id/name tables for a few well known form builders and the two
 * custom date pickers (react-datepicker and the Tesla one) that cannot be driven by typing.
 */
import { MONTHS, MONTH_ABBR, parseYearMonth, type YearMonth } from '../../shared/dates';
import type { ProfileData } from '../../shared/profile';
import { detectFields, forLabel, type DetectOptions } from './detect';
import { fillCombobox, fillSelect, fillText } from './fill';
import type { FieldEl, FieldInfo } from './types';

export type EntryKind = 'work' | 'edu';
export type EntryKey =
  | 'work.title' | 'work.company' | 'work.location' | 'work.startMonth' | 'work.startYear' | 'work.startDate'
  | 'work.endMonth' | 'work.endYear' | 'work.endDate' | 'work.current' | 'work.description'
  | 'edu.school' | 'edu.degree' | 'edu.field' | 'edu.gpa' | 'edu.startMonth' | 'edu.startYear' | 'edu.startDate'
  | 'edu.endMonth' | 'edu.endYear' | 'edu.endDate' | 'edu.current';
export interface EntryField { f: FieldInfo; kind: EntryKind; key: EntryKey; index: number }

export const wait = (ms: number): Promise<unknown> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------
// small local helpers (this module must not import repeaters.ts, which imports this one)

/** Full pointer sequence, which is what custom widgets listen for. */
function tap(el: HTMLElement): void {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

/** Poll `get` until it returns something truthy or the time is up. */
async function poll<T>(get: () => T | null | undefined | false, timeout: number, step = 60): Promise<T | null> {
  const end = Date.now() + timeout;
  do {
    const v = get();
    if (v) return v;
    await wait(step);
  } while (Date.now() < end);
  return null;
}

/** Lower-case words: splits camelCase, turns every other separator into one space. */
function words(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Drops phrases that mention "job" but are about the posting, not the candidate's history. */
function denoise(w: string): string {
  return w.replace(/\bjob (application|applications|apply|posting|board|search|alert|description|details|listing|opening|id|link|req)\w*/g, ' ');
}

const sigWords = (parts: string[]): string => denoise(words(parts.filter(Boolean).join(' ')));
const pad2 = (n: number) => String(n).padStart(2, '0');
const isControl = (el: Element): el is FieldEl => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);

// ---------------------------------------------------------------------------------------------------------------
// 4.1: identifiers that name the entry and the field exactly

const TABLE: [RegExp, EntryKey][] = [];
{
  const add = (re: RegExp, key: EntryKey) => TABLE.push([re, key]);
  // Greenhouse style job boards
  add(/^company-name-(\d+)$/, 'work.company');
  add(/^title-(\d+)$/, 'work.title');
  add(/^start-date-month-(\d+)$/, 'work.startMonth');
  add(/^start-date-year-(\d+)$/, 'work.startYear');
  add(/^end-date-month-(\d+)$/, 'work.endMonth');
  add(/^end-date-year-(\d+)$/, 'work.endYear');
  add(/^current-role-(\d+)(?:_\d+)?$/, 'work.current');
  add(/^(?:school|university)--(\d+)$/, 'edu.school');
  add(/^degree--(\d+)$/, 'edu.degree');
  add(/^(?:discipline|major)--(\d+)$/, 'edu.field');
  add(/^start-month--(\d+)$/, 'edu.startMonth');
  add(/^start-year--(\d+)$/, 'edu.startYear');
  add(/^end-month--(\d+)$/, 'edu.endMonth');
  add(/^end-year--(\d+)$/, 'edu.endYear');
  add(/^education_school_name_(\d+)$/, 'edu.school');
  add(/^education_degree_(\d+)$/, 'edu.degree');
  add(/^education_discipline_(\d+)$/, 'edu.field');
  add(/^education_start_month_(\d+)$/, 'edu.startMonth');
  add(/^education_start_year_(\d+)$/, 'edu.startYear');
  add(/^education_end_month_(\d+)$/, 'edu.endMonth');
  add(/^education_end_year_(\d+)$/, 'edu.endYear');
  // Tesla careers
  const tesla = (tail: string, key: EntryKey) => add(new RegExp(`^workExperience\\.employers\\[(\\d+)\\]\\.${tail}$`), key);
  tesla('companyName', 'work.company');
  tesla('jobTitle', 'work.title');
  tesla('startDate', 'work.startDate');
  tesla('endDate', 'work.endDate');
  tesla('isCurrent', 'work.current');
  tesla('summaryDuties', 'work.description');
  // array style forms
  const exp = (tail: string, key: EntryKey) => add(new RegExp(`^experienceData\\[(\\d+)\\]\\.${tail}$`), key);
  exp('title', 'work.title');
  exp('companyName', 'work.company');
  exp('location', 'work.location');
  exp('(?:description|roleDescription)', 'work.description');
  exp('fromTo\\.startDate', 'work.startDate');
  exp('fromTo\\.endDate', 'work.endDate');
  exp('fromTo\\.currentlyWorkHere', 'work.current');
  const edu = (tail: string, key: EntryKey) => add(new RegExp(`^educationData\\[(\\d+)\\]\\.${tail}$`), key);
  edu('schoolName', 'edu.school');
  edu('degree', 'edu.degree');
  edu('(?:major|fieldOfStudy)', 'edu.field');
  edu('gradeAverage', 'edu.gpa');
  edu('fromTo\\.startDate', 'edu.startDate');
  edu('fromTo\\.endDate', 'edu.endDate');
}

interface TableHit { kind: EntryKind; key: EntryKey; num: number }

function tableHit(f: FieldInfo): TableHit | null {
  for (const text of [f.id, f.name]) {
    if (!text) continue;
    for (const [re, key] of TABLE) {
      const m = re.exec(text);
      if (m) return { kind: key.startsWith('work') ? 'work' : 'edu', key, num: Number(m[1]) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// which section does a control live in

const WORK_SELF = /\b(company|companies|employer|employers|organi[sz]ation|firm|job title|jobtitle|job role|position title|role title|position|designation|occupation|workplace)\b/;
const EDU_SELF = /\b(school|schools|universit\w*|college|institution|institute|degree|diploma|field of study|major|discipline|gpa|cgpa|graduat\w*|qualification|education|educational|alma mater|course of study|area of study)\b/;
/** "Current company" at the top of a form is a profile question, not the first job. */
const CURRENT_WORDING = /\b(current|currently|most recent|latest)\b/;

const WORK_TOKEN = /\b(work|employment|employer|employers|job|jobs|experience|experiences|career|occupation|workexperience|workhistory)\b/;
const EDU_TOKEN = /\b(educat\w*|school|schools|universit\w*|college|academic|academics|degree|degrees|qualification|qualifications|institution|studies|schooling)\b/;

type Verdict = EntryKind | 'both' | null;

function verdictOfText(w: string): Verdict {
  const a = WORK_TOKEN.test(w);
  const b = EDU_TOKEN.test(w);
  return a && b ? 'both' : a ? 'work' : b ? 'edu' : null;
}

interface Ctx {
  self: WeakMap<Element, EntryKind | null>;
  block: WeakMap<Element, Verdict>;
}
const newCtx = (): Ctx => ({ self: new WeakMap(), block: new WeakMap() });

function selfVerdict(sig: string, label: string): EntryKind | null {
  if (label.includes('?')) return null; // a yes/no style question, not an entry field
  let work = WORK_SELF.test(sig) && !/\bappl(y|ying|ication)\b/.test(sig);
  const edu = EDU_SELF.test(sig);
  if (work && CURRENT_WORDING.test(sig)) work = false;
  return work && edu ? null : work ? 'work' : edu ? 'edu' : null;
}

function infoSig(f: FieldInfo): { sig: string; label: string } {
  const label = f.label.length <= 100 ? f.label : '';
  return { sig: sigWords([label, f.aria, f.placeholder, f.name, f.id]), label: `${label} ${f.aria}` };
}

/** How a control names itself. */
function selfKind(el: Element, ctx: Ctx): EntryKind | null {
  if (ctx.self.has(el)) return ctx.self.get(el) ?? null;
  let out: EntryKind | null = null;
  if (isControl(el) && !['hidden', 'file', 'radio', 'submit', 'button'].includes((el as HTMLInputElement).type)) {
    const label = forLabel(el);
    const aria = el.getAttribute('aria-label') ?? '';
    const sig = sigWords([label.length <= 100 ? label : '', aria, el.getAttribute('placeholder') ?? '', el.getAttribute('name') ?? '', el.id]);
    out = selfVerdict(sig, `${label} ${aria}`);
  }
  ctx.self.set(el, out);
  return out;
}

const ATTRS = ['id', 'class', 'name', 'aria-label', 'data-automation-id', 'data-testid', 'data-test', 'data-ui', 'data-section', 'data-qa', 'data-id'];
// attribute tokens: "company" and "position" are too common in unrelated class names to trust here
const WORK_ATTR = /\b(work|employment|employer|employers|job|jobs|experience|experiences|career|occupation|workexperience|workhistory)\b/;

/** What the attributes of a container (and the heading it points at) say. */
function attrVerdict(el: Element): Verdict {
  const parts = ATTRS.map((a) => el.getAttribute(a) ?? '');
  const lb = el.getAttribute('aria-labelledby');
  if (lb) {
    const root = el.getRootNode() as Document | ShadowRoot;
    for (const id of lb.split(/\s+/)) parts.push(root.getElementById?.(id)?.textContent ?? '');
  }
  const w = denoise(words(parts.join(' ')));
  const a = WORK_ATTR.test(w);
  const b = EDU_TOKEN.test(w);
  return a && b ? 'both' : a ? 'work' : b ? 'edu' : null;
}

const HEADING_SEL = 'h1,h2,h3,h4,h5,h6,legend,[role="heading"],caption';
const CONTROLS = 'input,select,textarea';
const rankOf = (e: Element) => { const m = /^H([1-6])$/.exec(e.tagName); return m ? Number(m[1]) : 7; };

function headingLike(e: Element): boolean {
  if (e.matches(HEADING_SEL)) return !e.querySelector(CONTROLS);
  if (e.querySelector(`${CONTROLS},button`)) return false;
  const text = (e.textContent ?? '').trim();
  if (!text || text.length > 60) return false;
  if (/\b(heading|title|header|legend|caption|subtitle)\b/.test(words(`${e.getAttribute('class') ?? ''} ${e.id}`))) return true;
  return e.children.length === 1 && e.children[0].matches(HEADING_SEL);
}

/** The nearest earlier sibling heading that names a section, or 'stop' when a nearer heading closes the scope. */
function headingBefore(node: Element): EntryKind | 'stop' | null {
  let neutral = 99;
  let seen = 0;
  for (let prev = node.previousElementSibling; prev && seen < 40; prev = prev.previousElementSibling, seen++) {
    if (!headingLike(prev)) continue;
    const text = (prev.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length > 80) continue;
    const w = denoise(words(text));
    const v = verdictOfText(w);
    if (v === 'both') return 'stop';
    if (v) return rankOf(prev) < neutral ? v : 'stop';
    if (/^(?:[a-z]+ )?\d+$/.test(w)) continue; // "Entry 2" only numbers an entry
    neutral = Math.min(neutral, rankOf(prev));
  }
  return null;
}

/** Headings and attributes of the containers around `el`, never leaving the form. */
function containerKind(el: Element): EntryKind | null {
  if (!isControl(el)) {
    const own = attrVerdict(el);
    if (own === 'work' || own === 'edu') return own;
  }
  let node: Element = el;
  for (let depth = 0; depth < 12; depth++) {
    const h = headingBefore(node);
    if (h === 'stop') return null;
    if (h) return h;
    const p = node.parentElement;
    if (!p || /^(BODY|HTML|FORM)$/.test(p.tagName)) return null;
    const v = attrVerdict(p);
    if (v === 'work' || v === 'edu') return v;
    node = p;
  }
  return null;
}

function blockVerdict(p: Element, ctx: Ctx): Verdict {
  if (ctx.block.has(p)) return ctx.block.get(p) ?? null;
  let work = false;
  let edu = false;
  for (const c of Array.from(p.querySelectorAll(CONTROLS))) {
    const k = selfKind(c, ctx);
    if (k === 'work') work = true;
    else if (k === 'edu') edu = true;
    if (work && edu) break;
  }
  const v: Verdict = work && edu ? 'both' : work ? 'work' : edu ? 'edu' : null;
  ctx.block.set(p, v);
  return v;
}

/** The nearest enclosing block that holds company/title (or school/degree) controls and none of the other kind. */
function blockKind(el: Element, ctx: Ctx): EntryKind | null {
  let p = el.parentElement;
  for (let depth = 0; p && depth < 10; depth++, p = p.parentElement) {
    if (/^(BODY|HTML|FORM)$/.test(p.tagName)) return null;
    const v = blockVerdict(p, ctx);
    if (v === 'both') return null;
    if (v) return v;
  }
  return null;
}

function sectionWith(el: Element, ctx: Ctx): EntryKind | null {
  const own = selfKind(el, ctx);
  if (own) return own;
  return containerKind(el) ?? blockKind(el, ctx);
}

/** Is this element inside a work or an education section (decided by name, containers, then neighbours)? */
export function sectionOf(el: Element): EntryKind | null {
  return sectionWith(el, newCtx());
}

// ---------------------------------------------------------------------------------------------------------------
// which field of the entry is it

const DESC_RE = /\b(description|descri\w*|responsib\w*|duties|duty|summary|role|details?|accomplish\w*|achievements?|tasks?|experience)\b/;
const COMPANY_RE = /\b(company|companies|employer|employers|organi[sz]ation|firm|business name|workplace)\b/;
const TITLE_RE = /\b(job title|jobtitle|position title|role title|title|position|role|designation|occupation)\b/;
const LOCATION_RE = /\b(location|city|town)\b/;
const SCHOOL_RE = /\b(school|schools|universit\w*|college|institution|institute|alma mater)\b/;
const DEGREE_RE = /\b(degree|diploma|qualification|level of education|education level|highest education|education type)\b/;
const FIELD_RE = /\b(field of study|field|major|discipline|concentration|area of study|specializ\w*|specialis\w*|subject|course|stream|branch|program|programme)\b/;
const GPA_RE = /\b(gpa|cgpa|grade|grades|grade point|percentage|marks|score)\b/;
const NOT_DATE = /\b(birth|dob|expir\w*|issue\w*|licen[sc]e|passport|visa|salary|notice|availab\w*|earliest|desired|preferred|interview|deadline)\b/;
const START_RE = /\b(start|starting|started|begin|began|beginning|commenc\w*|since|joined)\b/;
const END_RE = /\b(end|ending|ended|finish\w*|leaving|left|until|till|thru|through|completion|completed|graduat\w*|passing|expected)\b/;

function selectGranularity(el: Element): 'Month' | 'Year' | null {
  if (!(el instanceof HTMLSelectElement)) return null;
  const texts = Array.from(el.options).map((o) => (o.textContent ?? '').trim());
  const monthish = texts.filter((t) => MONTHS.some((m) => m.toLowerCase() === t.toLowerCase()) || MONTH_ABBR.some((m) => m.toLowerCase() === t.toLowerCase())).length;
  if (monthish >= 6) return 'Month';
  const nums = texts.filter((t) => /^\d{1,2}$/.test(t)).map(Number);
  if (nums.length >= 12 && Math.max(...nums) <= 12) return 'Month';
  if (texts.filter((t) => /^(19|20)\d\d$/.test(t)).length >= 5) return 'Year';
  return null;
}

function dateKey(sig: string, label: string, f: FieldInfo, kind: EntryKind): EntryKey | null {
  if (NOT_DATE.test(sig)) return null;
  const s = START_RE.test(sig);
  const e = END_RE.test(sig);
  let part: 'start' | 'end' | null = s && !e ? 'start' : e && !s ? 'end' : null;
  if (!s && !e) {
    const lab = words(label);
    if (/^from\b/.test(lab)) part = 'start';
    else if (/^to\b/.test(lab)) part = 'end';
  }
  if (!part) return null;
  const hasMonth = /\b(month|mm|mmm|mmmm|mon)\b/.test(sig);
  const hasYear = /\b(year|yyyy|yy)\b/.test(sig);
  let g: 'Month' | 'Year' | 'Date' = hasMonth && hasYear ? 'Date' : hasMonth ? 'Month' : hasYear ? 'Year' : 'Date';
  if (!hasMonth && !hasYear) g = selectGranularity(f.el) ?? 'Date';
  return `${kind}.${part}${g}` as EntryKey;
}

function keyFromText(f: FieldInfo, kind: EntryKind): EntryKey | null {
  if (f.kind === 'file' || f.kind === 'radio') return null;
  const label = f.label.length <= 100 ? f.label : '';
  if (`${label} ${f.aria}`.includes('?')) return null;
  const sig = sigWords([label, f.aria, f.placeholder, f.name, f.id]);

  if (f.kind === 'checkbox') {
    const re = kind === 'work' ? /\b(current|currently|present|still|ongoing)\b/ : /\b(current|currently|enrolled|present|ongoing|still|studying)\b/;
    return re.test(sig) ? `${kind}.current` as EntryKey : null;
  }
  if (f.kind === 'textarea') {
    if (kind !== 'work') return null;
    return DESC_RE.test(sig) || !label ? 'work.description' : null;
  }

  const date = dateKey(sig, label, f, kind);
  if (date) return date;
  if (kind === 'work') {
    if (LOCATION_RE.test(sig)) return 'work.location';
    if (COMPANY_RE.test(sig)) return 'work.company';
    if (TITLE_RE.test(sig) && !/\b(description|responsib\w*|duties|summary|mr|ms|mrs|salutation|honorific|prefix)\b/.test(sig)) return 'work.title';
    return null;
  }
  if (GPA_RE.test(sig)) return 'edu.gpa';
  if (FIELD_RE.test(sig)) return 'edu.field';
  if (DEGREE_RE.test(sig)) return 'edu.degree';
  if (SCHOOL_RE.test(sig)) return 'edu.school';
  return null;
}

/** The entry field `f` is, assuming it sits in a section of this kind; null when it is not an entry field. */
export function entryKeyOf(f: FieldInfo, kind: EntryKind): EntryKey | null {
  const t = tableHit(f);
  if (t) {
    if (t.kind !== kind) return null;
    return t.key.endsWith('.current') === (f.kind === 'checkbox') ? t.key : null;
  }
  return keyFromText(f, kind);
}

// ---------------------------------------------------------------------------------------------------------------
// classification and entry numbering

interface Row { f: FieldInfo; kind: EntryKind; key: EntryKey; num: number | null; table: boolean; order: number; index: number }

const lastNumber = (s: string): number | null => { const m = /(\d+)(?!.*\d)/.exec(s); return m ? Number(m[1]) : null; };

/** Entry numbers read from ids when they are 0,1,2... or 1,2,3...; null when they are not a clean sequence. */
function cleanSequence(nums: (number | null)[]): number | null {
  if (!nums.length || nums.some((n) => n === null)) return null;
  const list = nums as number[];
  if (list[0] !== 0 && list[0] !== 1) return null;
  return list.every((n, i) => n === list[0] + i) ? list[0] : null;
}

/** For each detected field that belongs to a job or school entry: its kind, its key and its 0-based entry. */
export function classifyEntryFields(fields: FieldInfo[]): EntryField[] {
  const ctx = newCtx();
  for (const f of fields) {
    if (f.kind === 'file' || f.kind === 'radio') continue;
    const { sig, label } = infoSig(f);
    ctx.self.set(f.el, selfVerdict(sig, label));
  }

  const rows: Row[] = [];
  fields.forEach((f, order) => {
    if (f.kind === 'file' || f.kind === 'radio') return;
    const t = tableHit(f);
    if (t) {
      if (t.key.endsWith('.current') === (f.kind === 'checkbox')) rows.push({ f, kind: t.kind, key: t.key, num: t.num, table: true, order, index: 0 });
      return;
    }
    const kind = sectionWith(f.el, ctx);
    if (!kind) return;
    const key = keyFromText(f, kind);
    if (key) rows.push({ f, kind, key, num: null, table: false, order, index: 0 });
  });

  for (const kind of ['work', 'edu'] as EntryKind[]) {
    const mine = rows.filter((r) => r.kind === kind);
    if (!mine.length) continue;
    const anchorKey: EntryKey = kind === 'work' ? 'work.company' : 'edu.school';
    const anchors = mine.filter((r) => r.key === anchorKey);

    // numbering of the anchors themselves
    const nums = anchors.map((a) => a.num ?? lastNumber(a.f.id) ?? lastNumber(a.f.name));
    const base = cleanSequence(nums);
    const anchorIndex = new Map<Row, number>();
    anchors.forEach((a, i) => anchorIndex.set(a, base !== null ? (nums[i] as number) - base : i));

    const tableNums = [...new Set(mine.filter((r) => r.num !== null).map((r) => r.num as number))].sort((x, y) => x - y);

    for (const r of mine) {
      if (anchorIndex.has(r)) { r.index = anchorIndex.get(r)!; continue; }
      if (r.table && r.num !== null) {
        const twin = anchors.findIndex((a, i) => nums[i] === r.num);
        r.index = twin >= 0 ? anchorIndex.get(anchors[twin])! : tableNums.indexOf(r.num);
        continue;
      }
      if (!anchors.length) continue; // handled below by key repetition
      // the closest ancestor that holds exactly one anchor is this field's entry
      let owner = -1;
      for (let p = r.f.el.parentElement; p; p = p.parentElement) {
        const inside = anchors.map((a, i) => (p!.contains(a.f.el) ? i : -1)).filter((i) => i >= 0);
        if (inside.length === 1) { owner = inside[0]; break; }
        if (inside.length > 1) break;
      }
      if (owner < 0) {
        // flat layout: nearest anchor that comes before the field, else the first one
        const before = anchors.filter((a) => (a.f.el.compareDocumentPosition(r.f.el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        owner = before.length ? anchors.indexOf(before[before.length - 1]) : 0;
      }
      r.index = anchorIndex.get(anchors[owner])!;
    }

    if (!anchors.length) {
      // no company/school field at all: a new entry starts when a key repeats
      let idx = 0;
      let seen = new Set<EntryKey>();
      for (const r of mine) {
        if (r.table && r.num !== null) { r.index = tableNums.indexOf(r.num); continue; }
        if (seen.has(r.key)) { idx++; seen = new Set(); }
        seen.add(r.key);
        r.index = idx;
      }
    }
  }

  return rows.sort((a, b) => a.order - b.order).map((r) => ({ f: r.f, kind: r.kind, key: r.key, index: r.index }));
}

// ---------------------------------------------------------------------------------------------------------------
// values

/** The profile value for this key and entry; '' when there is none (or the index is out of range). */
export function entryValue(key: EntryKey, p: ProfileData, index: number): string {
  if (key.startsWith('work.')) {
    const w = p.workExperience[index];
    if (!w) return '';
    switch (key) {
      case 'work.title': return w.jobTitle;
      case 'work.company': return w.companyName;
      case 'work.location': return w.location;
      case 'work.startMonth': case 'work.startYear': case 'work.startDate': return w.startDate;
      case 'work.endMonth': case 'work.endYear': case 'work.endDate': return w.isCurrent ? '' : w.endDate;
      case 'work.current': return w.isCurrent ? 'yes' : '';
      case 'work.description': return w.description;
      default: return '';
    }
  }
  const e = p.education[index];
  if (!e) return '';
  switch (key) {
    case 'edu.school': return e.schoolName;
    case 'edu.degree': return e.degree;
    case 'edu.field': return e.fieldOfStudy;
    case 'edu.gpa': return e.gpa;
    case 'edu.startMonth': case 'edu.startYear': case 'edu.startDate': return e.startDate;
    case 'edu.endMonth': case 'edu.endYear': case 'edu.endDate': return e.currentlyEnrolled ? '' : e.graduationDate;
    case 'edu.current': return e.currentlyEnrolled ? 'yes' : '';
    default: return '';
  }
}

const BACHELOR: Record<string, string> = {
  bs: 'Bachelor of Science', bsc: 'Bachelor of Science', ba: 'Bachelor of Arts', btech: 'Bachelor of Technology',
  be: 'Bachelor of Engineering', beng: 'Bachelor of Engineering', bba: 'Bachelor of Business Administration',
  bcom: 'Bachelor of Commerce', bca: 'Bachelor of Computer Applications', bfa: 'Bachelor of Fine Arts',
  barch: 'Bachelor of Architecture', llb: 'Bachelor of Laws', bsba: 'Bachelor of Science in Business Administration',
  bed: 'Bachelor of Education', bachelor: '', bachelors: '', bachelordegree: '', bachelorsdegree: '',
};
const MASTER: Record<string, string> = {
  ms: 'Master of Science', msc: 'Master of Science', ma: 'Master of Arts', mba: 'Master of Business Administration',
  mtech: 'Master of Technology', me: 'Master of Engineering', meng: 'Master of Engineering',
  mca: 'Master of Computer Applications', mcom: 'Master of Commerce', mfa: 'Master of Fine Arts', med: 'Master of Education',
  mphil: 'Master of Philosophy', llm: 'Master of Laws', master: '', masters: '', masterdegree: '', mastersdegree: '',
};
const DOCTOR: Record<string, string> = {
  phd: 'Doctor of Philosophy', dphil: 'Doctor of Philosophy', edd: 'Doctor of Education', md: 'Doctor of Medicine',
  jd: 'Juris Doctor', dba: 'Doctor of Business Administration', doctorate: '', doctoral: '', doctoraldegree: '',
};
const ASSOCIATE: Record<string, string> = {
  aa: 'Associate of Arts', as: 'Associate of Science', aas: 'Associate of Applied Science', associate: '', associates: '',
  associatedegree: '', associatesdegree: '',
};

/** The ways one degree may be worded in a dropdown, best first, always starting with the input. */
export function degreeAlternatives(degree: string): string[] {
  const raw = degree.trim();
  if (!raw) return [];
  const head = raw.split(/\s+(?:in|-)\s+|\s*[,(]/i)[0].trim();
  const n = head.toLowerCase().replace(/[\u2019`]/g, "'").replace(/[.\s']/g, '');
  const out: string[] = [raw];
  if (head && head !== raw) out.push(head);

  const lookup = (table: Record<string, string>): string | null => (n in table ? table[n] : null);
  let full: string | null;
  if ((full = lookup(BACHELOR)) !== null || n.startsWith('bachelor')) {
    if (full) out.push(full);
    out.push("Bachelor's Degree", "Bachelor's", 'Bachelors Degree', 'Bachelor Degree', 'Bachelors', 'Bachelor');
  } else if ((full = lookup(MASTER)) !== null || n.startsWith('master')) {
    if (full) out.push(full);
    out.push("Master's Degree", "Master's", 'Masters Degree', 'Master Degree', 'Masters', 'Master');
  } else if ((full = lookup(DOCTOR)) !== null || n.startsWith('doctor') || n === 'phd') {
    if (full === 'Doctor of Philosophy') out.push('Doctor of Philosophy (Ph.D.)', 'Doctor of Philosophy', 'Ph.D.', 'PhD');
    else if (full) out.push(full);
    out.push('Doctorate', 'Doctoral Degree', 'Doctor of Philosophy (Ph.D.)', 'Ph.D.', 'PhD');
  } else if ((full = lookup(ASSOCIATE)) !== null || n.startsWith('associate')) {
    if (full) out.push(full);
    out.push("Associate's Degree", "Associate's", 'Associate Degree', 'Associates', 'Associate');
  } else if (/^(highschool|secondary|ged|hsc|ssc|diploma|gcse|alevels?|highschooldiploma|highschooldegree|highschoolgraduate|secondaryschool)/.test(n)) {
    out.push('High School', 'High School Diploma', 'High School Diploma or equivalent', 'GED', 'Secondary School', 'Diploma');
  }
  // dropdowns sometimes use the typographic apostrophe
  for (const s of [...out]) if (s.includes("'")) out.push(s.replace(/'/g, '\u2019'));
  const seen = new Set<string>();
  return out.filter((s) => { const k = s.toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

// ---------------------------------------------------------------------------------------------------------------
// custom date pickers

const parseCaption = (text: string): { year?: number; month?: number } => {
  const y = /\b(\d{4})\b/.exec(text);
  const m = MONTHS.findIndex((n) => new RegExp(`\\b${n.slice(0, 3)}`, 'i').test(text));
  return { year: y ? Number(y[1]) : undefined, month: m >= 0 ? m + 1 : undefined };
};

/**
 * Month picker built on react-datepicker. Opens it, goes to the year (select or arrows), clicks the month cell
 * (or day 1 in day mode). Returns true when the input ended up with a value.
 */
export async function pickReactDatepicker(input: HTMLInputElement, ym: YearMonth): Promise<boolean> {
  if (!ym.year) return false;
  const year = Number(ym.year);
  const month = ym.month ?? 1;
  const find = () => document.querySelector<HTMLElement>('.react-datepicker');

  let pk = find();
  if (!pk) {
    input.focus();
    tap(input);
    pk = await poll(find, 1200);
  }
  if (!pk) {
    const icon = input.closest('.react-datepicker-wrapper, .react-datepicker__input-container')?.parentElement
      ?.querySelector<HTMLElement>('[data-ui="icon"], button[aria-label*="calendar" i], button[aria-label*="date" i], [class*="calendar" i]');
    if (icon) { tap(icon); pk = await poll(find, 1200); }
  }
  if (!pk) return false;

  const yearSelect = pk.querySelector<HTMLSelectElement>('select.react-datepicker__year-select') ??
    Array.from(pk.querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === String(year)));
  if (yearSelect) fillSelect(yearSelect, String(year), 'custom');
  else {
    for (let i = 0; i < 80; i++) {
      const cur = find();
      if (!cur) break;
      const head = cur.querySelector('.react-datepicker__current-month, .react-datepicker-year-header, .react-datepicker__header')?.textContent ?? '';
      const c = parseCaption(head);
      if (!c.year) break;
      const diff = c.month ? (year * 12 + month) - (c.year * 12 + c.month) : year - c.year;
      if (diff === 0) break;
      const nav = cur.querySelector<HTMLElement>(diff < 0 ? '.react-datepicker__navigation--previous' : '.react-datepicker__navigation--next');
      if (!nav || nav.getAttribute('aria-disabled') === 'true' || (nav as HTMLButtonElement).disabled) break;
      tap(nav);
      const changed = await poll(() => {
        const t = find()?.querySelector('.react-datepicker__current-month, .react-datepicker-year-header, .react-datepicker__header')?.textContent ?? '';
        return t !== head;
      }, 400, 20);
      if (!changed) break;
    }
  }

  pk = find();
  if (!pk) return input.value.trim() !== '';
  const monthSelect = pk.querySelector<HTMLSelectElement>('select.react-datepicker__month-select');
  if (monthSelect) fillSelect(monthSelect, MONTHS[month - 1], 'custom');
  const root = find() ?? pk;
  const usable = (c: Element) => !/--disabled|--outside-month/.test(c.getAttribute('class') ?? '') && c.getAttribute('aria-disabled') !== 'true';
  const cell =
    root.querySelector<HTMLElement>(`.react-datepicker__month-text.react-datepicker__month-${month - 1}`) ??
    Array.from(root.querySelectorAll<HTMLElement>('.react-datepicker__month-text')).find((c) => {
      const t = (c.textContent ?? '').trim().toLowerCase();
      return t === MONTHS[month - 1].toLowerCase() || t === MONTH_ABBR[month - 1].toLowerCase();
    }) ??
    Array.from(root.querySelectorAll<HTMLElement>('.react-datepicker__day')).find((c) => (c.textContent ?? '').trim() === '1' && usable(c)) ??
    Array.from(root.querySelectorAll<HTMLElement>('.react-datepicker__year-text')).find((c) => (c.textContent ?? '').trim() === String(year));
  if (!cell || !usable(cell)) return input.value.trim() !== '';
  tap(cell);
  await poll(() => input.value.trim() !== '', 1000, 30);
  return input.value.trim() !== '';
}

/** The Tesla careers date picker: step the caption to the month, then click day 1. */
export async function pickTeslaDate(input: HTMLInputElement, ym: YearMonth): Promise<boolean> {
  const box = input.closest('.tds-form-input');
  if (!box || !ym.year) return false;
  const year = Number(ym.year);
  const month = ym.month ?? 1;
  const find = () => box.querySelector<HTMLElement>('.tds-date-picker');

  let pk = find();
  if (!pk) {
    input.focus();
    tap(input);
    pk = await poll(find, 1500);
  }
  if (!pk) return false;
  const caption = () => find()?.querySelector('.tds-date-picker-month label')?.textContent ?? '';
  for (let i = 0; i < 240; i++) {
    const text = caption();
    const c = parseCaption(text);
    if (!c.year || !c.month) break;
    const diff = (year * 12 + month) - (c.year * 12 + c.month);
    if (diff === 0) break;
    const btns = find()?.querySelectorAll<HTMLElement>('.tds-date-picker-month button');
    const btn = btns && btns[diff < 0 ? 0 : 1];
    if (!btn || (btn as HTMLButtonElement).disabled) break;
    tap(btn);
    const changed = await poll(() => caption() !== text, 400, 20);
    if (!changed) break;
  }
  const c = parseCaption(caption());
  if (c.year !== year || c.month !== month) return input.value.trim() !== '';
  const day = Array.from(find()?.querySelectorAll<HTMLElement>('.tds-day') ?? []).find(
    (d) => !d.classList.contains('tds-day--not-this-month') && (d.textContent ?? '').trim() === '1',
  );
  if (!day) return input.value.trim() !== '';
  tap(day);
  await poll(() => input.value.trim() !== '', 1000, 30);
  return input.value.trim() !== '';
}

// ---------------------------------------------------------------------------------------------------------------
// filling

const hintOf = (f: FieldInfo) => `${f.placeholder} ${f.label} ${f.aria}`.toLowerCase();

/** Spellings of a month-and-year date for a text control, best first. */
function dateCandidates(ym: YearMonth, f: FieldInfo): string[] {
  if (!ym.year) return [];
  const y = ym.year;
  const el = f.el as HTMLInputElement;
  const mm = ym.month ? pad2(ym.month) : '';
  if (el.type === 'month') return mm ? [`${y}-${mm}`] : [];
  if (el.type === 'date') return [`${y}-${mm || '01'}-01`];
  if (!mm) return [y];
  const hint = hintOf(f);
  const styled: string[] = [];
  let m: RegExpExecArray | null;
  if ((m = /mm\s*([/.-])\s*dd\s*[/.-]\s*yy/.exec(hint))) styled.push(`${mm}${m[1]}01${m[1]}${y}`);
  else if ((m = /dd\s*([/.-])\s*mm\s*[/.-]\s*yy/.exec(hint))) styled.push(`01${m[1]}${mm}${m[1]}${y}`);
  else if ((m = /yyyy\s*([/.-])\s*mm/.exec(hint))) styled.push(`${y}${m[1]}${mm}`);
  else if ((m = /mm\s*([/.-])\s*yyyy/.exec(hint))) styled.push(`${mm}${m[1]}${y}`);
  else if (/mmmm\s*,?\s*yyyy|month\s*,?\s*yyyy/.test(hint)) styled.push(`${MONTHS[ym.month! - 1]} ${y}`);
  else if (/mmm\s*,?\s*yyyy/.test(hint)) styled.push(`${MONTH_ABBR[ym.month! - 1]} ${y}`);
  return [...styled, `${mm}/${y}`, `${y}-${mm}`].filter((s, i, a) => a.indexOf(s) === i);
}

function monthCandidates(month: number, f: FieldInfo): string[] {
  const full = MONTHS[month - 1];
  const abbr = MONTH_ABBR[month - 1];
  const padded = pad2(month);
  const plain = String(month);
  if (f.kind === 'select' || f.kind === 'combobox') return [full, abbr, padded, plain];
  const el = f.el as HTMLInputElement;
  const numeric = el.type === 'number' || el.type === 'tel' || (el.maxLength > 0 && el.maxLength <= 2) ||
    /\bmm\b/.test(hintOf(f)) || /\\d/.test(el.getAttribute('pattern') ?? '');
  return numeric ? [padded, plain, full, abbr] : [full, abbr, padded, plain];
}

function candidatesFor(ef: EntryField, value: string): string[] {
  const part = ef.key.split('.')[1];
  if (part === 'degree') return degreeAlternatives(value);
  const isDate = /(Month|Year|Date)$/.test(part);
  if (!isDate) return [value];
  const ym = parseYearMonth(value);
  if (/Month$/.test(part)) return ym.month ? monthCandidates(ym.month, ef.f) : [];
  if (/Year$/.test(part)) return ym.year ? [ym.year] : [];
  return dateCandidates(ym, ef.f);
}

function fits(el: HTMLInputElement | HTMLTextAreaElement, cand: string): boolean {
  if (el.maxLength > 0 && cand.length > el.maxLength) return false;
  const pat = el instanceof HTMLInputElement ? el.getAttribute('pattern') : null;
  if (pat) {
    try { if (!new RegExp(`^(?:${pat})$`).test(cand)) return false; } catch { /* unusable pattern: ignore it */ }
  }
  return true;
}

/** Write one classified field. 'skip' when the profile has nothing or nothing could be set. */
export async function fillEntryField(ef: EntryField, p: ProfileData): Promise<'ok' | 'skip'> {
  const { f } = ef;
  const value = entryValue(ef.key, p, ef.index);
  if (!value.trim()) return 'skip';
  try {
    if (f.kind === 'file' || f.kind === 'radio') return 'skip';

    if (f.kind === 'checkbox') {
      const box = f.el as HTMLInputElement;
      if (box.checked) return 'ok';
      box.click();
      if (!box.checked) {
        const lab = box.labels?.[0];
        if (lab) lab.click();
      }
      return box.checked ? 'ok' : 'skip';
    }

    const cands = candidatesFor(ef, value);
    if (!cands.length) return 'skip';

    if (f.kind === 'select') {
      for (const c of cands) if (fillSelect(f.el as HTMLSelectElement, c, 'custom')) return 'ok';
      return 'skip';
    }
    if (f.kind === 'combobox') {
      for (const c of cands.slice(0, 5)) if (await fillCombobox(f.el as HTMLInputElement, c, 'custom')) return 'ok';
      return 'skip';
    }

    const el = f.el as HTMLInputElement | HTMLTextAreaElement;
    const part = ef.key.split('.')[1];
    if (/Date$/.test(part) && el instanceof HTMLInputElement) {
      const ym = parseYearMonth(value);
      if (el.closest('.tds-form-input') && (await pickTeslaDate(el, ym))) return 'ok';
      if (el.closest('.react-datepicker-wrapper, .react-datepicker__input-container') && (await pickReactDatepicker(el, ym))) return 'ok';
    }
    const constrained = /(Month|Year|Date)$/.test(part);
    for (const c of cands) {
      if (constrained && !fits(el, c)) continue;
      if (fillText(el, c)) return 'ok';
    }
    return 'skip';
  } catch {
    return 'skip';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// add buttons

const ACTION_SEL = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
const FILLER = new Set(['another', 'more', 'new', 'a', 'an', 'one', 'additional', 'other', 'extra', 'and', 'or']);
const WORK_WORDS = new Set(['work', 'job', 'jobs', 'employment', 'employer', 'employers', 'company', 'companies', 'experience', 'experiences', 'position', 'positions', 'role', 'roles', 'occupation']);
const EDU_WORDS = new Set(['education', 'educations', 'school', 'schools', 'degree', 'degrees', 'qualification', 'qualifications', 'university', 'college', 'institution']);
const NEUTRAL_WORDS = new Set(['history', 'entry', 'entries', 'record', 'records', 'item', 'items', 'section', 'row']);
const ADD_CLASS = /add[-_ ]?another|array-button-add|addrowfor_|datasetfield__addbutton|\badd[-_]?(more|row|entry)\b/i;

interface AddLabel { work: boolean; edu: boolean; bare: boolean }

/** "Add", "+ Add another job", "Add education"... ; null when the label is not of that shape. */
function parseAddLabel(raw: string): AddLabel | null {
  const lab = words(raw.replace(/^[+\s]+|[+\s]+$/g, ''));
  if (!/^add\b/.test(lab)) return null;
  const toks = lab.slice(3).split(' ').filter(Boolean);
  let work = false;
  let edu = false;
  for (const t of toks) {
    if (WORK_WORDS.has(t)) work = true;
    else if (EDU_WORDS.has(t)) edu = true;
    else if (!NEUTRAL_WORDS.has(t) && !FILLER.has(t)) return null;
  }
  return { work, edu, bare: toks.length === 0 };
}

const labelOfAction = (b: HTMLElement) =>
  (b.getAttribute('aria-label') || (b instanceof HTMLInputElement ? b.value : b.textContent) || '').replace(/\s+/g, ' ').trim();

/** Number of ancestor steps between two elements through their closest common container. */
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

/** Buttons or links that would add one more entry of this kind, closest to `near` first. */
export function addButtonsFor(kind: EntryKind, near: Element | null, opts: DetectOptions): HTMLElement[] {
  let pageKinds: Set<EntryKind> | null = null;
  const kindsOnPage = () => (pageKinds ??= new Set(classifyEntryFields(detectFields(document, opts)).map((e) => e.kind)));

  const found: HTMLElement[] = [];
  for (const b of Array.from(document.querySelectorAll<HTMLElement>(ACTION_SEL))) {
    if ((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') continue;
    if (!opts.skipVisibilityCheck && (b.getClientRects().length === 0 || b.closest('[hidden], [aria-hidden="true"]'))) continue;

    const text = labelOfAction(b);
    const parsed = parseAddLabel(text);
    const cls = `${b.getAttribute('class') ?? ''} ${b.id}`;
    const classHit = ADD_CLASS.test(cls);
    if (!parsed && !classHit) continue;
    if (!parsed && /^\+?\s*add\b/i.test(text)) continue; // "Add skill", "Add a reference": some other list

    const idKind: EntryKind | null = /experiencedata/i.test(b.id) ? 'work' : /educationdata/i.test(b.id) ? 'edu' : null;
    if (idKind) { if (idKind === kind) found.push(b); continue; }
    if (parsed?.work && parsed.edu) continue;
    if (parsed?.work || parsed?.edu) { if ((parsed.work ? 'work' : 'edu') === kind) found.push(b); continue; }

    // no section words: it has to be shown to belong to this kind of section
    const sk = sectionOf(b);
    if (sk) { if (sk === kind) found.push(b); continue; }
    if (!classHit && parsed?.bare) continue; // a lone "Add" somewhere on the page is never ours
    const kinds = kindsOnPage();
    if (kinds.size === 1 && kinds.has(kind)) found.push(b);
  }
  if (!near) return found;
  return found
    .map((b, i) => ({ b, i, d: distance(near, b) }))
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .map((x) => x.b);
}

/**
 * Click "add" until the page shows `needed` entries (at most 8). Waits a bounded time after each click for new
 * fields to appear and stops as soon as nothing grows or there is no button. Returns the entry count.
 */
export async function ensureEntryCount(
  kind: EntryKind,
  needed: number,
  opts: DetectOptions = {},
  root: ParentNode = document,
): Promise<number> {
  const cap = Math.min(needed, 8);
  const snapshot = () => {
    const mine = classifyEntryFields(detectFields(root, opts)).filter((e) => e.kind === kind);
    const last = Math.max(-1, ...mine.map((e) => e.index));
    const near = mine.find((e) => e.index === last && e.key === (kind === 'work' ? 'work.company' : 'edu.school'))?.f.el ??
      mine.find((e) => e.index === last)?.f.el ?? null;
    return { count: new Set(mine.map((e) => e.index)).size, near };
  };

  let cur = snapshot();
  while (cur.count < cap) {
    const btn = addButtonsFor(kind, cur.near, opts)[0];
    if (!btn) break;
    const before = cur.count;
    tap(btn);
    const grown = await poll(() => (snapshot().count > before ? true : null), 3000, 60);
    if (!grown) break;
    await wait(150); // let the rest of the new block mount
    cur = snapshot();
  }
  return cur.count;
}
