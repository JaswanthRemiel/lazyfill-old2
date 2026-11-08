import { beforeEach, describe, expect, it } from 'vitest';
import { parseYearMonth, toYearMonth } from '../../shared/dates';
import { emptyProfileData, type ProfileData } from '../../shared/profile';
import { generic } from '../adapters/registry';
import { detectFields } from './detect';
import { classifyEntryFields, degreeAlternatives } from './entries';
import { autofill } from './run';

function profile(): ProfileData {
  const p = emptyProfileData();
  Object.assign(p.personalInfo, { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' });
  p.workExperience = [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Led the platform team.' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds', startDate: '2018-09', endDate: '2021-02', isCurrent: false, description: 'Built compilers.' },
    { jobTitle: 'Intern', companyName: 'Babbage Ltd', location: '', startDate: '2017-06', endDate: '2017-08', isCurrent: false, description: '' },
  ];
  p.education = [
    { schoolName: 'University of London', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2014-09', graduationDate: '2018-06', currentlyEnrolled: false },
    { schoolName: 'Open Academy', degree: 'High School Diploma', fieldOfStudy: 'General', gpa: '', startDate: '2010-09', graduationDate: '2014-06', currentlyEnrolled: false },
  ];
  return p;
}

const run = (p = profile(), over = {}) =>
  autofill({ profile: p, adapter: generic, getResume: async () => null, detect: { skipVisibilityCheck: true }, settleMs: 0, ...over });
const v = (sel: string) => (document.querySelector(sel) as HTMLInputElement | HTMLSelectElement).value;
const sel = (sel: string) => (document.querySelector(sel) as HTMLSelectElement).selectedOptions[0]?.textContent;

const MONTH_OPTS = `<option value="">Month</option>${['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}`;
const DEGREES = `<option value="">Select</option><option>High School</option><option>Associate's Degree</option><option>Bachelor's Degree</option><option>Master's Degree</option><option>Doctor of Philosophy (Ph.D.)</option>`;

/** Mimics Greenhouse's new application form: indexed ids and a real "Add another" button that appends blocks. */
function greenhouseLike() {
  const edu = (i: number) => `
    <div class="education-block">
      <label for="school--${i}">School</label><input id="school--${i}" type="text">
      <label for="degree--${i}">Degree</label><select id="degree--${i}">${DEGREES}</select>
      <label for="discipline--${i}">Discipline</label><input id="discipline--${i}" type="text">
      <label for="start-month--${i}">Start date month</label><select id="start-month--${i}">${MONTH_OPTS}</select>
      <label for="start-year--${i}">Start date year</label><input id="start-year--${i}" type="text">
      <label for="end-month--${i}">End date month</label><select id="end-month--${i}">${MONTH_OPTS}</select>
      <label for="end-year--${i}">End date year</label><input id="end-year--${i}" type="text">
    </div>`;
  const job = (i: number) => `
    <div class="job-block">
      <label for="company-name-${i}">Company name</label><input id="company-name-${i}" type="text">
      <label for="title-${i}">Title</label><input id="title-${i}" type="text">
      <label for="start-date-month-${i}">Start date month</label><select id="start-date-month-${i}">${MONTH_OPTS}</select>
      <label for="start-date-year-${i}">Start date year</label><input id="start-date-year-${i}" type="text">
      <label for="end-date-month-${i}">End date month</label><select id="end-date-month-${i}">${MONTH_OPTS}</select>
      <label for="end-date-year-${i}">End date year</label><input id="end-date-year-${i}" type="text">
      <label><input type="checkbox" id="current-role-${i}"> Current role</label>
    </div>`;
  document.body.innerHTML = `
    <form>
      <label for="first_name">First Name</label><input id="first_name">
      <div class="education--container"><h3>Education</h3><div id="edu-list">${edu(0)}</div><button type="button" class="add-another-button">Add another</button></div>
      <div class="employment--container"><h3>Employment</h3><div id="job-list">${job(0)}</div><button type="button" class="add-another-button">Add another</button></div>
    </form>`;
  let e = 1, j = 1;
  document.querySelector('.education--container .add-another-button')!.addEventListener('click', () => document.getElementById('edu-list')!.insertAdjacentHTML('beforeend', edu(e++)));
  document.querySelector('.employment--container .add-another-button')!.addEventListener('click', () => document.getElementById('job-list')!.insertAdjacentHTML('beforeend', job(j++)));
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('repeating work and education sections (Greenhouse-style indexed ids)', () => {
  it('adds as many entries as the profile has, then fills each one in order', async () => {
    greenhouseLike();
    expect(document.querySelectorAll('[id^="company-name-"]')).toHaveLength(1);
    const r = await run();
    expect(document.querySelectorAll('[id^="company-name-"]')).toHaveLength(3);
    expect(document.querySelectorAll('[id^="school--"]')).toHaveLength(2);

    // entry 0: current job
    expect(v('#company-name-0')).toBe('Analytical Engines');
    expect(v('#title-0')).toBe('Staff Engineer');
    expect(sel('#start-date-month-0')).toBe('March');
    expect(v('#start-date-year-0')).toBe('2021');
    expect((document.querySelector('#current-role-0') as HTMLInputElement).checked).toBe(true);
    expect(v('#end-date-year-0')).toBe(''); // still employed: no end date

    // entry 1 and 2
    expect(v('#company-name-1')).toBe('Difference Co');
    expect(sel('#start-date-month-1')).toBe('September');
    expect(sel('#end-date-month-1')).toBe('February');
    expect(v('#end-date-year-1')).toBe('2021');
    expect((document.querySelector('#current-role-1') as HTMLInputElement).checked).toBe(false);
    expect(v('#company-name-2')).toBe('Babbage Ltd');
    expect(v('#title-2')).toBe('Intern');

    // education, including turning "BSc" into the dropdown's wording
    expect(v('#school--0')).toBe('University of London');
    expect(sel('#degree--0')).toBe("Bachelor's Degree");
    expect(v('#discipline--0')).toBe('Mathematics');
    expect(sel('#start-month--0')).toBe('September');
    expect(v('#end-year--0')).toBe('2018');
    expect(v('#school--1')).toBe('Open Academy');
    expect(sel('#degree--1')).toBe('High School');
    expect(r.filled.some((f) => f.key === 'work.company')).toBe(true);
    expect(v('#first_name')).toBe('Ada'); // the rest of the form still works
  });

  it('does not add entries beyond what the profile has', async () => {
    greenhouseLike();
    const p = profile();
    p.workExperience = p.workExperience.slice(0, 1);
    p.education = [];
    await run(p);
    expect(document.querySelectorAll('[id^="company-name-"]')).toHaveLength(1);
    expect(document.querySelectorAll('[id^="school--"]')).toHaveLength(1);
    expect(v('#school--0')).toBe(''); // no education in the profile: left alone
  });

  it('is idempotent: running again neither duplicates entries nor overwrites', async () => {
    greenhouseLike();
    await run();
    await run();
    expect(document.querySelectorAll('[id^="company-name-"]')).toHaveLength(3);
    expect(v('#company-name-2')).toBe('Babbage Ltd');
  });

  it('keeps going when the site has no add button (fills what is there)', async () => {
    greenhouseLike();
    document.querySelectorAll('.add-another-button').forEach((b) => b.remove());
    await run();
    expect(document.querySelectorAll('[id^="company-name-"]')).toHaveLength(1);
    expect(v('#company-name-0')).toBe('Analytical Engines');
  });
});

describe('repeating sections with no stable ids (headings only)', () => {
  function plain(blocks = 1) {
    const block = `<div class="entry">
      <label>Company <input type="text" name="c"></label>
      <label>Job title <input type="text" name="t"></label>
      <label>Start date <input type="month" name="s"></label>
      <label>End date <input type="month" name="e"></label>
    </div>`;
    document.body.innerHTML = `<form><section><h2>Work Experience</h2><div id="list">${block.repeat(blocks)}</div><button type="button" id="add">Add experience</button></section></form>`;
    document.getElementById('add')!.addEventListener('click', () => document.getElementById('list')!.insertAdjacentHTML('beforeend', block));
  }
  it('uses the heading to know it is a work section and the order of the fields to pair them', async () => {
    plain();
    await run();
    const companies = [...document.querySelectorAll<HTMLInputElement>('[name=c]')];
    expect(companies.map((c) => c.value)).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    const starts = [...document.querySelectorAll<HTMLInputElement>('[name=s]')].map((s) => s.value);
    expect(starts).toEqual(['2021-03', '2018-09', '2017-06']); // type=month wants YYYY-MM
    const ends = [...document.querySelectorAll<HTMLInputElement>('[name=e]')].map((s) => s.value);
    expect(ends).toEqual(['', '2021-02', '2017-08']);
  });
  it('does not mistake a work heading for education', () => {
    plain();
    const fields = classifyEntryFields(detectFields(document, { skipVisibilityCheck: true }));
    expect(new Set(fields.map((f) => f.kind))).toEqual(new Set(['work']));
  });
  it('a standalone "Add" button without a section is never clicked', async () => {
    document.body.innerHTML = `<form><label>Company <input name="c"></label><button type="button" id="add">Add</button></form>`;
    let clicked = false;
    document.getElementById('add')!.addEventListener('click', () => { clicked = true; });
    await run();
    expect(clicked).toBe(false);
  });
});

describe('entries with no heading or telling class, and sites that re-render new blocks', () => {
  it('finds the section from the company/title fields themselves and refills values a re-render wiped', async () => {
    const block = `<div><div>
      <label>Job title <input type="text" name="t"></label>
      <label>Company <input type="text" name="c"></label>
      <label>Start date <input type="month" name="s"></label>
      <label>Description <textarea name="d"></textarea></label>
    </div></div>`;
    document.body.innerHTML = `<form><div id="list">${block}</div><button type="button" id="add">Add another</button></form>`;
    let wiped = false;
    document.getElementById('add')!.addEventListener('click', () => document.getElementById('list')!.insertAdjacentHTML('beforeend', block));
    // the site clears the first company once, shortly after it was filled
    document.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (!wiped && t.name === 'c' && t.value === 'Analytical Engines') { wiped = true; setTimeout(() => { t.value = ''; }, 10); }
    });
    await run(profile(), { overwrite: false });
    const out = [...document.querySelectorAll<HTMLInputElement>('[name=c]')].map((c) => c.value);
    expect(out).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    expect([...document.querySelectorAll<HTMLTextAreaElement>('[name=d]')][1].value).toBe('Built compilers.');
  });
});

describe('Greenhouse ids drive the entry, whatever the markup around them', () => {
  it('fills company, title, dates and current role by id, with no headings or section classes', async () => {
    const job = (i: number) => `<div><div>
      <label for="company-name-${i}">Company name</label><input id="company-name-${i}" type="text">
      <label for="title-${i}">Title</label><input id="title-${i}" type="text">
      <label for="start-date-month-${i}">Month</label><select id="start-date-month-${i}">${MONTH_OPTS}</select>
      <label for="start-date-year-${i}">Year</label><input id="start-date-year-${i}" type="text">
      <label for="end-date-month-${i}">Month</label><select id="end-date-month-${i}">${MONTH_OPTS}</select>
      <label for="end-date-year-${i}">Year</label><input id="end-date-year-${i}" type="text">
      <label><input type="checkbox" id="current-role-${i}"> Current role</label>
    </div></div>`;
    document.body.innerHTML = `<form><div id="w"><div id="list">${job(0)}</div><button type="button" class="add-another-button">Add another</button></div></form>`;
    let n = 1;
    document.querySelector('.add-another-button')!.addEventListener('click', () => document.getElementById('list')!.insertAdjacentHTML('beforeend', job(n++)));
    await run();
    expect([0, 1, 2].map((i) => v(`#company-name-${i}`))).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    expect([0, 1, 2].map((i) => v(`#title-${i}`))).toEqual(['Staff Engineer', 'Engineer', 'Intern']);
    expect([0, 1, 2].map((i) => v(`#start-date-year-${i}`))).toEqual(['2021', '2018', '2017']);
    expect(sel('#start-date-month-1')).toBe('September');
    expect((document.querySelector('#current-role-0') as HTMLInputElement).checked).toBe(true);
    expect(v('#end-date-year-1')).toBe('2021');
  });
});

describe('sites that open a form per entry (Add, fill, Save)', () => {
  it('adds and fills each job in turn, saving every one', async () => {
    document.body.innerHTML = `<form><h2>Work Experience</h2><div id="saved"></div><div id="slot"></div><button type="button" id="add">Add Experience</button></form>`;
    const slot = document.getElementById('slot')!;
    document.getElementById('add')!.addEventListener('click', () => {
      slot.innerHTML = `<div role="dialog"><label>Job Title <input name="t"></label><label>Employer <input name="c"></label>
        <label>Start date <input type="month" name="s"></label><button type="button" id="save">Save</button></div>`;
      document.getElementById('save')!.addEventListener('click', () => {
        const c = (slot.querySelector('[name=c]') as HTMLInputElement).value;
        const t = (slot.querySelector('[name=t]') as HTMLInputElement).value;
        document.getElementById('saved')!.insertAdjacentHTML('beforeend', `<p class="job">${t}|${c}</p>`);
        slot.innerHTML = '';
      });
    });
    await run();
    const jobs = [...document.querySelectorAll('.job')].map((j) => j.textContent);
    expect(jobs).toEqual(['Staff Engineer|Analytical Engines', 'Engineer|Difference Co', 'Intern|Babbage Ltd']);
  });
});

describe('skills are added one at a time', () => {
  it('types each skill into a chip input and presses Enter', async () => {
    document.body.innerHTML = `<form><label>Skills <input id="sk" type="text"></label><div id="chips"></div></form>`;
    const input = document.getElementById('sk') as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !input.value) return;
      document.getElementById('chips')!.insertAdjacentHTML('beforeend', `<span class="chip">${input.value}</span>`);
      input.value = '';
    });
    const p = profile();
    p.skills = ['Python', 'React', 'AWS'];
    await run(p);
    expect([...document.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['Python', 'React', 'AWS']);
  });

  it('clicks "Add skill" for each one when the site opens a small form', async () => {
    document.body.innerHTML = `<form><div id="list"></div><div id="slot"></div><button type="button" id="add">Add Skill</button></form>`;
    const slot = document.getElementById('slot')!;
    document.getElementById('add')!.addEventListener('click', () => {
      slot.innerHTML = `<div role="dialog"><label>Skill <input name="skills"></label><button type="button" id="save">Save</button></div>`;
      document.getElementById('save')!.addEventListener('click', () => {
        document.getElementById('list')!.insertAdjacentHTML('beforeend', `<i class="s">${(slot.querySelector('input') as HTMLInputElement).value}</i>`);
        slot.innerHTML = '';
      });
    });
    const p = profile();
    p.skills = ['Python', 'React'];
    p.workExperience = []; p.education = [];
    await run(p);
    expect([...document.querySelectorAll('.s')].map((c) => c.textContent)).toEqual(['Python', 'React']);
  });
});

