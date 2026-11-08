export interface LearnedEntry {
  originalLabel: string;
  value: string | string[];
  fieldType: 'text' | 'textarea' | 'select' | 'radio' | 'combobox' | 'checkboxes';
  selectedOptionText: string | string[] | null;
  selectedIndex: number | null;
  options: string[] | null;
  firstSeen: string;
  lastUsed: string;
  timesUsed: number;
  lastUrl: string;
  source: 'manual' | 'edited';
}

/** normalised question label -> saved answer, for one profile on one platform */
export type LearnedMap = Record<string, LearnedEntry>;
/** profileId -> platform scope -> labels */
export type LearnedStore = Record<string, Record<string, LearnedMap>>;

/** One key per question, however the site capitalises or decorates it. */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\((required|optional)\)/g, '')
    .replace(/[*:?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const sameValue = (a: LearnedEntry['value'], b: LearnedEntry['value']) =>
  JSON.stringify(a) === JSON.stringify(b);
