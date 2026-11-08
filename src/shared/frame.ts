import type { FillReport } from '../content/engine/types';

/** What each frame reports when the panel asks whether it can autofill. */
export interface DetectInfo {
  /** display name, e.g. "Greenhouse" or "Generic" */
  label: string;
  adapterId: string;
  /** fields the engine recognised */
  matched: number;
  total: number;
  /** a known ATS embedded in an iframe we cannot see into */
  embeddedAts?: string;
}

export interface FrameResult {
  url: string;
  report: FillReport | null;
  error?: string;
}
