import { useCallback, useEffect, useState } from 'react';

const KEY = 'lf_theme';
const initial = (): 'light' | 'dark' => {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(initial);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const setTheme = useCallback((t: 'light' | 'dark') => { localStorage.setItem(KEY, t); setThemeState(t); }, []);
  return { theme, isDark: theme === 'dark', setTheme };
}
