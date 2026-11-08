import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProfileData, type ProfileData } from '../../shared/profile';
import { detectFields } from './detect';
import {
  addButtonsFor, classifyEntryFields, degreeAlternatives, ensureEntryCount, entryKeyOf, entryValue, fillEntryField,
  pickReactDatepicker, pickTeslaDate, sectionOf, type EntryField,
} from './entries';

const O = { skipVisibilityCheck: true };
function profile(): ProfileData {
  const p = emptyProfileData();
  p.workExperience = [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Led.' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds', startDate: '2018-09', endDate: '2021-02', isCurrent: false, description: 'Built.' },
  ];
  p.education = [
    { schoolName: 'Uni of London', degree: 'BSc', fieldOfStudy: 'Maths', gpa: '3.9', startDate: '2014-09', graduationDate: '2018-06', currentlyEnrolled: false },
    { schoolName: 'Open Academy', degree: 'PhD', fieldOfStudy: 'Logic', gpa: '', startDate: '2019-09', graduationDate: '2024-06', currentlyEnrolled: true },
  ];
  return p;
}
const classify = () => classifyEntryFields(detectFields(document, O));
const find = (id: string) => classify().find((e) => e.f.id === id)!;
beforeEach(() => { document.body.innerHTML = ''; });

describe('entryValue', () => {
  const p = profile();
  it('maps keys and indexes', () => {
    expect(entryValue('work.company', p, 1)).toBe('Difference Co');
    expect(entryValue('work.startYear', p, 0)).toBe('2021-03');
    expect(entryValue('edu.field', p, 0)).toBe('Maths');
    expect(entryValue('edu.gpa', p, 0)).toBe('3.9');
  });
  it('end dates are empty for current positions and enrolled education', () => {
    expect(entryValue('work.endDate', p, 0)).toBe('');
    expect(entryValue('work.endMonth', p, 1)).toBe('2021-02');
    expect(entryValue('edu.endYear', p, 1)).toBe('');
    expect(entryValue('edu.endYear', p, 0)).toBe('2018-06');
  });
  it('current keys are yes or empty; out of range is empty', () => {
    expect(entryValue('work.current', p, 0)).toBe('yes');
    expect(entryValue('work.current', p, 1)).toBe('');
    expect(entryValue('edu.current', p, 1)).toBe('yes');
    expect(entryValue('work.title', p, 5)).toBe('');
    expect(entryValue('edu.school', p, -1)).toBe('');
  });
});

describe('degreeAlternatives', () => {
  it.each([
    ['B.S.', 'Bachelor of Science'], ['BA', 'Bachelor of Arts'], ['B.Tech', 'Bachelor of Technology'], ['B.E.', 'Bachelor of Engineering'],
    ['MSc', 'Master of Science'], ['M.Tech', 'Master of Technology'], ['MBA', "Master's Degree"], ['Ph.D.', 'Doctor of Philosophy (Ph.D.)'],
    ['Doctorate', 'Doctoral Degree'], ['Associate of Arts', "Associate's Degree"], ['AA', 'Associate of Arts'],
    ['GED', 'High School'], ['High School Diploma', 'High School'], ['Diploma', 'High School Diploma'], ['Bachelor of Arts in History', "Bachelor's Degree"],
    ['Masters', "Master's Degree"],
  ])('%s offers %s', (input, wanted) => {
    const a = degreeAlternatives(input);
    expect(a[0]).toBe(input);
    expect(a).toContain(wanted);
  });
  it('has no duplicates, ignores case, and handles unknown text', () => {
    const a = degreeAlternatives('bachelor');
    expect(new Set(a.map((s) => s.toLowerCase())).size).toBe(a.length);
    expect(degreeAlternatives('Certificate of Awesomeness')).toEqual(['Certificate of Awesomeness']);
    expect(degreeAlternatives('  ')).toEqual([]);
  });
});

