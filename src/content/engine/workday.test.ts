import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyProfileData, type ProfileData } from '../../shared/profile';
import { fillWorkdayEducation, fillWorkdayExperience, fillWorkdaySkills, fillWorkdayWebsites, uploadWorkdayResume } from './workday';

function profile(): ProfileData {
  const p = emptyProfileData();
  p.workExperience = [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Led the platform team.' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds', startDate: '2018-09', endDate: '2021-02', isCurrent: false, description: 'Built compilers.' },
  ];
  p.education = [
    { schoolName: 'University of London', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2014-09', graduationDate: '2018-06', currentlyEnrolled: false },
    { schoolName: 'Open Academy', degree: 'High School Diploma', fieldOfStudy: '', gpa: '', startDate: '2010-09', graduationDate: '2014-06', currentlyEnrolled: false },
  ];
  return p;
}

const byId = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const val = (id: string) => byId(id).value;
const all = (sel: string) => Array.from(document.querySelectorAll<HTMLInputElement>(sel));

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { document.body.innerHTML = ''; });

// ---- work experience ----

const job = (i: number) => `<div role="group" aria-labelledby="Work-Experience-${i}-panel"><h4 id="Work-Experience-${i}-panel">Work Experience ${i}</h4>
  <div data-fkit-id="workExperience-${i}--jobTitle"><input id="workExperience-${i}--jobTitle" data-automation-id="formField-jobTitle"></div>
  <input id="workExperience-${i}--companyName">
  <input id="workExperience-${i}--location">
  <input type="checkbox" id="workExperience-${i}--currentlyWorkHere">
  <div><input id="workExperience-${i}--startDate-dateSectionMonth-input"><input id="workExperience-${i}--startDate-dateSectionYear-input"></div>
  <div><input id="workExperience-${i}--endDate-dateSectionMonth-input"><input id="workExperience-${i}--endDate-dateSectionYear-input"></div>
  <textarea id="workExperience-${i}--roleDescription"></textarea></div>`;

/** A My Experience page with `initial` empty job entries; Add appends one more (ids 1, 3, 5, ...). */
function workPage(initial = 0) {
  let n = 0;
  const next = () => { n += 2; return job(n - 1); };
  let html = '';
  for (let i = 0; i < initial; i++) html += next();
  document.body.innerHTML = `<form><div role="group"><h3>Work Experience</h3><div id="jobs">${html}</div>
    <button data-automation-id="add-button" type="button" id="add">Add</button></div></form>`;
  const adds = { clicks: 0 };
  byId('add').addEventListener('click', () => { adds.clicks++; byId('jobs').insertAdjacentHTML('beforeend', next()); });
  return adds;
}

const titles = () => all('input[id$="--jobTitle"]').map((e) => e.value);
const companies = () => all('input[id$="--companyName"]').map((e) => e.value);

