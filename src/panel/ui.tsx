import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../ui/cn';
import { Switch } from '../ui/kit';

/** Back button + title: the header of Settings, Report and Edit Profile. */
export function PageTitle({ title, onBack, label, disabled }: { title: string; onBack: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onBack} aria-label={label} disabled={disabled}
        className="-ml-1.5 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
        <ChevronLeft className="size-5" strokeWidth={1.75} />
      </button>
      <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
    </div>
  );
}

export const Toggle = Switch;

/** A grouped-list row, like iOS Settings. */
export function Row({ icon, label, children, onClick }: { icon: ReactNode; label: string; children?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background text-foreground shadow-[0_0_0_1px_var(--border)] [&>svg]:size-4">{icon}</span>
        <span className="truncate text-[13px] font-medium">{label}</span>
      </span>
      {children ?? (onClick && <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.75} />)}
    </>
  );
  const cls = 'flex h-12 w-full items-center justify-between gap-3 rounded-2xl bg-muted px-3 text-left';
  return onClick
    ? <button type="button" onClick={onClick} className={cn(cls, 'transition-colors hover:bg-accent')}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}
