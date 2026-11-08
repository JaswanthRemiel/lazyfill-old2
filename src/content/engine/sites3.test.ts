import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProfileData, type ProfileData } from '../../shared/profile';
import { deepAll as deepQueryAll, deepFirst as deepQuery } from './sites3Kit';
import { atsHandlers } from './sites3';
import { countryCode } from './jobvite';

const [smartRecruiters, jobvite, workable] = atsHandlers;

function profile(): ProfileData {
  const p = emptyProfileData();
  p.workExperience = [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London, England, United Kingdom', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Led the platform team.' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds, England, United Kingdom', startDate: '2018-09', endDate: '2021-02', isCurrent: false, description: 'Built compilers.' },
  ];
  p.education = [
    { schoolName: 'University of Atlantis', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2014-09', graduationDate: '2018-06', currentlyEnrolled: false },
  ];
  return p;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, parent?: Node): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
};
const custom = (tag: string, attrs: Record<string, string> = {}, parent?: Node): HTMLElement => el(tag as 'div', attrs, parent);

beforeAll(() => {
  // jsdom has no layout: make everything count as laid out unless hidden by attribute
  HTMLElement.prototype.getClientRects = function () { return [{}] as unknown as DOMRectList; };
});
beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------------
// SmartRecruiters

function splAutocomplete(parent: Node, dataTest: string, mode: 'click' | 'enter' = 'click'): HTMLElement {
  const host = custom('spl-autocomplete', { 'data-test': dataTest }, parent);
  const root = host.attachShadow({ mode: 'open' });
  const input = el('input', { class: 'c-spl-input' }, root);
  const dd = custom('spl-dropdown', {}, root);
  const choose = (t: string) => { input.value = t; dd.innerHTML = ''; };
  input.addEventListener('input', () => {
    dd.innerHTML = '';
    if (!input.value) return;
    for (const t of [input.value + ' Group', input.value]) {
      const opt = custom('spl-select-option', {}, dd);
      const o = opt.attachShadow({ mode: 'open' });
      const item = custom('spl-dropdown-item', {}, o);
      const i = item.attachShadow({ mode: 'open' });
      const btn = el('div', { class: 'c-spl-dropdown-item' }, i);
      btn.textContent = t;
      if (mode === 'click') btn.addEventListener('click', () => choose(t));
      else btn.addEventListener('click', () => { input.value = ''; });
    }
  });
  if (mode === 'enter') {
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') { const o = dd.querySelector('spl-select-option'); if (o) choose(deepQuery(o, '.c-spl-dropdown-item')!.textContent!); }
    });
  }
  return host;
}

function splDateField(parent: Node): HTMLElement {
  const host = custom('spl-date-field', {}, parent);
  const r = host.attachShadow({ mode: 'open' });
  const picker = custom('spl-date-picker', {}, r);
  const pr = picker.attachShadow({ mode: 'open' });
  el('input', { class: 'c-spl-date-picker-input' }, pr);
  return host;
}

function splCheckbox(parent: Node): HTMLElement {
  const host = custom('spl-checkbox', {}, parent);
  const r = host.attachShadow({ mode: 'open' });
  el('input', { type: 'checkbox' }, r);
  return host;
}

function splText(parent: Node, outer: string, inner: string, field: string, deeper: boolean): HTMLElement {
  const oc = custom(outer, { 'data-test': field }, parent);
  const sp = custom(inner, {}, oc);
  let root = sp.attachShadow({ mode: 'open' });
  if (deeper) { const f = custom('spl-internal-form-field', {}, root); root = f.attachShadow({ mode: 'open' }); }
  el(inner === 'spl-textarea' ? 'textarea' : 'input', { class: inner === 'spl-textarea' ? 'c-spl-textarea' : 'c-spl-input' }, root);
  return oc;
}

function addButton(parent: Node, test: string, onClick: () => void): HTMLElement {
  const oc = custom('oc-button', { 'data-test': test }, parent);
  const sp = custom('spl-button', {}, oc);
  const r = sp.attachShadow({ mode: 'open' });
  const b = el('button', {}, r);
  b.textContent = 'Add';
  b.addEventListener('click', onClick);
  return oc;
}

