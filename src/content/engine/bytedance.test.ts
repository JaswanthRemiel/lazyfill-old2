import { beforeEach, describe, expect, it } from 'vitest';
import { bytedanceTiming, fillBytedance } from './bytedance';
import { b2Profile } from './siteFixtures';

const workCard = (company = '') => `<div class="apply-form-array-card__x">
  <div data-form-field-id="company"><input class="ud__native-input" value="${company}"></div>
  <div data-form-field-id="title"><input class="ud__native-input"></div>
  <div data-form-field-id="desc"><textarea></textarea></div>
  <div data-form-field-id="start_end_time"><div class="throne-biz-date-range-picker-input"><input class="ud__native-input"><input class="ud__native-input"></div></div></div>`;
const eduCard = (school = '') => `<div class="apply-form-array-card__y">
  <div data-form-field-id="school"><input class="ud__native-input" value="${school}"></div>
  <div data-form-field-id="field_of_study"><input class="ud__native-input"></div>
  <div data-form-field-id="degree"><div class="ud__select__selector"><span class="shown"></span></div></div>
  <div data-form-field-id="start_end_time"><div class="throne-biz-date-range-picker-input"><input><input></div></div></div>`;

function mount(opts: { career?: string[]; intern?: boolean; edu?: string[]; noEduAdd?: boolean } = {}) {
  const list = (id: string, cards: string, add: string) =>
    `<div id="formily-item-${id}"><div class="cards">${cards}</div><button class="apply-form-array-card-add-float-right__z" type="button">Add</button></div>`;
  document.body.innerHTML =
    list('career_list', (opts.career ?? []).map(workCard).join(''), 'w') +
    (opts.intern ? list('internship_list', '', 'w') : '') +
    (opts.edu ? list('education_list', opts.edu.map(eduCard).join(''), 'e') : '');
  for (const id of ['career_list', 'internship_list']) {
    const b = document.querySelector(`#formily-item-${id} > button`);
    b?.addEventListener('click', () => b.parentElement!.querySelector('.cards')!.insertAdjacentHTML('beforeend', workCard()));
  }
  const eb = document.querySelector('#formily-item-education_list > button');
  if (opts.noEduAdd) eb?.remove();
  else eb?.addEventListener('click', () => eb.parentElement!.querySelector('.cards')!.insertAdjacentHTML('beforeend', eduCard()));
  // degree dropdown: opens a list of options in a portal, picking one shows it
  document.addEventListener('click', onDocClick);
}
function onDocClick(e: Event) {
  const t = e.target as Element;
  const sel = t.closest('.ud__select__selector');
  if (sel) {
    document.querySelector('#portal')?.remove();
    const portal = document.createElement('div');
    portal.id = 'portal';
    portal.innerHTML = ['High School', "Associate's Degree", "Bachelor's Degree", "Master's Degree"].map((o) => `<div class="ud__select__option" role="option">${o}</div>`).join('');
    portal.addEventListener('click', (ev) => {
      const o = (ev.target as Element).closest('[role=option]');
      if (o) { sel.querySelector('.shown')!.textContent = o.textContent; portal.remove(); }
    });
    document.body.appendChild(portal);
  }
}
const vals = (sel: string) => [...document.querySelectorAll<HTMLInputElement>(sel)].map((i) => i.value);

beforeEach(() => {
  document.removeEventListener('click', onDocClick);
  document.body.innerHTML = '';
  bytedanceTiming.present = 80;
  bytedanceTiming.options = 300;
});

