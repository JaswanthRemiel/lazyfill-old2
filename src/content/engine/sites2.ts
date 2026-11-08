/**
 * Handlers for Avature, MathWorks, SAP UI5 forms and the education sections of Meta and Google careers.
 * sites.ts includes this array; each handler returns null when the page is not its own.
 */
import { fillAvature } from './avature';
import { fillGoogleEducation } from './googleEdu';
import { fillMathWorks } from './mathworks';
import { fillMetaEducation } from './metaEdu';
import { fillSapUi5 } from './sapui5';
import type { ProfileData } from '../../shared/profile';
import type { SiteResult } from './siteKit';

export const formWidgetHandlers: Array<(p: ProfileData) => Promise<SiteResult | null>> = [
  fillAvature,
  fillMathWorks,
  fillSapUi5,
  fillMetaEducation,
  fillGoogleEducation,
];
