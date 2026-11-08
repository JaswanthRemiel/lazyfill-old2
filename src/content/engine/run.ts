import type { ProfileData } from '../../shared/profile';
import { normalizeLabel, type LearnedMap } from '../../shared/learned';
import type { Adapter } from '../adapters';
import { learnCandidates } from './candidates';
import { detectFields, type DetectOptions } from './detect';
import { classifyEntryFields, ensureEntryCount, fillEntryField, type EntryKind } from './entries';
import { addAndFillEntry, fillSkills } from './repeaters';
import { fillSiteSpecific } from './sites';
import { fillWorkdayEducation, fillWorkdayExperience, fillWorkdaySkills, fillWorkdayWebsites, uploadWorkdayResume } from './workday';
import { fillCombobox, fillFile, fillRadio, fillSelect, fillText, hasValue } from './fill';
import { findBankEntry, isSensitiveQuestion } from '../../shared/answers';
import { allowedHere, replayAnswer, type LearnField } from './learn';
import { matchField } from './match';
import type { FieldInfo, FillReport, MatchKey } from './types';
import { formatDate, isYesNoKey, toYesNo, valueFor } from './values';

export interface ResumeFile { fileName: string; mimeType: string; base64: string }

export interface RunDeps {
  profile: ProfileData;
  adapter: Adapter;
  /** only called when the page has a resume upload */
  getResume: () => Promise<ResumeFile | null>;
  /** answers you have taught lazyfill before, for this profile on this platform */
  learned?: LearnedMap;
  pageUrl?: string;
  overwrite?: boolean;
  detect?: DetectOptions;
  /** time to wait between passes for conditional questions to appear */
  settleMs?: number;
  root?: ParentNode;
}

const labelOf = (f: FieldInfo) => f.label || f.aria || f.placeholder || f.name || f.id || '(unlabelled)';
const FILLED = 'data-lazyfill';
const SECTION_KINDS: EntryKind[] = ['work', 'edu'];

async function fillOne(f: FieldInfo, key: MatchKey, d: RunDeps, phoneWithCode: boolean): Promise<'ok' | 'no-option' | 'no-data'> {
  if (key === 'resume') {
    const file = await d.getResume();
    return file && fillFile(f.el as HTMLInputElement, file) ? 'ok' : 'no-data';
  }
  let value = valueFor(key, d.profile);
  // one phone box and no country-code box on the page: the number alone would lose its +44
  if (key === 'phone' && phoneWithCode && value && d.profile.personalInfo.phoneCountryCode && !(f.el instanceof HTMLInputElement && f.el.type === 'number')) {
    value = `${d.profile.personalInfo.phoneCountryCode} ${value}`;
  }
  if (!value.trim()) return 'no-data';
  if (isYesNoKey(key) && f.kind !== 'text') value = toYesNo(key, value);

  switch (f.kind) {
    case 'select':
      return fillSelect(f.el as HTMLSelectElement, value, key) ? 'ok' : 'no-option';
    case 'radio':
      return fillRadio(f.group ?? [f.el as HTMLInputElement], value, key) ? 'ok' : 'no-option';
    case 'combobox':
      return (await fillCombobox(f.el as HTMLInputElement, value, key)) ? 'ok' : 'no-option';
    case 'text': {
      const input = f.el as HTMLInputElement;
      if (input.type === 'number') value = value.match(/\d+(\.\d+)?/)?.[0] ?? '';
      else value = formatDate(input.type, value);
      return value && fillText(input, value) ? 'ok' : 'no-data';
    }
    default:
      return 'no-data';
  }
}

const learnedHasValue = (lf: LearnField) =>
  lf.boxes ? lf.boxes.some((b) => b.checked) : hasValue(lf.f.el, lf.f.group);

