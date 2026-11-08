import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { onApplicationsChanged, send } from '../../shared/messages';
import type { Application, ApplicationStatus } from '../../shared/types';
import { btnGhost, btnPrimary, card, Field, inputCls, Notice } from '../ui';

const STATUSES: { id: ApplicationStatus; label: string; tone: string }[] = [
  { id: 'filled', label: 'Filled', tone: 'bg-muted text-muted-foreground' },
  { id: 'submitted', label: 'Submitted', tone: 'bg-muted text-foreground' },
  { id: 'interviewing', label: 'Interviewing', tone: 'bg-foreground/10 text-foreground' },
  { id: 'offer', label: 'Offer', tone: 'bg-success/12 text-success' },
  { id: 'rejected', label: 'Rejected', tone: 'bg-destructive/10 text-destructive' },
  { id: 'ghosted', label: 'Ghosted', tone: 'bg-muted text-muted-foreground' },
  { id: 'withdrawn', label: 'Withdrawn', tone: 'bg-muted text-muted-foreground' },
];
const tone = (s: ApplicationStatus) => STATUSES.find((x) => x.id === s)?.tone ?? '';
const when = (a: Application) => a.submittedAt ?? a.filledAt ?? a.createdAt;
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not set');
const download = (name: string, text: string, type: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function useApplications(signedIn: boolean) {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!signedIn) { setLoading(false); return; }
    const r = await send<Application[]>({ action: 'listApplications' });
    if (r.success) setApps(r.data ?? []); else setError(r.error ?? 'Could not load applications');
    setLoading(false);
  }, [signedIn]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onApplicationsChanged(setApps), []);

  const save = useCallback(async (a: Application) => {
    const prev = apps;
    setApps((cur) => [...cur.filter((x) => x.id !== a.id), a].sort((x, y) => when(y).localeCompare(when(x))));
    const r = await send({ action: 'saveApplication', application: a });
    if (!r.success) { setApps(prev); setError(r.error ?? 'Save failed'); }
  }, [apps]);

  const remove = useCallback(async (id: string) => {
    const prev = apps;
    setApps((cur) => cur.filter((x) => x.id !== id));
    const r = await send({ action: 'deleteApplication', id });
    if (!r.success) { setApps(prev); setError(r.error ?? 'Delete failed'); }
  }, [apps]);

  return { apps, loading, error, setError, save, remove, reload: load };
}

function StatusSelect({ value, onChange }: { value: ApplicationStatus; onChange: (s: ApplicationStatus) => void }) {
  return (
    <select aria-label="Status" value={value} onChange={(e) => onChange(e.target.value as ApplicationStatus)}
      className={`h-8 cursor-pointer rounded-full border-0 px-3 text-xs font-semibold outline-none ${tone(value)}`}>
      {STATUSES.map((s) => <option key={s.id} value={s.id} className="bg-card text-foreground">{s.label}</option>)}
    </select>
  );
}

function AddDialog({ onSave, onClose }: { onSave: (a: Application) => void; onClose: () => void }) {
  const [f, setF] = useState({ company: '', jobTitle: '', jobUrl: '', status: 'submitted' as ApplicationStatus, date: new Date().toISOString().slice(0, 10), notes: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const at = new Date(`${f.date}T12:00:00`).toISOString();
    onSave({
      id: `app_manual_${crypto.randomUUID().slice(0, 12)}`, company: f.company.trim(), jobTitle: f.jobTitle.trim(),
      jobUrl: f.jobUrl.trim(), platform: 'manual', status: f.status, notes: f.notes.trim() || undefined,
      submittedAt: f.status === 'filled' ? undefined : at, filledAt: f.status === 'filled' ? at : undefined, createdAt: now, updatedAt: now,
    });
  };
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add application" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className={`${card} grid w-full max-w-lg gap-4`}>
        <h2 className="text-lg font-semibold">Add an application</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company"><input required className={inputCls} value={f.company} onChange={set('company')} /></Field>
          <Field label="Role"><input required className={inputCls} value={f.jobTitle} onChange={set('jobTitle')} /></Field>
        </div>
        <Field label="Job link"><input type="url" className={inputCls} value={f.jobUrl} onChange={set('jobUrl')} placeholder="https://" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select className={inputCls} value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </Field>
          <Field label="Date"><input type="date" className={inputCls} value={f.date} onChange={set('date')} /></Field>
        </div>
        <Field label="Notes"><textarea rows={3} className={`${inputCls} h-auto py-2`} value={f.notes} onChange={set('notes')} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button className={btnPrimary}>Add</button>
        </div>
      </form>
    </div>
  );
}

