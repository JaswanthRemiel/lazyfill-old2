import type { FieldInfo, MatchKey } from './types';

export function normalise(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-[\].()/:*?,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const AUTOCOMPLETE: Record<string, MatchKey> = {
  'given-name': 'firstName',
  'additional-name': 'middleName',
  'family-name': 'lastName',
  name: 'fullName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'tel-country-code': 'phoneCountryCode',
  'street-address': 'address',
  'address-line1': 'address',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'zip',
  country: 'country',
  'country-name': 'country',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'website',
};

// Order matters: the first rule that matches wins, so specific rules come first.
const RULES: [MatchKey, RegExp, RegExp?][] = [
  ['preferredName', /\b(preferred|nick|chosen|goes by)( first)? ?name\b/],
  ['middleName', /\bmiddle (name|initial)\b/],
  ['firstName', /\b(first|given|forename|legal first)( ?name)?$|\b(first|given|legal first) name\b|^fname$|^first$/],
  ['lastName', /\b(last|family|legal last)( ?name)?$|\b(last|family|legal last) name\b|\bsurname\b|^lname$|^last$/],
  ['fullName', /^(your |legal |candidate |applicant )?(full )?name$|\bfull name\b|\blegal name\b/],
  ['email', /\be ?mail\b/, /\b(alternate|alternative|secondary|other)\b/],
  ['phoneCountryCode', /\b(phone|mobile|tel\w*)\b.*\bcountry\b|\bcountry (calling )?code\b|\bdial(ing)? code\b|\bphone code\b/],
  ['phone', /\b(phone|mobile|cell|telephone|tel)\b|\bcontact number\b/, /\b(type|device|ext|extension|alternate)\b/],
  ['linkedin', /linked ?in/],
  ['github', /git ?hub/],
  ['twitter', /twitter|\bx handle\b/],
  ['portfolio', /portfolio/],
  ['website', /\b(personal )?(website|web site|homepage|blog)\b|\bother (website|url|link)s?\b|^url$/],
  ['zip', /\b(zip|postal|post) ?code\b|^zip$|\bpostcode\b/],
  ['state', /^(your |current |home |mailing )?(state|province|region)( (province|region|county|territory))?( of residence)?$/],
  ['country', /\bcountry\b/, /\b(code|phone|citizen\w*|birth|work|authori[sz]\w*|eligible|region)\b/],
  ['city', /^(your |current |home )?(city|town)( of residence)?$|\bcity\b|^location( city)?$|\bcurrent location\b/, /\b(birth|company|state of)\b/],
  ['address', /\b(street|mailing|home|current|residential|permanent)? ?address( line)?( 1)?$|\bstreet\b/, /\b(e ?mail|ip|web|url)\b/],
  ['currentCompany', /\b(current|present|most recent|latest|previous) (company|employer|organi[sz]ation)\b|^(company|employer|organi[sz]ation|org)( name)?$/],
  ['currentTitle', /\b(current|present|most recent|latest) (job )?(title|position|role)\b|^job title$/],
  ['yearsExperience', /\byears? (of )?(\w+ )?experience\b|\bexperience \(?years\)?|\bhow many years\b/],
  ['sponsorship', /\b(require|need|will you).*\bsponsor\w*|\bsponsor\w*.*\b(now or in the future|require|need)\b/],
  ['workAuthorization', /\b(authori[sz]ed|eligible|permitted|legal(ly)? right|right) to work\b|\bwork (authori[sz]ation|permit|eligibility|status)\b|\bvisa status\b|\bimmigration status\b/],
  ['sponsorship', /\bsponsor\w*/],
  ['relocate', /\brelocat\w*/],
  ['salary', /\b(salary|compensation|pay)\b|\bctc\b/],
  ['noticePeriod', /\bnotice period\b|\bhow soon\b.*\bstart\b/],
  ['startDate', /\b(available|earliest|desired|preferred)? ?start date\b|\bwhen (can|could) you start\b|\bavailable (to|from) start\b|\bavailability date\b/],
  ['orientation', /\bsexual orientation\b/],
  ['gender', /\bgender\b|\bsex\b/],
  ['race', /\b(race|ethnicity|ethnic)\b|\bhispanic\b|\blatino\b/],
  ['veteran', /\bveteran\b|\bmilitary\b/],
  ['disability', /\bdisabilit\w*/],
  ['pronouns', /\bpronouns?\b/],
  ['fieldOfStudy', /\b(field of study|major|discipline|area of study)\b/],
  ['gpa', /\bgpa\b|\bgrade point\b/],
  ['degree', /\bdegree\b|\blevel of education\b|\bhighest (level of )?education\b/],
  ['school', /\b(school|university|college|institution)\b/],
  ['graduationDate', /\bgraduation\b|\bgrad(uat\w*)? (date|year)\b/],
];

const RESUME = /\b(resume|cv|curriculum vitae)\b/;
const COVER = /\bcover ?letter\b/;

/** Long free-text questions are never matched, except these yes/no style ones. */
const LONG_OK = new Set<MatchKey>(['sponsorship', 'workAuthorization', 'relocate', 'veteran', 'disability', 'race', 'gender', 'orientation']);
const LONG_LABEL = 90;

function firstRule(text: string): MatchKey | null {
  const t = normalise(text);
  if (!t) return null;
  for (const [key, re, not] of RULES) if (re.test(t) && !(not && not.test(t))) return key;
  return null;
}

export interface MatchResult {
  key: MatchKey;
  /** where the match came from */
  via: 'adapter' | 'autocomplete' | 'label' | 'aria' | 'name' | 'id' | 'placeholder';
}

export function matchField(f: FieldInfo, override?: MatchKey | null): MatchResult | null {
  if (override) return { key: override, via: 'adapter' };

  if (f.kind === 'file') {
    const text = `${f.label} ${f.aria} ${f.name} ${f.id}`.toLowerCase();
    if (COVER.test(text)) return null;
    return RESUME.test(text) ? { key: 'resume', via: 'label' } : null;
  }
  if (f.kind === 'textarea' || f.kind === 'checkbox') return null;

  const ac = AUTOCOMPLETE[f.autocomplete];
  if (ac) return { key: ac, via: 'autocomplete' };

  const long = f.label.length > LONG_LABEL;
  const signals: [MatchResult['via'], string][] = [
    ['label', f.label],
    ['aria', f.aria],
    ['name', f.name],
    ['id', f.id],
    ['placeholder', f.placeholder],
  ];
  for (const [via, text] of signals) {
    const key = firstRule(text);
    if (!key) continue;
    if ((long || text.length > LONG_LABEL) && !LONG_OK.has(key)) return null;
    return { key, via };
  }
  return null;
}
