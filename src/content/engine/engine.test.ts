import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProfileData, type ProfileData } from '../../shared/profile';
import { generic } from '../adapters/registry';
import { detectAdapter } from '../adapters/registry';
import { detectFields } from './detect';
import { matchField } from './match';
import { matchOption } from './options';
import { autofill } from './run';
import { formatDate, toYesNo } from './values';

function profile(): ProfileData {
  const p = emptyProfileData();
  Object.assign(p.personalInfo, {
    firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phoneNumber: '5551234567',
    city: 'San Francisco', state: 'CA', zipCode: '94105', country: 'United States', currentAddress: '1 Main St',
  });
  Object.assign(p.links, { linkedinUrl: 'https://linkedin.com/in/ada', githubUrl: 'https://github.com/ada' });
  Object.assign(p.preferences, {
    requiresSponsorship: 'No', workAuthorization: 'US Citizen', willingToRelocate: 'Yes', yearsOfExperience: '7 years',
    desiredSalary: '150000', availableStartDate: '2026-01-15',
  });
  Object.assign(p.demographics, { genderIdentity: 'Female', veteranStatus: 'No', disabilityStatus: 'No', race: 'Asian' });
  p.workExperience = [{ jobTitle: 'Engineer', companyName: 'Analytical Engines', location: '', startDate: '', endDate: '', isCurrent: true, description: '' }];
  p.education = [{ schoolName: 'University of London', degree: "Bachelor's", fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '', graduationDate: '2020-05', currentlyEnrolled: false }];
  return p;
}

const run = (over: Partial<Parameters<typeof autofill>[0]> = {}) =>
  autofill({
    profile: profile(), adapter: generic, getResume: async () => null,
    detect: { skipVisibilityCheck: true }, settleMs: 0, ...over,
  });

const val = (sel: string) => (document.querySelector(sel) as HTMLInputElement).value;

beforeEach(() => { document.body.innerHTML = ''; });

describe('matchField', () => {
  const match = (label: string, extra: Record<string, string> = {}) => {
    document.body.innerHTML = `<label for="x">${label}</label><input id="x" ${Object.entries(extra).map(([k, v]) => `${k}="${v}"`).join(' ')}>`;
    return matchField(detectFields(document, { skipVisibilityCheck: true })[0])?.key ?? null;
  };
  it.each([
    ['First Name *', 'firstName'], ['Last name', 'lastName'], ['Full Name', 'fullName'], ['Email Address', 'email'],
    ['Confirm email', 'email'], ['Phone', 'phone'], ['Mobile number', 'phone'], ['LinkedIn Profile', 'linkedin'],
    ['GitHub URL', 'github'], ['Zip / Postal code', 'zip'], ['State/Province', 'state'], ['City', 'city'],
    ['Country', 'country'], ['Preferred name', 'preferredName'], ['Current company', 'currentCompany'],
    ['Years of experience', 'yearsExperience'], ['Desired salary', 'salary'], ['School', 'school'],
    ['Will you now or in the future require visa sponsorship?', 'sponsorship'],
    ['Are you legally authorized to work in the United States?', 'workAuthorization'],
    ['Are you willing to relocate?', 'relocate'], ['Gender', 'gender'], ['Veteran Status', 'veteran'],
    ['Disability Status', 'disability'], ['Website', 'website'],
  ])('%s -> %s', (label, key) => expect(match(label)).toBe(key));

  it.each([['Company name of your current employer?? tell us more about it in detail please and why you want to join us', null], ['Why do you want to work here?', null], ['Alternate email', null], ['Phone type', null]])(
    '%s is not matched', (label, key) => expect(match(label)).toBe(key));

  it('prefers autocomplete over a misleading label', () => expect(match('Name', { autocomplete: 'given-name' })).toBe('firstName'));
  it('falls back to the name attribute', () => {
    document.body.innerHTML = '<input name="first_name">';
    expect(matchField(detectFields(document, { skipVisibilityCheck: true })[0])?.key).toBe('firstName');
  });
});