describe('Workday My Experience page', () => {
  let n = 1;
  const job = (i: number) => `<div role="group" aria-labelledby="Work-Experience-${i}-panel"><h4 id="Work-Experience-${i}-panel">Work Experience ${i}</h4>
    <div data-fkit-id="workExperience-${i}--jobTitle"><input id="workExperience-${i}--jobTitle" data-automation-id="formField-jobTitle"></div>
    <input id="workExperience-${i}--companyName">
    <input id="workExperience-${i}--location">
    <input type="checkbox" id="workExperience-${i}--currentlyWorkHere">
    <div><input id="workExperience-${i}--startDate-dateSectionMonth-input"><input id="workExperience-${i}--startDate-dateSectionYear-input"></div>
    <div><input id="workExperience-${i}--endDate-dateSectionMonth-input"><input id="workExperience-${i}--endDate-dateSectionYear-input"></div>
    <textarea id="workExperience-${i}--roleDescription"></textarea></div>`;
  it('adds each job, fills only that job, includes description, and selects skills from the list', async () => {
    n = 1;
    document.body.innerHTML = `<form><div role="group"><h3>Work Experience</h3><div id="jobs">${job(n)}</div><button data-automation-id="add-button" type="button" id="add">Add</button></div>
      <div role="group"><h3>Skills</h3><input id="skills--skills"><ul id="opts"></ul><div id="picked"></div></div></form>`;
    document.getElementById('add')!.addEventListener('click', () => { n += 2; document.getElementById('jobs')!.insertAdjacentHTML('beforeend', job(n)); });
    const sk = document.getElementById('skills--skills') as HTMLInputElement;
    sk.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !sk.value) return;
      const term = sk.value;
      // the list for this search arrives a moment later, with a near-match first
      setTimeout(() => {
        document.getElementById('opts')!.innerHTML = `<div data-automation-id="activeListContainer" role="listbox">
          <div role="option" aria-label="${term} Pro"><div data-automation-id="promptOption" data-automation-label="${term} Pro">${term} Pro</div></div>
          <div role="option" aria-label="${term}"><div data-automation-id="promptOption" data-automation-label="${term}">${term}</div></div></div>`;
        document.querySelectorAll('[data-automation-id=promptOption]').forEach((o) =>
          o.addEventListener('click', () => {
            document.getElementById('picked')!.insertAdjacentHTML('beforeend', `<b class="pick">${o.getAttribute('data-automation-label')}</b>`);
            document.getElementById('opts')!.innerHTML = '';
          }));
      }, 120);
    });
    const p = profile();
    p.skills = ['Python', 'React'];
    await run(p);
    const titles = [...document.querySelectorAll<HTMLInputElement>('input[id$="--jobTitle"]')].map((e) => e.value);
    expect(titles).toEqual(['Staff Engineer', 'Engineer', 'Intern']);
    const cos = [...document.querySelectorAll<HTMLInputElement>('input[id$="--companyName"]')].map((e) => e.value);
    expect(cos).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    const desc = [...document.querySelectorAll<HTMLTextAreaElement>('textarea')].map((e) => e.value);
    expect(desc).toEqual(['Led the platform team.', 'Built compilers.', '']);
    expect((document.getElementById('workExperience-1--currentlyWorkHere') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('workExperience-3--startDate-dateSectionYear-input') as HTMLInputElement).value).toBe('2018');
    expect((document.getElementById('workExperience-3--endDate-dateSectionMonth-input') as HTMLInputElement).value).toBe('02');
    expect([...document.querySelectorAll('.pick')].map((e) => e.textContent)).toEqual(['Python', 'React']);
  });
});

