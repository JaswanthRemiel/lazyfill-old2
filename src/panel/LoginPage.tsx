import { MailCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Logo } from '../ui/kit';
import { ActionCluster } from './Header';
import { MIN_PASSWORD, usePasswordAuth } from './useSignIn';

export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const nav = useNavigate();
  const a = usePasswordAuth(() => { onSignedIn(); nav('/'); });
  const busy = a.step === 'busy';
  const signIn = a.mode === 'signIn';

  return (
    <main className="relative size-full overflow-hidden rounded-[22px] border border-border bg-background font-sans text-foreground">
      <ActionCluster signedIn={false} className="absolute top-3 right-2 z-20" />
      <section className="absolute top-[72px] left-1/2 flex w-[296px] -translate-x-1/2 flex-col items-center gap-6">
        {a.step === 'verify' ? (
          <div className="flex w-full animate-fade-in flex-col items-center gap-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted"><MailCheck className="size-7" strokeWidth={1.5} /></span>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight">Verify your email</h1>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">We sent a link to <b className="font-medium text-foreground">{a.email}</b>. Open it, then press the button.</p>
            </div>
            <Button size="lg" className="w-full" loading={busy} onClick={a.recheck}>I’ve verified</Button>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={a.resend}>Resend email</Button>
              <Button size="sm" variant="ghost" onClick={a.back}>Back</Button>
            </div>
            {a.note && <p role="status" className="text-xs text-muted-foreground">{a.note}</p>}
            {a.error && <p role="alert" className="text-xs text-destructive">{a.error}</p>}
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              <Logo className="size-12" />
              <div className="text-center">
                <h1 className="text-[22px] font-semibold tracking-tight">{signIn ? 'Sign in to lazyfill' : 'Create your account'}</h1>
                <p className="mt-1 text-xs text-muted-foreground">{signIn ? 'Your profiles and applications, saved to your account.' : 'We will email you a link to verify your address.'}</p>
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void a.submit(); }} className="grid w-full gap-2.5">
              <label htmlFor="login-email" className="sr-only">Email</label>
              <Input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" value={a.email} disabled={busy} className="h-11" onChange={(e) => a.setEmail(e.target.value)} />
              <label htmlFor="login-password" className="sr-only">Password</label>
              <Input id="login-password" type="password" autoComplete={signIn ? 'current-password' : 'new-password'} placeholder={signIn ? 'Password' : `Password (${MIN_PASSWORD}+ characters)`} value={a.password} disabled={busy} className="h-11"
                onChange={(e) => a.setPassword(e.target.value)} />
              {a.error && <p role="alert" className="px-1 text-xs text-destructive">{a.error}</p>}
              {a.note && <p role="status" className="px-1 text-xs text-muted-foreground">{a.note}</p>}
              <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">{signIn ? 'Sign in' : 'Create account'}</Button>
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                <button type="button" onClick={() => a.setMode(signIn ? 'signUp' : 'signIn')} className="font-medium text-foreground underline-offset-2 hover:underline">{signIn ? 'Create an account' : 'Have an account? Sign in'}</button>
                {signIn && <button type="button" onClick={a.forgot} className="underline-offset-2 hover:text-foreground hover:underline">Forgot password?</button>}
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
