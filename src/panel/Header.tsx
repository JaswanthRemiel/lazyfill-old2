import { Flag, LayoutGrid, LogOut, Settings, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { send } from '../shared/messages';
import { Wordmark } from '../ui/kit';

const btn = 'flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30';

export const closePanel = () => window.parent.postMessage({ action: 'closePanel' }, '*');
export const openDashboard = (tab = '') => chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html#/${tab}`) });

export function ActionCluster({ className = '', signedIn, disabled }: { className?: string; signedIn: boolean; disabled?: boolean }) {
  const nav = useNavigate();
  const icon = { className: 'size-[17px]', strokeWidth: 1.75 } as const;
  return (
    <div className={`flex items-center ${className}`}>
      <button type="button" onClick={() => openDashboard('applications')} disabled={disabled} aria-label="Dashboard" className={btn}><LayoutGrid {...icon} /></button>
      <button type="button" onClick={() => nav('/settings', { replace: true })} disabled={disabled} aria-label="Settings" className={btn}><Settings {...icon} /></button>
      <button type="button" onClick={() => nav('/report', { state: { fromHeader: true } })} disabled={disabled} aria-label="Report" className={btn}><Flag {...icon} /></button>
      {signedIn && (
        <button type="button" aria-label="Log out" disabled={disabled} className={btn}
          onClick={async () => { await send({ action: 'signOut' }); nav('/login'); }}><LogOut {...icon} /></button>
      )}
      <button type="button" onClick={closePanel} aria-label="Close" className={btn}><X {...icon} /></button>
    </div>
  );
}

export function Header({ signedIn, disabled }: { signedIn: boolean; disabled?: boolean }) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-between pr-2 pl-4">
      <Wordmark />
      <ActionCluster signedIn={signedIn} disabled={disabled} />
    </div>
  );
}