describe('classification', () => {
  it('table ids: 1-based Greenhouse numbering is normalised to 0', () => {
    document.body.innerHTML = ['1', '2'].map((i) => `<input id="company-name-${i}"><input id="title-${i}"><input id="start-date-year-${i}">`).join('');
    expect(classify().map((e) => `${e.key}:${e.index}`)).toEqual([
      'work.company:0', 'work.title:0', 'work.startYear:0', 'work.company:1', 'work.title:1', 'work.startYear:1',
    ]);
  });
  it('Tesla and array-style names are classified from the table', () => {
    document.body.innerHTML = `<input name="workExperience.employers[0].companyName"><input name="workExperience.employers[0].jobTitle">
      <input name="workExperience.employers[0].startDate"><input name="workExperience.employers[0].endDate"><input type="checkbox" name="workExperience.employers[0].isCurrent">
      <textarea name="workExperience.employers[0].summaryDuties"></textarea>
      <input name="educationData[0].schoolName"><input name="educationData[0].major"><input name="educationData[0].gradeAverage"><input name="educationData[1].schoolName">
      <input name="educationData[0].fromTo.startDate"><input name="experienceData[0].fromTo.currentlyWorkHere" type="checkbox">`;
    expect(classify().map((e) => e.key)).toEqual([
      'work.company', 'work.title', 'work.startDate', 'work.endDate', 'work.current', 'work.description',
      'edu.school', 'edu.field', 'edu.gpa', 'edu.school', 'edu.startDate', 'work.current',
    ]);
    expect(classify().filter((e) => e.key === 'edu.school').map((e) => e.index)).toEqual([0, 1]);
  });
  it('a company field in an education heading is never mistaken: school and degree fields stay education', () => {
    document.body.innerHTML = `<form><h2>Work Experience</h2><div><label>Company <input name="a"></label><label>Start date <input type="month" name="b"></label></div>
      <h2>Education</h2><div><label>School <input name="c"></label><label>Degree <input name="d"></label><label>Start date <input type="month" name="e"></label></div></form>`;
    expect(classify().map((e) => `${e.kind}:${e.key}`)).toEqual(['work:work.company', 'work:work.startDate', 'edu:edu.school', 'edu:edu.degree', 'edu:edu.startDate']);
  });
  it('ignores files, radios, plain textareas and checkboxes unrelated to current/enrolled', () => {
    document.body.innerHTML = `<form><h2>Work Experience</h2><div><label>Company <input name="a"></label>
      <label>Resume <input type="file"></label><input type="radio" name="r"><input type="radio" name="r">
      <label><input type="checkbox"> Subscribe to news</label><label><input type="checkbox"> I currently work here</label>
      <label>Cover letter <textarea></textarea></label><label>Description <textarea></textarea></label></div></form>`;
    expect(classify().map((e) => e.key)).toEqual(['work.company', 'work.current', 'work.description']);
  });
  it('textareas are never education', () => {
    document.body.innerHTML = '<form><h2>Education</h2><label>School <input></label><label>Description <textarea></textarea></label></form>';
    expect(classify().map((e) => e.key)).toEqual(['edu.school']);
  });
  it('"Current company" and yes/no questions are not entry fields', () => {
    document.body.innerHTML = '<form><label>Current company <input name="cc"></label><label>Have you worked for a company like ours? <input name="q"></label></form>';
    expect(classify()).toEqual([]);
  });
  it('an availability date outside any section is not an entry date', () => {
    document.body.innerHTML = '<form><h2>Work Experience</h2><div><label>Company <input></label></div><h2>Availability</h2><label>Earliest start date <input type="date"></label></form>';
    expect(classify().map((e) => e.key)).toEqual(['work.company']);
  });
  it('orders by appearance when ids are not a clean sequence, and groups flat layouts by repeated keys', () => {
    document.body.innerHTML = `<form><h2>Education</h2><label>Degree <input></label><label>Field of study <input></label>
      <label>Degree <input></label><label>Field of study <input></label></form>`;
    expect(classify().map((e) => `${e.key}:${e.index}`)).toEqual(['edu.degree:0', 'edu.field:0', 'edu.degree:1', 'edu.field:1']);
    document.body.innerHTML = '<input id="employer_7"><input id="employer_9">';
    expect(classify().map((e) => e.index)).toEqual([0, 1]);
  });
  it('month/year granularity from labels and from select options', () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July'].map((m) => `<option>${m}</option>`).join('');
    const years = [2019, 2020, 2021, 2022, 2023, 2024].map((y) => `<option>${y}</option>`).join('');
    document.body.innerHTML = `<form><h2>Experience</h2><div><label>Company <input></label>
      <label>Start <select>${months}</select></label><label>Start <select>${years}</select></label>
      <label>End month <input></label><label>End year <input></label><label>End (MM/YYYY) <input></label></div></form>`;
    expect(classify().map((e) => e.key).slice(1)).toEqual(['work.startMonth', 'work.startYear', 'work.endMonth', 'work.endYear', 'work.endDate']);
  });
  it('entryKeyOf respects the requested kind', () => {
    document.body.innerHTML = '<input id="school--0"><label for="g">GPA</label><input id="g">';
    const [a, b] = detectFields(document, O);
    expect(entryKeyOf(a, 'edu')).toBe('edu.school');
    expect(entryKeyOf(a, 'work')).toBeNull();
    expect(entryKeyOf(b, 'edu')).toBe('edu.gpa');
    expect(entryKeyOf(b, 'work')).toBeNull();
  });
  it('sectionOf uses names, containers and neighbours', () => {
    document.body.innerHTML = `<form><div class="education-block"><input id="a"></div><section id="employment"><input id="b"></section>
      <div><input id="c" placeholder="School name"><input id="d"></div><input id="e"></form>`;
    const g = (i: string) => sectionOf(document.getElementById(i)!);
    expect([g('a'), g('b'), g('c'), g('d'), g('e')]).toEqual(['edu', 'work', 'edu', 'edu', null]);
  });
});

