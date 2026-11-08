import { ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '../shared/types';
import { Avatar, fullName } from '../ui/avatar';
import { Button } from '../ui/kit';
import { openDashboard } from './Header';
import { PageTitle } from './ui';

export function ProfilesPage({ profiles, active, loading, error, onSelect }: {
  profiles: Profile[]; active?: Profile; loading: boolean; error: string; onSelect: (id: string) => Promise<void>;
}) {
  const nav = useNavigate();
  const [busy, setBusy] = useState<string>();
  const others = profiles.filter((p) => p.id !== active?.id);

  const pick = async (id: string) => {
    setBusy(id);
    await onSelect(id);
    nav('/');
  };

  return (
    <section className="flex size-full flex-col gap-4 px-5 pt-[64px] pb-4">
      <PageTitle title="Profiles" label="Back to home" onBack={() => nav('/')} />
      <div className="scroll-thin -mr-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2">
        {loading && !profiles.length && <p className="m-auto text-[13px] text-muted-foreground">Loading profiles…</p>}
        {error && !profiles.length && <p className="m-auto text-center text-xs text-destructive">{error}</p>}
        {!loading && !profiles.length && !error && (
          <p className="m-auto text-center text-xs text-muted-foreground">No profiles yet. Create your first one in the dashboard.</p>
        )}

        {active && (
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-foreground/80 p-3">
            <Avatar profile={active} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{active.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{fullName(active) || 'Current profile'}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => openDashboard(`profiles/${active.id}`)}>
              Edit <ExternalLink className="size-3" strokeWidth={2} />
            </Button>
          </div>
        )}

        {others.length > 0 && (
          <div className="shrink-0 divide-y divide-border rounded-2xl bg-muted px-3">
            {others.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <Avatar profile={p} size={30} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.name}</span>
                <Button size="sm" variant="outline" onClick={() => pick(p.id)} disabled={!!busy} loading={busy === p.id}>Use</Button>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={() => openDashboard('profiles/new')}
          className="flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-input text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
          <Plus className="size-3.5" strokeWidth={2} /> New profile
        </button>
      </div>
    </section>
  );
}