function workEntry(list: Node, opts: { noTitle?: boolean } = {}): HTMLElement {
  const e = el('div', { 'data-test': 'experience-entry' }, list);
  splAutocomplete(e, 'experience-company-autocomplete');
  if (!opts.noTitle) splAutocomplete(e, 'experience-job-title');
  splAutocomplete(e, 'experience-location-autocomplete');
  splDateField(e);
  splDateField(e);
  splCheckbox(e);
  splText(e, 'oc-textarea', 'spl-textarea', 'experience-description', true);
  return e;
}

function eduEntry(list: Node): HTMLElement {
  const e = el('div', { 'data-test': 'education-entry' }, list);
  splAutocomplete(e, 'institution-autocomplete');
  splText(e, 'oc-input', 'spl-input', 'education-degree', false);
  splText(e, 'oc-input', 'spl-input', 'education-major', true);
  splDateField(e);
  splDateField(e);
  splCheckbox(e);
  return e;
}

function srPage(opts: { workEntries?: number; eduEntries?: number } = {}) {
  const work = el('div', { id: 'work' }, document.body);
  const edu = el('div', { id: 'edu' }, document.body);
  for (let i = 0; i < (opts.workEntries ?? 1); i++) workEntry(work);
  for (let i = 0; i < (opts.eduEntries ?? 1); i++) eduEntry(edu);
  if (opts.workEntries !== 0) addButton(document.body, 'add-experience', () => workEntry(work));
  if (opts.eduEntries !== 0) addButton(document.body, 'add-education', () => eduEntry(edu));
  return { work, edu };
}

const val = (entry: Element, hostSel: string, inner = 'input') => {
  const host = deepQuery(entry, hostSel);
  return (host ? deepQuery<HTMLInputElement>(host, inner)?.value : '') ?? '';
};
const dates = (entry: Element) => deepQueryAll<HTMLInputElement>(entry, 'input.c-spl-date-picker-input').map((i) => i.value);

