import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ANSWER_MODES, emptyAnswer, type AnswerMode } from '../../shared/answers';
import { send } from '../../shared/messages';
import type { ResumeImport } from '../../shared/resumeImport';
import { applyReview, buildReview, reviewCount, type Review } from '../../shared/resumeReview';
import { ResumeReview } from '../ResumeReview';
import { emptyEducation, emptyProfileData, emptyWork, normaliseProfileData, type ProfileData } from '../../shared/profile';
import { getItem } from '../../shared/storage';
import type { Profile } from '../../shared/types';
import { btnGhost, btnPrimary, card, Field, inputCls, Notice } from '../ui';

type Sect = 'personalInfo' | 'links' | 'preferences' | 'demographics';
type Def = [key: string, label: string, options?: string[]];
const YES_NO = ['', 'Yes', 'No'];
const SECTIONS: { id: Sect; title: string; hint?: string; fields: Def[] }[] = [
  { id: 'personalInfo', title: 'Personal', fields: [
    ['firstName', 'First name'], ['middleName', 'Middle name'], ['lastName', 'Last name'], ['preferredName', 'Preferred name'],
    ['email', 'Email'], ['phoneCountryCode', 'Phone country code'], ['phoneNumber', 'Phone number'], ['pronouns', 'Pronouns'],
    ['currentAddress', 'Address'], ['city', 'City'], ['state', 'State / region'], ['zipCode', 'Postal code'], ['country', 'Country'] ] },
  { id: 'links', title: 'Links', fields: [
    ['linkedinUrl', 'LinkedIn'], ['githubUrl', 'GitHub'], ['portfolioUrl', 'Portfolio'], ['websiteUrl', 'Website'], ['twitterUrl', 'Twitter / X'] ] },
  { id: 'preferences', title: 'Job preferences', hint: 'Yes/No answers are matched to the options a form offers.', fields: [
    ['currentCompany', 'Current company'], ['currentTitle', 'Current title'], ['yearsOfExperience', 'Years of experience'],
    ['workAuthorization', 'Work authorization', ], ['requiresSponsorship', 'Requires sponsorship', YES_NO], ['willingToRelocate', 'Willing to relocate', YES_NO],
    ['desiredSalary', 'Desired salary'], ['noticePeriod', 'Notice period'], ['availableStartDate', 'Available start date'] ] },
  { id: 'demographics', title: 'Demographics (optional)', hint: 'Sensitive and entirely optional. If you fill these in, you agree to lazyfill storing them in your account so it can answer these questions when a form asks. They are never used for anything else. Leave blank to skip, and clear them any time.', fields: [
    ['genderIdentity', 'Gender'], ['race', 'Race / ethnicity'], ['sexualOrientation', 'Sexual orientation'],
    ['veteranStatus', 'Veteran status'], ['disabilityStatus', 'Disability status'] ] },
];

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const AI_TYPES = /^(application\/pdf|image\/(png|jpeg|webp))$/;

