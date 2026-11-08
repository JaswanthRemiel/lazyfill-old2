import type { FieldInfo, MatchKey } from '../engine/types';

export interface Adapter {
  id: string;
  /** shown in the panel's platform card */
  label: string;
  test(url: URL): boolean;
  /** Exact answers for fields whose ids/names the platform fixes. */
  keyFor?(f: FieldInfo): MatchKey | undefined;
}

/** Build an adapter from a table of exact field ids and/or names. */
export function tableAdapter(
  id: string,
  label: string,
  test: Adapter['test'],
  byId: Record<string, MatchKey>,
  byName: Record<string, MatchKey> = {},
): Adapter {
  return { id, label, test, keyFor: (f) => (f.id && byId[f.id]) || (f.name && byName[f.name]) || undefined };
}
