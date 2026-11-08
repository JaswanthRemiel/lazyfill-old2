import { forLabel } from './detect';
import { isPlaceholderOption, matchOption } from './options';
import type { FieldEl, MatchKey } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fire(el: Element, type: string, init: EventInit = {}) {
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...init }));
}

/**
 * Frameworks like React track the value themselves and ignore a plain
 * `el.value = x`. Going through the prototype setter makes them see the change.
 */
export function setNativeValue(el: FieldEl, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
}

function commit(el: FieldEl) {
  fire(el, 'input');
  fire(el, 'change');
  el.dispatchEvent(new FocusEvent('blur'));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

export function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  el.focus();
  setNativeValue(el, value);
  commit(el);
  return el.value === value;
}

export function fillSelect(el: HTMLSelectElement, desired: string, key: MatchKey | 'custom'): boolean {
  const opts = Array.from(el.options);
  let i = matchOption(opts.map((o) => o.textContent ?? ''), desired, key);
  if (i < 0) i = matchOption(opts.map((o) => o.value), desired, key);
  if (i < 0) return false;
  setNativeValue(el, opts[i].value);
  el.selectedIndex = i;
  commit(el);
  return true;
}

export function radioLabel(r: HTMLInputElement): string {
  return forLabel(r) || r.getAttribute('aria-label') || r.value;
}

export function fillRadio(group: HTMLInputElement[], desired: string, key: MatchKey | 'custom'): boolean {
  let i = matchOption(group.map(radioLabel), desired, key);
  if (i < 0) i = matchOption(group.map((r) => r.value), desired, key);
  if (i < 0) return false;
  group[i].click(); // a real click is what React/Vue radios listen for
  return group[i].checked;
}

async function waitFor<T>(get: () => T | null | undefined | false, timeout = 1500, step = 50): Promise<T | null> {
  const end = Date.now() + timeout;
  do {
    const v = get();
    if (v) return v;
    await sleep(step);
  } while (Date.now() < end);
  return null;
}

function optionsFor(el: HTMLInputElement): HTMLElement[] {
  const ids = (el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns') ?? '').split(/\s+/).filter(Boolean);
  const root = el.getRootNode() as Document | ShadowRoot;
  for (const id of ids) {
    const lb = root.getElementById?.(id);
    const found = lb?.querySelectorAll<HTMLElement>('[role="option"]');
    if (found?.length) return Array.from(found);
  }
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
}

function press(el: HTMLElement) {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

/** Type into a searchable dropdown (react-select, autocomplete) and pick the matching option. */
export async function fillCombobox(el: HTMLInputElement, desired: string, key: MatchKey | 'custom'): Promise<boolean> {
  el.focus();
  press(el); // many comboboxes only render options once opened
  setNativeValue(el, desired);
  fire(el, 'input');
  const opts = await waitFor(() => {
    const o = optionsFor(el).filter((x) => x.textContent?.trim());
    return o.length ? o : null;
  });
  const i = opts ? matchOption(opts.map((o) => o.textContent ?? ''), desired, key) : -1;
  if (!opts || i < 0) {
    setNativeValue(el, '');
    fire(el, 'input');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  }
  press(opts[i]);
  await sleep(60);
  return true;
}

export function fillFile(el: HTMLInputElement, file: { fileName: string; mimeType: string; base64: string }): boolean {
  if (typeof DataTransfer === 'undefined') return false;
  const bin = atob(file.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], file.fileName, { type: file.mimeType }));
  el.files = dt.files;
  fire(el, 'input');
  fire(el, 'change');
  return el.files?.length === 1;
}

/** Does the control already hold a user/site-provided answer? */
export function hasValue(el: FieldEl, group?: HTMLInputElement[]): boolean {
  if (group) return group.some((r) => r.checked);
  if (el instanceof HTMLSelectElement) {
    const o = el.selectedOptions[0];
    return !!o && el.value !== '' && !isPlaceholderOption(o.textContent ?? '', o.value);
  }
  if (el instanceof HTMLInputElement && el.type === 'file') return (el.files?.length ?? 0) > 0;
  return el.value.trim() !== '';
}
