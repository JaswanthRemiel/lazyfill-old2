import type { ProfileData } from '../../shared/profile';
import { detectFields, type DetectOptions } from './detect';
import { addButtonsFor, classifyEntryFields, fillEntryField, wait, type EntryField, type EntryKind } from './entries';
import { hasValue, setNativeValue } from './fill';
import { matchOption } from './options';
import type { FieldInfo } from './types';

/** Sites like Workday and Oracle add one entry at a time: click Add, fill the form that opens, press Save. */

export function press(el: HTMLElement) {
  el.scrollIntoView?.({ block: 'center' });
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

export async function until<T>(get: () => T | null | undefined | false, timeout: number, step = 80): Promise<T | null> {
  const end = Date.now() + timeout;
  do {
    const v = get();
    if (v) return v;
    await wait(step);
  } while (Date.now() < end);
  return null;
}

const SAVE = /^(save|done|ok|add|apply|confirm|continue|submit)( (and|&) (close|continue))?$|^save( changes| entry| experience| skill)?$/i;
const text = (b: HTMLElement) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();

/** The save/done button of the form that holds `fields`, if there is one. */
function saveButtonFor(fields: Element[]): HTMLElement | null {
  const first = fields[0];
  for (let n = first?.parentElement ?? null; n && n !== document.body; n = n.parentElement) {
    const btns = Array.from(n.querySelectorAll<HTMLElement>('button, [role="button"], input[type="button"], input[type="submit"]'))
      .filter((b) => !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true')
      .filter((b) => SAVE.test(b instanceof HTMLInputElement ? b.value : text(b)));
    // the add-another button is not the save button
    const real = btns.filter((b) => !/add (another|more)/i.test(text(b)));
    if (real.length) return real[real.length - 1];
    if (n.matches('dialog, [role="dialog"], form')) break;
  }
  return null;
}

const gone = (els: Element[]) => els.every((e) => !e.isConnected || (e as HTMLElement).getClientRects().length === 0 && !!document.body.getClientRects().length);

// ---- work experience / education ----

/**
 * Add entry `index` the one-by-one way. Returns false when the page has no such Add button
 * or the form never opened.
 */
export async function addAndFillEntry(
  kind: EntryKind,
  index: number,
  p: ProfileData,
  opts: DetectOptions,
  fill: (ef: EntryField) => Promise<void> = async (ef) => { await fillEntryField(ef, p); },
): Promise<boolean> {
  const known = new Set(classifyEntryFields(detectFields(document, opts)).map((e) => e.f.el));
  const btn = addButtonsFor(kind, null, opts)[0];
  if (!btn) return false;
  press(btn);

  const opened = await until(() => {
    const now = classifyEntryFields(detectFields(document, opts)).filter((e) => e.kind === kind && !known.has(e.f.el));
    return now.length ? now : null;
  }, 4000);
  if (!opened) return false;
  await wait(250); // let the rest of the form mount

  const filled: Element[] = [];
  for (let round = 0; round < 3; round++) {
    const mine = classifyEntryFields(detectFields(document, opts))
      .filter((e) => e.kind === kind && !known.has(e.f.el))
      .map((e) => ({ ...e, index })); // the form shows one entry; its own numbering means nothing
    let again = false;
    for (const ef of mine) {
      if (ef.f.kind !== 'checkbox' && hasValue(ef.f.el, ef.f.group)) { filled.push(ef.f.el); continue; }
      await fill(ef);
      filled.push(ef.f.el);
      if (ef.f.kind !== 'checkbox') again = true;
    }
    if (!again) break;
    await wait(300);
  }

  const save = saveButtonFor(filled);
  if (save) {
    press(save);
    await until(() => gone(filled), 3000);
    await wait(250);
  }
  return true;
}

// ---- skills ----

const SKILL_LABEL = /\bskills?\b|technolog(y|ies)|tech stack/i;
const NOT_SKILL = /years?|level|rating|experience in|how many|describe|why/i;

function isSkillField(f: FieldInfo): boolean {
  if (f.kind !== 'text' && f.kind !== 'combobox' && f.kind !== 'textarea') return false;
  const sig = [f.label, f.aria, f.placeholder, f.name, f.id].join(' ');
  return SKILL_LABEL.test(sig) && !NOT_SKILL.test(`${f.label} ${f.aria}`);
}

const key = (el: HTMLElement, k: string, type: string) =>
  el.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, bubbles: true, cancelable: true }));

