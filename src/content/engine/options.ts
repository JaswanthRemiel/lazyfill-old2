import { normalise } from './match';
import type { MatchKey } from './types';

const US_STATES: Record<string, string> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado',
  ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho',
  il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana',
  me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota',
  ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada',
  nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina',
  nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas',
  ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia',
  wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia',
};

const COUNTRY_ALIASES: string[][] = [
  ['united states', 'united states of america', 'usa', 'us', 'u s', 'u s a'],
  ['united kingdom', 'uk', 'u k', 'great britain', 'gb', 'england'],
  ['india', 'in', 'ind'],
  ['canada', 'ca', 'can'],
  ['australia', 'au', 'aus'],
  ['germany', 'de', 'deutschland'],
  ['united arab emirates', 'uae', 'ae'],
];

const GENDER: string[][] = [
  ['male', 'man', 'm'],
  ['female', 'woman', 'f'],
  ['non binary', 'nonbinary', 'non binary genderqueer', 'other'],
  ['decline', 'prefer not', 'do not wish', 'not to say', 'not disclose', 'choose not'],
];

const DECLINE = /\b(decline|prefer not|do not wish|not to (say|answer|disclose)|choose not|rather not)\b/;
const PLACEHOLDER = /^(select|choose|please select|pick|--+|\.\.\.)\b|^$/;

export const isPlaceholderOption = (label: string, value = ''): boolean => {
  const l = normalise(label);
  return PLACEHOLDER.test(l) && (value === '' || /^select|^choose|^-/.test(l));
};

function aliases(desired: string, key: MatchKey | 'custom'): string[] {
  const d = normalise(desired);
  const out = [d];
  if (key === 'state') {
    if (US_STATES[d]) out.push(US_STATES[d]);
    const abbr = Object.entries(US_STATES).find(([, name]) => name === d)?.[0];
    if (abbr) out.push(abbr);
  }
  if (key === 'country' || key === 'workAuthorization') {
    for (const g of COUNTRY_ALIASES) if (g.includes(d)) out.push(...g);
  }
  if (key === 'gender' || key === 'pronouns') {
    for (const g of GENDER) if (g.some((x) => d === x || d.startsWith(`${x} `))) out.push(...g);
  }
  if (DECLINE.test(d)) out.push('decline', 'prefer not', 'do not wish', 'not to say', 'choose not');
  return out;
}

/**
 * Index of the candidate that best matches `desired`, or -1. Tries exact, then
 * word-prefix, then containment, so "Male" never picks "Female" and "No" never
 * picks "Not applicable".
 */
export function matchOption(candidates: string[], desired: string, key: MatchKey | 'custom'): number {
  const norm = candidates.map(normalise);
  const d = normalise(desired);
  if (!d) return -1;

  if (d === 'yes' || d === 'no') {
    const re = new RegExp(`^${d}\\b`);
    const i = norm.findIndex((c) => re.test(c));
    if (i >= 0) return i;
    // "I am a protected veteran" style: only trust an unambiguous single "negative" hit
    return -1;
  }

  const alts = aliases(desired, key);
  const eq = (c: string, a: string) => c === a;
  const wordStart = (c: string, a: string) => a.length > 1 && (c.startsWith(`${a} `) || a.startsWith(`${c} `) && c.length > 2);
  const has = (c: string, a: string) => a.length > 3 && new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(c);
  for (const test of [eq, wordStart, has]) {
    for (const a of alts) {
      const i = norm.findIndex((c, idx) => !isPlaceholderOption(candidates[idx]) && test(c, a));
      if (i >= 0) return i;
    }
  }
  return -1;
}
