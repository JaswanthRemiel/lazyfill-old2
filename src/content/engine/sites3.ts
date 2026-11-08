/**
 * Handlers for SmartRecruiters, Jobvite/Talemetry and Workable application forms, bundled for the site entry point.
 */
import type { ProfileData } from '../../shared/profile';
import { jobviteHandler } from './jobvite';
import { smartRecruitersHandler } from './smartrecruiters';
import type { SiteResult } from './siteKit';
import { workableHandler } from './workable';

export const atsHandlers: Array<(p: ProfileData) => Promise<SiteResult | null>> = [
  smartRecruitersHandler,
  jobviteHandler,
  workableHandler,
];