/** Type one skill into a chip/search input and commit it: pick the matching suggestion, else press Enter. */
async function addChip(input: HTMLInputElement, skill: string, opts: DetectOptions): Promise<boolean> {
  input.focus();
  setNativeValue(input, skill);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const root = input.getRootNode() as Document | ShadowRoot;
  const ids = (input.getAttribute('aria-controls') ?? input.getAttribute('aria-owns') ?? '').split(/\s+/).filter(Boolean);
  const OPTION = '[role="option"], li.ui-menu-item, [data-automation-id="promptOption"], .select2-result-selectable, [class*="suggestion" i], [class*="autocomplete" i] li';
  const options = await until(() => {
    for (const id of ids) {
      const found = root.getElementById?.(id)?.querySelectorAll<HTMLElement>('[role="option"], li');
      if (found?.length) return Array.from(found);
    }
    const all = Array.from(document.querySelectorAll<HTMLElement>(OPTION)).filter(
      (o) => (opts.skipVisibilityCheck || o.getClientRects().length) && !/^no (items|results|matches)/i.test(o.textContent?.trim() ?? ''),
    );
    return all.length ? all : null;
  }, 1200);
  if (options) {
    const i = matchOption(options.map((o) => o.textContent ?? ''), skill, 'custom');
    const pick = options[i >= 0 ? i : 0];
    const box = pick.querySelector<HTMLInputElement>('input[type="checkbox"]'); // multi-select lists tick a box
    press(box ?? pick);
    await wait(150);
    // some widgets need their own "Add" button pressed to commit the pick
    for (let n: Element | null = input.parentElement, up = 0; n && up < 4; n = n.parentElement, up++) {
      const add = Array.from(n.querySelectorAll<HTMLElement>('button, [role="button"], input[type="button"]')).find(
        (b) => /^\+?\s*add$/i.test(b instanceof HTMLInputElement ? b.value : text(b)) && !(b as HTMLButtonElement).disabled,
      );
      if (add) { press(add); await wait(250); break; }
    }
    setNativeValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  for (const t of ['keydown', 'keypress', 'keyup']) key(input, 'Enter', t);
  await wait(150);
  return true;
}

/**
 * Add the profile's skills one at a time. Returns the elements it handled so the general pass leaves them alone.
 * Works for chip inputs (type, Enter) and for "Add skill" buttons that open a small form.
 */
export async function fillSkills(p: ProfileData, opts: DetectOptions, max = 15): Promise<Element[]> {
  const skills = [...new Set(p.skills.map((s) => s.trim()).filter(Boolean))].slice(0, max);
  if (!skills.length) return [];
  const handled: Element[] = [];

  const fields = detectFields(document, opts).filter(isSkillField);
  const area = fields.find((f) => f.kind === 'textarea');
  if (area && !hasValue(area.el)) {
    setNativeValue(area.el as HTMLTextAreaElement, skills.join(', '));
    area.el.dispatchEvent(new Event('input', { bubbles: true }));
    area.el.dispatchEvent(new Event('change', { bubbles: true }));
    handled.push(area.el);
  }

  const input = fields.find((f) => f.kind !== 'textarea');
  if (input) {
    handled.push(input.el);
    for (const s of skills) await addChip(input.el as HTMLInputElement, s, opts);
    return handled;
  }

  // no input yet: the site wants "Add skill" clicked for every one
  const addBtn = () =>
    Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a')).find(
      (b) => /^\+?\s*add\s+(a\s+|another\s+)?skills?$/i.test(text(b)) && (opts.skipVisibilityCheck || b.getClientRects().length > 0) && !(b as HTMLButtonElement).disabled,
    );
  for (const s of skills) {
    const btn = addBtn();
    if (!btn) break;
    const before = new Set(detectFields(document, opts).map((f) => f.el));
    press(btn);
    const field = await until(() => detectFields(document, opts).find((f) => !before.has(f.el) && (f.kind === 'text' || f.kind === 'combobox')), 3000);
    if (!field) break;
    await addChip(field.el as HTMLInputElement, s, opts);
    const save = saveButtonFor([field.el]);
    if (save) { press(save); await until(() => gone([field.el]), 3000); }
    handled.push(field.el);
    await wait(150);
  }
  return handled;
}