describe('matchOption', () => {
  it('male does not pick female', () => expect(matchOption(['Female', 'Male'], 'Male', 'gender')).toBe(1));
  it('yes/no', () => expect(matchOption(['Not sure', 'No, I do not', 'Yes, I am'], 'No', 'veteran')).toBe(1));
  it('state abbreviation to name', () => expect(matchOption(['Texas', 'California'], 'CA', 'state')).toBe(1));
  it('country alias', () => expect(matchOption(['Canada', 'United States of America'], 'United States', 'country')).toBe(1));
  it('skips placeholder', () => expect(matchOption(['Select...', 'Asian', 'White'], 'Asian', 'race')).toBe(1));
  it('no match', () => expect(matchOption(['A', 'B'], 'Zebra', 'race')).toBe(-1));
});

describe('values', () => {
  it('yes/no', () => {
    expect(toYesNo('workAuthorization', 'US Citizen')).toBe('Yes');
    expect(toYesNo('workAuthorization', 'Need sponsorship')).toBe('No');
    expect(toYesNo('sponsorship', 'no')).toBe('No');
  });
  it('dates', () => {
    expect(formatDate('date', '2026-01')).toBe('2026-01-01');
    expect(formatDate('month', '2020-05-10')).toBe('2020-05');
    expect(formatDate('text', '2020-05')).toBe('2020-05');
  });
});

