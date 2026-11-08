import { toYearMonth } from './dates';
import { emptyAnswer } from './answers';
import { emptyEducation, emptyProfileData, emptyWork, normaliseProfileData, type ProfileData } from './profile';

export const PROFILE_JSON_VERSION = 1;

/** The fields in the order they appear in the editor, with hints on how to fill them. */
const HELP = {
  dates: 'Use YYYY-MM (for example 2021-03). Leave endDate empty and set isCurrent to true for a job you still hold.',
  yesNo: 'requiresSponsorship and willingToRelocate: "Yes" or "No".',
  lists: 'workExperience and education: most recent first. Add or delete entries freely. Blank entries are ignored.',
  skills: 'A list of short strings, or one comma-separated string.',
  answerBank: 'Optional. Each entry: {question, answer, mode}. mode is "static" (always type my answer), "llm" (AI writes it) or "llm_with_static_hint" (AI writes it, guided by my answer).',
  demographics: 'Optional. Only used when a form asks. Leave empty to skip.',
  resume: 'A resume file cannot be imported from JSON. Attach it in the profile editor afterwards.',
};

export interface ProfileFile {
  lazyfillProfileVersion: number;
  _help?: typeof HELP;
  name: string;
  data: Omit<ProfileData, 'resume'>;
}

function stripResume(d: ProfileData): Omit<ProfileData, 'resume'> {
  const { resume: _resume, ...rest } = d;
  return rest;
}

/** A complete, fill-me-in profile with every field present. */
export function buildTemplate(): ProfileFile {
  const data = emptyProfileData();
  data.workExperience = [emptyWork()];
  data.education = [emptyEducation()];
  data.answerBank = [emptyAnswer()];
  return { lazyfillProfileVersion: PROFILE_JSON_VERSION, _help: HELP, name: 'Front End Developer', data: stripResume(data) };
}

export function buildExport(profiles: { name: string; data: ProfileData }[]): ProfileFile | { lazyfillProfileVersion: number; profiles: ProfileFile[] } {
  const files = profiles.map((p) => ({ lazyfillProfileVersion: PROFILE_JSON_VERSION, name: p.name, data: stripResume(p.data) }));
  return files.length === 1 ? files[0] : { lazyfillProfileVersion: PROFILE_JSON_VERSION, profiles: files };
}

// ---- reading it back ----

export interface ImportedProfile { name: string; data: ProfileData; warnings: string[] }
export interface ImportResult { profiles: ImportedProfile[]; errors: string[] }

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isBlank = (o: Json) => Object.values(o).every((v) => v === '' || v === false || v === null || v === undefined);

const YES = new Set(['yes', 'y', 'true', '1']);
const NO = new Set(['no', 'n', 'false', '0']);
function yesNo(v: unknown): unknown {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v !== 'string') return v;
  const t = v.trim().toLowerCase();
  return YES.has(t) ? 'Yes' : NO.has(t) ? 'No' : v;
}
const toBool = (v: unknown): unknown => (typeof v === 'string' ? YES.has(v.trim().toLowerCase()) : v);

/** Keys in `raw` that the profile does not have, as dotted paths (arrays checked against one blank entry). */
function unknownKeys(raw: unknown, tpl: unknown, path: string, out: string[]) {
  if (!isObj(raw) || !isObj(tpl)) return;
  for (const k of Object.keys(raw)) {
    if (k.startsWith('_')) continue;
    if (!(k in tpl)) out.push(path ? `${path}.${k}` : k);
    else if (Array.isArray(tpl[k]) && Array.isArray(raw[k])) {
      const sample = path === '' && k === 'workExperience' ? emptyWork() : path === '' && k === 'education' ? emptyEducation() : path === '' && k === 'answerBank' ? emptyAnswer() : null;
      (raw[k] as unknown[]).forEach((item, i) => unknownKeys(item, sample, `${k}[${i}]`, out));
    } else unknownKeys(raw[k], tpl[k], path ? `${path}.${k}` : k, out);
  }
}

