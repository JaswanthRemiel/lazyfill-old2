import { Check, X, Zap } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import type { Profile } from '../shared/types';
import { Avatar } from '../ui/avatar';
import { cn } from '../ui/cn';
import { useAutofill } from './AutofillContext';

export function ProfilePill({ profile }: { profile?: Profile }) {
  if (!profile) return null;
  return (
    <div className="inline-flex max-w-[calc(100vw-48px)] items-center gap-2 rounded-full bg-muted py-1 pr-3.5 pl-1">
      <Avatar profile={profile} size={22} />
      <span className="min-w-0 truncate text-xs font-medium">{profile.name}</span>
    </div>
  );
}

function Scrim({ children, onClick, profile }: { children: ReactNode; onClick: () => void; profile?: Profile }) {
  return (
    <section className="flex size-full cursor-pointer flex-col items-center justify-center gap-7 px-8" onClick={onClick} role="button" tabIndex={0}
      aria-label="Return to autofill home" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}>
      <ProfilePill profile={profile} />
      {children}
    </section>
  );
}

export function ProgressScreen({ profile }: { profile?: Profile }) {
  const { progress, dismiss } = useAutofill();
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <Scrim onClick={dismiss} profile={profile}>
      <div className="relative size-[112px]">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, progress) / 100)} />
        </svg>
        <Zap className="absolute inset-0 m-auto size-9" strokeWidth={1.75} fill="currentColor" />
      </div>
      <div className="text-center">
        <p className="text-xl font-semibold tracking-tight">Autofilling</p>
        <p className="mt-1 text-xs text-muted-foreground">{Math.round(Math.min(100, progress))}%</p>
      </div>
    </Scrim>
  );
}

function Result({ tone, icon, title, detail, onClick, profile, ms }: {
  tone: 'success' | 'danger'; icon: ReactNode; title: string; detail: string; onClick: () => void; profile?: Profile; ms: number;
}) {
  useEffect(() => { const t = setTimeout(onClick, ms); return () => clearTimeout(t); }, [onClick, ms]);
  return (
    <Scrim onClick={onClick} profile={profile}>
      <div className={cn('flex size-[88px] animate-pop-in items-center justify-center rounded-full', tone === 'success' ? 'bg-primary text-primary-foreground' : 'bg-destructive/10 text-destructive')}>
        {icon}
      </div>
      <div className="animate-fade-in text-center [animation-delay:120ms]">
        <p className="text-xl font-semibold tracking-tight">{title}</p>
        <p className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </Scrim>
  );
}

export function SuccessScreen({ profile }: { profile?: Profile }) {
  const { dismiss, lastFilled } = useAutofill();
  return (
    <Result tone="success" icon={<Check className="size-10" strokeWidth={2.25} />} title="Autofilled" profile={profile} onClick={dismiss} ms={3000}
      detail={`${lastFilled} field${lastFilled !== 1 ? 's' : ''}`} />
  );
}

export function FailedScreen({ profile }: { profile?: Profile }) {
  const { dismiss, error } = useAutofill();
  return (
    <Result tone="danger" icon={<X className="size-10" strokeWidth={2.25} />} title="Couldn’t autofill" profile={profile} onClick={dismiss} ms={3500}
      detail={error || 'Nothing on this page matched your profile.'} />
  );
}
