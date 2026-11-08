import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FillReport } from '../content/engine/types';
import { autofillActiveTab } from './tabs';

export type AutofillStatus = 'idle' | 'running' | 'success' | 'failed';

interface Ctx {
  status: AutofillStatus;
  progress: number;
  lastFilled: number;
  error: string;
  report: FillReport | null;
  run: (overwrite?: boolean) => Promise<void>;
  /** back to the home screen */
  dismiss: () => void;
}

const AutofillCtx = createContext<Ctx | null>(null);
export const useAutofill = () => {
  const c = useContext(AutofillCtx);
  if (!c) throw new Error('useAutofill outside provider');
  return c;
};

const SKIP_KEY = 'lf_skip_result_screens';

export function AutofillProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AutofillStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [lastFilled, setLastFilled] = useState(0);
  const [error, setError] = useState('');
  const [report, setReport] = useState<FillReport | null>(null);
  const tick = useRef<number>();

  useEffect(() => () => window.clearInterval(tick.current), []);

  const dismiss = useCallback(() => setStatus('idle'), []);

  const run = useCallback(async (overwrite = false) => {
    setError('');
    setProgress(4);
    setStatus('running');
    // the page reports no incremental progress, so ease toward 90% while we wait
    tick.current = window.setInterval(() => setProgress((p) => p + (90 - p) * 0.12), 160);

    let filled = 0;
    let err = '';
    let merged: FillReport | null = null;
    try {
      const results = await autofillActiveTab(overwrite);
      const reports = results.flatMap((r) => (r.report ? [r.report] : []));
      err = results.find((r) => r.error)?.error ?? '';
      if (reports.length) {
        merged = {
          platform: (reports.find((r) => r.platform !== 'generic') ?? reports[0]).platform,
          filled: reports.flatMap((r) => r.filled),
          skipped: reports.flatMap((r) => r.skipped),
          unmatched: reports.flatMap((r) => r.unmatched),
        };
        filled = merged.filled.length;
      } else if (!err) err = 'No form fields found on this page.';
    } catch (e) {
      err = e instanceof Error ? e.message : 'Could not reach the page.';
    }

    window.clearInterval(tick.current);
    setProgress(100);
    setLastFilled(filled);
    setReport(merged);
    setError(err);
    const skip = !!(await chrome.storage.sync.get(SKIP_KEY))[SKIP_KEY];
    await new Promise((r) => setTimeout(r, 350)); // let the bar reach the top
    setStatus(skip ? 'idle' : filled > 0 ? 'success' : 'failed');
  }, []);

  return (
    <AutofillCtx.Provider value={{ status, progress, lastFilled, error, report, run, dismiss }}>
      {children}
    </AutofillCtx.Provider>
  );
}