describe('site-specific forms', () => {
  it('fills experienceData[N] array forms by id, adding rows with the section button', async () => {
    const row = (i: number) => `<fieldset id="experienceData[${i}]">
      <input id="experienceData[${i}].title"><input id="experienceData[${i}].companyName"><input id="experienceData[${i}].location">
      <textarea id="experienceData[${i}].description"></textarea></fieldset>`;
    document.body.innerHTML = `<form><div id="rows">${row(0)}</div><button class="array-button-add" id="array-button-add-experienceData" type="button">Add</button></form>`;
    let n = 1;
    document.getElementById('array-button-add-experienceData')!.addEventListener('click', () => document.getElementById('rows')!.insertAdjacentHTML('beforeend', row(n++)));
    await run();
    const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect([0, 1, 2].map((i) => g(`experienceData[${i}].companyName`))).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    expect(g('experienceData[1].description')).toBe('Built compilers.');
  });

  it('fills ByteDance-style cards, sending interns to the internship list', async () => {
    const card = `<div class="apply-form-array-card__x">
      <div data-form-field-id="company"><input class="ud__native-input"></div>
      <div data-form-field-id="title"><input class="ud__native-input"></div>
      <div data-form-field-id="desc"><textarea></textarea></div>
      <div data-form-field-id="start_end_time"><div class="throne-biz-date-range-picker-input"><input class="ud__native-input"><input class="ud__native-input"></div></div></div>`;
    document.body.innerHTML = `<div id="formily-item-career_list"><div class="cards"></div><button class="apply-form-array-card-add-float-right__y" type="button">Add</button></div>
      <div id="formily-item-internship_list"><div class="cards"></div><button class="apply-form-array-card-add-float-right__y" type="button">Add</button></div>`;
    document.querySelectorAll('[id^=formily-item] > button').forEach((b) =>
      b.addEventListener('click', () => b.parentElement!.querySelector('.cards')!.insertAdjacentHTML('beforeend', card)));
    await run();
    const titles = (id: string) => [...document.querySelectorAll<HTMLInputElement>(`#${id} [data-form-field-id=title] input`)].map((i) => i.value);
    expect(titles('formily-item-career_list')).toEqual(['Staff Engineer', 'Engineer']);
    expect(titles('formily-item-internship_list')).toEqual(['Intern']);
    const first = document.querySelectorAll<HTMLInputElement>('#formily-item-career_list [data-form-field-id=start_end_time] input');
    expect([first[0].value, first[1].value]).toEqual(['2021-03', 'Present']);
  });
});