describe('fillWorkdayExperience', () => {
  it('adds an entry per job and fills every field of only that entry', async () => {
    workPage();
    const res = await fillWorkdayExperience(profile());
    expect(titles()).toEqual(['Staff Engineer', 'Engineer']);
    expect(companies()).toEqual(['Analytical Engines', 'Difference Co']);
    expect(all('input[id$="--location"]').map((e) => e.value)).toEqual(['London', 'Leeds']);
    expect(all('textarea').map((e) => e.value)).toEqual(['Led the platform team.', 'Built compilers.']);
    expect(val('workExperience-1--startDate-dateSectionMonth-input')).toBe('03');
    expect(val('workExperience-1--startDate-dateSectionYear-input')).toBe('2021');
    expect(val('workExperience-3--startDate-dateSectionMonth-input')).toBe('09');
    expect(val('workExperience-3--startDate-dateSectionYear-input')).toBe('2018');
    expect(val('workExperience-3--endDate-dateSectionMonth-input')).toBe('02');
    expect(val('workExperience-3--endDate-dateSectionYear-input')).toBe('2021');
    expect(byId('workExperience-1--currentlyWorkHere').checked).toBe(true);
    expect(byId('workExperience-3--currentlyWorkHere').checked).toBe(false);
    const keys = res!.filled.filter((f) => f.label === 'Staff Engineer @ Analytical Engines').map((f) => f.key).sort();
    expect(keys).toEqual(['work.company', 'work.current', 'work.description', 'work.location', 'work.startDate', 'work.title']);
    const keys2 = res!.filled.filter((f) => f.label === 'Engineer @ Difference Co').map((f) => f.key).sort();
    expect(keys2).toEqual(['work.company', 'work.description', 'work.endDate', 'work.location', 'work.startDate', 'work.title']);
    expect(res!.touched).toContain(byId('workExperience-3--companyName'));
  });

  it('skips the end date of the current job', async () => {
    workPage();
    await fillWorkdayExperience(profile());
    expect(val('workExperience-1--endDate-dateSectionMonth-input')).toBe('');
    expect(val('workExperience-1--endDate-dateSectionYear-input')).toBe('');
  });

  it('reuses an empty entry instead of clicking Add', async () => {
    const adds = workPage(1);
    const p = profile();
    p.workExperience = [p.workExperience[0]];
    await fillWorkdayExperience(p);
    expect(adds.clicks).toBe(0);
    expect(titles()).toEqual(['Staff Engineer']);
  });

  it('a second run changes nothing and adds nothing', async () => {
    const adds = workPage();
    await fillWorkdayExperience(profile());
    const valuesBefore = all('input, textarea').map((i) => i.value).join('|');
    const clicksBefore = adds.clicks;
    const res = await fillWorkdayExperience(profile());
    expect(adds.clicks).toBe(clicksBefore);
    expect(titles()).toHaveLength(2);
    expect(res).toEqual({ filled: [], touched: [] });
    expect(all('input, textarea').map((i) => i.value).join('|')).toBe(valuesBefore);
    expect(document.querySelectorAll('[role=group][aria-labelledby]').length).toBe(2);
  });

  it('leaves an existing filled entry of the same company alone and adds only the missing job', async () => {
    const adds = workPage(1);
    const t = byId('workExperience-1--jobTitle');
    t.value = 'Senior Engineer (edited by hand)';
    byId('workExperience-1--companyName').value = 'analytical engines';
    const res = await fillWorkdayExperience(profile());
    expect(adds.clicks).toBe(1);
    expect(titles()).toEqual(['Senior Engineer (edited by hand)', 'Engineer']);
    expect(companies()).toEqual(['analytical engines', 'Difference Co']);
    expect(res!.filled.every((f) => f.label === 'Engineer @ Difference Co')).toBe(true);
  });

  it('never unticks the current box and does not tick it for a past job', async () => {
    workPage(2);
    byId('workExperience-3--currentlyWorkHere').checked = true;
    const p = profile();
    p.workExperience[1].isCurrent = false;
    await fillWorkdayExperience(p);
    expect(byId('workExperience-1--currentlyWorkHere').checked).toBe(true);
    expect(byId('workExperience-3--currentlyWorkHere').checked).toBe(true);
  });

  it('accepts the other section names and ignores numbered entry headings as sections', async () => {
    document.body.innerHTML = `<div role="group"><h2>Work or Other Experience</h2><div id="jobs">${job(1)}</div></div>`;
    const p = profile();
    p.workExperience = [p.workExperience[0]];
    const res = await fillWorkdayExperience(p);
    expect(res!.filled.length).toBeGreaterThan(0);
    expect(val('workExperience-1--companyName')).toBe('Analytical Engines');
    document.body.innerHTML = `<div role="group"><h4>Work Experience 2</h4>${job(2).replace(/^<div role="group"[^>]*>/, '<div>')}`;
    expect(await fillWorkdayExperience(p)).toBeNull();
  });

  it('finds fields by name or automation id when ids differ', async () => {
    document.body.innerHTML = `<div role="group" data-automation-id="x"><h3>Work History</h3>
      <div role="group"><h4>Work Experience 1</h4><input name="jobTitle" id="a"><input id="x--companyName"></div></div>`;
    const p = profile();
    p.workExperience = [p.workExperience[1]];
    await fillWorkdayExperience(p);
    expect(val('a')).toBe('Engineer');
    expect(val('x--companyName')).toBe('Difference Co');
  });

  it('keeps going when one field fails', async () => {
    workPage(1);
    byId('workExperience-1--location').focus = () => { throw new Error('boom'); };
    const res = await fillWorkdayExperience({ ...profile(), workExperience: [profile().workExperience[0]] });
    expect(val('workExperience-1--location')).toBe('');
    expect(val('workExperience-1--companyName')).toBe('Analytical Engines');
    expect(val('workExperience-1--startDate-dateSectionYear-input')).toBe('2021');
    expect(res!.filled.some((f) => f.key === 'work.location')).toBe(false);
    expect(res!.filled.some((f) => f.key === 'work.description')).toBe(true);
  });

  it('stops quietly when Add does not produce an entry', async () => {
    workPage();
    byId('add').replaceWith(byId('add').cloneNode(true)); // listener removed: Add does nothing
    const start = Date.now();
    const res = await fillWorkdayExperience({ ...profile(), workExperience: [profile().workExperience[0]] });
    expect(res).toEqual({ filled: [], touched: [] });
    expect(Date.now() - start).toBeLessThan(8000);
  }, 12000);

  it('returns null on pages that are not Workday or have no such section', async () => {
    document.body.innerHTML = '<div role="group"><h3>Work Experience</h3><input id="workExperience-1--jobTitle"></div>';
    expect(await fillWorkdayExperience(profile())).toBeNull(); // no automation attributes
    expect(val('workExperience-1--jobTitle')).toBe('');
    document.body.innerHTML = '<div data-automation-id="x"><h3>Something else</h3><input id="workExperience-1--jobTitle"></div>';
    expect(await fillWorkdayExperience(profile())).toBeNull();
    document.body.innerHTML = '';
    expect(await fillWorkdayExperience(profile())).toBeNull();
  });
});

