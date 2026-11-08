import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'lf_theme';

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}

/** Theme lives in chrome.storage.sync so the panel, dashboard and page overlay agree. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    chrome.storage.sync.get(KEY).then((r) => {
      const t = r[KEY] === 'dark' ? 'dark' : 'light';
      setThemeState(t);
      apply(t);
    });
    const onChange = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync' && c[KEY]) {
        const t = c[KEY].newValue === 'dark' ? 'dark' : 'light';
        setThemeState(t);
        apply(t);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    chrome.storage.sync.set({ [KEY]: t });
  }, []);

  return { theme, isDark: theme === 'dark', setTheme };
}
