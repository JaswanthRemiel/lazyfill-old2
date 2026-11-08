/**
 * Shared building blocks for the per-site form fillers (Workday, Meta, Google, TikTok, Avature and so on).
 *
 * The helpers here are deliberately small and DOM-only: text normalisation, firing events, writing into plain and
 * masked inputs, choosing an item from a list of option elements, locating the box that holds one repeated entry,
 * clicking "add" and waiting for the new entry, and the result type every site handler returns.
 */
import { MONTHS, parseYearMonth } from '../../shared/dates';
import type { WorkExperience } from '../../shared/profile';
import { fillText, setNativeValue } from './fill';
import { press, until } from './repeaters';
import type { FilledKey } from './types';

/** Re-exported from repeaters.ts: click with the full pointer sequence, and poll with a bounded timeout. */
export { press, until };

// ---- text and visibility ----

/** Collapses whitespace, trims and lower-cases. */
export const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The visible label of a control: aria-label, else its text (or value for input buttons), normalised. */
export function textOf(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return norm(aria);
  return norm(el instanceof HTMLInputElement ? el.value : el.textContent);
}

/** Is the element laid out? jsdom has no layout, so callers can pass `skip` (from `skipVisibilityCheck`). */
export function isShown(el: Element, skip = false): boolean {
  if (skip) return true;
  return (el as HTMLElement).getClientRects().length > 0 && !el.closest('[hidden], [aria-hidden="true"]');
}

/** A control that can be clicked: not disabled, not aria-disabled. */
export const isEnabled = (el: Element): boolean =>
  !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';

// ---- events ----

/** Dispatches each named event on the element (bubbling, composed so it also crosses shadow roots). */
export function fire(el: Element, types: string[], init: EventInit = {}): void {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, composed: true, ...init }));
}

const KEY_CODES: Record<string, { code: string; keyCode: number }> = {
  Enter: { code: 'Enter', keyCode: 13 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  Escape: { code: 'Escape', keyCode: 27 },
  Tab: { code: 'Tab', keyCode: 9 },
};

/** A full keydown, keypress, keyup sequence with key, code, keyCode, which and charCode filled in. */
export function pressKey(el: Element, key: string): void {
  const known = KEY_CODES[key];
  const keyCode = known?.keyCode ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  const init = { key, code: known?.code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key), bubbles: true, cancelable: true, composed: true };
  for (const type of ['keydown', 'keypress', 'keyup']) {
    const ev = new KeyboardEvent(type, init);
    for (const [prop, val] of [['keyCode', keyCode], ['which', keyCode], ['charCode', type === 'keypress' ? keyCode : 0]] as const) {
      Object.defineProperty(ev, prop, { get: () => val });
    }
    el.dispatchEvent(ev);
  }
}

// ---- writing into controls ----

/** Sets a text control the way a user would (focus, native setter, input/change/blur). True when the value stuck. */
export function setText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  return fillText(el, value) && el.value === value;
}

const sameChars = (a: string, b: string) => a.replace(/[^a-z0-9]/gi, '') === b.replace(/[^a-z0-9]/gi, '');

/**
 * Types `text` one character at a time with key and input events, for masked inputs such as MM/YYYY.
 * A separator the mask already inserted is not typed twice. True when the final value matches.
 */
export async function typeInto(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  opts: { clear?: boolean; delayMs?: number } = {},
): Promise<boolean> {
  el.focus();
  if (opts.clear !== false && el.value) {
    setNativeValue(el, '');
    fire(el, ['input']);
  }
  for (const ch of text) {
    if (/[/\-.]/.test(ch) && el.value.endsWith(ch)) continue;
    const key = (type: string) => el.dispatchEvent(new KeyboardEvent(type, { key: ch, bubbles: true, cancelable: true, composed: true }));
    key('keydown');
    key('keypress');
    setNativeValue(el, el.value + ch);
    el.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true, composed: true }));
    key('keyup');
    await new Promise((r) => setTimeout(r, opts.delayMs ?? 2));
  }
  fire(el, ['change']);
  el.dispatchEvent(new FocusEvent('blur', { composed: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
  return el.value === text || sameChars(el.value, text);
}

// ---- dates and places ----

export type DateStyle = 'MM/YYYY' | 'MM-YYYY' | 'YYYY/MM' | 'YYYY-MM';

/** A profile date in the given style; '' when the year or month is unknown. */
export function dateString(raw: string, style: DateStyle): string {
  const { year, month } = parseYearMonth(raw);
  if (!year || !month) return '';
  const mm = String(month).padStart(2, '0');
  switch (style) {
    case 'MM/YYYY': return `${mm}/${year}`;
    case 'MM-YYYY': return `${mm}-${year}`;
    case 'YYYY/MM': return `${year}/${mm}`;
    case 'YYYY-MM': return `${year}-${mm}`;
  }
}

/** Full English name of the month in a profile date, or ''. */
export function monthNameOf(raw: string): string {
  const { month } = parseYearMonth(raw);
  return month ? MONTHS[month - 1] : '';
}

/** "City, State, Country" split into its trimmed, non-empty parts. */
export const locationParts = (loc: string): string[] => loc.split(',').map((s) => s.trim()).filter(Boolean);
/** The city: first part of a location. */
export const cityOf = (loc: string): string => locationParts(loc)[0] ?? '';
/** The country: last part of a location when there is more than one part. */
export const countryOf = (loc: string): string => { const p = locationParts(loc); return p.length > 1 ? p[p.length - 1] : ''; };

// ---- choosing from a list of option elements ----

const NO_RESULTS = /^(no (results?|options?|items?|matches|data|suggestions)|nothing found|loading|searching)\b/;
const usable = (o: Element) => { const t = norm(o.textContent); return !!t && !NO_RESULTS.test(t); };

/** Elements matching `selector` under `root` that are shown and are not a "no results" placeholder. */
export function visibleOptions(root: ParentNode, selector: string, skipVisibility = false): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((o) => usable(o) && isShown(o, skipVisibility));
}

/**
 * Picks the option whose text equals one of the wanted strings, else one that contains or is contained by it,
 * else (unless `strict`) the first usable option. Clicks it and returns it; null when nothing was chosen.
 */
export function pickOption(
  options: HTMLElement[],
  wanted: string | string[],
  opts: { strict?: boolean; click?: boolean } = {},
): HTMLElement | null {
  const list = options.filter(usable);
  const wants = (Array.isArray(wanted) ? wanted : [wanted]).map(norm).filter(Boolean);
  let hit: HTMLElement | undefined;
  for (const w of wants) { hit = list.find((o) => norm(o.textContent) === w); if (hit) break; }
  if (!hit) {
    for (const w of wants) {
      hit = list.find((o) => { const t = norm(o.textContent); return t.length >= 2 && (t.includes(w) || w.includes(t)); });
      if (hit) break;
    }
  }
  if (!hit && !opts.strict) hit = list[0];
  if (!hit) return null;
  if (opts.click !== false) press(hit);
  return hit;
}

// ---- repeated entries ----

/**
 * The box holding exactly one entry: the largest ancestor of `control` that contains a single element matching
 * `anchorSelector` (a control every entry has once, such as its employer field). Never the page body; null when there is none.
 */
export function entryBox(control: Element, anchorSelector: string): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (let p = control.parentElement; p && !/^(BODY|HTML)$/.test(p.tagName); p = p.parentElement) {
    const n = p.querySelectorAll(anchorSelector).length;
    if (n > 1) break;
    if (n === 1) best = p;
  }
  return best;
}

