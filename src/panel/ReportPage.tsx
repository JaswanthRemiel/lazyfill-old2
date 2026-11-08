import { Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { send } from '../shared/messages';
import { cn } from '../ui/cn';
import { Button, Textarea } from '../ui/kit';
import { PageTitle } from './ui';

const MAX = 1000;
const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
type Status = 'idle' | 'submitting' | 'success' | 'error';

const b64 = async (f: File) => {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export function ReportPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const back = () => (loc.state?.fromHeader ? nav(-1) : nav('/settings', { replace: true }));
  const busy = status === 'submitting' || status === 'success';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setStatus('submitting');
    setMessage('');
    const r = await send({
      action: 'submitReport',
      description: text.trim(),
      screenshot: file ? { fileName: file.name, mimeType: file.type, base64: await b64(file) } : undefined,
    });
    if (r.success) {
      setStatus('success');
      setMessage('Report saved. Thank you.');
      timer.current = window.setTimeout(back, 1800);
    } else {
      setStatus('error');
      setMessage(r.error ?? 'Unable to save your report. Are you signed in?');
    }
  }

  return (
    <section className="flex size-full flex-col px-5 pt-[64px] pb-4">
      <PageTitle title="Report a problem" label="Close report" onBack={back} disabled={status === 'submitting'} />
      <form className="mt-4 flex min-h-0 flex-1 flex-col gap-3" onSubmit={submit}>
        <label htmlFor="report-issue" className="text-xs font-medium">What went wrong?</label>
        <Textarea id="report-issue" value={text} onChange={(e) => { setText(e.target.value); if (status === 'error') { setStatus('idle'); setMessage(''); } }}
          placeholder="Tell us what happened…" maxLength={MAX} required disabled={busy} className="h-[104px] resize-none" />
        <input ref={input} type="file" className="hidden" accept={TYPES.join(',')} disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && !TYPES.includes(f.type)) { setStatus('error'); setMessage('Use a JPG, PNG, GIF or WebP image.'); e.target.value = ''; return; }
            setFile(f);
          }} />
        <div className="relative">
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className={cn('flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-input px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50', file && 'pr-12')}>
            <Paperclip className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 truncate">{file?.name || 'Attach a screenshot'}</span>
          </button>
          {file && (
            <button type="button" aria-label={`Remove ${file.name}`} disabled={busy} onClick={() => { setFile(null); if (input.current) input.current.value = ''; }}
              className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <p role={status === 'error' ? 'alert' : 'status'} className={cn('min-h-4 text-xs', status === 'error' ? 'text-destructive' : 'text-success')}>{message}</p>
        <Button type="submit" size="lg" className="mt-auto w-full" loading={status === 'submitting'} disabled={busy || !text.trim()}>
          {status === 'success' ? 'Submitted' : 'Submit'}
        </Button>
      </form>
    </section>
  );
}
