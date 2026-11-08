import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from '../panel/useProfiles';
import { cn } from '../ui/cn';
import { LegalFooter } from '../ui/Legal';
import { Wordmark } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { AnswersPage } from './pages/AnswersPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { ProfileEditorPage } from './pages/ProfileEditorPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { SettingsPage } from './pages/SettingsPage';

const tab = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors', isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground');

export function App() {
  const { isDark, setTheme } = useTheme();
  const { session, refresh } = useSession();
  useEffect(() => { document.title = 'lazyfill'; }, []);

  return (
    <div className="min-h-screen bg-subtle font-sans text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Wordmark />
          <nav className="flex gap-1" aria-label="Sections">
            <NavLink to="/applications" className={tab}>Applications</NavLink>
            <NavLink to="/profiles" className={tab}>Profiles</NavLink>
            <NavLink to="/answers" className={tab}>Saved answers</NavLink>
            <NavLink to="/settings" className={tab}>Settings</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {session ? <span>{session.email}</span> : <NavLink to="/settings" className="font-medium text-foreground underline-offset-2 hover:underline">Sign in</NavLink>}
            <button type="button" aria-label="Toggle dark mode" onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="flex size-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted">
              {isDark ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/applications" element={<ApplicationsPage signedIn={!!session} />} />
          <Route path="/profiles" element={<ProfilesPage signedIn={!!session} />} />
          <Route path="/profiles/:id" element={<ProfileEditorPage signedIn={!!session} />} />
          <Route path="/answers" element={<AnswersPage signedIn={!!session} />} />
          <Route path="/settings" element={<SettingsPage session={session ?? null} onSessionChange={refresh} />} />
          <Route path="*" element={<Navigate to="/applications" replace />} />
        </Routes>
        <LegalFooter className="mt-12" />
      </main>
    </div>
  );
}
