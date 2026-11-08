import { Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DetectInfo } from '../shared/frame';
import type { Profile } from '../shared/types';
import { Avatar, fullName } from '../ui/avatar';
import { cn } from '../ui/cn';
import { Badge, Button } from '../ui/kit';
import { useAutofill } from './AutofillContext';
import { detectOnActiveTab } from './tabs';

const hasProfileData = (p?: Profile) => {
  const d = p?.data;
  return !!d && !!(d.personalInfo.firstName || d.personalInfo.lastName || d.personalInfo.email || d.workExperience.length || d.education.length);
};

function usePlatform() {
  const [info, setInfo] = useState<DetectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const take = (i: DetectInfo | null) => {
      if (!live) return;
      setInfo((cur) => (i && (!cur || i.matched >= cur.matched || i.adapterId !== 'generic') ? i : cur ?? i));
      setLoading(false);
    };
    // 1) the page pushes what it found the moment we are ready (no round trip through the tabs API)
    const onMessage = (e: MessageEvent) => {
      if (e.source === window.parent && e.data?.action === 'detectInfo') take(e.data.info as DetectInfo);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ action: 'panelReady' }, '*');

    // 2) the tabs API also sees forms inside iframes, so keep asking: quickly at first, then calmly
    const probe = async () => take(await detectOnActiveTab());
    void probe();
    let n = 0;
    let slow: number | undefined;
    const fast = window.setInterval(() => {
      void probe();
      if (++n === 10) { window.clearInterval(fast); slow = window.setInterval(probe, 3000); }
    }, 500);
    return () => { live = false; window.removeEventListener('message', onMessage); window.clearInterval(fast); window.clearInterval(slow); };
  }, []);
  const detected = !!info && (info.adapterId !== 'generic' || info.matched >= 2 || !!info.embeddedAts);
  return { info, detected, loading };
}

function ProfileCard({ profiles, active, onSelect }: { profiles: Profile[]; active?: Profile; onSelect: (id: string) => void }) {
  const nav = useNavigate();
  if (!active) {
    return (
      <div className="flex h-[188px] flex-col items-center justify-center gap-3 rounded-3xl bg-muted">
        <span className="text-[13px] text-muted-foreground">No profile selected</span>
        <Button size="sm" onClick={() => nav('/profile')}>Create a profile</Button>
      </div>
    );
  }
  const many = profiles.length > 1;
  const idx = profiles.findIndex((p) => p.id === active.id);
  const at = (d: number) => profiles[(idx + d + profiles.length) % profiles.length];
  const name = fullName(active);

  const neighbour = (p: Profile, side: 'left' | 'right') => (
    <button key={side} type="button" aria-label={`Switch to ${p.name}`} onClick={() => onSelect(p.id)}
      className={cn('absolute top-[46px] opacity-50 transition-all duration-200 hover:scale-105 hover:opacity-90', side === 'left' ? 'left-[calc(50%-100px)]' : 'left-[calc(50%+68px)]')}>
      <Avatar profile={p} size={32} />
    </button>
  );

  return (
    <div className="relative h-[188px] rounded-3xl bg-muted">
      {many && <>{neighbour(at(-1), 'left')}{neighbour(at(1), 'right')}</>}
      <button type="button" aria-label="Edit profile" onClick={() => nav('/profile')}
        className="absolute top-7 left-1/2 -translate-x-1/2 rounded-full ring-4 ring-background transition-transform duration-300 hover:-translate-y-0.5">
        <Avatar profile={active} size={64} />
      </button>
      <div className="absolute inset-x-4 top-[104px] flex flex-col items-center gap-0.5 text-center">
        <span className="max-w-full truncate text-[17px] font-semibold tracking-tight">{active.name}</span>
        {name && <span className="max-w-full truncate text-xs text-muted-foreground">{name}</span>}
      </div>
    </div>
  );
}

function PlatformCard({ label, detected, loading }: { label: string; detected: boolean; loading: boolean }) {
  return (
    <div className={cn('flex h-12 items-center justify-between rounded-2xl border border-border px-4 transition-opacity', loading && 'opacity-0')}>
      <span className="flex items-center gap-2 text-[13px] font-medium">
        <span className={cn('size-2 rounded-full', detected ? 'bg-success' : 'bg-input')} />
        {detected ? label : 'No site detected'}
      </span>
      {detected
        ? <Badge tone="success">{label === 'Generic' ? 'Best effort' : 'Detected'}</Badge>
        : <span className="text-[11px] text-muted-foreground">Open a job application</span>}
    </div>
  );
}

export function Home({ profiles, active, onSelect }: { profiles: Profile[]; active?: Profile; onSelect: (id: string) => void }) {
  const { run, lastFilled, status } = useAutofill();
  const { info, detected, loading } = usePlatform();
  const ready = hasProfileData(active);
  const disabled = !detected || !ready || status === 'running';
  const badge = status === 'idle' && lastFilled > 0 ? `${lastFilled} field${lastFilled !== 1 ? 's' : ''} filled` : null;

  return (
    <div className="flex size-full flex-col gap-3 px-4 pt-[60px] pb-4">
      <ProfileCard profiles={profiles} active={active} onSelect={onSelect} />
      <PlatformCard label={info?.embeddedAts && !info.matched ? info.embeddedAts : info?.label ?? ''} detected={detected} loading={loading} />
      <div className="mt-auto grid gap-2.5">
        <p className={cn('h-4 text-center text-xs text-muted-foreground', badge && 'animate-fade-in text-success')}>
          {badge ?? (!ready && active ? 'Add your details to this profile first.' : '')}
        </p>
        <Button size="lg" className="h-12 w-full text-[15px] font-semibold" disabled={disabled} onClick={() => run(false)} title={!detected ? 'No platform detected' : undefined}>
          <Zap className="size-[18px]" strokeWidth={2.25} fill="currentColor" />
          Autofill
        </Button>
      </div>
    </div>
  );
}