describe('fillEntryField', () => {
  const one = (html: string, id: string, p = profile()) => {
    document.body.innerHTML = `<form>${html}</form>`;
    return { ef: find(id), p };
  };
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

  it('skips when the profile has nothing, and never unticks', async () => {
    const { ef, p } = one('<input type="checkbox" id="current-role-1">', 'current-role-1');
    document.body.innerHTML = '<input type="checkbox" id="current-role-0" checked><input type="checkbox" id="current-role-1" checked>';
    const all = classify();
    expect(await fillEntryField(all[1], p)).toBe('skip');
    expect((document.getElementById('current-role-1') as HTMLInputElement).checked).toBe(true);
    expect(ef.key).toBe('work.current');
  });
  it('ticks an unchecked box once and reports ok when already ticked', async () => {
    document.body.innerHTML = '<input type="checkbox" id="current-role-0">';
    let clicks = 0;
    document.getElementById('current-role-0')!.addEventListener('click', () => clicks++);
    const ef = classify()[0];
    expect(await fillEntryField(ef, profile())).toBe('ok');
    expect(await fillEntryField(ef, profile())).toBe('ok');
    expect(clicks).toBe(1);
  });
  it.each([
    ['type=month', '<input type="month" id="x">', '2021-03'],
    ['type=date', '<input type="date" id="x">', '2021-03-01'],
    ['mm/dd/yyyy', '<input id="x" placeholder="mm/dd/yyyy">', '03/01/2021'],
    ['yyyy-mm', '<input id="x" placeholder="YYYY-MM">', '2021-03'],
    ['Month YYYY', '<input id="x" placeholder="Month YYYY">', 'March 2021'],
    ['mmm yyyy', '<input id="x" placeholder="MMM YYYY">', 'Mar 2021'],
    ['MM-YYYY', '<input id="x" placeholder="MM-YYYY">', '03-2021'],
    ['default', '<input id="x">', '03/2021'],
    ['pattern forces second spelling', '<input id="x" pattern="\\d{4}-\\d{2}">', '2021-03'],
  ])('start date format: %s', async (_n, input, want) => {
    const { ef, p } = one(`<h2>Work Experience</h2><label for="x">Start date</label>${input}`, 'x');
    expect(ef.key).toBe('work.startDate');
    expect(await fillEntryField(ef, p)).toBe('ok');
    expect(val('x')).toBe(want);
  });
  it('month-only keys: select by name, abbreviation or number; text prefers numbers when hinted', async () => {
    const mk = (opts: string) => `<h2>Work Experience</h2><label for="m">Start month</label><select id="m"><option value="">Month</option>${opts}</select>`;
    let r = one(mk('<option>Jan</option><option>Feb</option><option>Mar</option>'), 'm');
    expect(await fillEntryField(r.ef, r.p)).toBe('ok');
    expect(val('m')).toBe('Mar');
    r = one(mk('<option value="01">x1</option><option value="03">x3</option>'), 'm');
    expect(await fillEntryField(r.ef, r.p)).toBe('ok');
    expect(val('m')).toBe('03');
    r = one('<h2>Work Experience</h2><label for="t">Start month</label><input id="t" placeholder="MM">', 't');
    expect(await fillEntryField(r.ef, r.p)).toBe('ok');
    expect(val('t')).toBe('03');
    r = one('<h2>Work Experience</h2><label for="t">Start month</label><input id="t">', 't');
    await fillEntryField(r.ef, r.p);
    expect(val('t')).toBe('March');
  });
  it('year key writes the year; degree select tries each wording', async () => {
    let r = one('<h2>Education</h2><label for="y">Graduation year</label><input id="y">', 'y');
    expect(r.ef.key).toBe('edu.endYear');
    await fillEntryField(r.ef, r.p);
    expect(val('y')).toBe('2018');
    r = one('<h2>Education</h2><label for="d">Degree</label><select id="d"><option>Select</option><option>Doctorate</option><option>Bachelor of Science</option></select>', 'd');
    expect(await fillEntryField(r.ef, r.p)).toBe('ok');
    expect(val('d')).toBe('Bachelor of Science');
  });
  it('returns skip when no option matches or the control is an unusable kind', async () => {
    const r = one('<h2>Education</h2><label for="d">Degree</label><select id="d"><option value="">Select</option><option>Certificate</option></select>', 'd');
    expect(await fillEntryField(r.ef, r.p)).toBe('skip');
    expect(val('d')).toBe('');
  });
  it('end date of a current job is skipped', async () => {
    document.body.innerHTML = '<input id="end-date-year-0"><input id="company-name-0">';
    const e = classify().find((x) => x.key === 'work.endYear')!;
    expect(await fillEntryField(e, profile())).toBe('skip');
    expect(val('end-date-year-0')).toBe('');
  });
  it('a field index out of range is skipped', async () => {
    document.body.innerHTML = '<input id="company-name-0">';
    const e: EntryField = { ...classify()[0], index: 9 };
    expect(await fillEntryField(e, profile())).toBe('skip');
  });
});

