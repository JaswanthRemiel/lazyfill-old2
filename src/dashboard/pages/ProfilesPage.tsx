import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProfiles } from '../../panel/useProfiles';
import { send } from '../../shared/messages';
import { buildExport, buildTemplate, parseProfileImport, type ImportResult } from '../../shared/profileJson';
import type { Profile } from '../../shared/types';
import { Avatar, fullName } from '../../ui/avatar';
import { download, fileSafe } from '../download';
import { btnGhost, btnPrimary, card, Notice } from '../ui';

function ImportPreview({ result, existing, onCancel, onConfirm, busy }: {
  result: ImportResult; existing: Profile[]; onCancel: () => void; onConfirm: (update: boolean) => void; busy: boolean;
}) {
  const [update, setUpdate] = useState(true);
  const clashes = result.profiles.filter((p) => existing.some((e) => e.name.toLowerCase() === p.name.toLowerCase())).length;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Import profiles" onClick={onCancel}>
      <div className={`${card} grid max-h-[85vh] w-full max-w-2xl gap-4 overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Import profiles</h2>
        {result.errors.map((e, i) => <Notice key={i} ok={false}>{e}</Notice>)}
        <ul className="grid gap-3">
          {result.profiles.map((p, i) => (
            <li key={i} className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold">{p.name}
                {existing.some((e) => e.name.toLowerCase() === p.name.toLowerCase()) && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">already exists</span>}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {[p.data.personalInfo.firstName, p.data.personalInfo.lastName].filter(Boolean).join(' ') || 'No name'} · {p.data.workExperience.length} job{p.data.workExperience.length === 1 ? '' : 's'} · {p.data.education.length} school{p.data.education.length === 1 ? '' : 's'} · {p.data.skills.length} skills
              </p>
              {p.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs font-medium text-muted-foreground">{p.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>
              )}
            </li>
          ))}
        </ul>
        {clashes > 0 && (
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={update} onChange={(e) => setUpdate(e.target.checked)} />
            <span>Update the {clashes} existing profile{clashes === 1 ? '' : 's'} with the same name (keeps their resume). Untick to create copies instead.</span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={btnPrimary} disabled={busy || !result.profiles.length} onClick={() => onConfirm(update)}>
            {busy ? 'Importing…' : `Import ${result.profiles.length} profile${result.profiles.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfilesPage({ signedIn }: { signedIn: boolean }) {
  const nav = useNavigate();
  const { profiles, active, loading, error, select, reload } = useProfiles(signedIn);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!signedIn) {
    return (
      <div className={`${card} mx-auto max-w-lg text-center`}>
        <h1 className="text-lg font-semibold">Sign in to manage profiles</h1>
        <p className="mt-2 text-sm text-muted-foreground">Profiles are saved to your account and cached on this device for offline autofill.</p>
        <Link to="/settings" className={`${btnPrimary} mt-4`}>Open Settings</Link>
      </div>
    );
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete the profile "${name}"? This cannot be undone.`)) return;
    const r = await send({ action: 'deleteProfile', id });
    if (!r.success) setErr(r.error ?? 'Delete failed');
    reload();
  }

  async function onFile(file: File) {
    setErr(''); setNote('');
    setPreview(parseProfileImport(await file.text()));
  }

  async function confirmImport(update: boolean) {
    if (!preview) return;
    setImporting(true);
    let created = 0, updated = 0;
    const now = new Date().toISOString();
    for (const p of preview.profiles) {
      const match = update ? profiles.find((e) => e.name.toLowerCase() === p.name.toLowerCase()) : undefined;
      const profile: Profile = match
        ? { ...match, name: p.name, data: { ...p.data, resume: match.data.resume }, updatedAt: now }
        : { id: crypto.randomUUID(), name: p.name, data: p.data, createdAt: now, updatedAt: now };
      const r = await send({ action: 'saveProfile', profile });
      if (!r.success) { setErr(`"${p.name}": ${r.error ?? 'could not be saved'}`); continue; }
      match ? updated++ : created++;
    }
    if (!active && created) {
      const first = (await send<Profile[]>({ action: 'listProfiles' })).data?.[0]?.id;
      if (first) await send({ action: 'setActiveProfile', id: first });
    }
    setImporting(false);
    setPreview(null);
    setNote(`Imported: ${created} created, ${updated} updated. They are saved to your account.`);
    reload();
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Profiles</h1>
          <p className="text-sm font-medium text-muted-foreground">Make one profile per kind of role. Pick the active one from the panel on any job page.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => download('lazyfill-profile-template.json', JSON.stringify(buildTemplate(), null, 2))}>Download template</button>
          <button className={btnGhost} onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className={btnGhost} disabled={!profiles.length} onClick={() => download('lazyfill-profiles.json', JSON.stringify(buildExport(profiles), null, 2))}>Export all</button>
          <button className={btnPrimary} onClick={() => nav('/profiles/new')}>+ New profile</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        </div>
      </div>

      <p className="rounded-xl bg-muted px-4 py-3 text-xs font-medium text-muted-foreground">
        <b className="text-foreground ">Fill by file:</b> download the template, fill in the values in any text editor, then press Import JSON. It lists the fields it understood and any it could not before saving anything.
      </p>

      {(err || error) && <Notice ok={false}>{err || error}</Notice>}
      {note && <Notice ok>{note}</Notice>}

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : profiles.length === 0 ? (
        <div className={`${card} p-10 text-center`}>
          <p className="text-base font-semibold">No profiles yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create one by hand, import a JSON file, or upload your resume and let your AI key fill it in.</p>
          <button className={`${btnPrimary} mt-4`} onClick={() => nav('/profiles/new')}>Create your first profile</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => {
            const isActive = p.id === active?.id;
            return (
              <div key={p.id} className={`${card} grid gap-4 ${isActive ? 'ring-2 ring-foreground' : ''}`}>
                <div className="flex items-center gap-3">
                  <Avatar profile={p} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{p.name}</p>
                    <p className="truncate text-xs font-semibold text-foreground">{fullName(p) || 'No name yet'}</p>
                  </div>
                  {isActive && <span className="rounded-full bg-success/12 px-2.5 py-1 text-[10px] font-semibold text-success">Active</span>}
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {p.data.workExperience.length} job{p.data.workExperience.length === 1 ? '' : 's'} · {p.data.education.length} school{p.data.education.length === 1 ? '' : 's'} · {p.data.skills.length} skills
                  {p.data.resume ? ` · ${p.data.resume.fileName}` : ' · no resume'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {!isActive && <button className={`${btnGhost} h-9 flex-1`} onClick={() => select(p.id)}>Use</button>}
                  <button className={`${btnGhost} h-9 flex-1`} onClick={() => nav(`/profiles/${p.id}`)}>Edit</button>
                  <button className={`${btnGhost} h-9`} aria-label={`Export ${p.name}`} onClick={() => download(`${fileSafe(p.name)}.json`, JSON.stringify(buildExport([p]), null, 2))}>Export</button>
                  <button className={`${btnGhost} h-9 text-destructive`} aria-label={`Delete ${p.name}`} onClick={() => remove(p.id, p.name)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {preview && <ImportPreview result={preview} existing={profiles} busy={importing} onCancel={() => setPreview(null)} onConfirm={confirmImport} />}
    </div>
  );
}
