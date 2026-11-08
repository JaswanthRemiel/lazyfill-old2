import { toYearMonth } from './dates';
import { emptyEducation, emptyProfileData, emptyWork, type Education, type ProfileData, type WorkExperience } from './profile';

/** What the importer reads from a resume file, before any AI is involved. */
export interface ResumeSource {
  fileName: string;
  /** page images (JPEG or PNG, base64), in order */
  images: { mimeType: string; base64: string }[];
  /** the PDF's text layer, if it has one */
  text: string;
  /** hidden hyperlink addresses and the words drawn over them */
  links: { text: string; url: string }[];
  pageCount: number;
  /** more pages than were sent */
  truncated?: boolean;
}

// ---- what the model is asked for ----

const s = { type: 'string' } as const;
const b = { type: 'boolean' } as const;
const obj = (props: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });

/** Strict, so the model cannot add or drop fields. Works as Gemini `responseJsonSchema` and OpenAI strict `json_schema`. */
export const RESUME_SCHEMA = obj({
  personalInfo: obj({ firstName: s, middleName: s, lastName: s, email: s, phoneNumber: s, currentAddress: s, city: s, state: s, zipCode: s, country: s }),
  links: obj({ linkedinUrl: s, githubUrl: s, portfolioUrl: s, websiteUrl: s, twitterUrl: s }),
  workExperience: {
    type: 'array',
    items: obj({ jobTitle: s, companyName: s, location: s, startDate: s, endDate: s, isCurrent: b, description: s, sourceQuote: s }),
  },
  education: {
    type: 'array',
    items: obj({ schoolName: s, degree: s, fieldOfStudy: s, gpa: s, startDate: s, graduationDate: s, currentlyEnrolled: b, sourceQuote: s }),
  },
  skills: { type: 'array', items: s },
});

export interface ModelResume {
  personalInfo: Record<string, string>;
  links: Record<string, string>;
  workExperience: (WorkExperience & { sourceQuote: string })[];
  education: (Education & { sourceQuote: string })[];
  skills: string[];
}

export const RESUME_SYSTEM = [
  'You are a meticulous resume parser. You read a resume and return its contents as JSON in the exact shape requested.',
  'You are given the resume as page images, plus the PDF text layer and the list of hyperlinks.',
  'Trust the page images for layout: which dates belong to which job, which words are a heading, which column something is in. Designed resumes often have dates, columns and sidebars, and the text layer can list them out of order or separated from the job they belong to.',
  'Trust the text layer for exact spelling of names, emails, numbers and URLs.',
  'Copy values exactly as written. Never invent, guess or fill in anything that is not on the resume. Use an empty string when a value is not there.',
  'Name: split into firstName, middleName (if any) and lastName.',
  'phoneNumber: the phone number exactly as printed, including any + country code.',
  'workExperience: one entry per position, most recent first. If someone held several roles at one company, give each its own entry. Keep jobTitle and companyName apart; resumes write them as "Title, Company", "Company | Title", "Title at Company" and in separate lines.',
  'Dates: "YYYY-MM" when the month is shown ("Apr 2025" is "2025-04", "05/2024" is "2024-05"); "YYYY" when only the year is shown; use only the year for seasons. "Present", "Current", "Now", "Till date" mean endDate "" and isCurrent true.',
  'description: the lines that belong to that job, in the resume\'s own words, one per line, without bullet symbols. Do not summarise or shorten them.',
  'education: one entry per degree or programme. "B.Tech in Electronics" is degree "B.Tech" and fieldOfStudy "Electronics". gpa is the number as printed without a label (for example "3.9" or "8.24/10"). graduationDate is the end date; for an ongoing or expected degree set currentlyEnrolled true and put the expected date in graduationDate if one is printed.',
  'skills: only the items the resume lists in a skills, technologies or tools section, one short item per entry (split comma and bullet lists). Do not add skills you infer from job descriptions.',
  'links: take each address from the hyperlink list or the text, matching it to the label next to it ("LinkedIn" is linkedinUrl, "GitHub" is githubUrl). A personal site or portfolio goes in websiteUrl or portfolioUrl. Leave a link out if it is not listed.',
  'sourceQuote: for every job and school, copy one short exact phrase (at most 80 characters) from the resume that proves it, such as the line with the company or school name.',
].join('\n');