/** Clicks an add control and waits up to `timeoutMs` for an entry that was not there before; returns it. */
export async function addNextEntry(add: HTMLElement, entries: () => Element[], timeoutMs = 4000): Promise<Element | null> {
  const before = new Set(entries());
  press(add);
  const fresh = await until(() => entries().find((e) => !before.has(e)), timeoutMs);
  if (fresh) await new Promise((r) => setTimeout(r, 120)); // let the new entry finish mounting
  return fresh;
}

/** An enabled button/link/role=button under `root` whose aria-label or text equals (first) or contains the label. */
export function findButton(
  root: ParentNode,
  label: string | RegExp | (string | RegExp)[],
  opts: { exact?: boolean; visible?: boolean } = {},
): HTMLElement | null {
  const labels = Array.isArray(label) ? label : [label];
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('button, a, [role="button"], input[type="button"], input[type="submit"]'))
    .filter((b) => isEnabled(b) && (!opts.visible || isShown(b)));
  const texts = (b: HTMLElement) => [norm(b.getAttribute('aria-label')), norm(b instanceof HTMLInputElement ? b.value : b.textContent)].filter(Boolean);
  for (const l of labels) {
    const hit = buttons.find((b) => texts(b).some((t) => (l instanceof RegExp ? l.test(t) : t === norm(l))));
    if (hit) return hit;
  }
  if (opts.exact) return null;
  for (const l of labels) {
    if (l instanceof RegExp) continue;
    const w = norm(l);
    const hit = w && buttons.find((b) => texts(b).some((t) => t.includes(w)));
    if (hit) return hit;
  }
  return null;
}

// ---- shadow DOM ----

/** querySelectorAll that also looks inside open shadow roots below `root`. */
export function deepQueryAll<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  const out: T[] = Array.from(root.querySelectorAll<T>(selector));
  for (const host of Array.from(root.querySelectorAll('*'))) {
    if (host.shadowRoot) out.push(...deepQueryAll<T>(host.shadowRoot, selector));
  }
  return out;
}

/** First match of `selector` under `root` or any open shadow root below it. */
export const deepQuery = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null =>
  deepQueryAll<T>(root, selector)[0] ?? null;

// ---- results ----

/** What a site handler reports: what it filled, which controls it wrote, and which sections it fully handled. */
export interface SiteResult {
  name: string;
  filled: { label: string; key: FilledKey }[];
  touched: Element[];
  work: boolean;
  edu: boolean;
}

/** An empty result for a handler that recognised the page. */
export const emptyResult = (name: string): SiteResult => ({ name, filled: [], touched: [], work: false, edu: false });

/** Records one field that really ended up set (ignores repeats of the same label and key). */
export function record(res: SiteResult, label: string, key: FilledKey, el?: Element | null): void {
  if (!res.filled.some((f) => f.label === label && f.key === key)) res.filled.push({ label, key });
  if (el && !res.touched.includes(el)) res.touched.push(el);
}

/** Merges the results of several handlers: names joined with "+", lists concatenated, flags OR-ed. */
export function mergeResults(list: SiteResult[]): SiteResult | null {
  if (!list.length) return null;
  const out = emptyResult(list.map((r) => r.name).join('+'));
  for (const r of list) {
    out.filled.push(...r.filled);
    out.touched.push(...r.touched);
    out.work ||= r.work;
    out.edu ||= r.edu;
  }
  return out;
}

/** The label reported for a work entry. */
export const workLabel = (w: Pick<WorkExperience, 'jobTitle' | 'companyName'>): string => `${w.jobTitle} @ ${w.companyName}`;
