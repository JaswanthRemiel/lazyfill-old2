import type { Education, ProfileData, WorkExperience } from './profile';
import type { ResumeImport } from './resumeImport';

/** The review step: what the AI found, set against what the profile already has, with sensible defaults for what to add. */

export type FieldSection = 'personalInfo' | 'links' | 'preferences';

const FIELDS: [FieldSection, string, string][] = [
  ['personalInfo', 'firstName', 'First name'], ['personalInfo', 'middleName', 'Middle name'], ['personalInfo', 'lastName', 'Last name'],
  ['personalInfo', 'email', 'Email'], ['personalInfo', 'phoneCountryCode', 'Phone country code'], ['personalInfo', 'phoneNumber', 'Phone number'],
  ['personalInfo', 'currentAddress', 'Address'], ['personalInfo', 'city', 'City'], ['personalInfo', 'state', 'State / region'],
  ['personalInfo', 'zipCode', 'Postal code'], ['personalInfo', 'country', 'Country'],
  ['links', 'linkedinUrl', 'LinkedIn'], ['links', 'githubUrl', 'GitHub'], ['links', 'portfolioUrl', 'Portfolio'], ['links', 'websiteUrl', 'Website'], ['links', 'twitterUrl', 'Twitter / X'],
  ['preferences', 'currentCompany', 'Current company'], ['preferences', 'currentTitle', 'Current title'], ['preferences', 'yearsOfExperience', 'Years of experience'],
];

export interface FieldRow { section: FieldSection; key: string; label: string; found: string; current: string; take: boolean }
export interface EntryRow<T> { item: T; flags: string[]; /** already in the profile */ present: boolean; take: boolean }
export interface SkillRow { name: string; present: boolean; take: boolean }

export interface Review {
  fields: FieldRow[];
  work: EntryRow<WorkExperience>[];
  education: EntryRow<Education>[];
  skills: SkillRow[];
  notes: string[];
  model: string;
  usedFallback: boolean;
}

const squash = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const sameish = (a: string, b: string) => !!a && !!b && (squash(a) === squash(b) || squash(a).includes(squash(b)) || squash(b).includes(squash(a)));

export function buildReview(current: ProfileData, imp: ResumeImport): Review {
  const fields: FieldRow[] = [];
  for (const [section, key, label] of FIELDS) {
    const found = String((imp.data[section] as unknown as Record<string, string>)[key] ?? '').trim();
    const have = String((current[section] as unknown as Record<string, string>)[key] ?? '').trim();
    if (!found || found === have) continue;
    // fill blanks by default; replacing what you typed has to be your choice
    fields.push({ section, key, label, found, current: have, take: !have });
  }

  const work = imp.data.workExperience.map((item, i): EntryRow<WorkExperience> => {
    const present = current.workExperience.some((w) => sameish(w.companyName, item.companyName) && sameish(w.jobTitle, item.jobTitle));
    const flags = imp.workFlags[i] ?? [];
    return { item, flags, present, take: !present && flags.length === 0 };
  });
  const education = imp.data.education.map((item, i): EntryRow<Education> => {
    const present = current.education.some((e) => sameish(e.schoolName, item.schoolName) && (sameish(e.degree, item.degree) || !e.degree || !item.degree));
    const flags = imp.educationFlags[i] ?? [];
    return { item, flags, present, take: !present && flags.length === 0 };
  });

  const have = new Set(current.skills.map((k) => k.toLowerCase()));
  const skills = imp.data.skills.map((name): SkillRow => ({ name, present: have.has(name.toLowerCase()), take: !have.has(name.toLowerCase()) }));

  return { fields, work, education, skills, notes: imp.notes, model: imp.model, usedFallback: !!imp.usedFallback };
}

/** Adds what was ticked. Nothing already in the profile is removed or reordered. */
export function applyReview(current: ProfileData, r: Review): ProfileData {
  const next: ProfileData = JSON.parse(JSON.stringify(current));
  for (const f of r.fields) if (f.take) (next[f.section] as unknown as Record<string, string>)[f.key] = f.found;
  next.workExperience.push(...r.work.filter((w) => w.take && !w.present).map((w) => w.item));
  next.education.push(...r.education.filter((e) => e.take && !e.present).map((e) => e.item));
  next.skills.push(...r.skills.filter((s) => s.take && !s.present).map((s) => s.name));
  return next;
}

export const reviewCount = (r: Review) =>
  r.fields.filter((f) => f.take).length + r.work.filter((w) => w.take).length + r.education.filter((e) => e.take).length + r.skills.filter((s) => s.take).length;
