/**
 * Small helpers private to the sites2 handlers (Avature, MathWorks, SAP UI5, Meta and Google education).
 * Kept apart from siteKit.ts, which is shared with other modules.
 */
import { isShown, norm } from './siteKit';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** jsdom (and any page without layout) reports no boxes for the body; real pages always do. */
export const noLayout = (): boolean => document.body.getClientRects().length === 0;

/** Is the element shown, treating a layout-less document as "everything is shown"? */
export const shown = (el: Element): boolean => isShown(el, noLayout());

/** Runs a step; a thrown error is logged at debug level and reported as false so the caller can carry on. */
export async function guard(what: string, fn: () => unknown): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    console.debug(`[lazyfill] ${what} failed`, err);
    return false;
  }
}

/** Same employer or school: equal, or one name starts with the other (after normalising). */
export function sameName(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * The largest ancestor of `from` that holds only one element matching `anchorSel` and nothing matching `forbidSel`
 * (so a box never reaches into the neighbouring entry or another section). Null when `from` has no usable parent.
 */
export function boxAround(from: Element, anchorSel: string, forbidSel?: string): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (let p = from.parentElement; p && !/^(BODY|HTML)$/.test(p.tagName); p = p.parentElement) {
    if (p.querySelectorAll(anchorSel).length > 1) break;
    if (forbidSel && p.querySelector(forbidSel)) break;
    best = p;
  }
  return best;
}

/** Everything that names a control: aria-label, placeholder, name, id, its labels. Normalised. */
export function ctlText(el: Element): string {
  const parts: (string | null | undefined)[] = [el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('name'), el.id];
  const labels = (el as HTMLInputElement).labels;
  if (labels) labels.forEach((l) => parts.push(l.textContent));
  const by = el.getAttribute('aria-labelledby');
  if (by) for (const id of by.split(/\s+/)) parts.push(el.ownerDocument.getElementById(id)?.textContent);
  return norm(parts.filter(Boolean).join(' '));
}

/** The element in `list` with this exact id (ids may contain characters that are awkward in selectors). */
export const byId = <T extends Element>(root: ParentNode, id: string): T | null =>
  (Array.from(root.querySelectorAll('[id]')).find((e) => e.id === id) as T | undefined) ?? null;

/** Is the profile date (year, month) after the current month? */
export function isFuture(year: string | undefined, month: number | undefined, now = new Date()): boolean {
  if (!year) return false;
  const y = Number(year);
  if (y !== now.getFullYear()) return y > now.getFullYear();
  return month !== undefined && month > now.getMonth() + 1;
}
