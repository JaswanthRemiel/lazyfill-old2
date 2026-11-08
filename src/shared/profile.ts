import type { AnswerEntry } from './answers';

export interface WorkExperience {
  jobTitle: string;
  companyName: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
}

export interface Education {
  schoolName: string;
  degree: string;
  fieldOfStudy: string;
  gpa: string;
  startDate: string;
  graduationDate: string;
  currentlyEnrolled: boolean;
}

export interface ResumeMeta {
  fileName: string;
  mimeType: string;
  size: number;
}

export interface ProfileData {
  personalInfo: {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    email: string;
    phoneCountryCode: string;
    phoneNumber: string;
    pronouns: string;
    currentAddress: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  links: {
    linkedinUrl: string;
    githubUrl: string;
    portfolioUrl: string;
    websiteUrl: string;
    twitterUrl: string;
  };
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  preferences: {
    currentCompany: string;
    currentTitle: string;
    yearsOfExperience: string;
    workAuthorization: string;
    requiresSponsorship: string;
    willingToRelocate: string;
    desiredSalary: string;
    noticePeriod: string;
    availableStartDate: string;
  };
  demographics: {
    genderIdentity: string;
    race: string;
    sexualOrientation: string;
    veteranStatus: string;
    disabilityStatus: string;
  };
  /** saved answers to open-ended questions, each with a mode that says whether AI writes it */
  answerBank: AnswerEntry[];
  resume: ResumeMeta | null;
}

export const emptyWork = (): WorkExperience => ({
  jobTitle: '', companyName: '', location: '', startDate: '', endDate: '', isCurrent: false, description: '',
});

export const emptyEducation = (): Education => ({
  schoolName: '', degree: '', fieldOfStudy: '', gpa: '', startDate: '', graduationDate: '', currentlyEnrolled: false,
});

export const emptyProfileData = (): ProfileData => ({
  personalInfo: {
    firstName: '', middleName: '', lastName: '', preferredName: '', email: '', phoneCountryCode: '',
    phoneNumber: '', pronouns: '', currentAddress: '', city: '', state: '', zipCode: '', country: '',
  },
  links: { linkedinUrl: '', githubUrl: '', portfolioUrl: '', websiteUrl: '', twitterUrl: '' },
  workExperience: [],
  education: [],
  skills: [],
  preferences: {
    currentCompany: '', currentTitle: '', yearsOfExperience: '', workAuthorization: '', requiresSponsorship: '',
    willingToRelocate: '', desiredSalary: '', noticePeriod: '', availableStartDate: '',
  },
  demographics: { genderIdentity: '', race: '', sexualOrientation: '', veteranStatus: '', disabilityStatus: '' },
  answerBank: [],
  resume: null,
});

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Copies `incoming` onto `template`, keeping only keys the template defines and
 * only values of the same primitive type. Used to sanitise AI output and to
 * upgrade older stored profiles when fields are added.
 */
export function mergeKnown<T>(template: T, incoming: unknown): T {
  if (Array.isArray(template)) {
    if (!Array.isArray(incoming)) return template;
    return incoming as unknown as T;
  }
  if (isObj(template)) {
    const out: Json = {};
    const src = isObj(incoming) ? incoming : {};
    for (const [k, def] of Object.entries(template)) out[k] = mergeKnown(def, src[k]);
    return out as T;
  }
  if (template === null) return (incoming ?? null) as T;
  if (typeof incoming === typeof template) return incoming as T;
  if (typeof template === 'string' && typeof incoming === 'number') return String(incoming) as T;
  return template;
}

export function normaliseProfileData(raw: unknown): ProfileData {
  const base = emptyProfileData();
  const merged = mergeKnown(base, raw);
  const src = isObj(raw) ? raw : {};
  merged.workExperience = (Array.isArray(src.workExperience) ? src.workExperience : []).map((w) =>
    mergeKnown(emptyWork(), w),
  );
  merged.education = (Array.isArray(src.education) ? src.education : []).map((e) =>
    mergeKnown(emptyEducation(), e),
  );
  merged.skills = (Array.isArray(src.skills) ? src.skills : []).filter((s): s is string => typeof s === 'string');
  merged.answerBank = (Array.isArray(src.answerBank) ? src.answerBank : [])
    .map((a) => mergeKnown({ question: '', answer: '', mode: 'llm_with_static_hint' as const }, a))
    .map((a) => ({ ...a, mode: (['static', 'llm', 'llm_with_static_hint'] as const).includes(a.mode) ? a.mode : ('llm_with_static_hint' as const) }))
    .filter((a) => a.question.trim() || a.answer.trim());
  merged.resume = isObj(src.resume) ? mergeKnown({ fileName: '', mimeType: '', size: 0 }, src.resume) : null;
  return merged;
}