describe('ByteDance / TikTok handler', () => {
  it('returns null when none of the list containers exist', async () => {
    document.body.innerHTML = '<div class="apply-form-array-card__x"><div data-form-field-id="company"><input></div></div>';
    expect(await fillBytedance(b2Profile())).toBeNull();
    expect(document.querySelector('input')!.value).toBe('');
  });

  it('adds cards, fills every field and reports them', async () => {
    mount({ edu: [] });
    const r = await fillBytedance(b2Profile());
    expect(vals('#formily-item-career_list [data-form-field-id=company] input')).toEqual(['Analytical Engines', 'Difference Co']);
    expect(vals('#formily-item-career_list [data-form-field-id=title] input')).toEqual(['Staff Engineer', 'Engineer']);
    expect([...document.querySelectorAll<HTMLTextAreaElement>('textarea')].map((t) => t.value)).toEqual(['Led the platform team.', 'Built compilers.']);
    const dates = vals('#formily-item-career_list .throne-biz-date-range-picker-input input');
    expect(dates).toEqual(['2021-03', 'Present', '2018-09', '2021-02']);
    expect(vals('#formily-item-education_list [data-form-field-id=school] input')).toEqual(['University of London']);
    expect(document.querySelector('#formily-item-education_list .shown')!.textContent).toBe("Bachelor's Degree");
    expect(vals('#formily-item-education_list [data-form-field-id=field_of_study] input')).toEqual(['Mathematics']);
    expect(vals('#formily-item-education_list .throne-biz-date-range-picker-input input')).toEqual(['2014-09', '2018-06']);
    expect(r?.work).toBe(true);
    expect(r?.edu).toBe(true);
    const keys = new Set(r!.filled.map((f) => f.key));
    for (const k of ['work.company', 'work.title', 'work.description', 'work.startDate', 'work.endDate', 'work.current', 'edu.school', 'edu.degree', 'edu.field', 'edu.startDate', 'edu.endDate']) {
      expect(keys.has(k as never)).toBe(true);
    }
    expect(r!.filled.find((f) => f.key === 'work.title')!.label).toBe('Staff Engineer @ Analytical Engines');
    expect(r!.filled.find((f) => f.key === 'edu.school')!.label).toBe('University of London');
    expect(r!.touched.length).toBeGreaterThan(8);
  });

  it('a second run changes nothing and adds no cards', async () => {
    mount({ edu: [] });
    await fillBytedance(b2Profile());
    const before = document.body.innerHTML;
    const r = await fillBytedance(b2Profile());
    expect(document.body.innerHTML).toBe(before);
    expect(r?.filled).toEqual([]);
    expect(document.querySelectorAll('[class*="apply-form-array-card__"]').length).toBe(3);
  });

  it('leaves an existing filled card alone and only adds the missing job', async () => {
    mount({ career: ['Analytical Engines'] });
    await fillBytedance(b2Profile());
    expect(vals('[data-form-field-id=company] input')).toEqual(['Analytical Engines', 'Difference Co']);
    expect(vals('[data-form-field-id=title] input')[0]).toBe('');
  });

  it('reuses an empty card before adding', async () => {
    mount({ career: [''] });
    await fillBytedance(b2Profile());
    expect(vals('[data-form-field-id=company] input')).toEqual(['Analytical Engines', 'Difference Co']);
    expect(document.querySelectorAll('#formily-item-career_list [class*="apply-form-array-card__"]').length).toBe(2);
  });

  it('sends interns to the internship list when there is one', async () => {
    mount({ intern: true });
    const p = b2Profile();
    p.workExperience.push({ jobTitle: 'Summer Trainee', companyName: 'Babbage Ltd', location: '', startDate: '2017-06', endDate: '2017-08', isCurrent: false, description: '' });
    await fillBytedance(p);
    expect(vals('#formily-item-career_list [data-form-field-id=title] input')).toEqual(['Staff Engineer', 'Engineer']);
    expect(vals('#formily-item-internship_list [data-form-field-id=title] input')).toEqual(['Summer Trainee']);
  });

  it('clicks the Present cell of the opened panel for a current job', async () => {
    mount({});
    const end = () => document.querySelectorAll<HTMLInputElement>('.throne-biz-date-range-picker-input input')[1];
    document.addEventListener('click', function once(e) {
      const t = e.target as HTMLInputElement;
      if (t === end() && !document.querySelector('#panel')) {
        const panel = document.createElement('div');
        panel.id = 'panel';
        panel.innerHTML = '<span class="cell">Present</span>';
        panel.addEventListener('click', () => { t.value = 'Present'; });
        document.body.appendChild(panel);
        document.removeEventListener('click', once);
      }
    });
    const p = b2Profile();
    p.workExperience = [p.workExperience[0]];
    await fillBytedance(p);
    expect(end().value).toBe('Present');
  });

  it('a degree dropdown that offers nothing suitable does not stop the other fields', async () => {
    mount({ edu: [] });
    const p = b2Profile();
    p.education[0].degree = 'Doctor of Philosophy';
    p.workExperience = [];
    const r = await fillBytedance(p);
    expect(document.querySelector('#formily-item-education_list .shown')!.textContent).toBe('');
    expect(vals('#formily-item-education_list [data-form-field-id=school] input')).toEqual(['University of London']);
    expect(r!.filled.some((f) => f.key === 'edu.degree')).toBe(false);
    expect(r!.filled.some((f) => f.key === 'edu.endDate')).toBe(true);
  });

  it('does not add when there is no add control', async () => {
    mount({ edu: [], noEduAdd: true });
    const p = b2Profile();
    p.workExperience = [];
    const r = await fillBytedance(p);
    expect(document.querySelectorAll('#formily-item-education_list [class*="apply-form-array-card__"]').length).toBe(0);
    expect(r!.filled).toEqual([]);
  });
});