describe('SmartRecruiters', () => {
  it('returns null and touches nothing on other pages', async () => {
    document.body.innerHTML = '<form><input id="a"><button>Add</button></form>';
    const before = document.body.innerHTML;
    expect(await smartRecruiters(profile())).toBeNull();
    expect(document.body.innerHTML).toBe(before);
  });

  it('fills the empty entry, adds one for the second job, and reports each field', async () => {
    const { work } = srPage({ eduEntries: 0 });
    const res = await smartRecruiters(profile());
    expect(res).not.toBeNull();
    expect(res!.name).toBe('smartrecruiters');
    expect(res!.work).toBe(true);
    const entries = work.querySelectorAll('[data-test="experience-entry"]');
    expect(entries.length).toBe(2);
    const [a, b] = Array.from(entries);
    expect(val(a, '[data-test*="company"]')).toBe('Analytical Engines');
    expect(val(a, '[data-test="experience-job-title"]')).toBe('Staff Engineer');
    expect(val(a, '[data-test*="location"]')).toBe('London, England');
    expect(dates(a)).toEqual(['03/2021', '']);
    expect(deepQuery<HTMLInputElement>(deepQuery(a, 'spl-checkbox')!, 'input')!.checked).toBe(true);
    expect(val(a, 'oc-textarea', 'textarea')).toBe('Led the platform team.');
    expect(val(b, '[data-test*="company"]')).toBe('Difference Co');
    expect(val(b, '[data-test="experience-job-title"]')).toBe('Engineer');
    expect(dates(b)).toEqual(['09/2018', '02/2021']);
    expect(deepQuery<HTMLInputElement>(deepQuery(b, 'spl-checkbox')!, 'input')!.checked).toBe(false);
    const keys = res!.filled.filter((f) => f.label === 'Staff Engineer @ Analytical Engines').map((f) => f.key).sort();
    expect(keys).toEqual(['work.company', 'work.current', 'work.description', 'work.location', 'work.startDate', 'work.title']);
    expect(res!.filled.some((f) => f.label === 'Engineer @ Difference Co' && f.key === 'work.endDate')).toBe(true);
    expect(res!.touched.length).toBeGreaterThanOrEqual(10);
  }, 20000);

  it('a second run changes nothing and adds no entries', async () => {
    const { work } = srPage({ eduEntries: 0 });
    await smartRecruiters(profile());
    const snapshot = () => Array.from(work.querySelectorAll('[data-test="experience-entry"]')).map((e) => [
      val(e, '[data-test*="company"]'), val(e, '[data-test="experience-job-title"]'), dates(e).join('|'), val(e, 'oc-textarea', 'textarea'),
    ].join(';'));
    const first = snapshot();
    const res = await smartRecruiters(profile());
    expect(res!.filled).toEqual([]);
    expect(snapshot()).toEqual(first);
  }, 20000);

  it('leaves an entry that already shows the employer alone and only adds what is missing', async () => {
    const { work } = srPage({ eduEntries: 0, workEntries: 1 });
    const pre = work.querySelector('[data-test="experience-entry"]')!;
    deepQuery<HTMLInputElement>(deepQuery(pre, '[data-test*="company"]')!, 'input')!.value = 'Analytical Engines';
    const res = await smartRecruiters(profile());
    const entries = work.querySelectorAll('[data-test="experience-entry"]');
    expect(entries.length).toBe(2);
    expect(val(entries[0], '[data-test="experience-job-title"]')).toBe('');
    expect(val(entries[1], '[data-test*="company"]')).toBe('Difference Co');
    expect(res!.filled.every((f) => f.label.endsWith('Difference Co'))).toBe(true);
  }, 20000);

  it('does not add more entries than the profile has', async () => {
    const { work } = srPage({ eduEntries: 0, workEntries: 3 });
    const p = profile();
    p.workExperience = p.workExperience.slice(0, 1);
    await smartRecruiters(p);
    expect(work.querySelectorAll('[data-test="experience-entry"]').length).toBe(3);
  }, 20000);

  it('falls back to ArrowDown + Enter when clicking the suggestion leaves the box empty, and survives a missing field', async () => {
    const work = el('div', {}, document.body);
    const e = el('div', { 'data-test': 'experience-entry' }, work);
    splAutocomplete(e, 'experience-company-autocomplete', 'enter');
    // no title control at all
    splDateField(e);
    splDateField(e);
    const p = profile();
    p.workExperience = [p.workExperience[1]];
    const res = await smartRecruiters(p);
    expect(val(e, '[data-test*="company"]')).toBe('Difference Co Group');
    expect(res!.filled.map((f) => f.key)).toContain('work.company');
    expect(res!.filled.map((f) => f.key)).toContain('work.startDate');
    expect(res!.filled.map((f) => f.key)).not.toContain('work.title');
  }, 20000);

  it('one throwing control does not stop the other fields', async () => {
    const { work } = srPage({ eduEntries: 0 });
    const entry = work.querySelector('[data-test="experience-entry"]')!;
    const dd = deepQuery(entry, '[data-test="experience-job-title"]')!;
    Object.defineProperty(deepQuery(dd, 'input')!, 'focus', { value: () => { throw new Error('boom'); } });
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const p = profile();
    p.workExperience = [p.workExperience[0]];
    const res = await smartRecruiters(p);
    expect(res!.filled.map((f) => f.key)).not.toContain('work.title');
    expect(val(entry, 'oc-textarea', 'textarea')).toBe('Led the platform team.');
  }, 20000);

  it('fills education: school, plain degree and major, dates; a graduate gets an end date', async () => {
    const { edu } = srPage({ workEntries: 0 });
    const res = await smartRecruiters(profile());
    expect(res!.edu).toBe(true);
    const e = edu.querySelector('[data-test="education-entry"]')!;
    expect(val(e, '[data-test="institution-autocomplete"]')).toBe('University of Atlantis');
    expect(val(e, '[data-test="education-degree"]')).toBe('BSc');
    expect(val(e, '[data-test="education-major"]')).toBe('Mathematics');
    expect(dates(e)).toEqual(['09/2014', '06/2018']);
    expect(res!.filled.map((f) => f.key).sort()).toEqual(['edu.degree', 'edu.endDate', 'edu.field', 'edu.school', 'edu.startDate']);
    const again = await smartRecruiters(profile());
    expect(again!.filled).toEqual([]);
    expect(edu.querySelectorAll('[data-test="education-entry"]').length).toBe(1);
  }, 20000);

  it('currently enrolled: ticks the box and leaves the end date empty', async () => {
    const { edu } = srPage({ workEntries: 0 });
    const p = profile();
    p.education[0].currentlyEnrolled = true;
    await smartRecruiters(p);
    const e = edu.querySelector('[data-test="education-entry"]')!;
    expect(deepQuery<HTMLInputElement>(deepQuery(e, 'spl-checkbox')!, 'input')!.checked).toBe(true);
    expect(dates(e)).toEqual(['09/2014', '']);
  }, 20000);

  it('is recognised from a bare experience entry', async () => {
    const e = el('div', { 'data-test': 'experience-entry' }, document.body);
    e.textContent = 'Analytical Engines, Staff Engineer';
    const res = await smartRecruiters(profile());
    expect(res).not.toBeNull();
    expect(res!.filled.filter((f) => f.label.includes('Analytical'))).toEqual([]);
  }, 20000);
});

