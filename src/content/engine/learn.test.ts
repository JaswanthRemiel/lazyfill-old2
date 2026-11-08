import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProfileData, type ProfileData } from '../../shared/profile';
import { normalizeLabel, type LearnedEntry, type LearnedMap } from '../../shared/learned';
import { generic } from '../adapters/registry';
import { learnCandidates } from './candidates';
import { detectFields } from './detect';
import { readAnswer, replayAnswer, toLearnFields } from './learn';
import { autofill } from './run';

const opts = { skipVisibilityCheck: true };
const profile = (): ProfileData => {
  const p = emptyProfileData();
  Object.assign(p.personalInfo, { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' });
  return p; // note: no salary, no linkedin, no start date
};
const fields = () => detectFields(document, opts);
const learnFields = () => toLearnFields(fields());
const entry = (over: Partial<LearnedEntry>): LearnedEntry => ({
  originalLabel: 'x', value: '', fieldType: 'text', selectedOptionText: null, selectedIndex: null, options: null,
  firstSeen: '', lastUsed: '', timesUsed: 0, lastUrl: 'https://boards.greenhouse.io/acme/jobs/1', source: 'manual', ...over,
});
const run = (learned: LearnedMap, over = {}) =>
  autofill({ profile: profile(), adapter: generic, getResume: async () => null, learned, pageUrl: 'https://boards.greenhouse.io/acme/jobs/2', detect: opts, settleMs: 0, ...over });

beforeEach(() => { document.body.innerHTML = ''; });

describe('normalizeLabel', () => {
  it('ignores case, spacing, asterisks, colons, "?" and (required)', () => {
    const a = normalizeLabel('  Why do you want to work here? *  ');
    expect(normalizeLabel('why do you  want to work here (required)')).toBe(a);
    expect(normalizeLabel('Why do you want to work here:')).toBe(a);
  });
});

describe('what counts as a question to remember', () => {
  it('collapses radio and checkbox groups, and skips consents, secrets and lone checkboxes', () => {
    document.body.innerHTML = `
      <label for="a">Favourite language</label><input id="a">
      <fieldset><legend>Remote or onsite?</legend><label><input type="radio" name="r" value="1"> Remote</label><label><input type="radio" name="r" value="2"> Onsite</label></fieldset>
      <fieldset><legend>Which tools have you used?</legend><label><input type="checkbox" name="t" value="a"> Git</label><label><input type="checkbox" name="t" value="b"> Docker</label></fieldset>
      <label><input type="checkbox" name="agree"> I agree to the privacy policy</label>
      <label for="s">Social Security Number</label><input id="s">
      <label for="p">Passport number</label><input id="p">
      <label for="c">Credit card number</label><input id="c">`;
    const labels = learnFields().map((l) => `${l.kind}:${l.label}`);
    expect(labels).toEqual(expect.arrayContaining(['text:Favourite language', 'radio:Remote or onsite?', 'checkboxes:Which tools have you used?']));
    expect(labels.join('|')).not.toMatch(/agree|Social|Passport|Credit/i);
  });
});

describe('reading and replaying answers', () => {
  it('round-trips a text answer', async () => {
    document.body.innerHTML = '<label for="q">Favourite language</label><input id="q">';
    (document.getElementById('q') as HTMLInputElement).value = 'TypeScript';
    const lf = learnFields()[0];
    const a = readAnswer(lf)!;
    expect(a).toMatchObject({ value: 'TypeScript', fieldType: 'text' });

    document.body.innerHTML = '<label for="q">Favourite language</label><input id="q">';
    expect(await replayAnswer(learnFields()[0], entry({ ...a }))).toBe(true);
    expect((document.getElementById('q') as HTMLInputElement).value).toBe('TypeScript');
  });

  it('round-trips a select by its visible text even when option values differ between sites', async () => {
    const page = (vals: string[]) => `<label for="s">How did you hear about us?</label><select id="s"><option value="">Select</option>${['LinkedIn', 'Referral', 'Job board'].map((t, i) => `<option value="${vals[i]}">${t}</option>`).join('')}</select>`;
    document.body.innerHTML = page(['1', '2', '3']);
    (document.getElementById('s') as HTMLSelectElement).value = '2';
    const a = readAnswer(learnFields()[0])!;
    expect(a).toMatchObject({ fieldType: 'select', selectedOptionText: 'Referral' });

    document.body.innerHTML = page(['x', 'y', 'z']);
    expect(await replayAnswer(learnFields()[0], entry({ ...a }))).toBe(true);
    expect((document.getElementById('s') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Referral');
  });

  it('round-trips a radio group and a multi-select checkbox group', async () => {
    const html = `
      <fieldset><legend>Remote or onsite?</legend><label><input type="radio" name="r" value="1"> Remote</label><label><input type="radio" name="r" value="2"> Onsite</label></fieldset>
      <fieldset><legend>Which tools have you used?</legend><label><input type="checkbox" name="t" value="a"> Git</label><label><input type="checkbox" name="t" value="b"> Docker</label><label><input type="checkbox" name="t" value="c"> Kubernetes</label></fieldset>`;
    document.body.innerHTML = html;
    (document.querySelector('[name=r][value="2"]') as HTMLInputElement).click();
    (document.querySelector('[name=t][value=a]') as HTMLInputElement).click();
    (document.querySelector('[name=t][value=c]') as HTMLInputElement).click();
    const answers = learnFields().map((lf) => ({ lf, a: readAnswer(lf)! }));
    expect(answers.find((x) => x.lf.kind === 'radio')!.a.selectedOptionText).toBe('Onsite');
    expect(answers.find((x) => x.lf.kind === 'checkboxes')!.a.value).toEqual(['Git', 'Kubernetes']);

    document.body.innerHTML = html;
    for (const { lf, a } of answers) void lf, a;
    const fresh = learnFields();
    for (const lf of fresh) {
      const a = answers.find((x) => x.lf.kind === lf.kind)!.a;
      expect(await replayAnswer(lf, entry({ ...a }))).toBe(true);
    }
    expect((document.querySelector('[name=r][value="2"]') as HTMLInputElement).checked).toBe(true);
    expect([...document.querySelectorAll<HTMLInputElement>('[name=t]')].map((b) => b.checked)).toEqual([true, false, true]);
  });

  it('returns null when nothing has been answered', () => {
    document.body.innerHTML = '<label for="q">Anything else?</label><input id="q"><select id="s"><option value="">Select</option><option>A</option></select>';
    for (const lf of learnFields()) expect(readAnswer(lf)).toBeNull();
  });
});

describe('autofill uses what you taught it', () => {
  const FORM = `
    <label for="fn">First Name</label><input id="fn">
    <label for="q1">Favourite language</label><input id="q1">
    <label for="q2">Desired salary</label><input id="q2">
    <label for="q3">Why do you want to work here?</label><textarea id="q3"></textarea>`;

  it('fills unknown questions and fields your profile has no data for', async () => {
    document.body.innerHTML = FORM;
    const learned: LearnedMap = {
      [normalizeLabel('Favourite language')]: entry({ value: 'TypeScript', fieldType: 'text' }),
      [normalizeLabel('Desired salary')]: entry({ value: '$150,000', fieldType: 'text' }), // profile has no salary
    };
    const r = await run(learned);
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
    expect(val('fn')).toBe('Ada'); // profile data still wins where it exists
    expect(val('q1')).toBe('TypeScript');
    expect(val('q2')).toBe('$150,000');
    expect(r.filled.filter((f) => f.key === 'learned')).toHaveLength(2);
    expect(r.learnedKeys).toEqual(expect.arrayContaining([normalizeLabel('Favourite language'), normalizeLabel('Desired salary')]));
    expect(r.unmatched).toEqual(['Why do you want to work here?']);
    expect(r.skipped.find((s) => s.label === 'Desired salary')).toBeUndefined(); // no longer "nothing in profile"
  });

  it('profile data beats a stale learned answer for the same question', async () => {
    document.body.innerHTML = '<label for="fn">First Name</label><input id="fn">';
    await run({ [normalizeLabel('First Name')]: entry({ value: 'WRONG' }) });
    expect((document.getElementById('fn') as HTMLInputElement).value).toBe('Ada');
  });

  it('long written answers are only reused on the same company site', async () => {
    document.body.innerHTML = FORM;
    const learned = { [normalizeLabel('Why do you want to work here?')]: entry({ value: 'I love Acme.', fieldType: 'textarea', lastUrl: 'https://boards.greenhouse.io/acme/jobs/1' }) };
    await run(learned, { pageUrl: 'https://boards.greenhouse.io/globex/jobs/9' });
    expect((document.getElementById('q3') as HTMLTextAreaElement).value).toBe('I love Acme.'); // same host: greenhouse board
    document.body.innerHTML = FORM;
    await run(learned, { pageUrl: 'https://jobs.lever.co/globex/9' });
    expect((document.getElementById('q3') as HTMLTextAreaElement).value).toBe(''); // different site: not reused
  });

  it('never overwrites what is already there, unless asked', async () => {
    document.body.innerHTML = FORM;
    (document.getElementById('q1') as HTMLInputElement).value = 'Rust';
    const learned = { [normalizeLabel('Favourite language')]: entry({ value: 'TypeScript' }) };
    await run(learned);
    expect((document.getElementById('q1') as HTMLInputElement).value).toBe('Rust');
    await run(learned, { overwrite: true });
    expect((document.getElementById('q1') as HTMLInputElement).value).toBe('TypeScript');
  });

  it('never ticks a consent box even if one was somehow saved', async () => {
    document.body.innerHTML = `<fieldset><legend>Communication</legend>
      <label><input type="checkbox" name="c" value="1"> I agree to the terms</label><label><input type="checkbox" name="c" value="2"> Email me updates</label></fieldset>`;
    const learned = { [normalizeLabel('Communication')]: entry({ value: ['I agree to the terms', 'Email me updates'], fieldType: 'checkboxes', selectedOptionText: ['I agree to the terms', 'Email me updates'] }) };
    await run(learned);
    const [agree, email] = [...document.querySelectorAll<HTMLInputElement>('[name=c]')];
    expect(agree.checked).toBe(false);
    expect(email.checked).toBe(true);
  });
});

describe('learnCandidates', () => {
  it('includes unknown questions and recognised fields the profile cannot answer, but not answered ones', () => {
    document.body.innerHTML = `
      <label for="fn">First Name</label><input id="fn">
      <label for="sal">Desired salary</label><input id="sal">
      <label for="q">Favourite language</label><input id="q">`;
    const labels = learnCandidates(fields(), generic, profile()).map((l) => l.label);
    expect(labels).toEqual(['Desired salary', 'Favourite language']);
  });
});