describe('custom date pickers', () => {
  it('react-datepicker with a year select: opens, picks the year and the month cell', async () => {
    document.body.innerHTML = '<div class="react-datepicker-wrapper"><input id="d" name="start_date"></div><div id="slot"></div>';
    const input = document.getElementById('d') as HTMLInputElement;
    const cells = Array.from({ length: 12 }, (_, m) => `<div class="react-datepicker__month-text react-datepicker__month-${m}">M${m}</div>`).join('');
    let year = '2020';
    input.addEventListener('click', () => {
      document.getElementById('slot')!.innerHTML = `<div class="react-datepicker-popper"><div class="react-datepicker"><select class="react-datepicker__year-select">${[2019, 2020, 2021].map((y) => `<option>${y}</option>`).join('')}</select>${cells}</div></div>`;
      document.querySelector('select')!.addEventListener('change', (e) => { year = (e.target as HTMLSelectElement).value; });
      document.querySelectorAll('.react-datepicker__month-text').forEach((c, m) => c.addEventListener('click', () => { input.value = `${m + 1}/${year}`; }));
    });
    expect(await pickReactDatepicker(input, { year: '2021', month: 3 })).toBe(true);
    expect(input.value).toBe('3/2021');
  });
  it('react-datepicker with header navigation', async () => {
    document.body.innerHTML = '<div class="react-datepicker-wrapper"><input id="d"></div><div id="slot"></div>';
    const input = document.getElementById('d') as HTMLInputElement;
    let y = 2023;
    const render = () => {
      document.getElementById('slot')!.innerHTML = `<div class="react-datepicker"><button class="react-datepicker__navigation--previous"></button><button class="react-datepicker__navigation--next"></button>
        <div class="react-datepicker__current-month">${y}</div>${Array.from({ length: 12 }, (_, m) => `<div class="react-datepicker__month-text react-datepicker__month-${m}">x</div>`).join('')}</div>`;
      document.querySelector('.react-datepicker__navigation--previous')!.addEventListener('click', () => { y--; render(); });
      document.querySelector('.react-datepicker__navigation--next')!.addEventListener('click', () => { y++; render(); });
      document.querySelectorAll('.react-datepicker__month-text').forEach((c, m) => c.addEventListener('click', () => { input.value = `${y}-${m + 1}`; }));
    };
    input.addEventListener('click', render);
    expect(await pickReactDatepicker(input, { year: '2021', month: 11 })).toBe(true);
    expect(input.value).toBe('2021-11');
  });
  it('react-datepicker returns false when no picker ever opens, or the month is disabled', async () => {
    document.body.innerHTML = '<div class="react-datepicker-wrapper"><input id="d"></div>';
    expect(await pickReactDatepicker(document.getElementById('d') as HTMLInputElement, { year: '2021', month: 3 })).toBe(false);
    expect(await pickReactDatepicker(document.getElementById('d') as HTMLInputElement, {})).toBe(false);
  }, 10000);
  it('Tesla picker steps month by month, then clicks day 1', async () => {
    document.body.innerHTML = '<div class="tds-form-input"><input id="d"></div>';
    const input = document.getElementById('d') as HTMLInputElement;
    const box = input.parentElement!;
    let m = 5, y = 2022; // June 2022
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const render = () => {
      box.querySelector('.tds-date-picker')?.remove();
      box.insertAdjacentHTML('beforeend', `<div class="tds-date-picker"><div class="tds-date-picker-month"><button></button><label>${names[m]} ${y}</label><button></button></div>
        <span class="tds-day tds-day--not-this-month">1</span><span class="tds-day">2</span><span class="tds-day" id="day1">1</span></div>`);
      const [back, fwd] = Array.from(box.querySelectorAll('.tds-date-picker-month button'));
      const shift = (d: number) => { m += d; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } render(); };
      back.addEventListener('click', () => shift(-1));
      fwd.addEventListener('click', () => shift(1));
      box.querySelector('#day1')!.addEventListener('click', () => { input.value = `${names[m]} 1, ${y}`; });
    };
    input.addEventListener('click', render);
    expect(await pickTeslaDate(input, { year: '2021', month: 2 })).toBe(true);
    expect(input.value).toBe('February 1, 2021');
  });
  it('fillEntryField uses the Tesla picker for date keys', async () => {
    document.body.innerHTML = '<div class="tds-form-input"><input name="workExperience.employers[0].startDate"></div>';
    const input = document.querySelector('input')!;
    const box = input.parentElement!;
    input.addEventListener('click', () => {
      box.insertAdjacentHTML('beforeend', '<div class="tds-date-picker"><div class="tds-date-picker-month"><button></button><label>March 2021</label><button></button></div><span class="tds-day" id="d1">1</span></div>');
      document.getElementById('d1')!.addEventListener('click', () => { input.value = 'picked'; });
    });
    expect(await fillEntryField(classify()[0], profile())).toBe('ok');
    expect(input.value).toBe('picked');
  });
});