// ---- skills ----

/** Skill search box whose list for a term arrives after `delay` ms, with a near match first. */
function skillsPage(opts: { delay?: number; preselected?: string[]; checkedStyle?: 'aria' | 'leaf' | 'aria-checked' | 'checkbox'; hidden?: boolean; disabled?: boolean; missing?: string[] } = {}) {
  const chosen = (opts.preselected ?? []).map((s) => `<div data-automation-id="selectedItem" title="${s}">${s}</div>`).join('');
  document.body.innerHTML = `<div data-automation-id="x"></div><div role="group"><h3>Skills</h3>
    <div data-automation-id="multiSelectContainer">${chosen}<input id="skills--skills"${opts.disabled ? ' disabled' : ''}></div>
    <div id="opts"></div></div>`;
  const input = byId('skills--skills');
  if (opts.hidden) input.getClientRects = () => [] as unknown as DOMRectList;
  const clicked: string[] = [];
  const searches: string[] = [];
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !input.value) return;
    const term = input.value;
    searches.push(term);
    setTimeout(() => {
      const missing = (opts.missing ?? []).some((m) => m.toLowerCase().startsWith(term.toLowerCase()) && m.toLowerCase() === term.toLowerCase());
      const mk = (label: string, checked: boolean) => {
        const aria = opts.checkedStyle === 'aria' ? `aria-label="${label} ${checked ? 'checked' : 'not checked'}"` : `aria-label="${label}"`;
        const state = checked
          ? opts.checkedStyle === 'leaf' ? '<span data-automation-id="promptLeafNode" data-automation-checked="checked"></span>'
            : opts.checkedStyle === 'checkbox' ? '<span data-automation-id="checkbox" data-automationcheckboxchecked="true"></span>'
              : opts.checkedStyle === 'aria-checked' ? '<span aria-checked="true"></span>' : ''
          : '';
        return `<div role="option" ${aria}>${state}<div data-automation-id="promptOption" data-automation-label="${label}">${label}</div></div>`;
      };
      byId('opts').innerHTML = missing
        ? '<div data-automation-id="activeListContainer" role="listbox"><div role="option" aria-label="No Items."></div></div>'
        : `<div data-automation-id="activeListContainer" role="listbox">${mk(term + ' Pro', false)}${mk(term, !!opts.checkedStyle && (opts.preselected ?? []).includes(term))}</div>`;
      document.querySelectorAll('#opts [data-automation-id=promptOption]').forEach((o) =>
        o.addEventListener('click', () => { clicked.push(o.getAttribute('data-automation-label')!); }));
    }, opts.delay ?? 60);
  });
  return { input, clicked, searches };
}

