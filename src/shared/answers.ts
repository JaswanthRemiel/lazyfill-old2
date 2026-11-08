import { normalizeLabel } from './learned';
import type { ProfileData } from './profile';

/** static: fill the saved answer. llm: write one. llm_with_static_hint: write one, using the saved answer as guidance. */
export type AnswerMode = 'static' | 'llm' | 'llm_with_static_hint';

export interface AnswerEntry {
  /** the question as a site asks it, e.g. "Why do you want to work here?" */
  question: string;
  answer: string;
  mode: AnswerMode;
}

export const ANSWER_MODES: { value: AnswerMode; label: string; hint: string }[] = [
  { value: 'static', label: 'Always use my saved answer', hint: 'Autofill types it in. No AI.' },
  { value: 'llm', label: 'Write it with AI', hint: 'Drafted from the job and your profile.' },
  { value: 'llm_with_static_hint', label: 'Write it with AI, using my answer as a guide', hint: 'Your saved answer steers the content and tone.' },
];

export const emptyAnswer = (): AnswerEntry => ({ question: '', answer: '', mode: 'llm_with_static_hint' });

export interface JobContext { title: string; company: string; description: string }

// ---- prompt ----

export const MAX_JD_CHARS = 5000;

/** The parts of the profile that help write an answer. Contact details are left out on purpose. */
export function profileForPrompt(p: ProfileData) {
  const pi = p.personalInfo;
  return {
    name: [pi.firstName, pi.lastName].filter(Boolean).join(' '),
    location: [pi.city, pi.state, pi.country].filter(Boolean).join(', '),
    currentRole: [p.preferences.currentTitle, p.preferences.currentCompany].filter(Boolean).join(' at '),
    yearsOfExperience: p.preferences.yearsOfExperience,
    experience: p.workExperience.filter((e) => e.companyName || e.jobTitle),
    education: p.education.filter((e) => e.schoolName || e.degree),
    skills: p.skills,
  };
}

export const SELECTION_SYSTEM = [
  'You write job application answers for the candidate described in the prompt.',
  'Follow the instructions in the user message exactly.',
  'Return only the answer text.',
].join('\n');

export const DEFAULT_PROMPT_TEMPLATE = `Candidate profile (JSON):
{{profile}}

Job title: {{jobTitle}}
Company: {{company}}
Job description:
{{description}}
{{hint}}
Question:
{{question}}

Write the answer as the candidate, in the first person.

Rules:
- Sound like a real person wrote it. Use natural rhythm, plain words and specific details.
- Use the candidate's real employers, job titles, dates, projects, skills and numbers from the profile. Name the employer and role when it helps. Never invent experience.
- Answer the question directly. Give every relevant detail from the profile that supports the answer.
- NO EM DASHES. Never use an em dash or an en dash. Use a comma, a full stop, or "to" instead.
- No headings, bullet points, markdown, or quotation marks around the answer.
- Keep it between 80 and 150 words unless the question clearly needs less.
- Return only the answer text.
`;

/**
 * Fill the editable template. Values are inserted literally, so "$&" in a job ad is not treated as a capture.
 * `{{hint}}` becomes the candidate's own notes when there are some, and nothing otherwise.
 */
export function buildSelectionPrompt(args: {
  profile: ProfileData;
  job: JobContext;
  question: string;
  template: string;
  hint?: string;
}): { system: string; user: string } {
  const { profile, job, question, template, hint } = args;
  const values: Record<string, string> = {
    profile: JSON.stringify(profileForPrompt(profile), null, 2),
    jobTitle: (job.title || 'Unknown').slice(0, 300),
    company: (job.company || 'Unknown').slice(0, 300),
    description: job.description ? job.description.slice(0, MAX_JD_CHARS) : 'Not available.',
    question: question.slice(0, 4000),
    hint: hint?.trim() ? `\nThe candidate's own notes for this question. Use them as guidance for content and tone:\n${hint.trim().slice(0, 4000)}\n` : '',
  };
  let user = (template.trim() ? template : DEFAULT_PROMPT_TEMPLATE).replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
  // a custom template with no {{hint}} slot still has to honour the notes
  if (hint?.trim() && !/\{\{hint\}\}/.test(template)) user = `${user}\n${values.hint}`;
  return { system: SELECTION_SYSTEM, user };
}

// ---- cleaning ----

/** The template forbids dashes, but models still slip one in. */
export function stripDashes(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.?!])/g, '$1');
}

export function cleanAnswer(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\n?|```$/g, '')
    .trim()
    .replace(/^["“]|["”]$/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .trim();
}

/** Cut to `max` characters at a sentence or word boundary. */
export function trimToLength(text: string, max?: number): string {
  if (!max || text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(' ');
  return `${(word > 0 ? cut.slice(0, word) : cut).replace(/[,;:\s]+$/, '')}.`;
}

// ---- which questions AI may answer ----

/**
 * Legal, medical and identity questions are never drafted: the answer is a fact about the person
 * (and sometimes a legal statement), not something to write.
 */
const SENSITIVE_QUESTION = new RegExp(
  [
    'criminal|convict|felony|misdemeanou?r|arrest|background check',
    'authori[sz]ed to work|work authori[sz]ation|right to work|legally (able|eligible|authori)|eligible to work',
    'sponsor|visa|immigration|citizen|work permit|green card',
    'veteran|military|disabilit|disabled',
    '\\b(race|ethnic|gender|sexual orientation|transgender|pronoun)\\b',
    'eeo|equal employment|self[- ]identif',
    'pass(word|code)|\\bssn\\b|social security|national (id|insurance)|passport|date of birth|\\bdob\\b',
    'drug (test|screen)|security clearance',
  ].join('|'),
  'i',
);

export function isSensitiveQuestion(question: string): boolean {
  return SENSITIVE_QUESTION.test(question);
}

// ---- matching a question to the answer bank ----

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'you', 'your', 'are', 'is', 'do', 'does', 'we', 'our', 'us', 'this', 'that', 'with', 'be', 'it', 'as', 'by', 'from', 'what', 'why', 'how', 'please', 'tell', 'me', 'about', 'i', 'my']);

const tokens = (s: string) =>
  normalizeLabel(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t));

/** Best bank entry for a question: an exact label match, else enough shared meaningful words. */
export function findBankEntry(question: string, bank: AnswerEntry[]): AnswerEntry | null {
  const q = normalizeLabel(question);
  if (!q) return null;
  const qt = new Set(tokens(question));
  let best: { e: AnswerEntry; score: number } | null = null;
  for (const e of bank) {
    if (!e.question.trim()) continue;
    if (normalizeLabel(e.question) === q) return e;
    const et = tokens(e.question);
    if (!et.length || !qt.size) continue;
    const shared = et.filter((t) => qt.has(t)).length;
    const score = shared / Math.max(et.length, qt.size);
    if (shared >= 2 && score >= 0.6 && (!best || score > best.score)) best = { e, score };
  }
  return best?.e ?? null;
}
