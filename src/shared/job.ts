export interface JobInfo {
  jobTitle: string;
  company: string;
  jobUrl: string;
  platform: string;
  location?: string;
  description?: string;
}

/** Same job -> same id, so "filled" and "submitted" update one record instead of adding two. */
export async function applicationIdFor(jobUrl: string, company = '', title = ''): Promise<string> {
  let key = jobUrl;
  try {
    const u = new URL(jobUrl);
    // drop tracking params and the /apply or /application suffix so the listing and its form agree
    key = `${u.hostname}${u.pathname.replace(/\/(apply|application|confirmation|thanks?)\/?$/i, '').replace(/\/$/, '')}`;
    const keep = ['gh_jid', 'jid', 'job', 'jobId', 'job_id', 'id', 'requisitionId'];
    for (const k of keep) if (u.searchParams.has(k)) key += `|${k}=${u.searchParams.get(k)}`;
  } catch {
    key = `${company}|${title}`;
  }
  const bytes = new TextEncoder().encode(key.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'app_' + Array.from(new Uint8Array(digest).slice(0, 10), (b) => b.toString(16).padStart(2, '0')).join('');
}