describe('Avature rows, MathWorks modal and skill checkboxes', () => {
  it('adds datasetField rows for work and education and fills each by its labels', async () => {
    const work = (i: number) => `<fieldset class="datasetField__row" id="row_${i}">
      <div class="fieldSpec"><label for="c${i}">Company</label><input id="c${i}"></div>
      <div class="fieldSpec"><label for="t${i}">Job title</label><input id="t${i}"></div>
      <div class="fieldSpec"><label for="s${i}">Start date</label><input id="s${i}" type="month"></div>
      <div class="fieldSpec"><label for="k${i}">Is current position</label><select id="k${i}"><option value="">-</option><option>Yes</option><option>No</option></select></div></fieldset>`;
    const edu = (i: number) => `<fieldset class="datasetField__row"><div class="fieldSpec"><label for="u${i}">School</label><input id="u${i}"></div></fieldset>`;
    document.body.innerHTML = `<form>
      <fieldset id="fieldSpecContainer1"><legend>Work experience</legend><div id="w">${work(0)}</div><a id="addRowFor_1" href="#">Add</a></fieldset>
      <fieldset id="fieldSpecContainer2"><legend>Education</legend><div id="e">${edu(0)}</div><a id="addRowFor_2" href="#">Add</a></fieldset>
      <fieldset><legend>Which of the following skills do you have?</legend>
        <label><input type="checkbox" id="b1"> Python</label><label><input type="checkbox" id="b2"> Cobol</label><label><input type="checkbox" id="b3"> React</label></fieldset></form>`;
    let w = 1, e = 1;
    document.getElementById('addRowFor_1')!.addEventListener('click', (ev) => { ev.preventDefault(); document.getElementById('w')!.insertAdjacentHTML('beforeend', work(w++)); });
    document.getElementById('addRowFor_2')!.addEventListener('click', (ev) => { ev.preventDefault(); document.getElementById('e')!.insertAdjacentHTML('beforeend', edu(e++)); });
    const p = profile();
    p.skills = ['Python', 'React'];
    await run(p);
    const g = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect([0, 1, 2].map((i) => g(`c${i}`))).toEqual(['Analytical Engines', 'Difference Co', 'Babbage Ltd']);
    expect([0, 1, 2].map((i) => g(`t${i}`))).toEqual(['Staff Engineer', 'Engineer', 'Intern']);
    expect(g('s1')).toBe('2018-09');
    expect((document.getElementById('k0') as HTMLSelectElement).value).toBe('Yes');
    expect([0, 1].map((i) => g(`u${i}`))).toEqual(['University of London', 'Open Academy']);
    expect(['b1', 'b2', 'b3'].map((id) => (document.getElementById(id) as HTMLInputElement).checked)).toEqual([true, false, true]);
  });
});