export async function autofill(d: RunDeps): Promise<FillReport> {
  const report: FillReport = { platform: d.adapter.id, filled: [], skipped: [], unmatched: [], learnedKeys: [] };
  const seen = new Set<Element>();
  const root = d.root ?? document;

  // 1) repeating sections, one entry at a time: add it, fill it, then move to the next
  const entryDone = new Set<Element>();
  const fillIndex = async (kind: EntryKind, index: number) => {
    // fill, then check the values stuck: freshly mounted entries are often re-rendered by the site and lose them
    for (let round = 0; round < 3; round++) {
      if (round > 0) await new Promise((r) => setTimeout(r, 350));
      let again = false;
      for (const ef of classifyEntryFields(detectFields(root, d.detect))) {
        if (ef.kind !== kind || ef.index !== index) continue;
        seen.add(ef.f.el);
        if (entryDone.has(ef.f.el) && hasValue(ef.f.el, ef.f.group)) continue;
        const label = labelOf(ef.f);
        if (!d.overwrite && hasValue(ef.f.el, ef.f.group) && ef.f.kind !== 'checkbox') {
          if (!report.skipped.some((s) => s.label === label && s.key === ef.key)) {
            report.skipped.push({ label, key: ef.key, reason: 'already filled' });
          }
          continue;
        }
        if ((await fillEntryField(ef, d.profile)) === 'ok') {
          entryDone.add(ef.f.el);
          ef.f.el.setAttribute(FILLED, 'filled');
          if (!report.filled.some((x) => x.label === label && x.key === ef.key)) report.filled.push({ label, key: ef.key });
          if (ef.f.kind !== 'checkbox') again = true; // verify next round
        }
      }
      if (!again) break;
    }
  };
  const entryCount = (kind: EntryKind) =>
    new Set(classifyEntryFields(detectFields(root, d.detect)).filter((e) => e.kind === kind).map((e) => e.index)).size;

  // sites with their own widgets (Meta, Google, TikTok/ByteDance) are handled by a dedicated filler
  const site = d.profile.workExperience.length || d.profile.education.length ? await fillSiteSpecific(d.profile) : null;
  if (site) {
    for (const el of site.touched) { seen.add(el); el.setAttribute(FILLED, 'filled'); }
    report.filled.push(...site.filled);
  }

  // Workday's My Experience page, in page order: resume, jobs, education, skills, websites
  const wdResume = await uploadWorkdayResume(d.getResume);
  if (wdResume) {
    seen.add(wdResume.input);
    if (wdResume.ok) report.filled.push({ label: 'Resume', key: 'resume' });
  }
  const wd = !site?.work && d.profile.workExperience.length ? await fillWorkdayExperience(d.profile) : null;
  if (wd) {
    for (const el of wd.touched) { seen.add(el); el.setAttribute(FILLED, 'filled'); }
    report.filled.push(...wd.filled);
  }
  const wdEdu = !site?.edu ? await fillWorkdayEducation(d.profile) : null;
  if (wdEdu) {
    for (const el of wdEdu.touched) { seen.add(el); el.setAttribute(FILLED, 'filled'); }
    report.filled.push(...wdEdu.filled);
  }
  const wdSkills = await fillWorkdaySkills(d.profile, d.detect);
  if (wdSkills) {
    seen.add(wdSkills.input);
    wdSkills.input.setAttribute(FILLED, 'filled');
    report.filled.push({ label: 'Skills', key: 'skills' });
  }
  const wdSites = await fillWorkdayWebsites(d.profile);
  if (wdSites) {
    for (const el of wdSites.touched) { seen.add(el); el.setAttribute(FILLED, 'filled'); }
    report.filled.push({ label: 'Websites', key: 'websites' });
  }

  for (const kind of SECTION_KINDS) {
    if ((wd || site?.work) && kind === 'work') continue;
    if ((site?.edu || wdEdu) && kind === 'edu') continue;
    const needed = kind === 'work' ? d.profile.workExperience.length : d.profile.education.length;
    for (let i = 0; i < needed; i++) {
      if (entryCount(kind) === 0) {
        // nothing on the page yet: this site opens a form per entry (Add, fill, Save)
        const ok = await addAndFillEntry(kind, i, d.profile, d.detect ?? {}, async (ef) => {
          const label = labelOf(ef.f);
          if ((await fillEntryField(ef, d.profile)) === 'ok') {
            entryDone.add(ef.f.el);
            if (!report.filled.some((x) => x.label === label && x.key === ef.key)) report.filled.push({ label, key: ef.key });
          }
        });
        if (!ok) break;
        continue;
      }
      if ((await ensureEntryCount(kind, i + 1, d.detect, root)) < i + 1) break;
      await fillIndex(kind, i);
    }
  }

  // skills go in one at a time too
  for (const el of wdSkills ? [] : await fillSkills(d.profile, d.detect ?? {})) {
    seen.add(el);
    el.setAttribute(FILLED, 'filled');
    report.filled.push({ label: 'Skills', key: 'skills' });
  }

  // the page asks for the phone number in one piece unless it also has a country-code field
  const phoneWithCode = !detectFields(root, d.detect).some((f) => matchField(f, d.adapter.keyFor?.(f))?.key === 'phoneCountryCode');

  // 2) everything else; a second pass picks up questions that only appear after earlier answers
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) await new Promise((r) => setTimeout(r, d.settleMs ?? 400));
    let progress = false;
    const unanswered: FieldInfo[] = [];

    for (const f of detectFields(root, d.detect)) {
      if (seen.has(f.el) || f.el.hasAttribute(FILLED)) continue;
      seen.add(f.el);
      const label = labelOf(f);

      const m = matchField(f, d.adapter.keyFor?.(f));
      if (!m) { unanswered.push(f); continue; }
      if (!d.overwrite && hasValue(f.el, f.group)) {
        report.skipped.push({ label, key: m.key, reason: 'already filled' });
        continue;
      }
      const res = await fillOne(f, m.key, d, phoneWithCode);
      if (res === 'ok') {
        f.el.setAttribute(FILLED, 'filled');
        report.filled.push({ label, key: m.key });
        progress = true;
      } else if (res === 'no-data') {
        unanswered.push(f); // your profile has nothing for this; maybe you taught us before
        report.skipped.push({ label, key: m.key, reason: 'nothing in profile' });
      } else {
        report.skipped.push({ label, key: m.key, reason: 'no matching option' });
      }
    }

    // 3) answers you taught lazyfill on earlier applications
    const answered = new Set<Element>();
    for (const lf of learnCandidates(unanswered, d.adapter, d.profile)) {
      const key = normalizeLabel(lf.label);
      const entry = d.learned?.[key];
      if (!entry || !allowedHere(lf, entry, d.pageUrl ?? location.href)) continue;
      if (!d.overwrite && learnedHasValue(lf)) continue;
      if (await replayAnswer(lf, entry)) {
        lf.f.el.setAttribute(FILLED, 'filled');
        answered.add(lf.f.el);
        report.filled.push({ label: lf.label, key: 'learned' });
        report.learnedKeys!.push(key);
        // the "nothing in profile" note no longer applies
        const i = report.skipped.findIndex((s) => s.label === labelOf(lf.f) && s.reason === 'nothing in profile');
        if (i >= 0) report.skipped.splice(i, 1);
        progress = true;
      }
    }
    // questions you saved an answer for with "always use my saved answer" (AI-written ones are made on request)
    for (const f of unanswered) {
      if (answered.has(f.el) || (f.kind !== 'textarea' && f.kind !== 'text')) continue;
      const q = labelOf(f);
      if (isSensitiveQuestion(q)) continue;
      const entry = findBankEntry(q, d.profile.answerBank);
      if (!entry || entry.mode !== 'static' || !entry.answer.trim()) continue;
      if (!d.overwrite && hasValue(f.el, f.group)) continue;
      if (fillText(f.el as HTMLInputElement | HTMLTextAreaElement, entry.answer.trim())) {
        f.el.setAttribute(FILLED, 'filled');
        answered.add(f.el);
        report.filled.push({ label: q, key: 'answer' });
        const i = report.skipped.findIndex((s) => s.label === q && s.reason === 'nothing in profile');
        if (i >= 0) report.skipped.splice(i, 1);
        progress = true;
      }
    }
    for (const f of unanswered) {
      if (answered.has(f.el) || f.kind === 'file' || f.kind === 'checkbox') continue;
      report.unmatched.push(labelOf(f));
    }

    if (pass === 0 && !progress) break;
  }
  return report;
}
