import type { ReactNode } from 'react';
import { buttonClass, controlClass, Field as KitField, Notice as KitNotice } from '../ui/kit';
import { cn } from '../ui/cn';

/* The dashboard pages share these class strings; they are the kit's tokens, spelled out once. */
export const card = 'rounded-2xl border border-border bg-card p-5';
export const inputCls = cn(controlClass, 'h-9');
export const btnPrimary = buttonClass('primary', 'md');
export const btnGhost = buttonClass('outline', 'md');
export const btnSmall = buttonClass('secondary', 'sm');

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <KitField label={label} hint={hint}>{children}</KitField>
);
export const Notice = KitNotice;