describe('fillWorkdaySkills', () => {
  const withSkills = (...s: string[]) => { const p = profile(); p.skills = s; return p; };

  it('searches with Enter, clicks the exact result and reports the count', async () => {
    const { input, clicked } = skillsPage();
    const res = await fillWorkdaySkills(withSkills('Python', ' React ', 'python'), { skipVisibilityCheck: true });
    expect(clicked).toEqual(['Python', 'React']);
    expect(res!.count).toBe(2);
    expect(res!.input).toBe(input);
    expect(input.value).toBe('');
  });

  it('sends a full key sequence with keyCode, which and charCode on Enter', async () => {
    const { input } = skillsPage();
    const seen: string[] = [];
    for (const t of ['keydown', 'keypress', 'keyup']) {
      input.addEventListener(t, (e) => {
        const k = e as KeyboardEvent;
        if (k.key === 'Enter') seen.push(`${t}:${k.code}:${k.keyCode}:${k.which}:${t === 'keypress' ? k.charCode : 'x'}`);
      });
    }
    await fillWorkdaySkills(withSkills('Go'), { skipVisibilityCheck: true });
    expect(seen).toEqual(['keydown:Enter:13:13:x', 'keypress:Enter:13:13:13', 'keyup:Enter:13:13:x']);
  });

  it('does not toggle off skills that are already chosen, so a second run is stable', async () => {
    const { clicked, searches } = skillsPage({ preselected: ['Python'] });
    const res = await fillWorkdaySkills(withSkills('Python', 'React'), { skipVisibilityCheck: true });
    expect(clicked).toEqual(['React']);
    expect(searches).not.toContain('Python');
    expect(res!.count).toBe(2);
  });

  it.each(['aria', 'leaf', 'aria-checked', 'checkbox'] as const)('does not click a result that is already checked (%s)', async (style) => {
    const { clicked } = skillsPage({ checkedStyle: style, preselected: [] });
    // the page shows Python checked in the results although it is not in the chosen list
    const p = withSkills('Python');
    // make the exact result checked by re-rendering after the page's own handler
    const input = byId('skills--skills');
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key !== 'Enter') return;
      setTimeout(() => {
        const opt = document.querySelector('#opts [role=option]:last-child') as HTMLElement;
        if (!opt) return;
        if (style === 'aria') opt.setAttribute('aria-label', 'Python checked');
        if (style === 'leaf') opt.insertAdjacentHTML('afterbegin', '<span data-automation-id="promptLeafNode" data-automation-checked="checked"></span>');
        if (style === 'aria-checked') opt.setAttribute('aria-checked', 'true');
        if (style === 'checkbox') opt.insertAdjacentHTML('afterbegin', '<span data-automation-id="checkbox" data-automationcheckboxchecked="true"></span>');
      }, 61);
    });
    const res = await fillWorkdaySkills(p, { skipVisibilityCheck: true });
    expect(clicked).toEqual([]);
    expect(res!.count).toBe(1);
  });

  it('counts already chosen skills from selectedItemList too', async () => {
    document.body.innerHTML = `<div role="group"><input id="skills--skills">
      <div data-automation-id="selectedItemList"><div data-automation-id="promptOption" data-automation-label="Rust">Rust</div></div></div>`;
    const res = await fillWorkdaySkills(withSkills('Rust'), { skipVisibilityCheck: true });
    expect(res!.count).toBe(1);
  });

  it('shortens a long name for the first search, then tries the full text, and clicks only an exact label', async () => {
    const { clicked, searches } = skillsPage();
    // the list echoes the term, so only the full text ever matches exactly
    await fillWorkdaySkills(withSkills('Machine Learning Operations'), { skipVisibilityCheck: true });
    expect(searches).toEqual(['Machine Learning', 'Machine Learning Operations']);
    expect(clicked).toEqual(['Machine Learning Operations']);
  });

  it('gives up on a skill that has no result and goes on with the next', async () => {
    const { clicked } = skillsPage({ missing: ['Cobol'] });
    const res = await fillWorkdaySkills(withSkills('Cobol', 'React'), { skipVisibilityCheck: true });
    expect(clicked).toEqual(['React']);
    expect(res!.count).toBe(1);
  });

  it('respects max and returns null when it has nothing to do', async () => {
    const { clicked } = skillsPage();
    await fillWorkdaySkills(withSkills('A1', 'B2', 'C3'), { skipVisibilityCheck: true }, 2);
    expect(clicked).toEqual(['A1', 'B2']);
    expect(await fillWorkdaySkills(withSkills(), { skipVisibilityCheck: true })).toBeNull();
  });

  it('does nothing for hidden, disabled or read-only boxes, or when the box is absent', async () => {
    skillsPage({ hidden: true });
    expect(await fillWorkdaySkills(withSkills('Python'))).toBeNull();
    expect((await fillWorkdaySkills(withSkills('Python'), { skipVisibilityCheck: true }))?.count).toBe(1); // skip flag overrides
    const d = skillsPage({ disabled: true });
    expect(await fillWorkdaySkills(withSkills('Python'), { skipVisibilityCheck: true })).toBeNull();
    d.input.disabled = false;
    d.input.readOnly = true;
    expect(await fillWorkdaySkills(withSkills('Python'), { skipVisibilityCheck: true })).toBeNull();
    document.body.innerHTML = '<input id="sk">';
    expect(await fillWorkdaySkills(withSkills('Python'), { skipVisibilityCheck: true })).toBeNull();
  });

  it('closes the list like a user: Escape, blur and a click elsewhere', async () => {
    const { input } = skillsPage();
    const seen: string[] = [];
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') seen.push('escape'); });
    input.addEventListener('blur', () => seen.push('blur'));
    document.body.addEventListener('click', (e) => { if (e.target === document.body) seen.push('click'); });
    input.focus();
    await fillWorkdaySkills(withSkills('Python'), { skipVisibilityCheck: true });
    expect(seen).toEqual(expect.arrayContaining(['escape', 'blur', 'click']));
  });

  it('accepts any input whose id ends with --skills', async () => {
    document.body.innerHTML = '<div role="group"><input id="foo--skills"></div>';
    const res = await fillWorkdaySkills(withSkills('Python'), { skipVisibilityCheck: true });
    expect(res).toBeNull(); // no result list ever appears: bounded wait, nothing selected
  }, 15000);
});

