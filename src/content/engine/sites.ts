/**
 * Entry point for the site-specific fillers. Runs every handler (Meta, Google, TikTok/ByteDance here, the rest from
 * sites2 and sites3), skips the ones that do not recognise the page, isolates failures, and merges what is left.
 */
import type { ProfileData } from '../../shared/profile';
import { fillBytedance } from './bytedance';
import { fillGoogleWork } from './googleWork';
import { fillMetaWork } from './metaWork';
import { formWidgetHandlers } from './sites2';
import { atsHandlers } from './sites3';
import { mergeResults, type SiteResult } from './siteKit';

export type { SiteResult };

type Handler = (p: ProfileData) => Promise<SiteResult | null>;

const handlers = (): Handler[] => [fillMetaWork, fillGoogleWork, fillBytedance, ...formWidgetHandlers, ...atsHandlers];

/** Runs all site handlers one after another; null when none recognised the page. */
export async function fillSiteSpecific(p: ProfileData): Promise<SiteResult | null> {
  const found: SiteResult[] = [];
  for (const h of handlers()) {
    try {
      const r = await h(p);
      if (r) found.push(r);
    } catch (e) {
      console.debug('lazyfill: site handler failed', e);
    }
  }
  return mergeResults(found);
}