export function buildResumePrompt(src: ResumeSource): string {
  const hasText = hasTextLayer(src.text);
  const parts = [
    `File: ${src.fileName}`,
    `Pages: ${src.images.length}${src.truncated ? ` of ${src.pageCount} (the rest are not included)` : ''}. The page images follow in order.`,
    hasText
      ? `Text layer (the order can be scrambled for designed resumes; use it for exact spelling):\n"""\n${src.text.slice(0, 24000)}\n"""`
      : 'There is no text layer: this is a scan or an image. Read everything from the page images.',
    src.links.length ? `Hyperlinks in the file (words on the page -> address):\n${JSON.stringify(src.links.slice(0, 40))}` : 'The file has no hyperlinks.',
    'Return the resume as JSON.',
  ];
  return parts.join('\n\n');
}

// ---- checking what came back ----

/** Anything the model sends that is not text (a number, null) counts as empty text or its digits. */
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

export const hasTextLayer = (text: string) => text.replace(/\s+/g, '').length >= 80;

const squash = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** Does the resume text mention `value`? Case, spacing and punctuation do not matter, and neither does word order inside it. */
export function mentions(text: string, value: string): boolean {
  const v = squash(value);
  if (!v) return false;
  const t = squash(text);
  if (t.includes(v)) return true;
  const words = value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  return words.length > 1 && words.every((w) => t.includes(w.replace(/[^\p{L}\p{N}]+/gu, '')));
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b(?:[a-z0-9-]+\.)+(?:com|in|io|dev|me|net|org|app|co|ai|tech|xyz)\/[^\s<>"')\]]*/gi;

// longest first, so +971 is not read as +9
const CALLING_CODES = [
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '212', '213', '216', '234', '254', '351', '352', '353', '354',
  '358', '370', '371', '372', '380', '420', '421', '852', '880', '886', '960', '966', '971', '972', '974', '977',
];

/** "+44 7700 900123" -> { phoneCountryCode: '+44', phoneNumber: '7700900123' }. A number with no + keeps no code. */
export function splitPhone(raw: string): { phoneCountryCode: string; phoneNumber: string } {
  const v = raw.trim();
  if (!v) return { phoneCountryCode: '', phoneNumber: '' };
  const intl = v.startsWith('+') || v.startsWith('00');
  const digits = v.replace(/\D/g, '').replace(/^00/, '');
  if (intl) {
    for (const len of [3, 2, 1]) {
      const code = digits.slice(0, len);
      if (CALLING_CODES.includes(code) && digits.length - len >= 6) return { phoneCountryCode: `+${code}`, phoneNumber: digits.slice(len).replace(/^0+(?=\d{9,})/, '') };
    }
  }
  return { phoneCountryCode: '', phoneNumber: digits };
}

function findPhone(text: string): string {
  for (const m of text.matchAll(/(?<![\w@.])(\+?\d[\d\s().-]{7,}\d)(?![\w])/g)) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    if (/^(19|20)\d{2}\D+(19|20)\d{2}$/.test(m[1].trim())) continue; // "2021 - 2025"
    if (/^\d{1,2}[/.-]\d{4}/.test(m[1].trim())) continue; // a date
    return m[1].trim();
  }
  return '';
}

const SOCIAL = [
  ['linkedinUrl', /(^|\.)linkedin\.com\//i],
  ['githubUrl', /(^|\.)github\.com\//i],
  ['twitterUrl', /(^|\.)(twitter|x)\.com\//i],
] as const;

const clean = (u: string) => u.trim().replace(/[.,;:]+$/, '');
const normUrl = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const withScheme = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/** Every web address on the resume: hyperlinks first (they are the real ones), then any printed in the text. */
export function collectUrls(src: Pick<ResumeSource, 'text' | 'links'>): string[] {
  const out: string[] = [];
  const add = (u: string) => { const c = clean(u); if (c && !/^mailto:/i.test(c) && !out.some((o) => normUrl(o) === normUrl(c))) out.push(c); };
  for (const l of src.links) add(l.url);
  for (const m of src.text.replace(EMAIL, ' ').matchAll(URL_RE)) add(m[0]);
  return out;
}

const looksLikeJobSite = (u: string) => /(greenhouse|lever|workday|indeed|glassdoor)\./i.test(u);

function contactFixes(model: ModelResume, src: Pick<ResumeSource, 'text' | 'links'>, notes: string[]) {
  const pi = model.personalInfo;
  const out = { email: str(pi.email), phoneCountryCode: '', phoneNumber: '' };
  const haystack = `${src.text}\n${src.links.map((l) => l.url).join('\n')}`;
  const text = hasTextLayer(src.text);

  const emails = [...haystack.matchAll(EMAIL)].map((m) => m[0]);
  if (emails.length && !emails.some((e) => e.toLowerCase() === out.email.toLowerCase())) {
    if (out.email) notes.push(`Email changed from "${out.email}" to "${emails[0]}", which is what the resume says.`);
    out.email = emails[0];
  } else if (!emails.length && out.email && text) {
    notes.push('The email the AI read is not in the resume text. Check it.');
  }

  const printed = findPhone(src.text);
  const modelPhone = str(pi.phoneNumber);
  const chosen = printed && (!modelPhone || printed.replace(/\D/g, '') !== modelPhone.replace(/\D/g, '')) ? printed : modelPhone;
  if (printed && modelPhone && chosen !== modelPhone) notes.push(`Phone number taken from the resume text: ${printed}.`);
  Object.assign(out, splitPhone(chosen));

  const urls = collectUrls(src);
  const links: Record<string, string> = { linkedinUrl: '', githubUrl: '', portfolioUrl: '', websiteUrl: '', twitterUrl: '' };
  for (const [key, re] of SOCIAL) {
    const hit = urls.find((u) => re.test(u.replace(/^https?:\/\//i, '')));
    if (hit) links[key] = withScheme(hit);
  }
  const others = urls.filter((u) => !SOCIAL.some(([, re]) => re.test(u.replace(/^https?:\/\//i, ''))) && !looksLikeJobSite(u));
  // keep the model's choice between website and portfolio when it picked a real address
  const modelSite = ['websiteUrl', 'portfolioUrl'].find((k) => str(model.links[k]) && others.some((o) => normUrl(o) === normUrl(str(model.links[k]))));
  if (others[0]) links[modelSite ?? 'websiteUrl'] = withScheme(others[0]);
  return { ...out, links };
}

const RANGE_NOW = /^(present|current|now|ongoing|till date|to date|today)$/i;

function fixDates(entry: { startDate: string; endDate?: string; graduationDate?: string; isCurrent?: boolean; currentlyEnrolled?: boolean }, flags: string[]) {
  const end = 'endDate' in entry ? 'endDate' : 'graduationDate';
  const cur = 'isCurrent' in entry ? 'isCurrent' : 'currentlyEnrolled';
  const rec = entry as Record<string, unknown>;
  const rawEnd = String(rec[end] ?? '').trim();
  rec.startDate = toYearMonth(String(rec.startDate ?? ''));
  if (RANGE_NOW.test(rawEnd)) { rec[end] = ''; rec[cur] = true; }
  else {
    rec[end] = toYearMonth(rawEnd);
    if (rawEnd && !rec[end]) flags.push(`End date "${rawEnd}" was not understood.`);
  }
  if (rec[cur] === true && rec[end] && cur === 'isCurrent') rec[end] = ''; // a current job has no end
  if (rec.startDate && rec[end] && String(rec.startDate) > String(rec[end])) flags.push('The dates look reversed.');
}

/** Months worked, with overlapping jobs counted once. */
export function monthsWorked(jobs: Pick<WorkExperience, 'startDate' | 'endDate' | 'isCurrent'>[], now = new Date()): number {
  const toIndex = (ym: string, fallbackMonth: number) => {
    const m = ym.match(/^(\d{4})(?:-(\d{2}))?$/);
    return m ? +m[1] * 12 + (m[2] ? +m[2] - 1 : fallbackMonth) : null;
  };
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const spans = jobs
    .map((j) => [toIndex(j.startDate, 0), j.isCurrent || !j.endDate ? nowIdx : toIndex(j.endDate, 11)] as const)
    .filter((s): s is readonly [number, number] => s[0] !== null && s[1] !== null && s[1] >= s[0])
    .sort((a, c) => a[0] - c[0]);
  let total = 0;
  let edge = -Infinity;
  for (const [a, e] of spans) {
    const from = Math.max(a, edge);
    if (e > from) total += e - from + (from === a ? 1 : 0);
    edge = Math.max(edge, e);
  }
  return total;
}

export interface ResumeImport {
  data: ProfileData;
  /** reasons to double-check each entry, aligned with data.workExperience / data.education */
  workFlags: string[][];
  educationFlags: string[][];
  notes: string[];
  /** the model that read the resume */
  model: string;
  /** the model asked for was not available, so this one was used */
  usedFallback?: boolean;
}

/**
 * Turn the model's answer into a profile, correcting it against the resume itself. Contact details come from the
 * text and hyperlinks when they are there; jobs and schools the resume text does not mention are flagged.
 */
export function verifyResume(raw: unknown, src: Pick<ResumeSource, 'text' | 'links'>, model: string): ResumeImport {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Partial<ModelResume>;
  const model_: ModelResume = {
    personalInfo: { ...(m.personalInfo ?? {}) } as Record<string, string>,
    links: { ...(m.links ?? {}) } as Record<string, string>,
    workExperience: Array.isArray(m.workExperience) ? m.workExperience : [],
    education: Array.isArray(m.education) ? m.education : [],
    skills: Array.isArray(m.skills) ? m.skills : [],
  };
  const notes: string[] = [];
  const text = hasTextLayer(src.text);
  const data = emptyProfileData();

  const pi = model_.personalInfo;
  for (const k of ['firstName', 'middleName', 'lastName', 'currentAddress', 'city', 'state', 'zipCode', 'country'] as const) data.personalInfo[k] = str(pi[k]);
  const c = contactFixes(model_, src, notes);
  data.personalInfo.email = c.email;
  data.personalInfo.phoneCountryCode = c.phoneCountryCode;
  data.personalInfo.phoneNumber = c.phoneNumber;
  Object.assign(data.links, c.links);

  const workFlags: string[][] = [];
  for (const w of model_.workExperience) {
    const job: WorkExperience = { ...emptyWork(), jobTitle: str(w.jobTitle), companyName: str(w.companyName), location: str(w.location), startDate: str(w.startDate), endDate: str(w.endDate), isCurrent: w.isCurrent === true, description: str(w.description) };
    if (!job.jobTitle && !job.companyName) continue;
    const flags: string[] = [];
    if (text) {
      const company = mentions(src.text, job.companyName);
      const title = mentions(src.text, job.jobTitle);
      const quote = mentions(src.text, str(w.sourceQuote));
      if (!company && !quote) flags.push('The company is not in the resume text.');
      else if (!title && !quote) flags.push('The job title is not in the resume text.');
    }
    fixDates(job, flags);
    if (!job.startDate) flags.push('No start date found.');
    data.workExperience.push(job);
    workFlags.push(flags);
  }

  const educationFlags: string[][] = [];
  for (const e of model_.education) {
    const ed: Education = { ...emptyEducation(), schoolName: str(e.schoolName), degree: str(e.degree), fieldOfStudy: str(e.fieldOfStudy), gpa: str(e.gpa), startDate: str(e.startDate), graduationDate: str(e.graduationDate), currentlyEnrolled: e.currentlyEnrolled === true };
    if (!ed.schoolName && !ed.degree) continue;
    const flags: string[] = [];
    if (text && !mentions(src.text, ed.schoolName) && !mentions(src.text, str(e.sourceQuote))) flags.push('The school is not in the resume text.');
    fixDates(ed, flags);
    data.education.push(ed);
    educationFlags.push(flags);
  }

  const seen = new Set<string>();
  for (const sk of model_.skills) {
    const name = str(sk).replace(/^[\s•·\-\u2013*]+/, '');
    const key = name.toLowerCase();
    if (!name || name.length > 40 || name.split(/\s+/).length > 5 || seen.has(key)) continue;
    // the resume has to say it ("React.js" is fine if the resume says "React")
    if (text && !mentions(src.text, name) && !(name.length > 4 && mentions(src.text, name.replace(/\.?js$/i, '')))) continue;
    seen.add(key);
    data.skills.push(name);
  }

  // only jobs the resume backs up count towards the totals
  const trusted = data.workExperience.filter((_, i) => workFlags[i].length === 0);
  const months = monthsWorked(trusted);
  if (months > 0) data.preferences.yearsOfExperience = String(Math.floor(months / 12));
  const current = trusted.find((j) => j.isCurrent);
  if (current) { data.preferences.currentCompany = current.companyName; data.preferences.currentTitle = current.jobTitle; }

  const dropped = (model_.skills.length - data.skills.length);
  if (text && dropped > 0) notes.push(`${dropped} skill${dropped === 1 ? '' : 's'} the AI listed but the resume does not mention ${dropped === 1 ? 'was' : 'were'} left out.`);
  return { data, workFlags, educationFlags, notes, model };
}
