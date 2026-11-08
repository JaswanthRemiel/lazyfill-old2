// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.google.com/about/careers/applications/"}
import { beforeEach, describe, expect, it } from 'vitest';
import { fillGoogleWork, googleTiming, onGoogleHost } from './googleWork';
import { b2Profile } from './siteFixtures';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dd = (label: string, items: string[]) =>
  `<div jscontroller="dd"><span>${label}</span><div role="combobox" aria-expanded="false"><span class="sel"></span></div>
   <ul role="listbox" aria-hidden="true">${items.map((m) => `<li role="option">${m}</li>`).join('')}</ul></div>`;
const entry = (employer = '') => `<div class="job">
  <input aria-label="Employer name" value="${employer}">
  <ul role="listbox" aria-hidden="true" class="sugg"></ul>
  <input aria-label="Job title">
  <div class="start"><span>Start date</span>${dd('', MONTHS)}<input aria-label="Start year"></div>
  <div class="end"><span>End date</span>${dd('', MONTHS)}<input aria-label="End year"></div>
  <label><input type="checkbox" value="I currently work in this job"> current</label>
  <input aria-label="City">
  ${dd('Country', ['India', 'United Kingdom', 'United States'])}
  </div>`;

function mount(o: { employer?: string; noSuggestions?: boolean; brokenMonth?: boolean } = {}) {
  const root = document.createElement('div');
  root.innerHTML = `<form><div id="jobs">${entry(o.employer)}</div><button type="button" id="add">Add another job</button>
    <div jsname="ouDqDb"><input aria-label="School name"></div></form>`;
  document.body.appendChild(root);
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLInputElement;
    if ((e as KeyboardEvent).key === 'ArrowDown' && t.getAttribute('aria-label') === 'Employer name' && !o.noSuggestions) {
      const l = t.nextElementSibling!;
      l.innerHTML = `<li role="option">${t.value} Group</li><li role="option">${t.value}</li>`;
      l.removeAttribute('aria-hidden');
    }
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'add') { root.querySelector('#jobs')!.insertAdjacentHTML('beforeend', entry()); return; }
    const opt = t.closest('li[role=option]');
    const wrap = t.closest('[jscontroller]');
    if (opt && wrap) {
      if (!o.brokenMonth || wrap.querySelector('li')?.textContent !== 'January') wrap.querySelector('.sel')!.textContent = opt.textContent;
      wrap.querySelector('ul')!.setAttribute('aria-hidden', 'true');
      return;
    }
    if (opt) { // employer suggestion
      const inp = opt.parentElement!.previousElementSibling as HTMLInputElement;
      inp.value = opt.textContent ?? '';
      opt.parentElement!.setAttribute('aria-hidden', 'true');
      return;
    }
    const trig = t.closest('[role=combobox]');
    if (trig) { trig.parentElement!.querySelector('ul')!.removeAttribute('aria-hidden'); trig.setAttribute('aria-expanded', 'true'); }
  });
}

const jobs = () => [...document.querySelectorAll('.job')];
const inp = (i: number, sel: string) => jobs()[i].querySelector(sel) as HTMLInputElement;
const sel = (i: number, group: string) => jobs()[i].querySelector(`${group} .sel`)!.textContent;
const country = (i: number) => jobs()[i].querySelectorAll('.sel')[2].textContent;

beforeEach(() => {
  document.body.innerHTML = '';
  Object.assign(googleTiming, { suggestions: 150, dropdown: 250 });
});

describe('Google work handler', () => {
  it('knows the host from the test url', () => { expect(onGoogleHost()).toBe(true); });

  it('returns null when the employer input is missing', async () => {
    document.body.innerHTML = '<input aria-label="Job title">';
    expect(await fillGoogleWork(b2Profile())).toBeNull();
  });

  it('fills the entry, adds a second and fills dropdowns, years, checkbox, city and country', async () => {
    mount();
    const r = await fillGoogleWork(b2Profile());
    expect(jobs().length).toBe(2);
    expect([0, 1].map((i) => inp(i, '[aria-label="Employer name"]').value)).toEqual(['Analytical Engines', 'Difference Co']);
    expect([0, 1].map((i) => inp(i, '[aria-label="Job title"]').value)).toEqual(['Staff Engineer', 'Engineer']);
    expect(sel(0, '.start')).toBe('March');
    expect(inp(0, '.start input').value).toBe('2021');
    expect(sel(1, '.start')).toBe('September');
    expect(sel(1, '.end')).toBe('February');
    expect(inp(1, '.end input').value).toBe('2021');
    expect(sel(0, '.end')).toBe('');
    expect(inp(0, 'input[type=checkbox]').checked).toBe(true);
    expect(inp(1, 'input[type=checkbox]').checked).toBe(false);
    expect(inp(0, '[aria-label="City"]').value).toBe('London');
    expect([country(0), country(1)]).toEqual(['United Kingdom', 'United Kingdom']);
    expect(r?.name).toBe('google');
    expect(r?.work).toBe(true);
    const keys = new Set(r!.filled.map((f) => f.key));
    for (const k of ['work.company', 'work.title', 'work.location', 'work.startDate', 'work.endDate', 'work.current']) expect(keys.has(k as never)).toBe(true);
    expect(r!.filled[0].label).toBe('Staff Engineer @ Analytical Engines');
  });

  it('picks the exact employer suggestion', async () => {
    mount();
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    await fillGoogleWork(p);
    expect(inp(0, '[aria-label="Employer name"]').value).toBe('Analytical Engines');
  });

  it('second run changes nothing', async () => {
    mount();
    await fillGoogleWork(b2Profile());
    const before = document.body.innerHTML;
    const r = await fillGoogleWork(b2Profile());
    expect(document.body.innerHTML).toBe(before);
    expect(r?.filled).toEqual([]);
  });

  it('keeps an existing filled entry and unticks nothing on it', async () => {
    mount({ employer: 'Analytical Engines' });
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    const r = await fillGoogleWork(p);
    expect(jobs().length).toBe(1);
    expect(inp(0, '[aria-label="Job title"]').value).toBe('');
    expect(r?.filled).toEqual([]);
  });

  it('works without a suggestion list', async () => {
    mount({ noSuggestions: true });
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    const r = await fillGoogleWork(p);
    expect(inp(0, '[aria-label="Employer name"]').value).toBe('Analytical Engines');
    expect(r!.filled.some((f) => f.key === 'work.company')).toBe(true);
  });

  it('a month dropdown that does not take the choice does not stop the other fields', async () => {
    mount({ brokenMonth: true });
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    const r = await fillGoogleWork(p);
    expect(sel(0, '.start')).toBe('');
    expect(inp(0, '[aria-label="Job title"]').value).toBe('Staff Engineer');
    expect(inp(0, 'input[type=checkbox]').checked).toBe(true);
    expect(r!.filled.some((f) => f.key === 'work.startDate')).toBe(false);
    expect(r!.filled.some((f) => f.key === 'work.title')).toBe(true);
  });

  it('unticks a pre-ticked current-job box for a past job', async () => {
    mount();
    (document.querySelector('input[type=checkbox]') as HTMLInputElement).checked = true;
    const p = b2Profile();
    p.workExperience = [p.workExperience[1]];
    await fillGoogleWork(p);
    expect(inp(0, 'input[type=checkbox]').checked).toBe(false);
    expect(sel(0, '.end')).toBe('February');
  });
});
