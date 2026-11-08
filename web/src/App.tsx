import type { User } from 'firebase/auth';
import { MailCheck, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApplicationsPage } from '../../src/dashboard/pages/ApplicationsPage';
import { btnGhost, btnPrimary, card, inputCls, Notice } from '../../src/dashboard/ui';
import { LegalFooter } from '../../src/ui/Legal';
import { Segmented, Wordmark } from '../../src/ui/kit';
import { MIN_PASSWORD, authMessage } from './errors';
import {
  refreshVerification, rememberEmail, rememberedEmail, resendVerification, sendReset, signInWithPassword, signOut, signUpWithPassword, watchUser,
} from './firebase';
import { useTheme } from './theme';

type Note = { ok: boolean; text: string } | null;

function PasswordForm() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    if (mode === 'signUp' && password.length < MIN_PASSWORD) return setNote({ ok: false, text: authMessage({ code: 'auth/weak-password' }) });
    setBusy(true);
    try {
      rememberEmail(email.trim());
      if (mode === 'signIn') await signInWithPassword(email.trim(), password);
      else await signUpWithPassword(email.trim(), password); // the app then shows the verify-your-email screen
    } catch (err) {
      setNote({ ok: false, text: authMessage(err) });
    }
    setBusy(false);
  }

  async function forgot() {
    if (!email.trim()) return setNote({ ok: false, text: 'Enter your email first, then press “Forgot password”.' });
    try {
      await sendReset(email.trim());
      setNote({ ok: true, text: 'If that address has an account, a password reset email is on its way.' });
    } catch (err) {
      setNote({ ok: false, text: authMessage(err) });
    }
  }

  return (
    <div className={`${card} mx-auto grid max-w-md gap-5`}>
      <div className="grid gap-3">
        <Segmented label="Account" value={mode} onChange={(m) => { setMode(m); setNote(null); }} options={[{ value: 'signIn', label: 'Sign in' }, { value: 'signUp', label: 'Create account' }]} />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{mode === 'signIn' ? 'Sign in to your tracker' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'signIn' ? 'Use the same email and password as the lazyfill extension.' : 'We will email you a link to verify your address.'}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-3">
        <input className={inputCls} type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <input className={inputCls} type="password" required autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} minLength={mode === 'signUp' ? MIN_PASSWORD : undefined}
          placeholder={mode === 'signUp' ? `Password (${MIN_PASSWORD}+ characters)` : 'Password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
        <button className={btnPrimary} disabled={busy}>{busy ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : 'Create account'}</button>
        {mode === 'signIn' && (
          <button type="button" onClick={forgot} className="justify-self-start text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Forgot password?</button>
        )}
      </form>
      {note && <Notice ok={note.ok}>{note.text}</Notice>}
    </div>
  );
}

/** Nothing can be saved until the address is verified, so new accounts wait here. */
function VerifyEmail({ user }: { user: User }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  return (
    <div className={`${card} mx-auto grid max-w-md justify-items-center gap-4 text-center`}>
      <span className="flex size-14 items-center justify-center rounded-full bg-muted"><MailCheck className="size-7" strokeWidth={1.5} /></span>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Verify your email</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">We sent a link to <b className="text-foreground">{user.email}</b>. Open it, then come back and press the button.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button className={btnPrimary} disabled={busy} onClick={async () => {
          setBusy(true);
          setNote(null);
          try {
            if (await refreshVerification(user)) window.location.reload();
            else setNote({ ok: false, text: 'Not verified yet. Open the link in the email first.' });
          } catch (e) { setNote({ ok: false, text: authMessage(e) }); }
          setBusy(false);
        }}>{busy ? 'Checking…' : 'I’ve verified'}</button>
        <button className={btnGhost} onClick={async () => { try { await resendVerification(user); setNote({ ok: true, text: 'Sent again.' }); } catch (e) { setNote({ ok: false, text: authMessage(e) }); } }}>Resend email</button>
        <button className={btnGhost} onClick={() => signOut()}>Use another account</button>
      </div>
      {note && <Notice ok={note.ok}>{note.text}</Notice>}
    </div>
  );
}

export function App() {
  const { isDark, setTheme } = useTheme();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => watchUser(setUser), []);

  return (
    <div className="min-h-screen bg-subtle font-sans text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
          <Wordmark />
          <span className="text-xs text-muted-foreground">tracker</span>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {user && <span>{user.email}</span>}
            {user && <button className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => signOut()}>Sign out</button>}
            <button type="button" aria-label="Toggle dark mode" onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted">
              {isDark ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {user === undefined ? <p className="text-center text-sm text-muted-foreground">Loading…</p>
          : !user ? <PasswordForm />
          : !user.emailVerified ? <VerifyEmail user={user} />
          : <ApplicationsPage signedIn />}
        <LegalFooter className="mt-12" />
      </main>
    </div>
  );
}
