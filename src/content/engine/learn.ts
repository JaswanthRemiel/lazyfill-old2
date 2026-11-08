import { normalizeLabel, type LearnedEntry } from '../../shared/learned';
import { groupLabel } from './detect';
import { fillCombobox, fillSelect, fillText, radioLabel } from './fill';
import { isPlaceholderOption, matchOption } from './options';
import type { FieldInfo } from './types';

/** Things we never remember: identifiers, secrets, one-time codes. */
const SENSITIVE = /pass(word|code)|\bssn\b|social security|national (id|insurance)|passport|card number|credit card|\bcvv\b|\bcvc\b|\biban\b|routing number|account number|\botp\b|verification code|captcha|one[- ]time|date of birth|\bdob\b|birth ?date/i;
/** Legal acknowledgements are the user's to give each time. */
const CONSENT = /\b(agree|consent|terms|privacy|certify|acknowledge|i understand|policy|accurate and complete)\b/i;

export type LearnKind = LearnedEntry['fieldType'];
export interface LearnField {
  kind: LearnKind;
  f: FieldInfo;
  /** the checkboxes of a multi-select question */
  boxes?: HTMLInputElement[];
  label: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const optionText = (o: HTMLOptionElement) => clean(o.textContent ?? '');

export function questionLabel(f: FieldInfo): string {
  return clean(f.label || f.aria || f.placeholder || '');
}

function learnable(f: FieldInfo, label: string): boolean {
  if (label.length < 3 || label.length > 300) return false;
  if (SENSITIVE.test(`${label} ${f.name} ${f.id} ${f.autocomplete}`)) return false;
  const el = f.el as HTMLInputElement;
  if (el.type === 'search' || el.getAttribute('role') === 'searchbox') return false;
  return true;
}

/** Turn the page's unmatched fields into questions we can remember (radio and checkbox groups collapse to one). */
export function toLearnFields(fields: FieldInfo[]): LearnField[] {
  const out: LearnField[] = [];
  const boxGroups = new Map<string, FieldInfo[]>();
  for (const f of fields) {
    if (f.kind === 'file') continue;
    if (f.kind === 'checkbox') {
      const n = f.name;
      if (n) boxGroups.set(n, [...(boxGroups.get(n) ?? []), f]);
      continue;
    }
    const label = questionLabel(f);
    if (!learnable(f, label)) continue;
    out.push({ kind: f.kind as LearnKind, f, label });
  }
  for (const group of boxGroups.values()) {
    if (group.length < 2) continue; // one lonely checkbox is almost always a consent
    const label = clean(groupLabel(group[0].el));
    if (!learnable(group[0], label) || CONSENT.test(label)) continue;
    out.push({ kind: 'checkboxes', f: group[0], boxes: group.map((g) => g.el as HTMLInputElement), label });
  }
  return out;
}

const labelOfBox = (b: HTMLInputElement) => radioLabel(b);

function comboboxText(el: HTMLInputElement): string {
  const box = el.closest('[class*="control" i], [class*="select" i], [role="combobox"]') ?? el.parentElement;
  const shown = box?.querySelector('[class*="singleValue" i], [class*="single-value" i], [class*="selected" i]');
  return clean(shown?.textContent ?? '') || clean(el.value);
}

/** What the user has chosen or typed right now, or null when there is nothing to remember. */
export function readAnswer(lf: LearnField): Omit<LearnedEntry, 'firstSeen' | 'lastUsed' | 'timesUsed' | 'lastUrl' | 'source' | 'originalLabel'> | null {
  const { f } = lf;
  const base = { selectedIndex: null as number | null, options: null as string[] | null };
  switch (lf.kind) {
    case 'text':
    case 'textarea': {
      const v = (f.el as HTMLInputElement).value.trim();
      return v ? { ...base, value: v, fieldType: lf.kind, selectedOptionText: null } : null;
    }
    case 'select': {
      const sel = f.el as HTMLSelectElement;
      const opt = sel.selectedOptions[0];
      if (!opt || sel.value === '' || isPlaceholderOption(optionText(opt), opt.value)) return null;
      const options = Array.from(sel.options).filter((o) => !isPlaceholderOption(optionText(o), o.value)).map(optionText);
      return { value: sel.value, fieldType: 'select', selectedOptionText: optionText(opt), selectedIndex: sel.selectedIndex, options };
    }
    case 'radio': {
      const group = f.group ?? [f.el as HTMLInputElement];
      const i = group.findIndex((r) => r.checked);
      if (i < 0) return null;
      return { value: group[i].value, fieldType: 'radio', selectedOptionText: radioLabel(group[i]), selectedIndex: i, options: group.map(radioLabel) };
    }
    case 'combobox': {
      const t = comboboxText(f.el as HTMLInputElement);
      return t ? { ...base, value: t, fieldType: 'combobox', selectedOptionText: t } : null;
    }
    case 'checkboxes': {
      const picked = (lf.boxes ?? []).filter((b) => b.checked).map(labelOfBox);
      return picked.length ? { value: picked, fieldType: 'checkboxes', selectedOptionText: picked, selectedIndex: null, options: (lf.boxes ?? []).map(labelOfBox) } : null;
    }
  }
}

const asText = (v: string | string[] | null | undefined) => (Array.isArray(v) ? v.join(', ') : v ?? '');
const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ''; } };

/** Long free-text answers ("why us?") belong to the company they were written for. */
export function allowedHere(lf: LearnField, entry: LearnedEntry, pageUrl: string): boolean {
  if (lf.kind !== 'textarea') return true;
  return hostOf(entry.lastUrl) === hostOf(pageUrl);
}

/** Put a remembered answer back. Returns true if the field now holds it. */
export async function replayAnswer(lf: LearnField, entry: LearnedEntry): Promise<boolean> {
  const text = asText(entry.selectedOptionText) || asText(entry.value);
  const { f } = lf;
  switch (lf.kind) {
    case 'text':
    case 'textarea':
      return fillText(f.el as HTMLInputElement | HTMLTextAreaElement, asText(entry.value));
    case 'select': {
      const sel = f.el as HTMLSelectElement;
      const opts = Array.from(sel.options);
      const byValue = opts.findIndex((o) => o.value === asText(entry.value) && o.value !== '');
      const sameList = !!entry.options && entry.selectedIndex !== null
        && JSON.stringify(entry.options) === JSON.stringify(opts.filter((o) => !isPlaceholderOption(optionText(o), o.value)).map(optionText));
      if (byValue >= 0 && (sameList || optionText(opts[byValue]) === text)) return fillSelect(sel, optionText(opts[byValue]), 'custom');
      return fillSelect(sel, text, 'custom');
    }
    case 'radio': {
      const group = f.group ?? [f.el as HTMLInputElement];
      const i = matchOption(group.map(radioLabel), text, 'custom');
      if (i < 0) return false;
      group[i].click();
      return group[i].checked;
    }
    case 'combobox':
      return fillCombobox(f.el as HTMLInputElement, text, 'custom');
    case 'checkboxes': {
      const want = Array.isArray(entry.selectedOptionText) ? entry.selectedOptionText : [text];
      let any = false;
      for (const box of lf.boxes ?? []) {
        const label = labelOfBox(box);
        if (box.checked || CONSENT.test(label)) continue;
        if (want.some((w) => matchOption([label], w, 'custom') === 0)) {
          box.click();
          any = box.checked || any;
        }
      }
      return any;
    }
  }
}

export { normalizeLabel };
