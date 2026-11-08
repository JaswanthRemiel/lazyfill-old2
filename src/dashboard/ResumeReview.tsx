import { AlertTriangle, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { reviewCount, type Review } from '../shared/resumeReview';
import { cn } from '../ui/cn';
import { btnGhost, btnPrimary, card } from './ui';

const Box = ({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) => (
  <input type="checkbox" aria-label={label} className="mt-0.5 size-4 shrink-0 accent-primary disabled:opacity-40" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
);

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{title}{count !== undefined && <span className="ml-1.5 font-normal text-muted-foreground">{count}</span>}</h3>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

const dates = (a: string, b: string, current: boolean) => [a, current ? 'Present' : b].filter(Boolean).join(' to ');

/** Everything the AI found, set against the profile, so nothing is added without a look. */
export function ResumeReview({ review, fileName, onChange, onApply, onCancel }: {
  review: Review; fileName: string; onChange: (r: Review) => void; onApply: () => void; onCancel: () => void;
}) {
  const n = reviewCount(review);
  const set = (patch: Partial<Review>) => onChange({ ...review, ...patch });
  const empty = !review.fields.length && !review.work.length && !review.education.length && !review.skills.length;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Review imported resume">
      <div className={cn(card, 'flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 !p-0')}>
        <header className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Review what we found</h2>
          <p className="text-xs text-muted-foreground">Read from {fileName} with {review.model}. Nothing is added until you press the button.</p>
          {review.usedFallback && <p className="mt-1 text-xs text-muted-foreground">Your key could not use the stronger import model, so a faster one read this resume. Check the details carefully.</p>}
        </header>

        <div className="scroll-thin grid gap-6 overflow-y-auto px-6">
          {review.notes.length > 0 && (
            <ul className="grid gap-1 rounded-xl bg-muted p-3 text-xs text-muted-foreground">{review.notes.map((t, i) => <li key={i}>{t}</li>)}</ul>
          )}
          {empty && <p className="py-8 text-center text-sm text-muted-foreground">Nothing new was found, or everything is already in your profile.</p>}

          {review.fields.length > 0 && (
            <Block title="Contact, links and details">
              {review.fields.map((f, i) => (
                <label key={`${f.section}.${f.key}`} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2">
                  <Box checked={f.take} label={`Add ${f.label}`} onChange={(v) => set({ fields: review.fields.map((x, j) => (j === i ? { ...x, take: v } : x)) })} />
                  <span className="grid min-w-0 flex-1 gap-0.5 text-sm sm:grid-cols-[9rem_1fr]">
                    <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
                    <span className="min-w-0 break-words">{f.found}{f.current && <span className="block text-xs text-muted-foreground">replaces “{f.current}”</span>}</span>
                  </span>
                </label>
              ))}
            </Block>
          )}

          {review.work.length > 0 && (
            <Block title="Work experience" count={review.work.length}>
              {review.work.map((w, i) => (
                <label key={i} className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5', w.flags.length ? 'border-foreground/40' : 'border-border', w.present && 'opacity-60')}>
                  <Box checked={w.take && !w.present} disabled={w.present} label={`Add ${w.item.jobTitle} at ${w.item.companyName}`} onChange={(v) => set({ work: review.work.map((x, j) => (j === i ? { ...x, take: v } : x)) })} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm font-semibold">{w.item.jobTitle || 'No title'} <span className="font-normal text-muted-foreground">at</span> {w.item.companyName || 'no company'}</span>
                    <span className="text-xs text-muted-foreground">{[dates(w.item.startDate, w.item.endDate, w.item.isCurrent), w.item.location].filter(Boolean).join(' · ')}</span>
                    {w.item.description && <span className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{w.item.description}</span>}
                    {w.present && <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3" /> Already in your profile</span>}
                    {w.flags.map((t) => <span key={t} className="mt-1 inline-flex items-center gap-1 text-xs font-medium"><AlertTriangle className="size-3" /> {t}</span>)}
                  </span>
                </label>
              ))}
            </Block>
          )}

          {review.education.length > 0 && (
            <Block title="Education" count={review.education.length}>
              {review.education.map((e, i) => (
                <label key={i} className={cn('flex items-start gap-3 rounded-xl border px-3 py-2.5', e.flags.length ? 'border-foreground/40' : 'border-border', e.present && 'opacity-60')}>
                  <Box checked={e.take && !e.present} disabled={e.present} label={`Add ${e.item.schoolName}`} onChange={(v) => set({ education: review.education.map((x, j) => (j === i ? { ...x, take: v } : x)) })} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm font-semibold">{e.item.schoolName || 'No school name'}</span>
                    <span className="text-xs text-muted-foreground">{[[e.item.degree, e.item.fieldOfStudy].filter(Boolean).join(', '), dates(e.item.startDate, e.item.graduationDate, e.item.currentlyEnrolled), e.item.gpa && `GPA ${e.item.gpa}`].filter(Boolean).join(' · ')}</span>
                    {e.present && <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3" /> Already in your profile</span>}
                    {e.flags.map((t) => <span key={t} className="mt-1 inline-flex items-center gap-1 text-xs font-medium"><AlertTriangle className="size-3" /> {t}</span>)}
                  </span>
                </label>
              ))}
            </Block>
          )}

          {review.skills.length > 0 && (
            <Block title="Skills" count={review.skills.length}>
              <div className="flex flex-wrap gap-1.5">
                {review.skills.map((s, i) => (
                  <button key={s.name} type="button" disabled={s.present} aria-pressed={s.take && !s.present}
                    onClick={() => set({ skills: review.skills.map((x, j) => (j === i ? { ...x, take: !x.take } : x)) })}
                    className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', s.present ? 'bg-muted text-muted-foreground opacity-60' : s.take ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-accent')}>
                    {s.name}
                  </button>
                ))}
              </div>
            </Block>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <span className="text-xs text-muted-foreground">{n} item{n === 1 ? '' : 's'} selected</span>
          <div className="flex gap-2">
            <button className={btnGhost} onClick={onCancel}>Cancel</button>
            <button className={btnPrimary} onClick={onApply} disabled={n === 0}>Add {n || ''} to profile</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