function Row({ a, onSave, onDelete }: { a: Application; onSave: (a: Application) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(a.notes ?? '');
  useEffect(() => setNotes(a.notes ?? ''), [a.notes]);
  return (
    <>
      <tr className="border-t border-border align-middle hover:bg-muted/60">
        <td className="px-4 py-3">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="cursor-pointer text-left">
            <p className="text-sm font-semibold">{a.jobTitle}</p>
            <p className="text-xs font-medium text-muted-foreground">{a.company}{a.location ? ` · ${a.location}` : ''}</p>
          </button>
        </td>
        <td className="hidden px-4 py-3 text-xs font-semibold capitalize text-muted-foreground md:table-cell">{a.platform}</td>
        <td className="px-4 py-3"><StatusSelect value={a.status} onChange={(status) => onSave({ ...a, status })} /></td>
        <td className="hidden px-4 py-3 text-xs font-medium text-muted-foreground sm:table-cell">{fmt(when(a))}</td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-3 text-xs font-semibold">
            {a.jobUrl && <a href={a.jobUrl} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">Open</a>}
            <button type="button" className="cursor-pointer text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete "${a.jobTitle}" at ${a.company}?`)) onDelete(); }}>Delete</button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/40">
          <td colSpan={5} className="grid gap-4 px-4 py-4 md:grid-cols-2">
            <Field label="Notes">
              <textarea rows={4} className={`${inputCls} h-auto py-2`} value={notes} placeholder="Recruiter, salary, follow-up date…"
                onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (a.notes ?? '') && onSave({ ...a, notes })} />
            </Field>
            <div className="grid content-start gap-2 text-xs font-medium text-muted-foreground">
              <p><b className="text-foreground ">Filled:</b> {fmt(a.filledAt)}</p>
              <p><b className="text-foreground ">Submitted:</b> {fmt(a.submittedAt)}</p>
              {a.jobDescription && (
                <details>
                  <summary className="cursor-pointer font-semibold text-foreground ">Saved job description</summary>
                  <p className="mt-2 max-h-48 overflow-y-auto leading-5 whitespace-pre-wrap">{a.jobDescription}</p>
                </details>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ApplicationsPage({ signedIn }: { signedIn: boolean }) {
  const { apps, loading, error, setError, save, remove } = useApplications(signedIn);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: apps.length };
    for (const a of apps) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [apps]);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = apps.filter((a) => a.submittedAt && Date.parse(a.submittedAt) > weekAgo).length;
  const shown = apps.filter((a) => (filter === 'all' || a.status === filter) &&
    `${a.company} ${a.jobTitle} ${a.platform} ${a.notes ?? ''}`.toLowerCase().includes(query.toLowerCase()));

  const exportCsv = () => {
    const head = ['Company', 'Role', 'Platform', 'Status', 'Filled', 'Submitted', 'Location', 'Link', 'Notes'];
    const rows = apps.map((a) => [a.company, a.jobTitle, a.platform, a.status, a.filledAt, a.submittedAt, a.location, a.jobUrl, a.notes].map(csvCell).join(','));
    download(`applications-${new Date().toISOString().slice(0, 10)}.csv`, [head.map(csvCell).join(','), ...rows].join('\n'), 'text/csv');
  };

  async function importJson(file: File) {
    try {
      const list = JSON.parse(await file.text());
      if (!Array.isArray(list)) throw new Error('Expected a JSON array of applications.');
      let n = 0;
      for (const raw of list) {
        if (!raw || typeof raw !== 'object' || !raw.company || !raw.jobTitle) continue;
        const now = new Date().toISOString();
        await save({ status: 'submitted', platform: 'import', jobUrl: '', createdAt: now, updatedAt: now, ...raw, id: raw.id ?? `app_import_${crypto.randomUUID().slice(0, 12)}` });
        n++;
      }
      setNote(`Imported ${n} application${n === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  }

  if (!signedIn) {
    return (
      <div className={`${card} mx-auto max-w-lg text-center`}>
        <h1 className="text-lg font-semibold">Sign in to see your applications</h1>
        <p className="mt-2 text-sm text-muted-foreground">Applications are saved to your account. Sign in with your email under Settings.</p>
        <Link to="/settings" className={`${btnPrimary} mt-4`}>Open Settings</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Applications</h1>
          <p className="text-sm font-medium text-muted-foreground">Every job you fill or submit with lazyfill shows up here automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={exportCsv} disabled={!apps.length}>Export CSV</button>
          <button className={btnGhost} onClick={() => download('applications.json', JSON.stringify(apps, null, 2), 'application/json')} disabled={!apps.length}>Export JSON</button>
          <button className={btnGhost} onClick={() => importRef.current?.click()}>Import JSON</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <button className={btnPrimary} onClick={() => setAdding(true)}>+ Add</button>
        </div>
      </div>

      {error && <Notice ok={false}>{error}</Notice>}
      {note && <Notice ok>{note}</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[['Total', apps.length], ['Submitted this week', thisWeek], ['Interviewing', counts.interviewing ?? 0], ['Offers', counts.offer ?? 0]].map(([l, v]) => (
          <div key={l} className={card}><p className="text-xs font-semibold text-muted-foreground">{l}</p><p className="mt-1 text-3xl font-semibold">{v}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[{ id: 'all', label: 'All' } as const, ...STATUSES].map((s) => (
          <button key={s.id} type="button" onClick={() => setFilter(s.id as ApplicationStatus | 'all')} aria-pressed={filter === s.id}
            className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${filter === s.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
            {s.label} <span className="opacity-70">{counts[s.id] ?? 0}</span>
          </button>
        ))}
        <input className={`${inputCls} ml-auto max-w-xs`} type="search" placeholder="Search company, role, notes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search applications" />
      </div>

      <div className={`${card} overflow-hidden !p-0`}>
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p> : shown.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-base font-semibold">{apps.length ? 'Nothing matches that filter' : 'No applications yet'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{apps.length ? 'Try a different status or search.' : 'Autofill a job application and it will appear here, or add one by hand.'}</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <tr><th className="px-4 py-3">Role</th><th className="hidden px-4 py-3 md:table-cell">Platform</th><th className="px-4 py-3">Status</th><th className="hidden px-4 py-3 sm:table-cell">Date</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody>{shown.map((a) => <Row key={a.id} a={a} onSave={save} onDelete={() => remove(a.id)} />)}</tbody>
          </table>
        )}
      </div>
      {adding && <AddDialog onClose={() => setAdding(false)} onSave={(a) => { save(a); setAdding(false); }} />}
    </div>
  );
}