// ---------------------------------------------------------------------------------------------------------------
// Jobvite / Talemetry

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function muiSelect(parent: Node, label: string, options: string[], extra: Record<string, string> = {}): HTMLSelectElement {
  const fc = el('div', { class: 'MuiFormControl-root' }, parent);
  el('label', {}, fc).textContent = label;
  const s = el('select', extra, fc);
  s.innerHTML = '<option value=""></option>' + options.map((o) => `<option value="${o}">${o}</option>`).join('');
  return s;
}

function dateSet(parent: Node, legend: string, withSwitch: boolean): HTMLFieldSetElement {
  const fs = el('fieldset', {}, parent);
  el('legend', { class: 'BaseFieldLayout-inputLabelQuestion' }, fs).textContent = legend;
  muiSelect(fs, 'Month', MONTH_NAMES);
  muiSelect(fs, 'Year', Array.from({ length: 30 }, (_, i) => String(2026 - i)));
  if (withSwitch) {
    const base = el('span', { class: 'MuiSwitch-switchBase' }, fs);
    const sw = el('input', { type: 'checkbox', class: 'MuiSwitch-input' }, base);
    base.addEventListener('click', (e) => { if (e.target === base) sw.click(); });
  }
  return fs;
}

interface Snap { [k: string]: string }
function jobvitePage(opts: { cards?: { list: 'work' | 'edu'; title: string }[]; noState?: boolean } = {}) {
  const log: Snap[] = [];
  const root = el('div', {}, document.body);
  const mk = (kind: 'work' | 'edu') => {
    const wrap = el('div', {}, root);
    const list = el('div', { class: 'MultiFieldGroupList-root' }, wrap);
    for (const c of (opts.cards ?? []).filter((x) => x.list === kind)) card(list, c.title);
    const btn = el('button', {}, wrap);
    btn.textContent = kind === 'work' ? 'Add New Work History' : 'Add New Education History';
    btn.addEventListener('click', () => open(kind, wrap, list));
    return list;
  };
  const card = (list: Element, title: string) => {
    const c = el('div', { class: 'MultiFieldGroupCard-summaryRoot' }, list);
    el('span', { class: 'MultiFieldGroupCard-title' }, c).textContent = title;
  };
  const open = (kind: 'work' | 'edu', wrap: Element, list: Element) => {
    const form = el('div', { class: 'form' }, wrap);
    const text = (auto: string, tag: 'input' | 'textarea' = 'input') => el(tag, { autocomplete: `tm-form-${auto}` }, form);
    const pre = kind === 'work' ? 'field_wh_' : 'field_eh_';
    if (kind === 'work') { text('companyName'); text('title'); text('description', 'textarea'); } else { text('institution'); text('degree'); text('major'); }
    text('city');
    muiSelect(form, 'Country', ['United States', 'United Kingdom', 'India'].map((n) => n), { autocomplete: 'tm-form-country', id: `${pre}country` });
    const cs = form.querySelector<HTMLSelectElement>('select[autocomplete="tm-form-country"]')!;
    cs.innerHTML = '<option value=""></option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="IN">India</option>';
    if (!opts.noState) muiSelect(form, 'State', ['England', 'Scotland'], { autocomplete: 'tm-form-state', id: `${pre}state` });
    dateSet(form, 'Start date', false);
    dateSet(form, 'End date', true);
    const done = el('button', {}, form);
    done.innerHTML = '<svg data-testid="DoneIcon"></svg>Done';
    done.addEventListener('click', () => {
      const snap: Snap = {};
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[autocomplete]').forEach((c) => { snap[c.getAttribute('autocomplete')!.replace('tm-form-', '')] = c.value; });
      form.querySelectorAll('fieldset').forEach((fs) => {
        const k = fs.querySelector('legend')!.textContent!.startsWith('Start') ? 's' : 'e';
        const [m, y] = Array.from(fs.querySelectorAll('select'));
        snap[k] = `${m.value}/${y.value}`;
        snap[k + 'sw'] = String(fs.querySelector<HTMLInputElement>('input.MuiSwitch-input')?.checked ?? '');
      });
      log.push(snap);
      card(list, snap.companyName || snap.institution);
      form.remove();
    });
  };
  const w = mk('work');
  const e = mk('edu');
  return { log, w, e };
}

