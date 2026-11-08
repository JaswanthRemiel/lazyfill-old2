import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProfileData, type ProfileData } from '../../shared/profile';
import { formWidgetHandlers } from './sites2';
import { fillAvature } from './avature';
import { fillMathWorks } from './mathworks';
import { fillSapUi5 } from './sapui5';
import { fillMetaEducation } from './metaEdu';
import { fillGoogleEducation, googleDegree } from './googleEdu';

function profile(): ProfileData {
  const p = emptyProfileData();
  p.workExperience = [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London, UK', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Led the platform team.' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds', startDate: '2018-09', endDate: '2021-02', isCurrent: false, description: 'Built compilers.' },
    { jobTitle: 'Intern', companyName: 'Babbage Ltd', location: '', startDate: '2017-06', endDate: '2017-08', isCurrent: false, description: '' },
  ];
  p.education = [
    { schoolName: 'University of London', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2014-09', graduationDate: '2018-06', currentlyEnrolled: false },
    { schoolName: 'Open Academy', degree: 'PhD', fieldOfStudy: 'Logic', gpa: '', startDate: '2019-09', graduationDate: '', currentlyEnrolled: true },
  ];
  p.skills = ['Python', 'React'];
  return p;
}

const val = (sel: string, root: ParentNode = document) => (root.querySelector(sel) as HTMLInputElement).value;

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('formWidgetHandlers', () => {
  it('exports five handlers that all return null on an unrelated page', async () => {
    document.body.innerHTML = '<form><label for="a">Name</label><input id="a"><button>Add</button></form>';
    expect(formWidgetHandlers).toHaveLength(5);
    for (const h of formWidgetHandlers) expect(await h(profile())).toBeNull();
    expect((document.getElementById('a') as HTMLInputElement).value).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Avature', () => {
  const work = (i: number) => `<fieldset class="datasetField__row">
    <div><label for="c${i}">Company</label><input id="c${i}"></div>
    <div><label for="t${i}">Job title</label><input id="t${i}"></div>
    <div><label for="s${i}">Start date</label><input id="s${i}" type="month"></div>
    <div><label for="e${i}">End date</label><input id="e${i}" type="month"></div>
    <div><label for="k${i}">Is current position</label><select id="k${i}"><option value="">-</option><option>Yes</option><option>No</option></select></div></fieldset>`;
  const edu = (i: number) => `<fieldset class="datasetField__row"><div><label for="u${i}">School</label><input id="u${i}"></div><div><label for="d${i}">Field of study</label><input id="d${i}"></div></fieldset>`;
  function page(opts: { workRows?: number; sample?: boolean } = {}) {
    document.body.innerHTML = `<form>
      <fieldset id="fieldSpecContainer1"><legend>Work experience</legend><div id="w">${Array.from({ length: opts.workRows ?? 1 }, (_, i) => work(i)).join('')}</div>
        ${opts.sample ? `<div class="datasetField__row datasetField__row--sample"><input id="sample"><label for="sample">Company</label></div>` : ''}
        <a id="addRowFor_1" href="#">Add</a></fieldset>
      <fieldset id="fieldSpecContainer2"><legend>Education</legend><div id="e">${edu(0)}</div><a id="addRowFor_2" href="#">Add</a></fieldset>
      <fieldset><legend>Which of the following skills do you have?</legend>
        <label><input type="checkbox" id="b1"> Python</label><label><input type="checkbox" id="b2"> Cobol</label><label><input type="checkbox" id="b3"> React</label></fieldset></form>`;
    let w = opts.workRows ?? 1, e = 1;
    document.getElementById('addRowFor_1')!.addEventListener('click', (ev) => { ev.preventDefault(); document.getElementById('w')!.insertAdjacentHTML('beforeend', work(w++)); });
    document.getElementById('addRowFor_2')!.addEventListener('click', (ev) => { ev.preventDefault(); document.getElementById('e')!.insertAdjacentHTML('beforeend', edu(e++)); });
  }
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

  it('adds rows, fills each by label, answers the current question and ticks skills', async () => {
    page({ sample: true });
    const res = (await fillAvature(profile()))!;
    expect([0, 1, 2].map((i) => g(`c${i}`))).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    expect([0, 1, 2].map((i) => g(`t${i}`))).toEqual(['Staff Engineer', 'Engineer', 'Intern']);
    expect([0, 1, 2].map((i) => g(`s${i}`))).toEqual(['2021-03', '2018-09', '2017-06']);
    expect([g('e0'), g('e1'), g('e2')]).toEqual(['', '2021-02', '2017-08']);
    expect([0, 1, 2].map((i) => g(`k${i}`))).toEqual(['Yes', 'No', 'No']);
    expect([0, 1].map((i) => g(`u${i}`))).toEqual(['University of London', 'Open Academy']);
    expect([0, 1].map((i) => g(`d${i}`))).toEqual(['Mathematics', 'Logic']);
    expect(['b1', 'b2', 'b3'].map((id) => (document.getElementById(id) as HTMLInputElement).checked)).toEqual([true, false, true]);
    expect(g('sample')).toBe('');
    expect(document.querySelectorAll('#w > .datasetField__row')).toHaveLength(3);
    expect(res.work && res.edu && res.name === 'avature').toBe(true);
    const keys = res.filled.map((f) => f.key);
    for (const k of ['work.company', 'work.title', 'work.startDate', 'work.endDate', 'work.current', 'edu.school', 'edu.field', 'skills']) expect(keys).toContain(k);
    expect(res.filled.find((f) => f.key === 'work.company')!.label).toBe('Staff Engineer @ Analytical Engines');
    expect(res.touched).toContain(document.getElementById('c2'));
  });

  it('a second run changes and reports nothing, and adds no rows', async () => {
    page();
    await fillAvature(profile());
    const html = document.body.innerHTML;
    const again = (await fillAvature(profile()))!;
    expect(again.filled).toEqual([]);
    expect(document.querySelectorAll('.datasetField__row')).toHaveLength(5);
    expect(g('c0')).toBe('Analytical Engines');
    expect(document.body.innerHTML.length).toBe(html.length);
  });

  it('leaves an existing filled row alone, fills its empty fields only, and does not duplicate it', async () => {
    page({ workRows: 2 });
    (document.getElementById('c0') as HTMLInputElement).value = 'Difference Co';
    (document.getElementById('t0') as HTMLInputElement).value = 'Hand typed title';
    await fillAvature(profile());
    expect(g('t0')).toBe('Hand typed title');
    expect(g('s0')).toBe('2018-09'); // empty field of the matched row is completed
    const companies = [0, 1, 2].map((i) => g(`c${i}`));
    expect(companies.filter((c) => c === 'Difference Co')).toHaveLength(1);
    expect(companies).toContain('Analytical Engines');
    expect(companies).toContain('Babbage Ltd');
  });

  it('answers a Yes/No radio pair under a "current position" group', async () => {
    document.body.innerHTML = `<fieldset id="fieldSpecContainer1"><legend>Employment</legend><fieldset class="datasetField__row">
      <label for="c">Company</label><input id="c">
      <fieldset role="radiogroup"><legend>Are you in your current position?</legend>
        <label><input type="radio" name="cur" value="y"> Yes</label><label><input type="radio" name="cur" value="n"> No</label></fieldset></fieldset></fieldset>`;
    const p = profile();
    p.workExperience = [p.workExperience[0]];
    p.education = [];
    await fillAvature(p);
    expect((document.querySelector('input[value=y]') as HTMLInputElement).checked).toBe(true);
    expect(val('#c')).toBe('Analytical Engines');
  });

  it('ticks skills with a group even when the page has no rows, never unticks, and handles reverse containment', async () => {
    document.body.innerHTML = `<div role="group" aria-label="Technologies you have used">
      <label><input type="checkbox" id="x1" checked> Cobol</label><label><input type="checkbox" id="x2"> JavaScript</label>
      <label><input type="checkbox" id="x3"> Go</label><label><input type="checkbox" id="x4"> C</label></div>`;
    const p = profile();
    p.skills = ['JavaScript (ES6)', 'Rust'];
    const res = (await fillAvature(p))!;
    expect(['x1', 'x2', 'x3', 'x4'].map((id) => (document.getElementById(id) as HTMLInputElement).checked)).toEqual([true, true, false, false]);
    expect(res.filled).toEqual([{ label: 'javascript', key: 'skills' }]);
    expect(res.work || res.edu).toBe(false);
  });

  it('ignores groups with fewer than three boxes or a non-skill heading', async () => {
    document.body.innerHTML = `<fieldset><legend>Skills</legend><label><input type="checkbox"> Python</label><label><input type="checkbox"> React</label></fieldset>
      <fieldset><legend>Newsletters</legend><label><input type="checkbox" id="n1"> Python</label><label><input type="checkbox"> a</label><label><input type="checkbox"> b</label></fieldset>`;
    expect(await fillAvature(profile())).toBeNull();
    expect((document.getElementById('n1') as HTMLInputElement).checked).toBe(false);
  });

  it('returns null without rows or skill groups, and skips hidden rows', async () => {
    document.body.innerHTML = '<form><input id="x"></form>';
    expect(await fillAvature(profile())).toBeNull();
    document.body.innerHTML = `<fieldset id="fieldSpecContainer1"><legend>Work experience</legend><div style="display:none"><div class="datasetField__row"><label for="h">Company</label><input id="h"></div></div></fieldset>`;
    expect(await fillAvature(profile())).toBeNull();
    expect(val('#h')).toBe('');
  });

  it('survives a field that throws and still fills the others', async () => {
    page();
    const bad = document.getElementById('t0') as HTMLInputElement;
    Object.defineProperty(bad, 'value', { get: () => '', set: () => { throw new Error('boom'); } });
    await fillAvature(profile());
    expect(g('c0')).toBe('Analytical Engines');
    expect(g('s0')).toBe('2021-03');
    expect(g('u0')).toBe('University of London');
  });

  it('does not add rows when the page has no add control', async () => {
    document.body.innerHTML = `<fieldset id="fieldSpecContainer1"><legend>Work experience</legend>${work(0)}</fieldset>`;
    await fillAvature(profile());
    expect(document.querySelectorAll('.datasetField__row')).toHaveLength(1);
    expect(g('c0')).toBe('Analytical Engines');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('MathWorks', () => {
  const row = (id: string, emp = '') => `<tr id="employment_${id}">
    <td><input id="employer_${id}" value="${emp}"></td><td><input id="job_title_${id}"></td>
    <td><select id="employment_type_${id}"><option value="">-</option><option value="x">Contractor</option><option value="e">Employee</option></select></td>
    <td><input id="start_date_${id}"></td><td><input id="end_date_${id}"></td><td><input type="checkbox" id="is_current_${id}"></td></tr>`;
  let saves = 0;
  function page(rows: string, modalOpen = true) {
    saves = 0;
    document.body.innerHTML = `<button id="edit_employment" aria-label="Edit work experience records">Edit</button>
      <div id="modal" ${modalOpen ? '' : 'hidden'}><table><tbody id="rows">${modalOpen ? rows : ''}</tbody></table>
      <button id="add_employment" aria-label="Add new work experience record(s)">Add</button><button id="save_employment">Save</button></div>`;
    let n = 100;
    document.getElementById('add_employment')!.addEventListener('click', () => document.getElementById('rows')!.insertAdjacentHTML('beforeend', row(String(n++))));
    document.getElementById('save_employment')!.addEventListener('click', () => { saves++; });
    document.getElementById('edit_employment')!.addEventListener('click', () => { if (!document.getElementById('rows')!.children.length) document.getElementById('rows')!.innerHTML = rows; });
  }
  const host = (h: string) => vi.stubGlobal('location', { hostname: h });
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

  it('returns null on other hosts and with no jobs', async () => {
    page(row('1'));
    host('www.example.com');
    expect(await fillMathWorks(profile())).toBeNull();
    host('www.mathworks.com');
    const p = profile(); p.workExperience = [];
    expect(await fillMathWorks(p)).toBeNull();
    expect(g('employer_1')).toBe('');
  });

  it('returns null when the page has no work experience records or buttons', async () => {
    document.body.innerHTML = '<p>hello</p>';
    host('www.mathworks.com');
    expect(await fillMathWorks(profile())).toBeNull();
  });

  it('fills an empty row, adds rows for the rest, saves twice and fills the masked dates', async () => {
    page(row('1'));
    host('www.mathworks.com');
    const res = (await fillMathWorks(profile()))!;
    expect(res.work).toBe(true);
    expect(g('employer_1')).toBe('Analytical Engines');
    expect(g('job_title_1')).toBe('Staff Engineer');
    expect((document.getElementById('employment_type_1') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Employee');
    expect(g('start_date_1')).toBe('03/2021');
    expect(g('end_date_1')).toBe('');
    expect((document.getElementById('is_current_1') as HTMLInputElement).checked).toBe(true);
    expect([g('employer_100'), g('employer_101')]).toEqual(['Difference Co', 'Babbage Ltd']);
    expect([g('start_date_100'), g('end_date_100')]).toEqual(['09/2018', '02/2021']);
    expect((document.getElementById('is_current_100') as HTMLInputElement).checked).toBe(false);
    expect(document.querySelectorAll('tr[id^=employment_]')).toHaveLength(3);
    expect(saves).toBe(2);
    expect(res.filled.map((f) => f.key)).toEqual(expect.arrayContaining(['work.company', 'work.title', 'work.startDate', 'work.endDate', 'work.current']));
  });

  it('opens the modal through the edit button when it is closed', async () => {
    page(row('1'), false);
    host('www.mathworks.com');
    await fillMathWorks(profile());
    expect(g('employer_1')).toBe('Analytical Engines');
  });

  it('on a past job unticks current and clears nothing else; on a current job clears the end date', async () => {
    page(row('1') + row('2'));
    host('www.mathworks.com');
    (document.getElementById('is_current_1') as HTMLInputElement).checked = true;
    (document.getElementById('end_date_2') as HTMLInputElement).value = '12/2020';
    const p = profile();
    p.workExperience = [{ ...p.workExperience[1], companyName: 'First Co' }, { ...p.workExperience[0], companyName: 'Second Co' }];
    (document.getElementById('end_date_1') as HTMLInputElement).value = '';
    await fillMathWorks(p);
    expect((document.getElementById('is_current_1') as HTMLInputElement).checked).toBe(false);
    expect(g('end_date_1')).toBe('02/2021');
    expect((document.getElementById('is_current_2') as HTMLInputElement).checked).toBe(true);
    expect(g('end_date_2')).toBe('');
  });

  it('second run changes nothing, does not save and does not add rows; an existing employer is not duplicated', async () => {
    page(row('1') + row('7', 'Difference Co'));
    host('www.mathworks.com');
    await fillMathWorks(profile());
    expect(g('employer_7')).toBe('Difference Co');
    expect(g('job_title_7')).toBe(''); // existing record left alone
    expect(document.querySelectorAll('tr[id^=employment_]')).toHaveLength(3);
    const savesAfterFirst = saves;
    const again = (await fillMathWorks(profile()))!;
    expect(again.filled).toEqual([]);
    expect(again.work).toBe(false);
    expect(saves).toBe(savesAfterFirst);
    expect(document.querySelectorAll('tr[id^=employment_]')).toHaveLength(3);
  });

  it('a field that throws does not stop the rest of the row', async () => {
    page(row('1'));
    host('www.mathworks.com');
    const bad = document.getElementById('job_title_1') as HTMLInputElement;
    Object.defineProperty(bad, 'value', { get: () => '', set: () => { throw new Error('boom'); } });
    const p = profile(); p.workExperience = [p.workExperience[0]];
    await fillMathWorks(p);
    expect(g('employer_1')).toBe('Analytical Engines');
    expect(g('start_date_1')).toBe('03/2021');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('SAP UI5', () => {
  const SFX = '-xweb-dynamic-content';
  function inputHost(tag: string, label: string, date = false): HTMLElement {
    const host = document.createElement(`${tag}${SFX}`);
    host.setAttribute('accessible-name', label);
    const sr = host.attachShadow({ mode: 'open' });
    if (date) {
      const dt = document.createElement(`ui5-datetime-input${SFX}`);
      dt.attachShadow({ mode: 'open' }).innerHTML = '<input id="inner">';
      sr.appendChild(dt);
    } else sr.innerHTML = '<input id="inner">';
    return host;
  }
  function entry(n: number): HTMLElement {
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML = `<ui5-title${SFX}>Previous Employment ${n}</ui5-title>`;
    const form = document.createElement(`ui5-form${SFX}`);
    form.setAttribute('header-text', '');
    form.append(inputHost('ui5-input', 'Company Name'), inputHost('ui5-input', 'Job Title'),
      inputHost('ui5-date-picker', 'From Date', true), inputHost('ui5-date-picker', 'End Date', true), inputHost('ui5-input', 'Reason For Leaving'));
    div.appendChild(form);
    return div;
  }
  let clicks = 0;
  function page(count: number) {
    clicks = 0;
    document.body.innerHTML = '<div id="list"></div>';
    for (let i = 1; i <= count; i++) document.getElementById('list')!.appendChild(entry(i));
    const add = document.createElement(`ui5-button${SFX}`);
    add.textContent = 'Add';
    add.attachShadow({ mode: 'open' }).innerHTML = '<button>x</button>';
    add.shadowRoot!.querySelector('button')!.addEventListener('click', () => {
      clicks++;
      const n = document.querySelectorAll(`ui5-title${SFX}`).length + 1;
      document.getElementById('list')!.appendChild(entry(n));
    });
    document.body.appendChild(add);
  }
  const inner = (e: Element, label: string): HTMLInputElement => {
    const host = [...e.querySelectorAll<HTMLElement>('[accessible-name]')].find((h) => h.getAttribute('accessible-name') === label)!;
    let sr = host.shadowRoot!;
    const nested = sr.querySelector(`ui5-datetime-input${SFX}`);
    if (nested) sr = nested.shadowRoot!;
    return sr.querySelector('input')!;
  };
  const entries = () => [...document.querySelectorAll('.entry')];

  it('returns null without Previous Employment headings or without jobs', async () => {
    document.body.innerHTML = '<p>x</p>';
    expect(await fillSapUi5(profile())).toBeNull();
    page(1);
    const p = profile(); p.workExperience = [];
    expect(await fillSapUi5(p)).toBeNull();
  });

  it('fills the first entry, clicks Add for the rest, formats dates and leaves Reason For Leaving empty', async () => {
    page(1);
    const res = (await fillSapUi5(profile()))!;
    expect(res.work).toBe(true);
    expect(entries()).toHaveLength(3);
    expect(clicks).toBe(2);
    const e = entries();
    expect([0, 1, 2].map((i) => inner(e[i], 'Company Name').value)).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    expect([0, 1, 2].map((i) => inner(e[i], 'Job Title').value)).toEqual(['Staff Engineer', 'Engineer', 'Intern']);
    expect([0, 1, 2].map((i) => inner(e[i], 'From Date').value)).toEqual(['Mar 1, 2021', 'Sep 1, 2018', 'Jun 1, 2017']);
    expect([0, 1, 2].map((i) => inner(e[i], 'End Date').value)).toEqual(['', 'Feb 1, 2021', 'Aug 1, 2017']);
    expect(e.map((x) => inner(x, 'Reason For Leaving').value)).toEqual(['', '', '']);
    const host = e[1].querySelector('[accessible-name="From Date"]')!;
    expect(host.getAttribute('value')).toBe('Sep 1, 2018');
    expect((host as unknown as { value: string }).value).toBe('Sep 1, 2018');
    expect(res.filled.map((f) => f.key)).toEqual(expect.arrayContaining(['work.company', 'work.title', 'work.startDate', 'work.endDate']));
  });

  it('dispatches composed input and change events from the shadow input', async () => {
    page(1);
    const seen: string[] = [];
    const input = inner(entries()[0], 'Company Name');
    document.addEventListener('input', () => seen.push('input'));
    document.addEventListener('change', () => seen.push('change'));
    const p = profile(); p.workExperience = [p.workExperience[0]];
    await fillSapUi5(p);
    expect(input.value).toBe('Analytical Engines');
    expect(seen).toEqual(expect.arrayContaining(['input', 'change']));
  });

  it('second run changes nothing and does not add entries', async () => {
    page(1);
    await fillSapUi5(profile());
    const again = (await fillSapUi5(profile()))!;
    expect(again.filled).toEqual([]);
    expect(entries()).toHaveLength(3);
    expect(clicks).toBe(2);
  });

  it('does not duplicate a job that is already on the page and reuses an empty entry', async () => {
    page(2);
    inner(entries()[1], 'Company Name').value = 'Difference Co';
    inner(entries()[1], 'Job Title').value = 'Typed';
    await fillSapUi5(profile());
    expect(entries()).toHaveLength(3);
    expect(inner(entries()[1], 'Job Title').value).toBe('Typed');
    expect(inner(entries()[0], 'Company Name').value).toBe('Analytical Engines');
    expect(inner(entries()[2], 'Company Name').value).toBe('Babbage Ltd');
    expect(clicks).toBe(1);
  });

  it('finds fields by form-item label when accessible-name is missing', async () => {
    document.body.innerHTML = `<div class="entry"><ui5-title${SFX}>Previous Employment 1</ui5-title${SFX}><ui5-form${SFX}>
      <ui5-form-item${SFX}><ui5-label${SFX} slot="labelContent">Company Name:</ui5-label${SFX}></ui5-form-item${SFX}></ui5-form${SFX}></div>`;
    const item = document.querySelector(`ui5-form-item${SFX}`)!;
    const host = document.createElement(`ui5-input${SFX}`);
    host.attachShadow({ mode: 'open' }).innerHTML = '<input id="inner">';
    item.appendChild(host);
    const p = profile(); p.workExperience = [p.workExperience[0]];
    await fillSapUi5(p);
    expect((host.shadowRoot!.querySelector('input') as HTMLInputElement).value).toBe('Analytical Engines');
  });

  it('gives up cleanly when there is no Add button', async () => {
    page(1);
    document.querySelector(`ui5-button${SFX}`)!.remove();
    await fillSapUi5(profile());
    expect(entries()).toHaveLength(1);
    expect(inner(entries()[0], 'Company Name').value).toBe('Analytical Engines');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Meta education', () => {
  /** A popover combobox: clicking opens a dialog with a search box and options filtered by what is typed. */
  function combo(label: string, items: string[], opts: { search?: boolean; failFirstOpen?: boolean } = {}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-label', label);
    btn.textContent = label;
    let opened = 0;
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') document.querySelector('[role=dialog]')?.remove(); });
    btn.addEventListener('click', () => {
      if (document.querySelector('[role=dialog]')) return;
      if (opts.failFirstOpen && opened++ === 0) return;
      const dlg = document.createElement('div');
      dlg.setAttribute('role', 'dialog');
      const list = document.createElement('div');
      const render = (q: string) => {
        list.innerHTML = '';
        for (const it of items.filter((x) => x.toLowerCase().includes(q.toLowerCase()))) {
          const o = document.createElement('div');
          o.setAttribute('role', 'option');
          o.textContent = it;
          o.addEventListener('click', () => { btn.textContent = it; dlg.remove(); });
          list.appendChild(o);
        }
      };
      if (opts.search !== false) {
        const s = document.createElement('input');
        s.type = 'text';
        s.addEventListener('input', () => render(s.value));
        dlg.appendChild(s);
        render('');
        list.innerHTML = ''; // results only appear after typing
      } else render('');
      dlg.appendChild(list);
      document.body.appendChild(dlg);
    });
    return btn;
  }
  let uid = 0;
  const SCHOOLS = ['University of London', 'University of Leeds', 'Open Academy'];
  const DEGREES = ["Bachelor's Degree", "Master's Degree", 'Doctor of Philosophy (Ph.D.)'];
  function eduEntry(opts: { failFirstOpen?: boolean } = {}): HTMLElement {
    const div = document.createElement('div');
    div.className = 'edu';
    div.append(combo('School name', SCHOOLS, opts), combo('Degree', DEGREES, { search: false }));
    div.insertAdjacentHTML('beforeend', `<label for="f">Field of study</label><input id="f" type="text" autocomplete="on">
      <label for="sd">Start date (mm/yyyy)</label><input id="sd" type="text" autocomplete="on" placeholder="mm/yyyy">
      <label for="ed">End date (mm/yyyy)</label><input id="ed" type="text" autocomplete="on" placeholder="mm/yyyy">
      <label><input type="checkbox" class="cur"> I currently study here</label>`);
    div.querySelectorAll('input[id]').forEach((i) => { i.id = `${i.id}${uid}`; div.querySelector(`label[for="${i.id.slice(0, -String(uid).length)}"]`)?.setAttribute('for', i.id); });
    uid++;
    return div;
  }
  function page(n: number, opts: { failFirstOpen?: boolean } = {}) {
    document.body.innerHTML = `<section id="work"><button role="combobox" aria-label="Employer name">Employer name</button>
      <input type="text" autocomplete="on" placeholder="mm/yyyy" aria-label="Start date mm/yyyy" id="wstart"></section>
      <section id="eduwrap"><div id="list"></div><button id="add" type="button">Add another degree</button></section>`;
    for (let i = 0; i < n; i++) document.getElementById('list')!.appendChild(eduEntry(opts));
    document.getElementById('add')!.addEventListener('click', () => document.getElementById('list')!.appendChild(eduEntry()));
  }
  const text = (e: Element, label: string) => e.querySelector(`[aria-label="${label}"]`)!.textContent;
  const edus = () => [...document.querySelectorAll('.edu')];

  it('returns null without a School name combobox', async () => {
    document.body.innerHTML = '<button role="combobox" aria-label="Employer name">Employer name</button>';
    expect(await fillMetaEducation(profile())).toBeNull();
  });

  it('fills school, degree, field of study and dates, adds a second entry and skips the work section', async () => {
    page(1);
    const res = (await fillMetaEducation(profile()))!;
    expect(res.edu).toBe(true);
    expect(res.work).toBe(false);
    const e = edus();
    expect(e).toHaveLength(2);
    expect(text(e[0], 'School name')).toBe('University of London');
    expect(text(e[0], 'Degree')).toBe("Bachelor's Degree");
    expect(val('input[type=text]:not([placeholder])', e[0])).toBe('Mathematics');
    const dates = [...e[0].querySelectorAll<HTMLInputElement>('input[placeholder]')].map((i) => i.value);
    expect(dates).toEqual(['09/2014', '06/2018']);
    expect(text(e[1], 'School name')).toBe('Open Academy');
    expect(text(e[1], 'Degree')).toBe('Doctor of Philosophy (Ph.D.)');
    const dates2 = [...e[1].querySelectorAll<HTMLInputElement>('input[placeholder]')].map((i) => i.value);
    expect(dates2).toEqual(['09/2019', '']);
    expect(e[1].querySelector<HTMLInputElement>('.cur')!.checked).toBe(true);
    expect(text(document.getElementById('work')!, 'Employer name')).toBe('Employer name');
    expect(val('#wstart')).toBe('');
    expect(res.filled.map((f) => f.key)).toEqual(expect.arrayContaining(['edu.school', 'edu.degree', 'edu.field', 'edu.startDate', 'edu.endDate']));
    expect(res.filled.find((f) => f.key === 'edu.school')!.label).toBe('University of London');
  });

  it('retries when the popover fails to open the first time', async () => {
    page(1, { failFirstOpen: true });
    const p = profile(); p.education = [p.education[0]];
    await fillMetaEducation(p);
    expect(text(edus()[0], 'School name')).toBe('University of London');
  });

  it('second run does nothing: no new entries, no new reports', async () => {
    page(1);
    await fillMetaEducation(profile());
    const again = (await fillMetaEducation(profile()))!;
    expect(again.filled).toEqual([]);
    expect(edus()).toHaveLength(2);
  });

  it('leaves an already chosen school alone and reuses an empty entry', async () => {
    page(2);
    const e = edus();
    e[1].querySelector('[aria-label="School name"]')!.textContent = 'Open Academy';
    await fillMetaEducation(profile());
    expect(edus()).toHaveLength(2);
    expect(text(edus()[0], 'School name')).toBe('University of London');
    expect(text(edus()[1], 'Degree')).toBe('Degree'); // untouched
  });

  it('leaves the school unset (no wrong click) when no option matches', async () => {
    page(1);
    const p = profile(); p.education = [{ ...p.education[0], schoolName: 'Nowhere Institute' }];
    const res = (await fillMetaEducation(p))!;
    expect(text(edus()[0], 'School name')).toBe('School name');
    expect(res.filled.some((f) => f.key === 'edu.school')).toBe(false);
  }, 15000);
});

// ---------------------------------------------------------------------------------------------------------------
describe('Google education', () => {
  function material(jsname: string, placeholder: string, items: string[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.setAttribute('jsname', jsname);
    wrap.innerHTML = `<div role="combobox" aria-expanded="false"><span class="sel">${placeholder}</span></div>`;
    const trigger = wrap.firstElementChild as HTMLElement;
    trigger.addEventListener('click', () => {
      if (wrap.querySelector('ul')) return;
      trigger.setAttribute('aria-expanded', 'true');
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      for (const it of items) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = it;
        li.addEventListener('click', () => { trigger.querySelector('.sel')!.textContent = it; trigger.setAttribute('aria-expanded', 'false'); ul.remove(); });
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    });
    return wrap;
  }
  function entry(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'edu';
    div.innerHTML = `<div jsname="ouDqDb"><input type="text" aria-label="School"></div>`;
    div.append(material('sFKGad', 'Degree', ["Bachelor's", "Master's", 'PhD', 'Associate']), material('LrfOX', 'Status', ['Now attending', 'Graduated']));
    div.insertAdjacentHTML('beforeend', `<div jsname="uS8Kcc"><input type="text" aria-label="Area of study"></div><input aria-label="GPA (optional)">`);
    return div;
  }
  function page(n: number) {
    document.body.innerHTML = `<div id="work"><input aria-label="Employer name"><input aria-label="Job title"></div><div id="list"></div><button id="add" type="button">Add another degree</button>`;
    for (let i = 0; i < n; i++) document.getElementById('list')!.appendChild(entry());
    document.getElementById('add')!.addEventListener('click', () => document.getElementById('list')!.appendChild(entry()));
    vi.stubGlobal('location', { hostname: 'www.google.com' });
  }
  const edus = () => [...document.querySelectorAll('.edu')];
  const sel = (e: Element, js: string) => e.querySelector(`[jsname="${js}"] .sel`)!.textContent;

  it('returns null off google hosts', async () => {
    page(1);
    vi.stubGlobal('location', { hostname: 'example.com' });
    expect(await fillGoogleEducation(profile())).toBeNull();
    expect(val('input[aria-label=School]')).toBe('');
  });

  it('returns null without a school input', async () => {
    document.body.innerHTML = '<input aria-label="Employer name">';
    vi.stubGlobal('location', { hostname: 'careers.google.com' });
    expect(await fillGoogleEducation(profile())).toBeNull();
  });

  it('fills school, mapped degree, status, field and GPA and adds the second entry', async () => {
    page(1);
    const res = (await fillGoogleEducation(profile()))!;
    expect(res.edu).toBe(true);
    const e = edus();
    expect(e).toHaveLength(2);
    expect(val('input[aria-label=School]', e[0])).toBe('University of London');
    expect(sel(e[0], 'sFKGad')).toBe("Bachelor's");
    expect(sel(e[0], 'LrfOX')).toBe('Graduated');
    expect(val('[jsname=uS8Kcc] input', e[0])).toBe('Mathematics');
    expect(val('input[aria-label^=GPA]', e[0])).toBe('3.9');
    expect(val('input[aria-label=School]', e[1])).toBe('Open Academy');
    expect(sel(e[1], 'sFKGad')).toBe('PhD');
    expect(sel(e[1], 'LrfOX')).toBe('Now attending');
    expect(val('input[aria-label^=GPA]', e[1])).toBe('');
    expect(val('input[aria-label="Employer name"]')).toBe('');
    expect(res.filled.map((f) => f.key)).toEqual(expect.arrayContaining(['edu.school', 'edu.degree', 'edu.field', 'edu.gpa']));
  });

  it('a graduation date in the future means Now attending; no date and not enrolled leaves status alone', async () => {
    page(2);
    const p = profile();
    p.education = [
      { ...p.education[0], graduationDate: `${new Date().getFullYear() + 2}-06` },
      { ...p.education[1], schoolName: 'Second School', currentlyEnrolled: false, graduationDate: '' },
    ];
    await fillGoogleEducation(p);
    expect(sel(edus()[0], 'LrfOX')).toBe('Now attending');
    expect(sel(edus()[1], 'LrfOX')).toBe('Status');
  });

  it('picks the exact school from the suggestion list after ArrowDown', async () => {
    page(1);
    const input = document.querySelector<HTMLInputElement>('input[aria-label=School]')!;
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowDown') return;
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'listbox');
      for (const t of ['University of London Extra', 'University of London']) {
        const li = document.createElement('li');
        li.textContent = t;
        li.addEventListener('click', () => { input.value = `picked:${t}`; ul.remove(); });
        ul.appendChild(li);
      }
      document.body.appendChild(ul);
    });
    const p = profile(); p.education = [p.education[0]];
    await fillGoogleEducation(p);
    expect(input.value).toBe('picked:University of London');
  });

  it('second run changes nothing, adds no entries; an existing school is not duplicated', async () => {
    page(2);
    document.querySelectorAll<HTMLInputElement>('input[aria-label=School]')[1].value = 'Open Academy';
    await fillGoogleEducation(profile());
    expect(edus()).toHaveLength(2);
    const again = (await fillGoogleEducation(profile()))!;
    expect(again.filled).toEqual([]);
    expect(edus()).toHaveLength(2);
  });

  it('a throwing field does not stop the others', async () => {
    page(1);
    const bad = document.querySelector<HTMLInputElement>('[jsname=uS8Kcc] input')!;
    Object.defineProperty(bad, 'value', { get: () => '', set: () => { throw new Error('boom'); } });
    const p = profile(); p.education = [p.education[0]];
    await fillGoogleEducation(p);
    expect(val('input[aria-label=School]')).toBe('University of London');
    expect(val('input[aria-label^=GPA]')).toBe('3.9');
  });

  it('googleDegree maps abbreviations to the four Google options', () => {
    expect(googleDegree('B.Tech')[0]).toBe("Bachelor's");
    expect(googleDegree('MBA')[0]).toBe("Master's");
    expect(googleDegree('Ph.D.')[0]).toBe('PhD');
    expect(googleDegree('Associate of Arts')[0]).toBe('Associate');
    expect(googleDegree('Certificate of Joy')[0]).toBe('Certificate of Joy');
  });
});