describe('Workday websites and education', () => {
  it('replaces the websites list with linkedin, github and the portfolio, one Add at a time', async () => {
    const row = (u = '') => `<div role="group"><div data-fkit-id="webAddress-1"><input id="webAddress-1--url" name="url" value="${u}"></div><button type="button" class="del"><span class="wd-icon-trash"></span></button></div>`;
    document.body.innerHTML = `<form><div role="group" aria-labelledby="Websites-section"><h3 id="Websites-section">Websites</h3><div id="sites">${row('http://old.example')}</div>
      <button data-automation-id="add-button" type="button" id="addsite">Add</button></div></form>`;
    document.getElementById('sites')!.addEventListener('click', (e) => { const b = (e.target as Element).closest('.del'); if (b) b.closest('[role=group]')!.remove(); });
    document.getElementById('addsite')!.addEventListener('click', () => document.getElementById('sites')!.insertAdjacentHTML('beforeend', row()));
    const p = profile();
    p.links.linkedinUrl = 'https://linkedin.com/in/ada';
    p.links.githubUrl = 'https://github.com/ada';
    p.links.websiteUrl = 'https://ada.dev';
    p.workExperience = []; p.education = []; p.skills = [];
    await run(p);
    const urls = [...document.querySelectorAll<HTMLInputElement>('input[name=url]')].map((i) => i.value);
    expect(urls.sort()).toEqual(['https://ada.dev', 'https://github.com/ada', 'https://linkedin.com/in/ada']);
  });
});