// ---- websites ----

describe('fillWorkdayWebsites', () => {
  const row = (u = '') => `<div role="group"><div data-fkit-id="webAddress-1"><input id="webAddress-1--url" name="url" value="${u}"></div><button type="button" class="del"><span class="wd-icon-trash"></span></button></div>`;
  function page(urls: string[], head = 'Websites') {
    document.body.innerHTML = `<form><div role="group" aria-labelledby="Websites-section"><h3 id="Websites-section">${head}</h3><div id="sites">${urls.map(row).join('')}</div>
      <button data-automation-id="add-button" type="button" id="addsite">Add</button></div></form>`;
    const clicks = { add: 0, del: 0 };
    byId('sites').addEventListener('click', (e) => { const b = (e.target as Element).closest('.del'); if (b) { clicks.del++; b.closest('[role=group]')!.remove(); } });
    byId('addsite').addEventListener('click', () => { clicks.add++; byId('sites').insertAdjacentHTML('beforeend', row()); });
    return clicks;
  }
  const withLinks = () => {
    const p = profile();
    Object.assign(p.links, { linkedinUrl: 'https://linkedin.com/in/ada', githubUrl: 'https://github.com/ada', portfolioUrl: '', websiteUrl: 'https://ada.dev' });
    return p;
  };
  const urls = () => all('input[name=url]').map((i) => i.value);

  it('replaces existing entries with the profile links, in order', async () => {
    const clicks = page(['http://old.example', 'http://older.example']);
    const res = await fillWorkdayWebsites(withLinks());
    expect(urls()).toEqual(['https://linkedin.com/in/ada', 'https://github.com/ada', 'https://ada.dev']);
    expect(clicks.del).toBe(2);
    expect(res!.count).toBe(3);
    expect(res!.touched).toHaveLength(3);
  });

  it('does nothing when the page already has exactly those URLs, ignoring scheme, www and trailing slash', async () => {
    const clicks = page(['linkedin.com/in/ada/', 'http://www.github.com/ada', 'https://ada.dev']);
    const res = await fillWorkdayWebsites(withLinks());
    expect(clicks).toEqual({ add: 0, del: 0 });
    expect(urls()).toEqual(['linkedin.com/in/ada/', 'http://www.github.com/ada', 'https://ada.dev']);
    expect(res!.count).toBe(3);
  });

  it('de-duplicates the links and fills an empty box before clicking Add', async () => {
    const clicks = page(['']);
    const p = withLinks();
    p.links.websiteUrl = 'https://www.linkedin.com/in/ada/';
    await fillWorkdayWebsites(p);
    expect(urls()).toEqual(['https://linkedin.com/in/ada', 'https://github.com/ada']);
    expect(clicks.add).toBe(1);
    expect(clicks.del).toBe(0);
  });

  it('is stable on a second run', async () => {
    const clicks = page(['http://old.example']);
    await fillWorkdayWebsites(withLinks());
    const after = { ...clicks };
    await fillWorkdayWebsites(withLinks());
    expect(clicks).toEqual(after);
    expect(urls()).toHaveLength(3);
  });

  it('removes entries that only have a Delete text button, and overwrites ones that cannot be deleted', async () => {
    document.body.innerHTML = `<div role="group" data-automation-id="x" aria-labelledby="Professional-Website(s)-section"><h3 id="Professional-Website(s)-section">Professional Website(s)</h3>
      <div role="group"><input name="url" value="http://old.example"><button type="button" id="d">Delete</button></div>
      <div role="group"><input name="url" id="stuck" value="http://stuck.example"></div></div>`;
    byId('d').addEventListener('click', () => byId('d').closest('[role=group]')!.remove());
    const p = profile();
    p.links.githubUrl = 'https://github.com/ada';
    await fillWorkdayWebsites(p);
    expect(urls()).toEqual(['https://github.com/ada']);
    expect(val('stuck')).toBe('https://github.com/ada');
  });

  it('finds the section by heading, and a Portfolio group uses only portfolio and website', async () => {
    page(['', ''], 'Professional Websites(s)');
    document.getElementById('Websites-section')!.parentElement!.removeAttribute('aria-labelledby');
    await fillWorkdayWebsites(withLinks());
    expect(urls().filter(Boolean)).toHaveLength(3);
    document.body.innerHTML = `<div data-automation-id="a" role="group"><h3>Portfolio</h3><input name="url"></div>`;
    await fillWorkdayWebsites(withLinks());
    expect(urls()).toEqual(['https://ada.dev']);
  });

  it('returns null away from Workday, with no section, or with no links', async () => {
    document.body.innerHTML = `<div role="group" aria-labelledby="Websites-section"><h3 id="Websites-section">Websites</h3><input name="url" value="keep"></div>`;
    expect(await fillWorkdayWebsites(withLinks())).toBeNull();
    expect(urls()).toEqual(['keep']);
    document.body.innerHTML = '<div data-automation-id="a"></div>';
    expect(await fillWorkdayWebsites(withLinks())).toBeNull();
    page(['http://old.example']);
    expect(await fillWorkdayWebsites(profile())).toBeNull();
    expect(urls()).toEqual(['http://old.example']);
  });
});

