// Browser-only stand-in for the chrome.* APIs, used for visual checks outside the extension.
type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
const listeners: Listener[] = [];
const mem: Record<string, Record<string, unknown>> = { sync: {}, local: {} };
const params = new URLSearchParams(location.search);

const area = (name: 'sync' | 'local') => ({
  get: async (k?: string | string[]) => {
    if (!k) return { ...mem[name] };
    const keys = Array.isArray(k) ? k : [k];
    return Object.fromEntries(keys.filter((x) => x in mem[name]).map((x) => [x, mem[name][x]]));
  },
  set: async (o: Record<string, unknown>) => {
    Object.assign(mem[name], o);
    listeners.forEach((l) => l(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { newValue: v }])), name));
  },
  remove: async () => {},
});

const mk = (id: string, name: string, first: string, last: string, avatarId: number) => ({
  id, name, avatarId, createdAt: '', updatedAt: '',
  data: { personalInfo: { firstName: first, lastName: last, email: 'x@y.z' }, workExperience: [], education: [], skills: [], links: {}, preferences: {}, demographics: {}, resume: null },
});
const profiles = [mk('p1', 'Front End Developer', 'John', 'Doe', 3), mk('p2', 'Data Analyst', 'John', 'Doe', 7), mk('p3', 'Product Manager', 'John', 'Doe', 5)];
if (params.has('empty')) profiles.length = 0;
if (params.has('dark')) mem.sync.lf_theme = 'dark';
mem.local.lf_profile_cache = profiles;
mem.local.lf_active_profile_id = 'p1';

const iso = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const app = (id: string, company: string, jobTitle: string, platform: string, status: string, ago: number, extra = {}) => ({
  id, company, jobTitle, platform, status, jobUrl: 'https://example.com/jobs/' + id, createdAt: iso(ago), updatedAt: iso(ago),
  submittedAt: status === 'filled' ? undefined : iso(ago), filledAt: iso(ago), location: 'Remote', ...extra });
const applications = params.has('noapps') ? [] : [
  app('a1', 'Northfield Labs', 'Senior Frontend Engineer', 'greenhouse', 'interviewing', 2, { notes: 'Recruiter: Dana. Loop on Thursday.', jobDescription: 'Build the interfaces our customers use every day. You will own the experience end to end.' }),
  app('a2', 'Brightwave', 'Product Engineer', 'ashby', 'submitted', 1),
  app('a3', 'Kestrel Systems', 'Developer Experience Engineer', 'lever', 'submitted', 4),
  app('a4', 'Tidepool', 'Software Engineer, Web', 'greenhouse', 'filled', 0),
  app('a5', 'Orchard Health', 'Frontend Engineer', 'greenhouse', 'rejected', 12),
  app('a6', 'Lumen Works', 'Staff Developer', 'workday', 'offer', 20),
  app('a7', 'Quillon', 'Full Stack Engineer', 'greenhouse', 'ghosted', 31),
];

const detect = params.has('nosite')
  ? { label: 'Generic', adapterId: 'generic', matched: 0, total: 0 }
  : { label: 'Greenhouse', adapterId: 'greenhouse', matched: 8, total: 10 };

(window as unknown as { chrome: unknown }).chrome = {
  runtime: {
    id: 'dev',
    getURL: (p: string) => `/${p}`,
    getManifest: () => ({ version: '0.1.0' }),
    sendMessage: async (m: { action: string }) => {
      if (m.action === 'signIn') return { success: true, data: params.has('unverified') ? 'unverified' : 'ok' };
      if (m.action === 'signUp') return { success: true, data: 'unverified' };
      if (m.action === 'resendVerification' || m.action === 'sendPasswordReset') return { success: true };
      if (m.action === 'getSession') return { success: true, data: params.has('loggedout') ? null : { uid: 'u', email: 'a@b.c' } };
      if (m.action === 'listProfiles') return { success: true, data: profiles };
      if (m.action === 'setActiveProfile') return { success: true };
      if (m.action === 'listLearned') return { success: true, data: { p1: { greenhouse: {
        'why do you want to work here': { originalLabel: 'Why do you want to work here?', value: 'I admire how the team ships polished developer tools.', fieldType: 'textarea', selectedOptionText: null, selectedIndex: null, options: null, firstSeen: iso(9), lastUsed: iso(2), timesUsed: 3, lastUrl: 'https://boards.greenhouse.io/acme/jobs/1', source: 'manual' },
        'how did you hear about us': { originalLabel: 'How did you hear about us?', value: '3', fieldType: 'select', selectedOptionText: 'LinkedIn', selectedIndex: 1, options: ['Referral', 'LinkedIn'], firstSeen: iso(9), lastUsed: iso(2), timesUsed: 5, lastUrl: 'https://boards.greenhouse.io/acme/jobs/1', source: 'manual' },
        'desired salary': { originalLabel: 'Desired salary', value: '$150,000', fieldType: 'text', selectedOptionText: null, selectedIndex: null, options: null, firstSeen: iso(20), lastUsed: iso(1), timesUsed: 8, lastUrl: 'https://boards.greenhouse.io/acme/jobs/1', source: 'edited' } },
        lever: { 'notice period': { originalLabel: 'Notice period', value: '2 weeks', fieldType: 'text', selectedOptionText: null, selectedIndex: null, options: null, firstSeen: iso(4), lastUsed: iso(4), timesUsed: 0, lastUrl: 'https://jobs.lever.co/x/1', source: 'manual' } } } } };
      if (m.action === 'generateAnswer') return { success: true, data: { ok: true, source: 'ai', answer: 'I like that Acme Robotics ships software that moves real things. At Analytical Engines I led the platform team that cut deploy times from forty minutes to six, and I want to bring that same focus on reliable tooling to the people building your warehouse robots.' } };
      if (m.action === 'listApplications') return { success: true, data: applications };
      if (m.action === 'saveApplication' || m.action === 'deleteApplication') return { success: true };
      return { success: true, data: null };
    },
  },
  storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: (l: Listener) => listeners.push(l), removeListener: () => {} } },
  tabs: {
    query: async () => [{ id: 1, url: 'https://boards.greenhouse.io/acme/jobs/1' }],
    sendMessage: async (_t: number, m: { action: string }) => {
      if (m.action === 'detectPlatform') return detect;
      await new Promise((r) => setTimeout(r, params.has('slow') ? 60000 : 1200));
      return { url: 'x', report: params.has('fail') ? { platform: 'greenhouse', filled: [], skipped: [], unmatched: [] } : { platform: 'greenhouse', filled: Array(12).fill({ label: 'x', key: 'email' }), skipped: [], unmatched: [] } };
    },
    create: async () => {},
  },
  webNavigation: { getAllFrames: async () => [{ frameId: 0, url: 'https://boards.greenhouse.io/x' }] },
  scripting: { executeScript: async () => {} },
};

// auto-press Autofill so screenshots can capture the running / result screens
if (params.has('click')) {
  const t = setInterval(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Autofill') as HTMLButtonElement | undefined;
    if (b && !b.disabled) { clearInterval(t); b.click(); }
  }, 100);
}