describe('Jobvite / Talemetry', () => {
  it('returns null on pages that are not Talemetry', async () => {
    document.body.innerHTML = '<button>Add New Job</button><input autocomplete="email">';
    expect(await jobvite(profile())).toBeNull();
  });

  it('adds each job and school through the card form and reports the fields', async () => {
    const { log, w, e } = jobvitePage();
    const res = await jobvite(profile());
    expect(res!.work && res!.edu).toBe(true);
    expect(log.length).toBe(3);
    expect(log[0]).toMatchObject({ companyName: 'Analytical Engines', title: 'Staff Engineer', description: 'Led the platform team.', city: 'London', country: 'GB', state: 'England', s: 'March/2021', e: '/', esw: 'true' });
    expect(log[1]).toMatchObject({ companyName: 'Difference Co', title: 'Engineer', s: 'September/2018', e: 'February/2021', esw: 'false' });
    expect(log[2]).toMatchObject({ institution: 'University of Atlantis', degree: 'BSc', major: 'Mathematics', s: 'September/2014', e: 'June/2018' });
    expect(w.querySelectorAll('.MultiFieldGroupCard-summaryRoot').length).toBe(2);
    expect(e.querySelectorAll('.MultiFieldGroupCard-summaryRoot').length).toBe(1);
    const keys = (l: string) => res!.filled.filter((f) => f.label === l).map((f) => f.key);
    expect(keys('Staff Engineer @ Analytical Engines')).toEqual(expect.arrayContaining(['work.company', 'work.title', 'work.description', 'work.location', 'work.startDate', 'work.current']));
    expect(keys('Staff Engineer @ Analytical Engines')).not.toContain('work.endDate');
    expect(keys('Engineer @ Difference Co')).toContain('work.endDate');
    expect(keys('University of Atlantis')).toEqual(expect.arrayContaining(['edu.school', 'edu.degree', 'edu.field', 'edu.startDate', 'edu.endDate']));
  }, 30000);

  it('second run adds nothing', async () => {
    const { log } = jobvitePage();
    await jobvite(profile());
    const n = log.length;
    const res = await jobvite(profile());
    expect(log.length).toBe(n);
    expect(res!.filled).toEqual([]);
  }, 30000);

  it('skips a job whose name already appears in a card title and adds the rest', async () => {
    const { log, w } = jobvitePage({ cards: [{ list: 'work', title: 'Analytical Engines - Staff Engineer' }] });
    await jobvite(profile());
    expect(log.map((l) => l.companyName || l.institution)).toEqual(['Difference Co', 'University of Atlantis']);
    expect(w.querySelectorAll('.MultiFieldGroupCard-summaryRoot').length).toBe(2);
  }, 30000);

  it('a missing state select does not stop the rest', async () => {
    const { log } = jobvitePage({ noState: true });
    const res = await jobvite(profile());
    expect(log[0].country).toBe('GB');
    expect(res!.filled.some((f) => f.key === 'work.startDate')).toBe(true);
    expect(log.length).toBe(3);
  }, 30000);

  it('only uses visible controls', async () => {
    jobvitePage();
    HTMLElement.prototype.getClientRects = function () { return this.closest('.form') && this.getAttribute('autocomplete') === 'tm-form-companyName' ? ([] as unknown as DOMRectList) : ([{}] as unknown as DOMRectList); };
    try {
      const p = profile();
      p.education = [];
      p.workExperience = p.workExperience.slice(0, 1);
      const res = await jobvite(p);
      expect(res!.filled).toEqual([]);
    } finally {
      HTMLElement.prototype.getClientRects = function () { return [{}] as unknown as DOMRectList; };
    }
  }, 30000);

  it('maps country names to codes', () => {
    expect(countryCode('USA')).toBe('US');
    expect(countryCode('United Kingdom')).toBe('GB');
    expect(countryCode('UK')).toBe('GB');
    expect(countryCode('India')).toBe('IN');
    expect(countryCode('Atlantis')).toBe('');
  });

  it('is recognised by tm-form autocomplete attributes alone and claims no section', async () => {
    document.body.innerHTML = '<input autocomplete="tm-form-city">';
    const res = await jobvite(profile());
    expect(res).not.toBeNull();
    expect(res!.work).toBe(false);
    expect(res!.edu).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Workable

function datepicker(input: HTMLInputElement) {
  let year = 2024;
  const open = () => {
    if (document.querySelector('.react-datepicker')) return;
    const pk = el('div', { class: 'react-datepicker' }, document.body);
    const head = el('div', { class: 'react-datepicker__current-month' }, pk);
    const render = () => { head.textContent = String(year); };
    render();
    const prev = el('button', { class: 'react-datepicker__navigation--previous' }, pk);
    const next = el('button', { class: 'react-datepicker__navigation--next' }, pk);
    prev.addEventListener('click', () => { year--; render(); });
    next.addEventListener('click', () => { year++; render(); });
    MONTH_NAMES.forEach((m, i) => {
      const c = el('div', { class: `react-datepicker__month-text react-datepicker__month-${i}` }, pk);
      c.textContent = m.slice(0, 3);
      c.addEventListener('click', () => { input.value = `${String(i + 1).padStart(2, '0')}/${year}`; pk.remove(); });
    });
  };
  input.addEventListener('click', open);
}

function workablePage(opts: { items?: { sec: 'experience' | 'education'; text: string }[]; disabled?: boolean } = {}) {
  const saved: Record<string, string>[] = [];
  const mkSection = (sec: 'experience' | 'education') => {
    const s = el('section', { 'data-ui': sec }, document.body);
    const ul = el('ul', {}, s);
    for (const it of (opts.items ?? []).filter((i) => i.sec === sec)) el('li', {}, ul).textContent = it.text;
    const add = el('button', { 'data-ui': 'add-section' }, s);
    add.textContent = 'Add';
    if (opts.disabled) add.setAttribute('disabled', '');
    add.addEventListener('click', () => {
      const ed = el('div', { 'data-ui': 'editor' }, s);
      const names = sec === 'experience' ? ['title', 'company'] : ['school', 'field_of_study', 'degree'];
      for (const n of names) el('input', { id: n, name: n }, ed);
      if (sec === 'experience') {
        el('textarea', { id: 'summary', name: 'summary' }, ed);
        el('input', { type: 'checkbox', name: 'current_role' }, ed);
      }
      for (const n of ['start_date', 'end_date']) {
        const group = el('div', { class: 'field-group' }, ed);
        const w = el('div', { class: 'react-datepicker-wrapper' }, group);
        const i = el('input', { name: n }, w);
        datepicker(i);
      }
      const save = el('button', { 'data-ui': 'save-section' }, ed);
      save.textContent = 'Save';
      save.addEventListener('click', () => {
        const q = (sel: string) => ed.querySelector<HTMLInputElement>(sel);
        const rec: Record<string, string> = {};
        ed.querySelectorAll<HTMLInputElement>('input, textarea').forEach((i) => { rec[i.name] = i.type === 'checkbox' ? String(i.checked) : i.value; });
        saved.push(rec);
        el('li', {}, ul).textContent = sec === 'experience' ? `${q('#title')!.value} ${q('#company')!.value}` : q('#school')!.value;
        ed.remove();
      });
    });
    return s;
  };
  mkSection('experience');
  mkSection('education');
  return { saved };
}

describe('Workable', () => {
  it('returns null on other pages', async () => {
    document.body.innerHTML = '<div data-ui="other"><button data-ui="add-section">Add</button></div>';
    expect(await workable(profile())).toBeNull();
    expect(document.querySelector('[data-ui="editor"]')).toBeNull();
  });

  it('fills, saves and adds each entry in turn', async () => {
    const { saved } = workablePage();
    const res = await workable(profile());
    expect(res!.work && res!.edu).toBe(true);
    expect(saved.length).toBe(3);
    expect(saved[0]).toMatchObject({ title: 'Staff Engineer', company: 'Analytical Engines', summary: 'Led the platform team.', start_date: '03/2021', end_date: '', current_role: 'true' });
    expect(saved[1]).toMatchObject({ title: 'Engineer', company: 'Difference Co', start_date: '09/2018', end_date: '02/2021', current_role: 'false' });
    expect(saved[2]).toMatchObject({ school: 'University of Atlantis', field_of_study: 'Mathematics', degree: 'BSc', start_date: '09/2014', end_date: '06/2018' });
    const keys = (l: string) => res!.filled.filter((f) => f.label === l).map((f) => f.key).sort();
    expect(keys('Staff Engineer @ Analytical Engines')).toEqual(['work.company', 'work.current', 'work.description', 'work.startDate', 'work.title']);
    expect(keys('Engineer @ Difference Co')).toEqual(['work.company', 'work.description', 'work.endDate', 'work.startDate', 'work.title']);
    expect(keys('University of Atlantis')).toEqual(['edu.degree', 'edu.endDate', 'edu.field', 'edu.school', 'edu.startDate']);
    expect(document.querySelector('[data-ui="editor"]')).toBeNull();
  }, 30000);

  it('second run changes nothing', async () => {
    const { saved } = workablePage();
    await workable(profile());
    const res = await workable(profile());
    expect(saved.length).toBe(3);
    expect(res!.filled).toEqual([]);
    expect(document.querySelectorAll('[data-ui="experience"] li').length).toBe(2);
  }, 30000);

  it('skips an existing entry showing title and company, and an existing school', async () => {
    const { saved } = workablePage({ items: [
      { sec: 'experience', text: 'Engineer at Difference Co 2018 - 2021' },
      { sec: 'education', text: 'University of Atlantis, BSc' },
    ] });
    await workable(profile());
    expect(saved.map((s) => s.company)).toEqual(['Analytical Engines']);
  }, 30000);

  it('does nothing when the add button is disabled', async () => {
    const { saved } = workablePage({ disabled: true });
    const res = await workable(profile());
    expect(saved).toEqual([]);
    expect(res!.filled).toEqual([]);
  });

  it('an empty end date counts as current; a failing date picker does not stop the other fields', async () => {
    const { saved } = workablePage();
    const p = profile();
    p.workExperience = [{ ...p.workExperience[1], endDate: '', isCurrent: false }];
    p.education = [];
    // break the start date picker: the input is replaced by an inert one with no calendar
    const add = document.querySelector<HTMLElement>('[data-ui="experience"] [data-ui="add-section"]')!;
    add.addEventListener('click', () => {
      const s = document.querySelector<HTMLInputElement>('input[name="start_date"]')!;
      s.replaceWith(s.cloneNode(false));
    });
    const res = await workable(p);
    expect(saved[0]).toMatchObject({ title: 'Engineer', company: 'Difference Co', current_role: 'true' });
    const keys = res!.filled.map((f) => f.key);
    expect(keys).not.toContain('work.startDate');
    expect(keys).toEqual(expect.arrayContaining(['work.title', 'work.company', 'work.current']));
  }, 30000);
});

describe('atsHandlers', () => {
  it('exports the three handlers and they are mutually exclusive', async () => {
    expect(atsHandlers.length).toBe(3);
    workablePage();
    expect(await smartRecruiters(profile())).toBeNull();
    expect(await jobvite(profile())).toBeNull();
    expect(await workable(profile())).not.toBeNull();
  }, 30000);
});