// ---- education ----

describe('fillWorkdayEducation', () => {
  /** Multi-select field whose result list echoes the typed term; selecting adds a selectedItem. */
  function multi(field: string, id: string) {
    return `<div data-automation-id="formField-${field}"><div data-automation-id="multiSelectContainer"><input id="${id}"></div></div>`;
  }
  const edu = (i: number) => `<div role="group" aria-labelledby="Education-${i}-panel"><h4 id="Education-${i}-panel">Education ${i}</h4>
    ${multi('school', `education-${i}--school`)}
    <button type="button" name="degree" id="education-${i}--degree">Select One</button>
    ${multi('fieldOfStudy', `education-${i}--fos`)}
    <input id="education-${i}--gradeAverage">
    <input id="education-${i}--firstYearAttended-dateSectionYear-input" data-automation-id="dateSectionYear-input">
    <input id="education-${i}--lastYearAttended-dateSectionYear-input" data-automation-id="dateSectionYear-input"></div>`;

  function page(initial = 0) {
    let n = 0;
    const next = () => { n += 2; return edu(n - 1); };
    document.body.innerHTML = `<form><div role="group"><h3>Education</h3><div id="edus">${Array.from({ length: initial }, next).join('')}</div>
      <button data-automation-id="add-button" type="button" id="add">Add</button></div><div id="lists"></div></form>`;
    const stats = { adds: 0, searches: [] as string[], picked: [] as string[], degrees: [] as string[] };
    byId('add').addEventListener('click', () => { stats.adds++; byId('edus').insertAdjacentHTML('beforeend', next()); });
    // search lists: Enter shows echo results, clicking one records a selectedItem in that field
    document.addEventListener('keydown', (e) => {
      const input = e.target as HTMLInputElement;
      if (e.key !== 'Enter' || !input.closest || !input.closest('[data-automation-id=multiSelectContainer]') || !input.value) return;
      const term = input.value;
      stats.searches.push(term);
      setTimeout(() => {
        byId('lists').innerHTML = `<div data-automation-id="activeListContainer" role="listbox">
          <div role="option"><div data-automation-id="promptOption" data-automation-label="${term} Extension">${term} Extension<input type="radio"></div></div>
          <div role="option"><div data-automation-id="promptOption" data-automation-label="${term}">${term}<input type="radio"></div></div></div>`;
        byId('lists').querySelectorAll('[data-automation-id=promptOption]').forEach((o) => o.addEventListener('click', () => {
          const label = o.getAttribute('data-automation-label')!;
          stats.picked.push(label);
          input.closest('[data-automation-id=multiSelectContainer]')!.insertAdjacentHTML('afterbegin', `<div data-automation-id="selectedItem" title="${label}">${label}</div>`);
          byId('lists').innerHTML = '';
        }));
      }, 50);
    });
    // degree button opens a listbox
    document.addEventListener('click', (e) => {
      const b = (e.target as Element).closest('button[name=degree]');
      if (!b) return;
      byId('lists').innerHTML = `<div role="listbox" data-automation-id="activeListContainer">${["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree"]
        .map((d) => `<div role="option"><div data-automation-id="promptOption" data-automation-label="${d}">${d}</div></div>`).join('')}</div>`;
      byId('lists').querySelectorAll('[role=option]').forEach((o) => o.addEventListener('click', () => {
        stats.degrees.push(o.textContent!);
        b.textContent = o.textContent;
        byId('lists').innerHTML = '';
      }));
    });
    return stats;
  }

  it('adds an entry per school and fills school, degree, field, GPA and years', async () => {
    const stats = page();
    const res = await fillWorkdayEducation(profile());
    expect(stats.adds).toBe(2);
    expect(stats.picked).toEqual(['University of London', 'Mathematics', 'Open Academy']);
    expect(stats.degrees).toEqual(["Bachelor's Degree", 'High School']);
    expect(val('education-1--gradeAverage')).toBe('3.9');
    expect(val('education-1--firstYearAttended-dateSectionYear-input')).toBe('2014');
    expect(val('education-1--lastYearAttended-dateSectionYear-input')).toBe('2018');
    expect(val('education-3--firstYearAttended-dateSectionYear-input')).toBe('2010');
    expect(val('education-3--gradeAverage')).toBe('');
    const keys = res!.filled.filter((f) => f.label === 'University of London').map((f) => f.key).sort();
    expect(keys).toEqual(['edu.degree', 'edu.endYear', 'edu.field', 'edu.gpa', 'edu.school', 'edu.startYear']);
    // second school has no field of study and no GPA: not reported, nothing invented
    const keys2 = res!.filled.filter((f) => f.label === 'Open Academy').map((f) => f.key).sort();
    expect(keys2).toEqual(['edu.degree', 'edu.endYear', 'edu.school', 'edu.startYear']);
  });

  it('second run changes nothing', async () => {
    const stats = page();
    await fillWorkdayEducation(profile());
    const adds = stats.adds;
    const picked = stats.picked.length;
    const res = await fillWorkdayEducation(profile());
    expect(stats.adds).toBe(adds);
    expect(stats.picked.length).toBe(picked);
    expect(res).toEqual({ filled: [], touched: [] });
    expect(document.querySelectorAll('[data-automation-id=formField-school]')).toHaveLength(2);
  });

  it('leaves an entry with the same school alone (first 12 characters) and reuses an empty one', async () => {
    const stats = page(2);
    byId('education-1--school').closest('[data-automation-id=multiSelectContainer]')!
      .insertAdjacentHTML('afterbegin', '<div data-automation-id="selectedItem" title="University of London (UCL)">University of London (UCL)</div>');
    await fillWorkdayEducation(profile());
    expect(stats.adds).toBe(0);
    expect(stats.picked).toEqual(['Open Academy']);
    expect(val('education-1--gradeAverage')).toBe(''); // entry 1 untouched
    expect(val('education-3--firstYearAttended-dateSectionYear-input')).toBe('2010');
  });

  it('handles a plain text school box and a select for degree', async () => {
    document.body.innerHTML = `<div role="group" data-automation-id="a"><h3>Education</h3><div role="group"><h4>Education 1</h4>
      <input name="schoolName" id="s"><select id="e--degree"><option value="">Select</option><option>Bachelor's Degree</option></select>
      <input name="gradeAverage" id="g"></div></div>`;
    const p = profile();
    p.education = [p.education[0]];
    await fillWorkdayEducation(p);
    expect(val('s')).toBe('University of London');
    expect(byId<HTMLSelectElement>('e--degree').value).toBe("Bachelor's Degree");
    expect(val('g')).toBe('3.9');
  });

  it('keeps going when a field fails', async () => {
    page(1);
    byId('education-1--gradeAverage').focus = () => { throw new Error('boom'); };
    const p = profile();
    p.education = [p.education[0]];
    const res = await fillWorkdayEducation(p);
    expect(val('education-1--gradeAverage')).toBe('');
    expect(val('education-1--lastYearAttended-dateSectionYear-input')).toBe('2018');
    expect(res!.filled.some((f) => f.key === 'edu.gpa')).toBe(false);
    expect(res!.filled.some((f) => f.key === 'edu.endYear')).toBe(true);
  });

  it('returns null away from Workday or without an Education section', async () => {
    document.body.innerHTML = '<div role="group"><h3>Education</h3><input name="schoolName" id="s"></div>';
    expect(await fillWorkdayEducation(profile())).toBeNull();
    expect(val('s')).toBe('');
    document.body.innerHTML = '<div data-automation-id="a" role="group"><h3>Languages</h3><input name="schoolName" id="s"></div>';
    expect(await fillWorkdayEducation(profile())).toBeNull();
  });
});

