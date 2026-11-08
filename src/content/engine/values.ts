import type { ProfileData } from '../../shared/profile';
import type { MatchKey } from './types';

/** The text to enter for a field, or '' when the profile has nothing for it. */
export function valueFor(key: MatchKey, p: ProfileData): string {
  const pi = p.personalInfo;
  const pref = p.preferences;
  const job = p.workExperience[0];
  const edu = p.education[0];
  switch (key) {
    case 'firstName': return pi.firstName;
    case 'middleName': return pi.middleName;
    case 'lastName': return pi.lastName;
    case 'preferredName': return pi.preferredName || pi.firstName;
    case 'fullName': return [pi.firstName, pi.lastName].filter(Boolean).join(' ');
    case 'email': return pi.email;
    case 'phone': return pi.phoneNumber;
    case 'phoneCountryCode': return pi.phoneCountryCode;
    case 'address': return pi.currentAddress;
    case 'city': return pi.city;
    case 'state': return pi.state;
    case 'zip': return pi.zipCode;
    case 'country': return pi.country;
    case 'linkedin': return p.links.linkedinUrl;
    case 'github': return p.links.githubUrl;
    case 'twitter': return p.links.twitterUrl;
    case 'portfolio': return p.links.portfolioUrl || p.links.websiteUrl;
    case 'website': return p.links.websiteUrl || p.links.portfolioUrl;
    case 'currentCompany': return pref.currentCompany || job?.companyName || '';
    case 'currentTitle': return pref.currentTitle || job?.jobTitle || '';
    case 'yearsExperience': return pref.yearsOfExperience;
    case 'workAuthorization': return pref.workAuthorization;
    case 'sponsorship': return pref.requiresSponsorship;
    case 'relocate': return pref.willingToRelocate;
    case 'salary': return pref.desiredSalary;
    case 'noticePeriod': return pref.noticePeriod;
    case 'startDate': return pref.availableStartDate;
    case 'gender': return p.demographics.genderIdentity;
    case 'race': return p.demographics.race;
    case 'orientation': return p.demographics.sexualOrientation;
    case 'veteran': return p.demographics.veteranStatus;
    case 'disability': return p.demographics.disabilityStatus;
    case 'pronouns': return pi.pronouns;
    case 'school': return edu?.schoolName ?? '';
    case 'degree': return edu?.degree ?? '';
    case 'fieldOfStudy': return edu?.fieldOfStudy ?? '';
    case 'gpa': return edu?.gpa ?? '';
    case 'graduationDate': return edu?.graduationDate ?? '';
    case 'resume': return p.resume?.fileName ?? '';
  }
}

/** Is a yes/no style answer a "no"? Used for authorization questions phrased as statuses. */
export function isYesNoKey(key: MatchKey): boolean {
  return key === 'sponsorship' || key === 'relocate' || key === 'workAuthorization';
}

/**
 * For yes/no fields, turn the stored value into "Yes" or "No". Work authorization
 * is stored as free text ("US Citizen", "Need sponsorship"), so it counts as
 * "Yes" unless it starts with a negative.
 */
export function toYesNo(key: MatchKey, value: string): string {
  const v = value.trim();
  if (/^(yes|no)$/i.test(v)) return v[0].toUpperCase() + v.slice(1).toLowerCase();
  if (key === 'workAuthorization') return /^(no\b|not\b|need|require|unauthori[sz]ed)/i.test(v) ? 'No' : 'Yes';
  return v;
}

/** Dates for <input type=date|month>; leaves free-text fields untouched. */
export function formatDate(inputType: string, value: string): string {
  const m = value.trim().match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return value;
  const [, y, mo = '01', d = '01'] = m;
  const pad = (s: string) => s.padStart(2, '0');
  if (inputType === 'date') return `${y}-${pad(mo)}-${pad(d)}`;
  if (inputType === 'month') return `${y}-${pad(mo)}`;
  return value;
}
