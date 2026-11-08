import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AutofillProvider, useAutofill } from './AutofillContext';
import { FailedScreen, ProgressScreen, SuccessScreen } from './AutofillScreens';
import { Home } from './Home';
import { LoginPage } from './LoginPage';
import { ProfilesPage } from './ProfilesPage';
import { ReportPage } from './ReportPage';
import { SettingsPage } from './SettingsPage';
import { Shell } from './Shell';
import { useProfiles, useSession } from './useProfiles';
import { useTheme } from '../ui/theme';

function Routed() {
  useTheme(); // applies the saved theme class to <html>
  const { session, refresh } = useSession();
  const { profiles, active, loading, error, select } = useProfiles(!!session);
  const { status } = useAutofill();
  const loc = useLocation();

  useEffect(() => {
    // the host page tells us when the panel is shown again, so session state is fresh
    const on = (e: MessageEvent) => e.data?.action === 'panelVisible' && refresh();
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [refresh]);

  if (session === undefined) return <Shell signedIn={false} header={false}><div /></Shell>;

  if (!session && loc.pathname !== '/settings' && loc.pathname !== '/report' && loc.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  if (session && loc.pathname === '/login') return <Navigate to="/" replace />;

  if (loc.pathname === '/login') {
    return <LoginPage onSignedIn={refresh} />;
  }

  const busyScreen = status === 'running' ? <ProgressScreen profile={active} />
    : status === 'success' ? <SuccessScreen profile={active} />
      : status === 'failed' ? <FailedScreen profile={active} /> : null;

  return (
    <Shell signedIn={!!session} disabledHeader={status === 'running'}>
      {busyScreen ?? (
        <Routes>
          <Route path="/" element={<Home profiles={profiles} active={active} onSelect={select} />} />
          <Route path="/profile" element={<ProfilesPage profiles={profiles} active={active} loading={loading} error={error} onSelect={select} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Shell>
  );
}

export function App() {
  return (
    <AutofillProvider>
      <Routed />
    </AutofillProvider>
  );
}