// ---- resume ----

describe('uploadWorkdayResume', () => {
  const file = { fileName: 'ada_cv.pdf', mimeType: 'application/pdf', base64: btoa('%PDF-1.4 fake') };
  type Fake = { name: string };
  let uploads: string[];
  let behaviour: 'success' | 'error' | 'none';

  class FakeDT {
    private list: File[] = [];
    items = { add: (f: File) => { this.list.push(f); } };
    get files() { return this.list as unknown as FileList; }
  }

  function page(attached: string[] = []) {
    const names = attached.map((n) => `<div><span data-automation-id="file-upload-file-name">${n}</span><button type="button" data-automation-id="delete-file">x</button></div>`).join('');
    document.body.innerHTML = `<div role="group" aria-labelledby="Resume/CV-section"><h3 id="Resume/CV-section">Resume/CV</h3>
      <div data-fkit-id="resumeAttachments--attachments">${names}</div>
      <input type="file" data-automation-id="file-upload-input-ref" id="up"></div>`;
    const input = byId('up');
    let held: FileList | null = null;
    Object.defineProperty(input, 'files', { configurable: true, get: () => held, set: (v) => { held = v; } });
    const attachments = document.querySelector('[data-fkit-id="resumeAttachments--attachments"]')!;
    attachments.addEventListener('click', (e) => { const b = (e.target as Element).closest('button'); if (b) b.parentElement!.remove(); });
    input.addEventListener('change', () => {
      const name = (held as unknown as Fake[])[0].name;
      uploads.push(name);
      setTimeout(() => {
        if (behaviour === 'success') {
          attachments.insertAdjacentHTML('beforeend', `<div><span data-automation-id="file-upload-file-name">${name}</span><button type="button" data-automation-id="delete-file">x</button></div>`);
          input.parentElement!.insertAdjacentHTML('beforeend', '<div data-automation-id="file-upload-successful"></div>');
        }
        if (behaviour === 'error') input.parentElement!.insertAdjacentHTML('beforeend', '<div data-automation-id="file-upload-error"></div>');
      }, 40);
    });
    return input;
  }

  beforeEach(() => {
    uploads = [];
    behaviour = 'success';
    (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = FakeDT;
  });
  afterEach(() => { delete (globalThis as unknown as { DataTransfer?: unknown }).DataTransfer; });

  it('uploads and reports success', async () => {
    const input = page();
    const res = await uploadWorkdayResume(async () => file);
    expect(res).toEqual({ ok: true, input });
    expect(uploads).toEqual(['ada_cv.pdf']);
  });

  it('finds the section through the resumeAttachments group when there is no aria-labelledby', async () => {
    page();
    document.querySelector('[aria-labelledby]')!.removeAttribute('aria-labelledby');
    document.querySelector('[data-fkit-id="resumeAttachments--attachments"]')!.setAttribute('data-fkit-id', 'resumeAttachments--attachments');
    document.querySelector('[role=group]')!.insertAdjacentHTML('afterbegin', '<span data-fkit-id="resumeAttachments--null"></span>');
    expect((await uploadWorkdayResume(async () => file))?.ok).toBe(true);
  });

  it('does nothing when the same file (or a renamed repeat) is already attached', async () => {
    page(['ada_cv_2.pdf']);
    expect((await uploadWorkdayResume(async () => file))?.ok).toBe(true);
    expect(uploads).toEqual([]);
    page(['ada_cv.pdf']);
    expect((await uploadWorkdayResume(async () => file))?.ok).toBe(true);
    expect(uploads).toEqual([]);
    page(['ada_cv_final.pdf']); // a different file
    expect((await uploadWorkdayResume(async () => file))?.ok).toBe(true);
    expect(uploads).toEqual(['ada_cv.pdf']);
  });

  it('deletes a different attached file before uploading', async () => {
    page(['old_resume.pdf', 'older.pdf']);
    const res = await uploadWorkdayResume(async () => file);
    expect(res!.ok).toBe(true);
    const names = [...document.querySelectorAll('[data-automation-id=file-upload-file-name]')].map((e) => e.textContent);
    expect(names).toEqual(['ada_cv.pdf']);
  });

  it('reports failure when the page shows an upload error', async () => {
    behaviour = 'error';
    page();
    expect((await uploadWorkdayResume(async () => file))?.ok).toBe(false);
  });

  it('refuses files over 5 MB without uploading', async () => {
    const input = page();
    const big = { ...file, base64: 'A'.repeat(Math.ceil((5 * 1024 * 1024 + 10) / 3) * 4) };
    expect(await uploadWorkdayResume(async () => big)).toEqual({ ok: false, input });
    expect(uploads).toEqual([]);
  });

  it('returns null without calling getResume when there is no section or input, and when no resume is saved', async () => {
    let calls = 0;
    const get = async () => { calls++; return file; };
    document.body.innerHTML = '<div data-automation-id="a"></div>';
    expect(await uploadWorkdayResume(get)).toBeNull();
    document.body.innerHTML = '<div role="group" aria-labelledby="Resume/CV-section"><h3 id="Resume/CV-section">Resume</h3></div><div data-automation-id="a"></div>';
    expect(await uploadWorkdayResume(get)).toBeNull();
    expect(calls).toBe(0);
    page();
    expect(await uploadWorkdayResume(async () => null)).toBeNull();
    expect(uploads).toEqual([]);
  });

  it('returns null away from Workday', async () => {
    document.body.innerHTML = `<div role="group" aria-labelledby="Resume/CV-section"><input type="file"></div>`;
    expect(await uploadWorkdayResume(async () => file)).toBeNull();
  });
});
