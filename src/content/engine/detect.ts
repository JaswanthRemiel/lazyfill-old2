import type { FieldEl, FieldInfo } from './types';

export interface DetectOptions {
  /** jsdom has no layout, so tests turn this off */
  skipVisibilityCheck?: boolean;
  /** also look inside open shadow roots. Costs a full-DOM walk, so background polling leaves it off. */
  deep?: boolean;
}

const clean = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/\(?\brequired\b\)?/gi, '').replace(/[*\u2731]/g, '').trim();

/** Elements in the document and in any open shadow roots. */
function collect(root: ParentNode, out: FieldEl[], deep: boolean): FieldEl[] {
  root.querySelectorAll<FieldEl>('input, select, textarea').forEach((e) => out.push(e));
  if (deep) {
    root.querySelectorAll<HTMLElement>('*').forEach((h) => {
      if (h.shadowRoot) collect(h.shadowRoot, out, true);
    });
  }
  return out;
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]') && !(el instanceof HTMLInputElement && el.type === 'file')) return false;
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** Visible text of an element, ignoring the form controls nested inside it. */
function ownText(node: Element): string {
  const c = node.cloneNode(true) as Element;
  c.querySelectorAll('input, select, textarea, option, script, style').forEach((x) => x.remove());
  return clean(c.textContent ?? '');
}

function byIds(el: Element, ids: string): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  return clean(
    ids
      .split(/\s+/)
      .map((id) => {
        const n = root.getElementById?.(id);
        return n ? ownText(n) : '';
      })
      .join(' '),
  );
}

export function forLabel(el: FieldEl): string {
  const texts: string[] = [];
  const labels = (el as HTMLInputElement).labels;
  if (labels) labels.forEach((l) => texts.push(ownText(l)));
  if (!texts.length) {
    const wrap = el.closest('label');
    if (wrap) texts.push(ownText(wrap));
  }
  return clean(texts.join(' '));
}

/** Text immediately before the control, for forms with no real <label>. */
function nearbyText(el: Element): string {
  let n: Element | null = el;
  for (let hops = 0; hops < 3 && n; hops++) {
    let prev = n.previousElementSibling;
    for (let i = 0; i < 2 && prev; i++, prev = prev.previousElementSibling) {
      if (prev.querySelector('input, select, textarea')) break;
      const t = ownText(prev);
      if (t && t.length <= 120) return t;
    }
    n = n.parentElement;
  }
  return '';
}

/** A question label that sits above a group of radios or a combobox. */
export function groupLabel(first: HTMLElement): string {
  const group = first.closest('[role="radiogroup"], [role="group"], fieldset');
  if (group) {
    const lb = group.getAttribute('aria-labelledby');
    if (lb) {
      const t = byIds(group, lb);
      if (t) return t;
    }
    const al = group.getAttribute('aria-label');
    if (al) return clean(al);
    const legend = group.querySelector('legend');
    if (legend) return ownText(legend);
  }
  let anc: HTMLElement | null = first.parentElement;
  for (let up = 0; up < 5 && anc; up++, anc = anc.parentElement) {
    for (const cand of Array.from(anc.querySelectorAll('legend, label, .label, [class*="label" i], h1, h2, h3, h4, h5, h6'))) {
      if (cand.querySelector('input, select, textarea')) continue; // an option's own label
      const f = (cand as HTMLLabelElement).htmlFor;
      if (f && anc.querySelector(`input[type="radio"]#${CSS.escape(f)}, input[type="checkbox"]#${CSS.escape(f)}`)) continue;
      const t = ownText(cand);
      if (t) return t;
    }
    // question text in a plain div/p/span that precedes the options
    for (const child of Array.from(anc.children)) {
      if (child.querySelector('input, select, textarea') || /^(SCRIPT|STYLE)$/.test(child.tagName)) continue;
      const t = ownText(child);
      if (t && t.length <= 200) return t;
    }
  }
  return '';
}

function describe(el: FieldEl): Pick<FieldInfo, 'placeholder' | 'aria' | 'name' | 'id' | 'autocomplete' | 'required'> {
  const labelledby = el.getAttribute('aria-labelledby');
  return {
    placeholder: clean(el.getAttribute('placeholder') ?? ''),
    aria: clean(el.getAttribute('aria-label') ?? '') || (labelledby ? byIds(el, labelledby) : ''),
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    autocomplete: (el.getAttribute('autocomplete') ?? '').split(/\s+/).pop() ?? '',
    required: (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true',
  };
}

export function detectFields(root: ParentNode = document, opts: DetectOptions = {}): FieldInfo[] {
  const fields: FieldInfo[] = [];
  const seenRadioGroups = new Set<string>();

  for (const el of collect(root, [], opts.deep ?? true)) {
    if (el.disabled || (el as HTMLInputElement).readOnly) continue;
    const type = el instanceof HTMLInputElement ? el.type : '';
    if (['hidden', 'submit', 'button', 'reset', 'image', 'password', 'range', 'color'].includes(type)) continue;
    if (type !== 'file' && !opts.skipVisibilityCheck && !isVisible(el)) continue;

    const base = describe(el);

    if (type === 'radio') {
      const nameKey = `${el.form?.id ?? ''}|${base.name}`;
      if (!base.name || seenRadioGroups.has(nameKey)) continue;
      seenRadioGroups.add(nameKey);
      const scope: ParentNode = el.form ?? (el.getRootNode() as Document | ShadowRoot);
      const group = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
        (r) => r.name === base.name && !r.disabled,
      );
      fields.push({ kind: 'radio', el, group, label: groupLabel(el) || forLabel(el), ...base });
      continue;
    }
    if (type === 'checkbox') {
      fields.push({ kind: 'checkbox', el, label: forLabel(el) || groupLabel(el), ...base });
      continue;
    }

    const labelledby = el.getAttribute('aria-labelledby');
    const label =
      (labelledby && byIds(el, labelledby)) || forLabel(el) || nearbyText(el) || (type === 'file' ? groupLabel(el) : '');
    const isCombo =
      el instanceof HTMLInputElement && (el.getAttribute('role') === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox');
    const kind = type === 'file' ? 'file' : el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLTextAreaElement ? 'textarea' : isCombo ? 'combobox' : 'text';
    fields.push({ kind, el, label, ...base });
  }
  return fields;
}
