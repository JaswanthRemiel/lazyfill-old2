import { describe, expect, it } from 'vitest';
import {
  buildSelectionPrompt, cleanAnswer, DEFAULT_PROMPT_TEMPLATE, findBankEntry, isSensitiveQuestion, stripDashes, trimToLength,
  type AnswerEntry,
} from './answers';
import { emptyProfileData, normaliseProfileData } from './profile';
import { buildTemplate, parseProfileImport } from './profileJson';
import { pickModel } from '../background/ai';

const job = { title: 'Staff Engineer', company: 'Globex', description: 'Build things. Costs $& more.' };
const profile = () => {
  const p = emptyProfileData();
  p.personalInfo.firstName = 'Ada';
  p.personalInfo.email = 'ada@example.com';
  p.workExperience = [{ jobTitle: 'Engineer', companyName: 'Analytical Engines', location: '', startDate: '2020-01', endDate: '', isCurrent: true, description: '' }];
  p.skills = ['Python'];
  return p;
};

describe('buildSelectionPrompt', () => {
  it('fills the template and never leaks contact details', () => {
    const { user } = buildSelectionPrompt({ profile: profile(), job, question: 'Why us?', template: DEFAULT_PROMPT_TEMPLATE });
    expect(user).toContain('Analytical Engines');
    expect(user).toContain('Job title: Staff Engineer');
    expect(user).toContain('Why us?');
    expect(user).not.toContain('ada@example.com');
    expect(user).not.toContain('{{');
  });
  it('inserts job text literally ($& is not a capture)', () => {
    const { user } = buildSelectionPrompt({ profile: profile(), job, question: 'Q', template: DEFAULT_PROMPT_TEMPLATE });
    expect(user).toContain('Costs $& more.');
  });
  it('adds the candidate notes when there are some, and nothing when there are none', () => {
    const withHint = buildSelectionPrompt({ profile: profile(), job, question: 'Q', template: DEFAULT_PROMPT_TEMPLATE, hint: 'Mention open source' }).user;
    expect(withHint).toContain('Mention open source');
    const without = buildSelectionPrompt({ profile: profile(), job, question: 'Q', template: DEFAULT_PROMPT_TEMPLATE }).user;
    expect(without).not.toContain("candidate's own notes");
  });
  it('still honours the notes when a custom template has no {{hint}} slot', () => {
    const { user } = buildSelectionPrompt({ profile: profile(), job, question: 'Q', template: 'Write about {{question}}.', hint: 'Be brief' });
    expect(user).toContain('Write about Q.');
    expect(user).toContain('Be brief');
  });
  it('falls back to the built-in prompt for an empty template', () => {
    expect(buildSelectionPrompt({ profile: profile(), job, question: 'Q', template: '  ' }).user).toContain('Write the answer as the candidate');
  });
});

describe('cleaning', () => {
  it('removes em and en dashes', () => {
    expect(stripDashes('I led it \u2014 and shipped.')).toBe('I led it, and shipped.');
    expect(stripDashes('2019\u20132021')).toBe('2019, 2021');
  });
  it('strips fences, quotes and bold', () => {
    expect(cleanAnswer('```\n"I **love** this."\n```')).toBe('I love this.');
  });
  it('trims at a sentence boundary', () => {
    expect(trimToLength('One two three. Four five six seven.', 20)).toBe('One two three.');
    expect(trimToLength('short', 20)).toBe('short');
  });
});

describe('isSensitiveQuestion', () => {
  it.each([
    'Have you ever been convicted of a felony?',
    'Are you legally authorized to work in the United States?',
    'Will you now or in the future require visa sponsorship?',
    'Veteran status',
    'What is your gender identity?',
    'Do you have a disability?',
  ])('refuses %s', (q) => expect(isSensitiveQuestion(q)).toBe(true));
  it.each(['Why do you want to work here?', 'Describe a project you are proud of.', 'Tell us about your experience with distributed systems.'])('allows %s', (q) =>
    expect(isSensitiveQuestion(q)).toBe(false));
});

describe('findBankEntry', () => {
  const bank: AnswerEntry[] = [
    { question: 'Why do you want to work here?', answer: 'Because.', mode: 'static' },
    { question: 'Describe your biggest technical achievement', answer: 'Notes', mode: 'llm_with_static_hint' },
  ];
  it('matches the exact question however it is decorated', () => {
    expect(findBankEntry('Why do you want to work here? *', bank)?.mode).toBe('static');
  });
  it('matches a reworded question that shares the meaning', () => {
    expect(findBankEntry('Please describe your biggest technical achievement.', bank)?.mode).toBe('llm_with_static_hint');
  });
  it('does not match unrelated questions or one shared word', () => {
    expect(findBankEntry('Why are you leaving your job?', bank)).toBeNull();
    expect(findBankEntry('Biggest fear?', bank)).toBeNull();
  });
});

describe('the answer bank in a profile', () => {
  it('is kept, with unknown modes reset and blank entries dropped', () => {
    const p = normaliseProfileData({ answerBank: [{ question: 'Q', answer: 'A', mode: 'static' }, { question: 'R', answer: '', mode: 'nonsense' }, { question: '', answer: '', mode: 'llm' }] });
    expect(p.answerBank).toEqual([{ question: 'Q', answer: 'A', mode: 'static' }, { question: 'R', answer: '', mode: 'llm_with_static_hint' }]);
  });
  it('round-trips through the JSON import without "unknown field" warnings', () => {
    const t = buildTemplate();
    t.data.answerBank = [{ question: 'Why us?', answer: 'Because', mode: 'static' }];
    t.data.personalInfo.firstName = 'Ada';
    const r = parseProfileImport(JSON.stringify(t));
    expect(r.errors).toEqual([]);
    expect(r.profiles[0].data.answerBank).toHaveLength(1);
    expect(r.profiles[0].warnings.join(' ')).not.toMatch(/answerBank/);
  });
});

describe('pickModel', () => {
  it('prefers the cheap class and skips non-chat models', () => {
    expect(pickModel('gemini', ['gemini-2.5-pro', 'gemini-2.5-flash', 'text-embedding-004', 'gemini-2.5-flash-image'])).toBe('gemini-2.5-flash');
    expect(pickModel('openai', ['gpt-4o', 'gpt-4o-mini', 'whisper-1'])).toBe('gpt-4o-mini');
    expect(pickModel('openai', ['whisper-1'])).toBeNull();
  });
});
