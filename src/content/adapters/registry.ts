import { tableAdapter, type Adapter } from './index';
import { greenhouse } from './greenhouse';
import { lever } from './lever';

const host = (suffix: string) => (u: URL) => u.hostname === suffix || u.hostname.endsWith(`.${suffix}`);

/**
 * Platforms we recognise by hostname so the panel can name them, but that have no
 * field table yet. The generic matcher still fills whatever it understands.
 */
const known = (id: string, label: string, ...hosts: string[]): Adapter =>
  tableAdapter(id, label, (u) => hosts.some((h) => host(h)(u)), {});

const ADAPTERS: Adapter[] = [
  greenhouse,
  lever,
  known('workday', 'Workday', 'myworkdayjobs.com', 'myworkdaysite.com'),
  known('ashby', 'Ashby', 'ashbyhq.com'),
  known('icims', 'iCIMS', 'icims.com'),
  known('smartrecruiters', 'SmartRecruiters', 'smartrecruiters.com'),
  known('jobvite', 'Jobvite', 'jobvite.com'),
  known('bamboohr', 'BambooHR', 'bamboohr.com'),
  known('rippling', 'Rippling', 'ats.rippling.com'),
  known('comeet', 'Comeet', 'comeet.co', 'comeet.com'),
  known('adp', 'ADP', 'adp.com'),
  known('workable', 'Workable', 'workable.com'),
  known('breezy', 'Breezy HR', 'breezy.hr'),
  known('recruitee', 'Recruitee', 'recruitee.com'),
  known('personio', 'Personio', 'jobs.personio.de', 'jobs.personio.com'),
  known('teamtailor', 'Teamtailor', 'teamtailor.com'),
  known('paylocity', 'Paylocity', 'recruiting.paylocity.com'),
  known('jazzhr', 'JazzHR', 'applytojob.com'),
];

export const generic: Adapter = { id: 'generic', label: 'Generic', test: () => true };

export function detectAdapter(url: URL): Adapter {
  return ADAPTERS.find((a) => a.test(url)) ?? generic;
}

/** An ATS embedded in an iframe on a company's own careers page. */
export function embeddedAtsLabel(src: string): string | null {
  try {
    const u = new URL(src, location.href);
    const a = ADAPTERS.find((x) => x.test(u));
    return a ? a.label : null;
  } catch {
    return null;
  }
}
