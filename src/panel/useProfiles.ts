import { useCallback, useEffect, useState } from 'react';
import { send } from '../shared/messages';
import { getItem } from '../shared/storage';
import type { Profile } from '../shared/types';

export interface SessionInfo { uid: string; email: string }

export function useSession() {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    const r = await send<SessionInfo | null>({ action: 'getSession' });
    setSession(r.data ?? null);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // signing in or out in another extension page (or from the emailed link) updates every open page
  useEffect(() => {
    const on = (c: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && c.lf_session) refresh(); };
    chrome.storage.onChanged.addListener(on);
    return () => chrome.storage.onChanged.removeListener(on);
  }, [refresh]);
  return { session, refresh };
}

/** Profiles come from the offline cache first so the panel opens instantly, then refresh from Firestore. */
export function useProfiles(enabled: boolean) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const cached = (await getItem('lf_profile_cache')) ?? [];
    setProfiles([...cached].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveId(await getItem('lf_active_profile_id'));
    setLoading(false);
    if (!enabled) return;
    const r = await send<Profile[]>({ action: 'listProfiles' });
    if (r.success && r.data) setProfiles(r.data);
    else if (r.error) setError(r.error);
    setActiveId(await getItem('lf_active_profile_id'));
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const on = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (c.lf_profile_cache || c.lf_active_profile_id)) load();
    };
    chrome.storage.onChanged.addListener(on);
    return () => chrome.storage.onChanged.removeListener(on);
  }, [load]);

  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const select = useCallback(async (id: string) => {
    setActiveId(id);
    await send({ action: 'setActiveProfile', id });
  }, []);

  return { profiles, active, loading, error, select, reload: load };
}