function cleanOne(rawIn: unknown, fallbackName: string): ImportedProfile | string {
  if (!isObj(rawIn)) return 'Not a profile object.';
  const warnings: string[] = [];
  // accept {name, data:{...}} as well as the data object on its own
  const dataRaw = isObj(rawIn.data) ? rawIn.data : rawIn;
  const copy = JSON.parse(JSON.stringify(dataRaw)) as Json;

  const unknown: string[] = [];
  unknownKeys(copy, emptyProfileData(), '', unknown);
  const topLevelNoise = new Set(['name', 'lazyfillProfileVersion', 'profiles', 'id', 'createdAt', 'updatedAt', 'avatarId']);
  const ignored = unknown.filter((k) => !(dataRaw === rawIn && topLevelNoise.has(k)));
  if (ignored.length) warnings.push(`Ignored unknown fields: ${ignored.slice(0, 8).join(', ')}${ignored.length > 8 ? ` (+${ignored.length - 8} more)` : ''}`);
  if (copy.resume) warnings.push(copy.resume && isObj(copy.resume) && (copy.resume as Json).fileName ? 'The resume file was not imported. Attach it in the editor.' : '');
  delete copy.resume;

  // friendly input -> what the engine expects
  if (typeof copy.skills === 'string') copy.skills = copy.skills.split(',').map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(copy.skills)) copy.skills = copy.skills.map((s) => (typeof s === 'string' ? s.trim() : s)).filter(Boolean);
  if (isObj(copy.preferences)) {
    for (const k of ['requiresSponsorship', 'willingToRelocate']) if (k in copy.preferences) copy.preferences[k] = yesNo(copy.preferences[k]);
  }
  if (copy.answerBank !== undefined) {
    if (!Array.isArray(copy.answerBank)) { warnings.push('answerBank must be a list.'); delete copy.answerBank; }
    else copy.answerBank = copy.answerBank.filter((a): a is Json => isObj(a) && !isBlank({ ...a, mode: '' }));
  }
  const fixDate = (item: Json, key: string, where: string) => {
    const raw = item[key];
    if (typeof raw !== 'string' || !raw.trim()) return;
    if (/^(present|current|now)$/i.test(raw.trim())) { item[key] = ''; return; }
    const ym = toYearMonth(raw);
    if (ym) item[key] = ym;
    else warnings.push(`${where}.${key}: "${raw}" is not a date I understand. Use YYYY-MM.`);
  };
  for (const key of ['workExperience', 'education'] as const) {
    const list = copy[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { warnings.push(`${key} must be a list.`); delete copy[key]; continue; }
    const kept = list.filter((e): e is Json => isObj(e) && !isBlank(e));
    kept.forEach((e, i) => {
      const where = `${key}[${i}]`;
      if (key === 'workExperience') {
        const rawEnd = String(e.endDate ?? '').trim(); // read before fixDate blanks "Present"
        e.isCurrent = toBool(e.isCurrent);
        fixDate(e, 'startDate', where); fixDate(e, 'endDate', where);
        if (/^(present|current|now)$/i.test(rawEnd)) e.isCurrent = true;
      } else {
        e.currentlyEnrolled = toBool(e.currentlyEnrolled);
        fixDate(e, 'startDate', where); fixDate(e, 'graduationDate', where);
      }
    });
    copy[key] = kept;
  }

  const data = normaliseProfileData(copy);
  const name = (typeof rawIn.name === 'string' && rawIn.name.trim()) || fallbackName;
  const empty = JSON.stringify({ ...data, resume: null }) === JSON.stringify(emptyProfileData());
  if (empty) return `"${name}": nothing to import. Is this the template with no values filled in?`;
  return { name, data, warnings: warnings.filter(Boolean) };
}

/** Understands: one profile, a list of profiles, {profiles:[...]}, or a bare data object. */
export function parseProfileImport(text: string): ImportResult {
  let root: unknown;
  try { root = JSON.parse(text); } catch { return { profiles: [], errors: ['That file is not valid JSON.'] }; }

  const items: unknown[] = Array.isArray(root) ? root : isObj(root) && Array.isArray(root.profiles) ? root.profiles : [root];
  if (!items.length) return { profiles: [], errors: ['The file contains no profiles.'] };

  const result: ImportResult = { profiles: [], errors: [] };
  items.forEach((item, i) => {
    const r = cleanOne(item, items.length === 1 ? 'Imported profile' : `Imported profile ${i + 1}`);
    if (typeof r === 'string') result.errors.push(items.length === 1 ? r : `Profile ${i + 1}: ${r}`);
    else result.profiles.push(r);
  });
  return result;
}
