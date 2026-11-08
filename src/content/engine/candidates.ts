import type { ProfileData } from '../../shared/profile';
import type { Adapter } from '../adapters';
import { classifyEntryFields } from './entries';
import { toLearnFields, type LearnField } from './learn';
import { matchField } from './match';
import type { FieldInfo } from './types';
import { valueFor } from './values';

/**
 * Questions lazyfill cannot answer from the profile: nothing recognised them, or they were
 * recognised but the profile has no value. These are the ones worth remembering.
 */
export function learnCandidates(fields: FieldInfo[], adapter: Adapter, profile: ProfileData): LearnField[] {
  const inEntries = new Set(classifyEntryFields(fields).map((e) => e.f.el));
  const rest = fields.filter((f) => {
    if (inEntries.has(f.el)) return false;
    const m = matchField(f, adapter.keyFor?.(f));
    return !m || !valueFor(m.key, profile).trim();
  });
  return toLearnFields(rest);
}
