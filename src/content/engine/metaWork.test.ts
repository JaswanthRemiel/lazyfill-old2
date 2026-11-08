import { beforeEach, describe, expect, it } from 'vitest';
import { fillMetaWork, metaTiming } from './metaWork';
import { b2Profile } from './siteFixtures';

interface Opts { entries?: number; employer?: string; failOpens?: number; noPositionOptions?: boolean }

const entry = (employer = 'Employer name') => `<div class="entry">
  <button type="button" role="combobox" aria-label="Employer name" aria-controls="pop">${employer}</button>
  <button type="button" role="combobox" aria-label="Position">Position</button>
  <input type="text" role="combobox" placeholder="City">
  <input type="text" autocomplete="on" placeholder="MM/YYYY" aria-label="Start date mm/yyyy">
  <input type="text" autocomplete="on" placeholder="MM/YYYY" aria-label="End date mm/yyyy">
  <label><input type="checkbox"> I currently work here</label>
  <textarea></textarea></div>`;

let opens = 0;

function mount(o: Opts = {}) {
  const root = document.createElement('div');
  root.innerHTML = `<form><div id="entries">${Array.from({ length: o.entries ?? 1 }, (_, i) => entry(i === 0 && o.employer ? o.employer : undefined)).join('')}</div>
    <a href="#" id="add">Add another job</a>
    <div role="dialog" id="education"><button type="button" role="combobox" aria-label="School name">School name</button></div></form>`;
  document.body.appendChild(root);
  opens = 0;
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'add') { e.preventDefault(); root.querySelector('#entries')!.insertAdjacentHTML('beforeend', entry()); return; }
    const btn = t.closest<HTMLElement>('button[role=combobox]');
    if (btn && btn.getAttribute('aria-label') !== 'School name') {
      if (++opens <= (o.failOpens ?? 0)) return;
      document.querySelector('#pop')?.remove();
      const pop = document.createElement('div');
      pop.id = 'pop';
      pop.setAttribute('role', 'dialog');
      pop.innerHTML = '<input type="text"><div role="listbox"></div>';
      const list = pop.querySelector('[role=listbox]')!;
      pop.querySelector('input')!.addEventListener('input', (ev) => {
        const v = (ev.target as HTMLInputElement).value;
        const isPos = btn.getAttribute('aria-label') === 'Position';
        list.innerHTML = o.noPositionOptions && isPos ? '<div role="option">No results</div>' : `<div role="option">${v} Holdings</div><div role="option">${v}</div>`;
      });
      list.addEventListener('click', (ev) => {
        const opt = (ev.target as Element).closest('[role=option]');
        if (opt) { btn.textContent = opt.textContent; pop.remove(); }
      });
      document.body.appendChild(pop);
      return;
    }
    // location suggestions
    const opt = t.closest('.sugg [role=option]');
    if (opt) { (opt.closest('.entry')!.querySelector('input[role=combobox]') as HTMLInputElement).value = opt.textContent ?? ''; opt.parentElement!.remove(); }
  });
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.getAttribute('role') === 'combobox' && t.tagName === 'INPUT') {
      t.parentElement!.querySelector('.sugg')?.remove();
      t.insertAdjacentHTML('afterend', `<ul class="sugg"><li role="option">${t.value}, State, Country</li></ul>`);
    }
    if (t.getAttribute('placeholder') === 'MM/YYYY' && /^\d\d$/.test(t.value)) t.value += '/'; // mask
  });
  return root;
}

const entries = () => [...document.querySelectorAll('.entry')];
const field = (i: number, sel: string) => entries()[i].querySelector(sel) as HTMLInputElement;
const text = (i: number, sel: string) => entries()[i].querySelector(sel)!.textContent;

beforeEach(() => {
  document.body.innerHTML = '';
  Object.assign(metaTiming, { open: 150, results: 300, set: 150 });
});

describe('Meta work handler', () => {
  it('returns null on a page without the employer combobox', async () => {
    document.body.innerHTML = '<form><input></form>';
    expect(await fillMetaWork(b2Profile())).toBeNull();
  });

  it('fills the empty entry, adds one for the second job and fills every field', async () => {
    mount();
    const r = await fillMetaWork(b2Profile());
    expect(entries().length).toBe(2);
    expect([text(0, '[aria-label="Employer name"]'), text(1, '[aria-label="Employer name"]')]).toEqual(['Analytical Engines', 'Difference Co']);
    expect([text(0, '[aria-label=Position]'), text(1, '[aria-label=Position]')]).toEqual(['Staff Engineer', 'Engineer']);
    expect(field(0, 'input[role=combobox]').value).toBe('London, State, Country');
    expect(field(0, 'input[aria-label^="Start"]').value).toBe('03/2021');
    expect(field(0, 'input[aria-label^="End"]').value).toBe('');
    expect(field(0, 'input[type=checkbox]').checked).toBe(true);
    expect(field(1, 'input[aria-label^="Start"]').value).toBe('09/2018');
    expect(field(1, 'input[aria-label^="End"]').value).toBe('02/2021');
    expect(field(1, 'input[type=checkbox]').checked).toBe(false);
    expect([field(0, 'textarea').value, field(1, 'textarea').value]).toEqual(['Led the platform team.', 'Built compilers.']);
    expect(r?.name).toBe('meta');
    expect(r?.work).toBe(true);
    expect(r?.edu).toBe(false);
    const keys = new Set(r!.filled.map((f) => f.key));
    for (const k of ['work.company', 'work.title', 'work.location', 'work.startDate', 'work.endDate', 'work.current', 'work.description']) expect(keys.has(k as never)).toBe(true);
    expect(r!.filled[0].label).toBe('Staff Engineer @ Analytical Engines');
    expect(r!.touched.length).toBeGreaterThan(8);
  }, 15000);

  it('a second run changes nothing', async () => {
    mount();
    await fillMetaWork(b2Profile());
    const before = document.body.innerHTML;
    const r = await fillMetaWork(b2Profile());
    expect(document.body.innerHTML).toBe(before);
    expect(r?.filled).toEqual([]);
    expect(entries().length).toBe(2);
  }, 15000);

  it('leaves an entry that already holds the employer alone and does not add for it', async () => {
    mount({ employer: 'Analytical Engines' });
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    const r = await fillMetaWork(p);
    expect(entries().length).toBe(1);
    expect(field(0, 'textarea').value).toBe('');
    expect(r?.filled).toEqual([]);
  });

  it('retries a popover that fails to open the first time', async () => {
    mount({ failOpens: 1 });
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    await fillMetaWork(p);
    expect(text(0, '[aria-label="Employer name"]')).toBe('Analytical Engines');
  }, 15000);

  it('a position that cannot be found does not stop the dates and description', async () => {
    mount({ noPositionOptions: true });
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    const r = await fillMetaWork(p);
    expect(text(0, '[aria-label=Position]')).toBe('Position');
    expect(field(0, 'input[aria-label^="Start"]').value).toBe('03/2021');
    expect(field(0, 'textarea').value).toBe('Led the platform team.');
    expect(r!.filled.some((f) => f.key === 'work.title')).toBe(false);
    expect(r!.filled.some((f) => f.key === 'work.description')).toBe(true);
  }, 15000);

  it('does not add entries beyond the profile and survives a missing Add link', async () => {
    mount();
    document.getElementById('add')!.remove();
    const r = await fillMetaWork(b2Profile());
    expect(entries().length).toBe(1);
    expect(r!.filled.some((f) => f.label.includes('Analytical'))).toBe(true);
    expect(r!.filled.some((f) => f.label.includes('Difference'))).toBe(false);
  }, 15000);
});
