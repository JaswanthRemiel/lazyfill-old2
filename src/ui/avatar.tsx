import type { Profile } from '../shared/types';

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Ten quiet grays, so each profile still gets its own look without any color. */
const TONES = [
  ['#111113', '#ffffff'], ['#2c2c2e', '#f5f5f7'], ['#48484a', '#ffffff'], ['#636366', '#ffffff'], ['#8e8e93', '#ffffff'],
  ['#aeaeb2', '#111113'], ['#c7c7cc', '#111113'], ['#d1d1d6', '#111113'], ['#e5e5ea', '#111113'], ['#f2f2f7', '#111113'],
];
export const avatarIdFor = (p: Pick<Profile, 'id' | 'avatarId'>) => p.avatarId ?? (hash(p.id) % 10) + 1;

const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '·';
};

export function Avatar({ profile, size = 30 }: { profile: Pick<Profile, 'id' | 'avatarId' | 'name'>; size?: number }) {
  const [bg, fg] = TONES[(avatarIdFor(profile) - 1) % TONES.length];
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.max(9, Math.round(size * 0.38)), boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.06)' }}>
      {initials(profile.name)}
    </span>
  );
}

export const fullName = (p: Profile) => [p.data.personalInfo.firstName, p.data.personalInfo.lastName].filter(Boolean).join(' ');