function Input({ label, value, onChange, options, type }: { label: string; value: string; onChange: (v: string) => void; options?: string[]; type?: string }) {
  return (
    <Field label={label}>
      {options ? (
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o || 'Not set'}</option>)}</select>
      ) : <input className={inputCls} type={type ?? 'text'} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function ProfileEditorPage({ signedIn }: { signedIn: boolean }) {
  const { id = 'new' } = useParams();
  const nav = useNavigate();
  const profileId = useMemo(() => (id === 'new' ? crypto.randomUUID() : id), [id]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [data, setData] = useState<ProfileData>(emptyProfileData());
  const [createdAt, setCreatedAt] = useState(new Date().toISOString());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [review, setReview] = useState<{ review: Review; fileName: string; base: ProfileData } | null>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (id !== 'new') {
        const p = ((await getItem('lf_profile_cache')) ?? []).find((x) => x.id === id);
        if (p) { setName(p.name); setData(normaliseProfileData(p.data)); setCreatedAt(p.createdAt); }
      }
      setLoaded(true);
    })();
  }, [id]);

  const edit = (fn: (d: ProfileData) => ProfileData) => { setData(fn); setDirty(true); };
  const setIn = (sect: Sect, key: string, v: string) => edit((d) => ({ ...d, [sect]: { ...d[sect], [key]: v } }));

  async function persist(nextName: string, nextData: ProfileData): Promise<boolean> {
    const now = new Date().toISOString();
    const profile: Profile = { id: profileId, name: nextName, data: nextData, createdAt: id === 'new' ? now : createdAt, updatedAt: now };
    const r = await send({ action: 'saveProfile', profile });
    if (!r.success) { setNotice({ ok: false, text: r.error ?? 'Could not save.' }); return false; }
    if (!(await getItem('lf_active_profile_id'))) await send({ action: 'setActiveProfile', id: profileId });
    setDirty(false);
    return true;
  }

  async function upload(file: File, withAi: boolean) {
    setNotice(null);
    if (withAi && !AI_TYPES.test(file.type)) {
      return setNotice({ ok: false, text: 'AI import needs a PDF or an image of your resume. Export your Word file as PDF first.' });
    }
    setBusy(withAi ? 'Reading the pages…' : 'Attaching…');
    try {
      const f = { fileName: file.name, mimeType: file.type || 'application/pdf', base64: toBase64(await file.arrayBuffer()) };
      let next: ProfileData = { ...data, resume: { fileName: f.fileName, mimeType: f.mimeType, size: file.size } };
      let found: ResumeImport | null = null;

      // 1) read the resume first: nothing about storing it may stop the import
      if (withAi) {
        const { readResume } = await import('../../resume/read'); // pdf.js is only loaded when someone imports
        const source = await readResume(file);
        setBusy('Asking the AI to read it…');
        const r = await send<ResumeImport>({ action: 'importResume', source });
        if (!r.success || !r.data) throw new Error(r.error ?? 'The AI import failed.');
        found = r.data;
      }
      setData(next);
      setDirty(true);

      // 2) keep the file for autofill; failing to sync it is a warning, not an error
      const s = await send<{ synced: boolean; reason?: string }>({ action: 'saveResume', profileId, file: f });
      const warn = s.success && s.data && !s.data.synced ? ` ${s.data.reason}` : '';

      if (found) {
        // 3) show what was found; nothing is added until the user says so
        setReview({ review: buildReview(next, found), fileName: file.name, base: next });
        if (warn) setNotice({ ok: false, text: warn.trim() });
      } else if (signedIn) {
        const label = name.trim() || 'My profile';
        if (!name.trim()) setName(label);
        if (await persist(label, next)) setNotice({ ok: true, text: `Resume attached. Saved to your profile.${warn}` });
      } else {
        setNotice({ ok: false, text: 'Resume attached. Sign in under Settings, then press Save to keep it.' });
      }
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' });
    }
    setBusy('');
  }

  async function applyImport() {
    if (!review) return;
    const next = applyReview(review.base, review.review);
    const added = reviewCount(review.review);
    setReview(null);
    setData(next);
    setDirty(true);
    const label = name.trim() || [next.personalInfo.firstName, next.personalInfo.lastName].filter(Boolean).join(' ') || 'My profile';
    if (!name.trim()) setName(label);
    if (signedIn && (await persist(label, next))) {
      setNotice({ ok: true, text: `Added ${added} item${added === 1 ? '' : 's'} from your resume and saved. Review the fields below.` });
      if (id === 'new') nav(`/profiles/${profileId}`, { replace: true });
    } else {
      setNotice({ ok: false, text: `Added ${added} item${added === 1 ? '' : 's'} from your resume. Sign in under Settings, then press Save to keep them.` });
    }
  }

  async function save() {
    if (!name.trim()) return setNotice({ ok: false, text: 'Give the profile a name first, such as "Front End Developer".' });
    setBusy('Saving…');
    setNotice(null);
    if (await persist(name.trim(), data)) {
      setNotice({ ok: true, text: 'Saved.' });
      if (id === 'new') nav(`/profiles/${profileId}`, { replace: true });
    }
    setBusy('');
  }

  if (!signedIn) {
    return <div className={`${card} mx-auto max-w-lg text-center`}><p className="font-semibold">Sign in to edit profiles.</p><Link to="/settings" className={`${btnPrimary} mt-4`}>Open Settings</Link></div>;
  }
  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/profiles" className="text-xs font-semibold text-foreground">Back to all profiles</Link>
          <h1 className="text-2xl font-semibold">{id === 'new' ? 'New profile' : 'Edit profile'}</h1>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs font-semibold text-muted-foreground">Unsaved changes</span>}
          <button className={btnPrimary} onClick={save} disabled={!!busy}>{busy || 'Save profile'}</button>
        </div>
      </div>

      {notice && <Notice ok={notice.ok}>{notice.text}</Notice>}

      <div className={`${card} grid gap-4`}>
        <Field label="Profile name" hint="Shown in the panel, e.g. “Front End Developer”."><input className={inputCls} value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></Field>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Resume</p>
            <p className="truncate text-xs font-medium text-muted-foreground">{data.resume ? data.resume.fileName : 'None attached'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} disabled={!!busy} onClick={() => attachRef.current?.click()}>Attach file</button>
            <button className={btnPrimary} disabled={!!busy} onClick={() => aiRef.current?.click()}>Import with AI</button>
          </div>
          <input ref={attachRef} type="file" accept=".pdf,.doc,.docx,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, false); e.target.value = ''; }} />
          <input ref={aiRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, true); e.target.value = ''; }} />
          <p className="w-full text-xs font-medium text-muted-foreground">
            “Import with AI” sends images of your resume pages, its text and its links to your Gemini/OpenAI account (key in <Link to="/settings" className="font-semibold text-foreground">Settings</Link>). You review what it found before anything is added, and nothing you typed is replaced unless you choose it.
          </p>
        </div>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.id} className={`${card} grid gap-4`}>
          <div><h2 className="text-base font-semibold">{s.title}</h2>{s.hint && <p className="text-xs font-medium text-muted-foreground">{s.hint}</p>}</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.fields.map(([key, label, options]) => (
              <Input key={key} label={label} options={options} value={(data[s.id] as Record<string, string>)[key]} onChange={(v) => setIn(s.id, key, v)} />
            ))}
          </div>
        </section>
      ))}

      <section className={`${card} grid gap-4`}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Work experience</h2>
          <button className={btnGhost} onClick={() => edit((d) => ({ ...d, workExperience: [...d.workExperience, emptyWork()] }))}>+ Add job</button></div>
        {data.workExperience.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet. The most recent one is used for “current company / title”.</p>}
        {data.workExperience.map((w, i) => {
          const set = (patch: Partial<typeof w>) => edit((d) => ({ ...d, workExperience: d.workExperience.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
          return (
            <div key={i} className="grid gap-4 rounded-xl border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input label="Title" value={w.jobTitle} onChange={(v) => set({ jobTitle: v })} />
                <Input label="Company" value={w.companyName} onChange={(v) => set({ companyName: v })} />
                <Input label="Location" value={w.location} onChange={(v) => set({ location: v })} />
                <Input label="Start (YYYY-MM)" value={w.startDate} onChange={(v) => set({ startDate: v })} />
                <Input label="End (YYYY-MM)" value={w.endDate} onChange={(v) => set({ endDate: v })} />
                <label className="flex items-end gap-2 pb-2 text-xs font-semibold"><input type="checkbox" className="size-4 accent-primary" checked={w.isCurrent} onChange={(e) => set({ isCurrent: e.target.checked })} />I work here now</label>
              </div>
              <Field label="Description"><textarea rows={3} className={`${inputCls} h-auto py-2`} value={w.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              <button className="w-fit cursor-pointer text-xs font-semibold text-destructive" onClick={() => edit((d) => ({ ...d, workExperience: d.workExperience.filter((_, j) => j !== i) }))}>Remove this job</button>
            </div>
          );
        })}
      </section>

      <section className={`${card} grid gap-4`}>
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Education</h2>
          <button className={btnGhost} onClick={() => edit((d) => ({ ...d, education: [...d.education, emptyEducation()] }))}>+ Add school</button></div>
        {data.education.map((ed, i) => {
          const set = (patch: Partial<typeof ed>) => edit((d) => ({ ...d, education: d.education.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
          return (
            <div key={i} className="grid gap-4 rounded-xl border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input label="School" value={ed.schoolName} onChange={(v) => set({ schoolName: v })} />
                <Input label="Degree" value={ed.degree} onChange={(v) => set({ degree: v })} />
                <Input label="Field of study" value={ed.fieldOfStudy} onChange={(v) => set({ fieldOfStudy: v })} />
                <Input label="GPA" value={ed.gpa} onChange={(v) => set({ gpa: v })} />
                <Input label="Start (YYYY-MM)" value={ed.startDate} onChange={(v) => set({ startDate: v })} />
                <Input label="Graduation (YYYY-MM)" value={ed.graduationDate} onChange={(v) => set({ graduationDate: v })} />
              </div>
              <button className="w-fit cursor-pointer text-xs font-semibold text-destructive" onClick={() => edit((d) => ({ ...d, education: d.education.filter((_, j) => j !== i) }))}>Remove this school</button>
            </div>
          );
        })}
      </section>

      <section className={`${card} grid gap-3`}>
        <h2 className="text-base font-semibold">Skills</h2>
        <textarea rows={3} className={`${inputCls} h-auto py-2`} aria-label="Skills, comma separated" value={data.skills.join(', ')}
          onChange={(e) => edit((d) => ({ ...d, skills: e.target.value.split(',').map((x) => x.trimStart()) }))}
          onBlur={() => edit((d) => ({ ...d, skills: d.skills.map((x) => x.trim()).filter(Boolean) }))} />
        <p className="text-xs font-medium text-muted-foreground">Separate with commas.</p>
      </section>

      <section className={`${card} grid gap-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Answer bank</h2>
            <p className="text-xs font-medium text-muted-foreground">Questions you get asked often. On an application, select a question, right-click and choose “Generate with lazyfill”. Needs an AI key unless the mode is “Always use my saved answer”.</p>
          </div>
          <button className={`${btnGhost} shrink-0`} onClick={() => edit((d) => ({ ...d, answerBank: [...d.answerBank, emptyAnswer()] }))}>+ Add question</button>
        </div>
        {data.answerBank.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet. You can still generate answers for any question without adding it here.</p>}
        {data.answerBank.map((a, i) => {
          const set = (patch: Partial<typeof a>) => edit((d) => ({ ...d, answerBank: d.answerBank.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
          const mode = ANSWER_MODES.find((m) => m.value === a.mode);
          return (
            <div key={i} className="grid gap-4 rounded-xl border border-border p-4">
              <Input label="Question" value={a.question} onChange={(v) => set({ question: v })} />
              <Field label="How should it be answered?" hint={mode?.hint}>
                <select className={inputCls} value={a.mode} onChange={(e) => set({ mode: e.target.value as AnswerMode })}>
                  {ANSWER_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              {a.mode !== 'llm' && (
                <Field label={a.mode === 'static' ? 'Your answer' : 'Your notes for the AI'}>
                  <textarea rows={3} className={`${inputCls} h-auto py-2`} value={a.answer} onChange={(e) => set({ answer: e.target.value })} />
                </Field>
              )}
              <button className="w-fit cursor-pointer text-xs font-semibold text-destructive" onClick={() => edit((d) => ({ ...d, answerBank: d.answerBank.filter((_, j) => j !== i) }))}>Remove this question</button>
            </div>
          );
        })}
      </section>
      {review && <ResumeReview review={review.review} fileName={review.fileName} onChange={(r) => setReview({ ...review, review: r })} onApply={applyImport} onCancel={() => { setReview(null); setNotice({ ok: true, text: 'Resume attached. Nothing was imported.' }); }} />}
    </div>
  );
}