describe('Greenhouse-style form', () => {
  beforeEach(() => {
    document.body.innerHTML = `
    <form>
      <div class="field"><label for="first_name">First Name *</label><input id="first_name" name="job_application[first_name]" type="text" required></div>
      <div class="field"><label for="last_name">Last Name *</label><input id="last_name" type="text"></div>
      <div class="field"><label for="email">Email *</label><input id="email" type="text"></div>
      <div class="field"><label for="phone">Phone</label><input id="phone" type="tel"></div>
      <div class="field"><label for="resume">Resume</label><input id="resume" type="file"></div>
      <div class="field"><label for="question_1">LinkedIn Profile</label><input id="question_1" type="text"></div>
      <div class="field"><label for="question_2">Are you legally authorized to work in the United States?</label>
        <select id="question_2"><option value="">Please select</option><option value="1">Yes</option><option value="2">No</option></select></div>
      <div class="field"><label for="question_3">Will you now or in the future require visa sponsorship?</label>
        <select id="question_3"><option value="">Please select</option><option value="1">Yes</option><option value="2">No</option></select></div>
      <div class="field"><label for="question_4">Why do you want to work here?</label><textarea id="question_4"></textarea></div>
      <div class="field"><label for="gender">Gender</label>
        <select id="gender"><option value="">Select...</option><option value="1">Male</option><option value="2">Female</option><option value="3">Decline To Self Identify</option></select></div>
    </form>`;
  });

  it('fills the standard fields, answers selects, leaves open questions alone', async () => {
    const report = await run({ adapter: detectAdapter(new URL('https://job-boards.greenhouse.io/acme/jobs/1')) });
    expect(report.platform).toBe('greenhouse');
    expect(val('#first_name')).toBe('Ada');
    expect(val('#last_name')).toBe('Lovelace');
    expect(val('#email')).toBe('ada@example.com');
    expect(val('#phone')).toBe('5551234567');
    expect(val('#question_1')).toBe('https://linkedin.com/in/ada');
    expect((document.querySelector('#question_2') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Yes');
    expect((document.querySelector('#question_3') as HTMLSelectElement).selectedOptions[0].textContent).toBe('No');
    expect((document.querySelector('#gender') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Female');
    expect(val('#question_4')).toBe('');
    expect(report.unmatched).toContain('Why do you want to work here?');
  });

  it('does not overwrite existing answers unless asked', async () => {
    (document.querySelector('#first_name') as HTMLInputElement).value = 'Grace';
    await run();
    expect(val('#first_name')).toBe('Grace');
    await run({ overwrite: true });
    expect(val('#first_name')).toBe('Ada');
  });

  it('is idempotent: a second run fills nothing new', async () => {
    await run();
    const again = await run();
    expect(again.filled).toHaveLength(0);
  });

  it('triggers the input event so framework state updates', async () => {
    let seen = '';
    document.querySelector('#first_name')!.addEventListener('input', (e) => { seen = (e.target as HTMLInputElement).value; });
    await run();
    expect(seen).toBe('Ada');
  });
});

describe('Lever-style form', () => {
  it('uses the name-attribute table', async () => {
    document.body.innerHTML = `
    <form>
      <input name="name" placeholder="">
      <input name="email">
      <input name="phone">
      <input name="org">
      <input name="urls[LinkedIn]">
      <input name="urls[GitHub]">
      <select name="eeo[gender]"><option value="">Select</option><option>Male</option><option>Female</option></select>
    </form>`;
    const r = await run({ adapter: detectAdapter(new URL('https://jobs.lever.co/acme/123/apply')) });
    expect(r.platform).toBe('lever');
    expect(val('[name="name"]')).toBe('Ada Lovelace');
    expect(val('[name="org"]')).toBe('Analytical Engines');
    expect(val('[name="urls[GitHub]"]')).toBe('https://github.com/ada');
    expect((document.querySelector('[name="eeo[gender]"]') as HTMLSelectElement).value).toBe('Female');
  });
});

describe('radios and comboboxes', () => {
  it('fills a radio group labelled by a legend', async () => {
    document.body.innerHTML = `
    <fieldset><legend>Are you willing to relocate?</legend>
      <label><input type="radio" name="reloc" value="y"> Yes</label>
      <label><input type="radio" name="reloc" value="n"> No</label>
    </fieldset>
    <div class="q"><div class="lbl">Are you a protected veteran?</div>
      <label><input type="radio" name="vet" value="1"> I am a protected veteran</label>
      <label><input type="radio" name="vet" value="2"> No</label></div>`;
    await run();
    expect((document.querySelector('[name=reloc][value=y]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('[name=vet][value="2"]') as HTMLInputElement).checked).toBe(true);
  });

  it('types into a combobox and picks the option', async () => {
    document.body.innerHTML = `<label for="loc">Location (City)</label><input id="loc" role="combobox" aria-controls="lb">`;
    const input = document.querySelector('#loc') as HTMLInputElement;
    input.addEventListener('input', () => {
      document.body.insertAdjacentHTML('beforeend', `<ul id="lb" role="listbox"><li role="option">Oakland, CA</li><li role="option">San Francisco, CA, USA</li></ul>`);
      document.querySelectorAll('[role=option]').forEach((o) => o.addEventListener('click', () => { input.value = o.textContent!; }));
    }, { once: true });
    const r = await run();
    expect(r.filled.map((f) => f.key)).toContain('city');
    expect(input.value).toBe('San Francisco, CA, USA');
  });

  it('reports a combobox with no matching option and clears what it typed', async () => {
    document.body.innerHTML = `<label for="loc">City</label><input id="loc" role="combobox">`;
    const r = await run();
    expect((document.querySelector('#loc') as HTMLInputElement).value).toBe('');
    expect(r.skipped[0]?.reason).toBe('no matching option');
  }, 5000);
});

describe('safety', () => {
  it('never touches passwords, hidden, disabled or buttons', async () => {
    document.body.innerHTML = `<input type="password" name="email"><input type="hidden" name="email"><input name="email" disabled><button name="email">x</button>`;
    const r = await run();
    expect(r.filled).toHaveLength(0);
  });
  it('does not tick checkboxes (consents)', async () => {
    document.body.innerHTML = `<label><input type="checkbox" name="agree"> I agree to the privacy policy</label>`;
    await run();
    expect((document.querySelector('input') as HTMLInputElement).checked).toBe(false);
  });
  it('leaves unknown fields blank rather than guessing', async () => {
    document.body.innerHTML = `<label for="q">Favourite colour</label><input id="q">`;
    const r = await run();
    expect(val('#q')).toBe('');
    expect(r.unmatched).toEqual(['Favourite colour']);
  });
});
