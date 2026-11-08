import type { ReactNode } from 'react';
import { Header } from './Header';

/** The rounded 360x467 card every screen sits in. */
export function Shell({ children, signedIn, header = true, disabledHeader }: {
  children: ReactNode; signedIn: boolean; header?: boolean; disabledHeader?: boolean;
}) {
  return (
    <div className="fixed inset-0 size-full overflow-hidden rounded-[22px] border border-border bg-background font-sans text-foreground [clip-path:inset(0_round_22px)]">
      {header && <Header signedIn={signedIn} disabled={disabledHeader} />}
      <div className="absolute inset-0 flex">{children}</div>
    </div>
  );
}