describe('answer bank during autofill', () => {
  it('types "always use my saved answer" entries into the matching question, and leaves AI ones and sensitive ones alone', async () => {
    document.body.innerHTML = `<form>
      <label for="a">Why do you want to work here?</label><textarea id="a"></textarea>
      <label for="b">Describe your biggest technical achievement</label><textarea id="b"></textarea>
      <label for="c">Are you legally authorized to work in the US?</label><textarea id="c"></textarea></form>`;
    const p = profile();
    p.workExperience = []; p.education = [];
    p.answerBank = [
      { question: 'Why do you want to work here?', answer: 'I like the product.', mode: 'static' },
      { question: 'Describe your biggest technical achievement', answer: 'notes', mode: 'llm_with_static_hint' },
      { question: 'Are you legally authorized to work in the US?', answer: 'Yes', mode: 'static' },
    ];
    await run(p);
    const g = (id: string) => (document.getElementById(id) as HTMLTextAreaElement).value;
    expect(g('a')).toBe('I like the product.');
    expect(g('b')).toBe('');
    expect(g('c')).toBe('');
  });
});

describe('phone numbers', () => {
  const withPhone = () => { const p = profile(); p.personalInfo.phoneCountryCode = '+44'; p.personalInfo.phoneNumber = '7700900123'; p.workExperience = []; p.education = []; return p; };
  it('includes the country code when the page has a single phone box', async () => {
    document.body.innerHTML = '<form><label for="p">Phone</label><input id="p" type="tel"></form>';
    await run(withPhone());
    expect(v('#p')).toBe('+44 7700900123');
  });
  it('fills the number alone when the page has its own country-code field', async () => {
    document.body.innerHTML = '<form><label for="c">Country code</label><input id="c"><label for="p">Phone number</label><input id="p" type="tel"></form>';
    await run(withPhone());
    expect(v('#c')).toBe('+44');
    expect(v('#p')).toBe('7700900123');
  });
  it('never puts a + into a numeric input', async () => {
    document.body.innerHTML = '<form><label for="p">Phone</label><input id="p" type="number"></form>';
    await run(withPhone());
    expect(v('#p')).toBe('7700900123');
  });
});

describe('date and degree helpers', () => {
  it.each([
    ['2021-03', { year: '2021', month: 3 }], ['03/2021', { year: '2021', month: 3 }], ['3/2021', { year: '2021', month: 3 }],
    ['March 2021', { year: '2021', month: 3 }], ['Sept 2021', { year: '2021', month: 9 }], ['2021', { year: '2021' }],
    ['2021-13', { year: '2021' }], ['garbage', {}], ['', {}],
  ])('parseYearMonth(%s)', (input, out) => expect(parseYearMonth(input)).toEqual(out));
  it('toYearMonth normalises', () => { expect(toYearMonth('3/2021')).toBe('2021-03'); expect(toYearMonth('nope')).toBe(''); });
  it('degreeAlternatives maps abbreviations to dropdown wording', () => {
    expect(degreeAlternatives('BSc')).toContain("Bachelor's Degree");
    expect(degreeAlternatives('M.S.')).toContain("Master's Degree");
    expect(degreeAlternatives('MBA')).toContain('Master of Business Administration');
    expect(degreeAlternatives('PhD')).toContain('Doctor of Philosophy (Ph.D.)');
    expect(degreeAlternatives('Bachelor of Arts')[0]).toBe('Bachelor of Arts');
  });
});
