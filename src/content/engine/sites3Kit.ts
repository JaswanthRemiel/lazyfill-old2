/**
 * Small helpers shared by the SmartRecruiters, Jobvite and Workable handlers (sites3 family).
 * DOM-only; nothing here knows about a particular career site.
 */
import { setNativeValue } from './fill';
import { deepQueryAll, fire, norm } from './siteKit';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Writes a value into an input or textarea with events that also cross shadow roots (composed). True when the
 * value stuck. Used for controls inside web components, where the plain helpers would not reach the host.
 */
export function setComposed(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new InputEvent('input', { data: value, inputType: 'insertText', bubbles: true, composed: true }));
  fire(el, ['change']);
  el.dispatchEvent(new FocusEvent('blur', { composed: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
  return el.value === value;
}

/** Picks the first option of a native select whose text or value equals (then contains) one of the wanted strings. */
export function chooseNative(sel: HTMLSelectElement, wanted: string[]): boolean {
  const opts = Array.from(sel.options).filter((o) => o.value !== '' || norm(o.textContent) !== '');
  const ws = wanted.map(norm).filter(Boolean);
  const textOf = (o: HTMLOptionElement) => norm(o.textContent);
  let hit: HTMLOptionElement | undefined;
  for (const w of ws) { hit = opts.find((o) => textOf(o) === w || norm(o.value) === w); if (hit) break; }
  if (!hit) {
    for (const w of ws) {
      if (w.length < 3) continue;
      hit = opts.find((o) => textOf(o).includes(w) || (textOf(o).length >= 3 && w.includes(textOf(o))));
      if (hit) break;
    }
  }
  if (!hit) return false;
  setNativeValue(sel, hit.value);
  sel.selectedIndex = hit.index;
  fire(sel, ['input', 'change']);
  sel.dispatchEvent(new FocusEvent('blur'));
  return sel.value === hit.value;
}

/** Ticks a checkbox if it is not ticked yet; true when it ends up checked. Never unticks. */
export function tick(box: HTMLInputElement): boolean {
  if (box.checked) return true;
  box.click();
  if (!box.checked) {
    box.checked = true;
    fire(box, ['input', 'change']);
  }
  return box.checked;
}

/** Whether a free text matches a wanted name loosely (either contains the other, 3+ characters). */
export function sameName(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x)));
}

/** Like deepQueryAll, but also looks in the shadow root of `root` itself (deepQueryAll only enters descendants' roots). */
export function deepAll<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  const own = (root as Element).shadowRoot;
  const inner = own ? deepQueryAll<T>(own, selector) : [];
  const out = [...deepQueryAll<T>(root, selector)];
  for (const e of inner) if (!out.includes(e)) out.push(e);
  return out;
}

/** First match of `selector` in `root`, its descendants or any open shadow root among them (including root's own). */
export const deepFirst = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null =>
  deepAll<T>(root, selector)[0] ?? null;
