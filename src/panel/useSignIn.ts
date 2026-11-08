import { useCallback, useRef, useState } from 'react';
import { send } from '../shared/messages';

export const MIN_PASSWORD = 8;
export type AuthMode = 'signIn' | 'signUp';
export type AuthStep = 'form' | 'busy' | 'verify';

/**
 * Email and password sign-in. A new account (or one that never confirmed its address) goes through a
 * "verify your email" step, because nothing can be saved until the address is verified.
 */
export function usePasswordAuth(onSignedIn: () => void) {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [step, setStep] = useState<AuthStep>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const done = useRef(onSignedIn);
  done.current = onSignedIn;

  const clear = () => { setError(''); setNote(''); };

  const submit = useCallback(async () => {
    clear();
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'signUp' && password.length < MIN_PASSWORD) { setError(`Use a password of at least ${MIN_PASSWORD} characters.`); return; }
    setStep('busy');
    const r = await send<'ok' | 'unverified'>({ action: mode, email: email.trim(), password });
    if (!r.success) { setStep('form'); setError(r.error ?? 'Could not sign in. Try again.'); return; }
    if (r.data === 'ok') { await send({ action: 'listProfiles' }); setPassword(''); setStep('form'); done.current(); return; }
    setStep('verify');
  }, [email, password, mode]);

  /** The user says they opened the link: sign in again and see whether the address is confirmed now. */
  const recheck = useCallback(async () => {
    clear();
    setStep('busy');
    const r = await send<'ok' | 'unverified'>({ action: 'signIn', email: email.trim(), password });
    if (r.success && r.data === 'ok') { await send({ action: 'listProfiles' }); setPassword(''); setStep('form'); done.current(); return; }
    setStep('verify');
    if (!r.success) setError(r.error ?? 'Could not check. Try again.');
    else setNote('Not verified yet. Open the link in the email first.');
  }, [email, password]);

  const resend = useCallback(async () => {
    clear();
    const r = await send({ action: 'resendVerification', email: email.trim(), password });
    if (r.success) setNote('Sent again.'); else setError(r.error ?? 'Could not send the email.');
  }, [email, password]);

  const forgot = useCallback(async () => {
    clear();
    if (!email.trim()) { setError('Enter your email first, then press “Forgot password”.'); return; }
    const r = await send({ action: 'sendPasswordReset', email: email.trim() });
    if (r.success) setNote('If that address has an account, a password reset email is on its way.'); else setError(r.error ?? 'Could not send the email.');
  }, [email]);

  return {
    mode, setMode: (m: AuthMode) => { setMode(m); clear(); },
    step, email, setEmail: (v: string) => { setEmail(v); setError(''); },
    password, setPassword: (v: string) => { setPassword(v); setError(''); },
    error, note, submit, recheck, resend, forgot, back: () => { setStep('form'); clear(); },
  };
}
