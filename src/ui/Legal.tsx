import { NOT_AFFILIATED, PRIVACY_URL, TERMS_URL } from '../shared/config';

/** Links to the policies, and the line that says lazyfill is nobody's product but its own. */
export function LegalFooter({ className = '' }: { className?: string }) {
  const version = typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : '';
  return (
    <footer className={`grid gap-1.5 border-t border-border pt-6 text-xs text-muted-foreground ${className}`}>
      <p className="max-w-3xl leading-relaxed">{NOT_AFFILIATED}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <a className="underline-offset-2 hover:text-foreground hover:underline" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy policy</a>
        <a className="underline-offset-2 hover:text-foreground hover:underline" href={TERMS_URL} target="_blank" rel="noopener noreferrer">Terms</a>
        {version && <span>v{version}</span>}
      </p>
    </footer>
  );
}