describe('add buttons and entry count', () => {
  const labels = (kind: 'work' | 'edu') => addButtonsFor(kind, null, O).map((b) => b.textContent!.trim());
  it('accepts add-shaped labels with section words and rejects other lists', () => {
    document.body.innerHTML = `<form><button type="button">Add work experience</button><button type="button">+ Add another job</button><button type="button">Add education</button>
      <button type="button">Add degree</button><button type="button">Add skill</button><button type="button">Add a reference</button><button type="button">Add employer</button>
      <button type="button" disabled>Add position</button><a href="#">Add qualification</a></form>`;
    expect(labels('work')).toEqual(['Add work experience', '+ Add another job', 'Add employer']);
    expect(labels('edu')).toEqual(['Add education', 'Add degree', 'Add qualification']);
  });
  it('a bare Add must be proven by its own section', () => {
    document.body.innerHTML = `<form><button id="lone" type="button">Add</button><section><h2>Employment</h2><div><input id="company-name-0"></div><button id="mine" type="button">Add</button></section>
      <section><h2>Education</h2><button id="theirs" type="button">Add</button></section></form>`;
    expect(addButtonsFor('work', null, O).map((b) => b.id)).toEqual(['mine']);
    expect(addButtonsFor('edu', null, O).map((b) => b.id)).toEqual(['theirs']);
  });
  it('recognises add classes and array-button-add ids, Tesla "Add employer", and sorts by closeness', () => {
    document.body.innerHTML = `<div id="a"><input id="company-name-0"><button class="style_Add__x1" type="button">Add employer</button></div>
      <div id="b"><input id="company-name-1"><button class="style_Add__x2" type="button">Add employer</button></div>
      <button class="array-button-add" id="array-button-add-educationData" type="button">Add</button>`;
    const near = document.getElementById('company-name-1')!;
    expect(addButtonsFor('work', near, O).map((b) => b.className)).toEqual(['style_Add__x2', 'style_Add__x1']);
    expect(addButtonsFor('edu', null, O).map((b) => b.id)).toEqual(['array-button-add-educationData']);
    expect(addButtonsFor('work', null, O).some((b) => b.id.includes('educationData'))).toBe(false);
  });
  it('buttons must be visible unless the check is skipped', () => {
    document.body.innerHTML = '<button type="button">Add job</button>';
    expect(addButtonsFor('work', null, {})).toEqual([]);
    expect(addButtonsFor('work', null, O)).toHaveLength(1);
  });
  it('ensureEntryCount adds up to what is needed and never beyond, capped at 8', async () => {
    const row = (i: number) => `<div class="r"><input id="company-name-${i}"></div>`;
    document.body.innerHTML = `<form><h2>Experience</h2><div id="l">${row(0)}</div><button type="button" class="add-another-button">Add another</button></form>`;
    let n = 1;
    let clicks = 0;
    document.querySelector('.add-another-button')!.addEventListener('click', () => { clicks++; document.getElementById('l')!.insertAdjacentHTML('beforeend', row(n++)); });
    expect(await ensureEntryCount('work', 3, O)).toBe(3);
    expect(await ensureEntryCount('work', 2, O)).toBe(3);
    expect(clicks).toBe(2);
    expect(await ensureEntryCount('work', 20, O)).toBe(8);
    expect(clicks).toBe(7);
  }, 20000);
  it('stops when a click grows nothing, and when there is no button', async () => {
    document.body.innerHTML = '<form><h2>Experience</h2><input id="company-name-0"><button type="button" class="add-another-button">Add another</button></form>';
    const t = Date.now();
    expect(await ensureEntryCount('work', 3, O)).toBe(1);
    expect(Date.now() - t).toBeLessThan(6000);
    document.querySelector('button')!.remove();
    expect(await ensureEntryCount('work', 3, O)).toBe(1);
  }, 15000);
});
