export const MATCH_KEYS = [
  'firstName', 'middleName', 'lastName', 'preferredName', 'fullName', 'email',
  'phone', 'phoneCountryCode', 'address', 'city', 'state', 'zip', 'country',
  'linkedin', 'github', 'twitter', 'portfolio', 'website',
  'currentCompany', 'currentTitle', 'yearsExperience',
  'workAuthorization', 'sponsorship', 'relocate', 'salary', 'noticePeriod', 'startDate',
  'gender', 'race', 'orientation', 'veteran', 'disability', 'pronouns',
  'school', 'degree', 'fieldOfStudy', 'gpa', 'graduationDate',
  'resume',
] as const;
export type MatchKey = (typeof MATCH_KEYS)[number];

export type FieldEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export type FieldKind = 'text' | 'textarea' | 'select' | 'radio' | 'combobox' | 'file' | 'checkbox';

export interface FieldInfo {
  kind: FieldKind;
  el: FieldEl;
  /** all radios of the group when kind === 'radio' */
  group?: HTMLInputElement[];
  label: string;
  placeholder: string;
  aria: string;
  name: string;
  id: string;
  autocomplete: string;
  required: boolean;
}

export type FilledKey = MatchKey | `work.${string}` | `edu.${string}` | 'learned' | 'skills' | 'websites' | 'answer';

export interface FillReport {
  platform: string;
  filled: { label: string; key: FilledKey }[];
  skipped: { label: string; key?: FilledKey; reason: string }[];
  unmatched: string[];
  /** normalised questions answered from saved answers, so the caller can count the replay */
  learnedKeys?: string[];
}
