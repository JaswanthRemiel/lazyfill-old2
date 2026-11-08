import { beforeEach, describe, expect, it } from 'vitest';
import { extractJobInfo, looksConfirmed } from './tracking';

function setUrl(url: string) { window.history.pushState({}, '', url); }
beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; document.title = ''; setUrl('/'); });

describe('extractJobInfo', () => {
  it('prefers schema.org JobPosting data', () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Staff Engineer',
      hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
      jobLocation: { address: { addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' } },
      description: '<p>Build <b>great</b> things.</p>',
    })}</script>`;
    const j = extractJobInfo('greenhouse');
    expect(j).toMatchObject({ jobTitle: 'Staff Engineer', company: 'Acme Corp', location: 'Austin, TX, US', platform: 'greenhouse' });
    expect(j.description).toBe('Build great things.');
  });

  it('finds JobPosting inside @graph and arrays', () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'WebSite' }, { '@type': 'JobPosting', title: 'Designer', hiringOrganization: 'Globex' }] })}</script>`;
    expect(extractJobInfo('x')).toMatchObject({ jobTitle: 'Designer', company: 'Globex' });
  });

  it('survives malformed JSON-LD and falls back to the page', () => {
    document.head.innerHTML = '<script type="application/ld+json">{ not json</script>';
    document.body.innerHTML = '<h1>  Data   Analyst </h1>';
    const j = extractJobInfo('generic');
    expect(j.jobTitle).toBe('Data Analyst');
  });

  it('cleans "Job Application for X at Company" titles', () => {
    document.head.innerHTML = '<meta property="og:site_name" content="Initech">';
    document.title = 'Job Application for Support Engineer at Initech';
    document.body.innerHTML = '';
    expect(extractJobInfo('x')).toMatchObject({ jobTitle: 'Support Engineer', company: 'Initech' });
  });

  it('never throws on an empty page and keeps the url without a fragment', () => {
    setUrl('/jobs/1#apply');
    const j = extractJobInfo('generic');
    expect(j.jobUrl.endsWith('/jobs/1')).toBe(true);
    expect(j.jobTitle).toBeTruthy();
  });
});

describe('looksConfirmed', () => {
  it.each([
    ['/acme/jobs/123/confirmation', '', true],
    ['/embed/job_app/confirmation', '', true],
    ['/acme/thanks', '', true],
    ['/apply/application-submitted', '', true],
    ['/acme/jobs/123', '', false],
    ['/jobs/thanksgiving-baker', '', false],
    ['/jobs/456/apply', '', false],
    ['/jobs/456', '<h1>Thank you for applying!</h1>', true],
    ['/jobs/456', '<p>Your application has been submitted.</p>', true],
    ['/jobs/456', "<p>We've received your application</p>", true],
    ['/jobs/456', '<p>Please fill the form and apply</p>', false],
  ])('%s %s -> %s', (path, html, expected) => {
    setUrl(path);
    document.body.innerHTML = html;
    expect(looksConfirmed()).toBe(expected);
  });
});
