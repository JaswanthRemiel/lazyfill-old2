/**
 * A small driver shared by the work-history handlers (Meta, Google, TikTok/ByteDance): for each profile item, leave
 * it alone if the page already shows it, reuse an empty entry if there is one, otherwise add exactly one new entry,
 * and let the site-specific code fill that entry. Also holds a few DOM helpers those handlers have in common.
 */
import { addNextEntry, norm } from './siteKit';

export interface EntrySite<J> {
  /** The entries currently on the page (identity must be stable between calls). */
  entries(): Element[];
  /** Does this entry already show the item? */
  matches(entry: Element, item: J): boolean;
  /** Is this entry untouched? */
  isEmpty(entry: Element): boolean;
  /** The control that adds one more entry, or null when there is none. */
  add(): HTMLElement | null;
  /** Fills one entry. Errors are caught by the driver. */
  fill(entry: Element, item: J): Promise<void>;
}

/** Walks the items in order. Never adds more entries than there are items that need one. */
export async function driveEntries<J>(items: J[], site: EntrySite<J>): Promise<void> {
  const used = new Set<Element>();
  for (const item of items) {
    try {
      const have = site.entries().find((e) => !used.has(e) && site.matches(e, item));
      if (have) { used.add(have); continue; }
      let entry = site.entries().find((e) => !used.has(e) && site.isEmpty(e)) ?? null;
      if (!entry) {
        const add = site.add();
        if (!add) continue;
        entry = await addNextEntry(add, () => site.entries());
        if (!entry) continue;
      }
      used.add(entry);
      await site.fill(entry, item);
    } catch (e) {
      console.debug('lazyfill: entry skipped', e);
    }
  }
}

/** Runs one step, swallowing errors so a single bad field never stops the rest. */
export async function guard<T>(step: () => T | Promise<T>, fallback: T): Promise<T> {
  try { return await step(); } catch (e) { console.debug('lazyfill: step failed', e); return fallback; }
}

/** Text that names a control: aria-label, label elements, aria-labelledby, placeholder. Normalised. */
export function labelOf(el: Element): string {
  const parts: string[] = [el.getAttribute('aria-label') ?? ''];
  const labels = (el as HTMLInputElement).labels;
  if (labels) for (const l of Array.from(labels)) parts.push(l.textContent ?? '');
  const by = el.getAttribute('aria-labelledby');
  if (by) for (const id of by.split(/\s+/)) parts.push(document.getElementById(id)?.textContent ?? '');
  parts.push(el.getAttribute('placeholder') ?? '');
  return norm(parts.join(' '));
}

/**
 * The box that holds one entry: the largest ancestor of `control` containing a single `anchor` and none of the
 * `stop` selector (which marks a neighbouring section). Null when the control has no such ancestor.
 */
export function boxAround(control: Element, anchor: string, stop?: string): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (let p = control.parentElement; p && !/^(BODY|HTML)$/.test(p.tagName); p = p.parentElement) {
    if (p.querySelectorAll(anchor).length !== 1) break;
    if (stop && p.querySelector(stop)) break;
    best = p;
  }
  return best;
}

/** Resolves after the given number of milliseconds. */
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Is a checkbox-like control ticked (native input or role=checkbox)? */
export function isTicked(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}

/** Ticks or unticks a checkbox-like control to match `want`, trying the control and then its label. */
export async function setTicked(el: HTMLElement, want: boolean): Promise<boolean> {
  if (isTicked(el) === want) return true;
  el.click();
  if (isTicked(el) === want) return true;
  const label = (el as HTMLInputElement).labels?.[0] ?? el.closest('label');
  if (label) label.click();
  await wait(30);
  return isTicked(el) === want;
}
