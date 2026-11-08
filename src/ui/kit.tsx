import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/* A small shadcn-style kit: tokens + variants, no runtime dependencies beyond clsx/tailwind-merge. */

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-85',
  secondary: 'bg-secondary text-foreground hover:bg-accent',
  outline: 'border border-input bg-transparent text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9 gap-2 px-4 text-[13px]',
  lg: 'h-11 gap-2 px-5 text-sm',
  icon: 'size-8 p-0',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium whitespace-nowrap transition-[opacity,background-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
    variants[variant],
    sizes[size],
    className,
  );

export function Button({ variant, size, loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} className={buttonClass(variant, size, className)}>
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export const controlClass =
  'w-full rounded-xl border border-input bg-background px-3 text-[13px] text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/30 focus:border-foreground/60 focus:outline-none disabled:opacity-50';

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(controlClass, 'h-9', className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(controlClass, 'min-h-20 py-2 leading-relaxed', className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(controlClass, 'h-9 pr-8', className)} />;

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-1.5 text-xs font-medium text-foreground', className)}>
      {label}
      {children}
      {hint && <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLElement>) => (
  <section {...p} className={cn('rounded-2xl border border-border bg-card p-5', className)} />
);

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'success' | 'danger' | 'solid'; className?: string }) {
  const tones = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-success/12 text-success',
    danger: 'bg-destructive/10 text-destructive',
    solid: 'bg-primary text-primary-foreground',
  };
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange}
      className={cn('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-primary' : 'bg-input')}>
      <span className={cn('absolute top-0.5 left-0.5 size-[18px] rounded-full bg-background shadow-sm transition-transform duration-200', checked && 'translate-x-4')} />
    </button>
  );
}

export function Notice({ ok, children, className }: { ok: boolean; children: ReactNode; className?: string }) {
  return (
    <p role="status" className={cn('rounded-xl px-3 py-2 text-xs', ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive', className)}>
      {children}
    </p>
  );
}

/** Apple-style segmented control. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-muted p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('rounded-full px-3.5 py-1 text-xs font-medium transition-colors', value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The lazyfill mark: a black rounded square with a white bolt. */
export function Logo({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6.5" className="fill-primary" />
      <path d="M13.2 4.2 6.6 13h4.5l-.9 6.8 7.2-9.2h-4.6l.4-6.4Z" className="fill-primary-foreground" />
    </svg>
  );
}

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn('inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight', className)}>
    <Logo className="size-[22px]" />
    lazyfill
  </span>
);
