import { FastForward, LayoutGrid, Moon, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRIVACY_URL } from '../shared/config';
import { useTheme } from '../ui/theme';
import { openDashboard } from './Header';
import { PageTitle, Row, Toggle } from './ui';

const SKIP_KEY = 'lf_skip_result_screens';

export function SettingsPage() {
  const nav = useNavigate();
  const { isDark, setTheme } = useTheme();
  const [skip, setSkip] = useState(false);

  useEffect(() => { chrome.storage.sync.get(SKIP_KEY).then((r) => setSkip(!!r[SKIP_KEY])); }, []);
  const toggleSkip = () => { setSkip(!skip); chrome.storage.sync.set({ [SKIP_KEY]: !skip }); };

  return (
    <section className="flex size-full flex-col px-5 pt-[64px] pb-4">
      <PageTitle title="Settings" label="Close settings" onBack={() => nav('/', { replace: true })} />
      <div className="mt-4 grid gap-2">
        <Row icon={<Moon />} label="Dark mode"><Toggle checked={isDark} onChange={() => setTheme(isDark ? 'light' : 'dark')} label="Dark mode" /></Row>
        <Row icon={<FastForward />} label="Skip result animations"><Toggle checked={skip} onChange={toggleSkip} label="Skip result animations" /></Row>
        <Row icon={<LayoutGrid />} label="Application tracker" onClick={() => openDashboard('applications')} />
        <Row icon={<SlidersHorizontal />} label="Account & AI setup" onClick={() => openDashboard('settings')} />
        <Row icon={<ShieldCheck />} label="Privacy policy" onClick={() => chrome.tabs.create({ url: PRIVACY_URL })} />
      </div>
      <p className="mt-auto text-center text-[10px] leading-4 text-muted-foreground">Independent project, not affiliated with any employer, job board or AI provider.<br />lazyfill v{chrome.runtime.getManifest().version}</p>
    </section>
  );
}
