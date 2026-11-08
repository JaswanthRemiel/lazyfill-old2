import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { send } from '../../shared/messages';
import type { LearnedEntry, LearnedStore } from '../../shared/learned';
import { getItem } from '../../shared/storage';
import type { Profile } from '../../shared/types';
import { btnGhost, btnPrimary, card, inputCls, Notice } from '../ui';

const show = (v: LearnedEntry['value']) => (Array.isArray(v) ? v.join(', ') : v);
const when = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never');

function Row({ profileId, scope, k, e, onChange }: { profileId: string; scope: string; k: string; e: LearnedEntry; onChange: () => void }) {
  const [text, setText] = useState(show(e.selectedOptionText ?? e.value));
  useEffect(() => setText(show(e.selectedOptionText ?? e.value)), [e]);
  const long = e.fieldType === 'textarea' || text.length > 80;
  const save = async () => { if (text.trim() && text !== show(e.selectedOptionText ?? e.value)) { await send({ action: 'updateLearned', profileId, scope, key: k, value: text.trim() }); onChange(); } };
  return (
    <tr className="border-t border-border align-top">
      <td className="w-2/5 px-4 py-3">
        <p className="text-sm font-semibold">{e.originalLabel}</p>
        <p className="text-[11px] font-medium text-muted-foreground">{e.fieldType} · {scope}</p>
      </td>
      <td className="px-4 py-3">
        {long
          ? <textarea className={`${inputCls} h-auto min-h-20 py-2`} value={text} onChange={(x) => setText(x.target.value)} onBlur={save} aria-label={`Answer for ${e.originalLabel}`} />
          : <input className={inputCls} value={text} onChange={(x) => setText(x.target.value)} onBlur={save} aria-label={`Answer for ${e.originalLabel}`} />}
      </td>
      <td className="hidden px-4 py-3 text-xs font-medium whitespace-nowrap text-muted-foreground md:table-cell">Used {e.timesUsed}× · {when(e.lastUsed)}</td>
      <td className="px-4 py-3 text-right">
        <button className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-destructive" onClick={async () => { await send({ action: 'deleteLearned', profileId, scope, key: k }); onChange(); }}>Delete</button>
      </td>
    </tr>
  );
}

export function AnswersPage({ signedIn }: { signedIn: boolean }) {
  const [store, setStore] = useState<LearnedStore>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setStore(((await send<LearnedStore>({ action: 'listLearned' })).data) ?? {});
    setProfiles((await getItem('lf_profile_cache')) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!signedIn) {
    return (
      <div className={`${card} mx-auto max-w-lg text-center`}>
        <h1 className="text-lg font-semibold">Sign in to see your saved answers</h1>
        <Link to="/settings" className={`${btnPrimary} mt-4`}>Open Settings</Link>
      </div>
    );
  }

  const ids = Object.keys(store).filter((id) => Object.values(store[id]).some((m) => Object.keys(m).length));
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name ?? 'Deleted profile';

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saved answers</h1>
          <p className="max-w-2xl text-sm font-medium text-muted-foreground">
            When a form asks something your profile can’t answer, lazyfill remembers what you type and fills it in next time. Look for the small bolt icon in the field.
            Answers are kept per profile and per job platform. Long written answers are only reused on the same site.
          </p>
        </div>
        <input className={`${inputCls} max-w-xs`} type="search" placeholder="Search questions or answers" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search saved answers" />
      </div>
      {note && <Notice ok>{note}</Notice>}

      {ids.length === 0 ? (
        <div className={`${card} p-10 text-center`}>
          <p className="text-base font-semibold">Nothing saved yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Fill in an application question lazyfill didn’t know the answer to, and it will appear here.</p>
        </div>
      ) : ids.map((id) => {
        const rows = Object.entries(store[id]).flatMap(([scope, map]) => Object.entries(map).map(([k, e]) => ({ scope, k, e })))
          .filter(({ e }) => `${e.originalLabel} ${show(e.value)}`.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => b.e.lastUsed.localeCompare(a.e.lastUsed));
        return (
          <section key={id} className={`${card} overflow-hidden !p-0`}>
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-base font-semibold">{nameOf(id)} <span className="text-xs font-semibold text-muted-foreground">{rows.length} answer{rows.length === 1 ? '' : 's'}</span></h2>
              <button className={`${btnGhost} h-8 text-xs`} onClick={async () => { if (confirm(`Forget every saved answer for "${nameOf(id)}"?`)) { await send({ action: 'clearLearned', profileId: id }); setNote('Cleared.'); void load(); } }}>Clear all</button>
            </div>
            <table className="w-full text-left"><tbody>{rows.map((r) => <Row key={`${r.scope}${r.k}`} profileId={id} scope={r.scope} k={r.k} e={r.e} onChange={load} />)}</tbody></table>
            {rows.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">No matches.</p>}
          </section>
        );
      })}
    </div>
  );
}
