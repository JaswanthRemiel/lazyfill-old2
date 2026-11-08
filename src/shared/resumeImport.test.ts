import { describe, expect, it } from 'vitest';
import { buildResumePrompt, collectUrls, hasTextLayer, mentions, monthsWorked, RESUME_SCHEMA, splitPhone, verifyResume } from './resumeImport';

const TEXT = `Ada
Lovelace
Front End Developer
C O N TA C T
ada@example.com
+44 7700 900123
London, England, United Kingdom
LinkedIn
GitHub
ada.dev
SKILLS
Java, Python, JavaScript, C++
Node.js, NestJS, React
Apr 2025 - Present
05/2024 - 01/2025
EXPERIENCE
Staff Engineer · Analytical Engines
London, UK
Engineer · Difference Co
Leeds, UK
EDUCATION
BSc, Mathematics
University of London · GPA 3.9`;
const LINKS = [
  { text: 'LinkedIn', url: 'https://www.linkedin.com/in/ada-lovelace' },
  { text: 'GitHub', url: 'https://github.com/ada' },
  { text: 'ada.dev', url: 'https://ada.dev/' },
];

const model = () => ({
  personalInfo: { firstName: 'Ada', middleName: '', lastName: 'Lovelace', email: 'ada@exampel.com', phoneNumber: '+44 7700 900123', currentAddress: '', city: 'London', state: 'England', zipCode: '', country: 'United Kingdom' },
  links: { linkedinUrl: 'https://linkedin.com/in/made-up', githubUrl: '', portfolioUrl: '', websiteUrl: 'https://ada.dev', twitterUrl: '' },
  workExperience: [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London, UK', startDate: 'Apr 2025', endDate: 'Present', isCurrent: false, description: 'Built things', sourceQuote: 'Staff Engineer · Analytical Engines' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds, UK', startDate: '05/2024', endDate: '01/2025', isCurrent: false, description: '', sourceQuote: 'Engineer · Difference Co' },
    { jobTitle: 'CTO', companyName: 'Imaginary Labs', location: '', startDate: '2019', endDate: '2020', isCurrent: false, description: '', sourceQuote: 'CTO at Imaginary Labs' },
  ],
  education: [{ schoolName: 'University of London', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2021', graduationDate: '2025', currentlyEnrolled: false, sourceQuote: 'University of London · GPA 3.9' }],
  skills: ['Java', 'Python', 'React.js', 'Kubernetes', 'Python'],
});

describe('verifyResume', () => {
  const r = verifyResume(model(), { text: TEXT, links: LINKS }, 'gemini-2.5-pro');

  it('takes the email from the resume text when the model misread it', () => {
    expect(r.data.personalInfo.email).toBe('ada@example.com');
    expect(r.notes.join(' ')).toMatch(/Email changed/);
  });
  it('splits the phone number into country code and number', () => {
    expect(r.data.personalInfo.phoneCountryCode).toBe('+44');
    expect(r.data.personalInfo.phoneNumber).toBe('7700900123');
  });
  it('uses the real hyperlink addresses, not the model\'s guesses', () => {
    expect(r.data.links.linkedinUrl).toBe('https://www.linkedin.com/in/ada-lovelace');
    expect(r.data.links.githubUrl).toBe('https://github.com/ada');
    expect(r.data.links.websiteUrl).toBe('https://ada.dev/');
  });
  it('normalises dates, and treats "Present" as a current job with no end date', () => {
    const [a, b] = r.data.workExperience;
    expect([a.startDate, a.endDate, a.isCurrent]).toEqual(['2025-04', '', true]);
    expect([b.startDate, b.endDate, b.isCurrent]).toEqual(['2024-05', '2025-01', false]);
  });
  it('flags a job the resume never mentions', () => {
    expect(r.workFlags[0]).toEqual([]);
    expect(r.workFlags[2].join(' ')).toMatch(/not in the resume text/);
    expect(r.educationFlags[0]).toEqual([]);
  });
  it('keeps only skills the resume says, once each', () => {
    expect(r.data.skills).toEqual(['Java', 'Python', 'React.js']);
    expect(r.notes.join(' ')).toMatch(/left out/);
  });
  it('fills current company, title and years of experience', () => {
    expect(r.data.preferences.currentCompany).toBe('Analytical Engines');
    expect(r.data.preferences.currentTitle).toBe('Staff Engineer');
    expect(Number(r.data.preferences.yearsOfExperience)).toBeGreaterThanOrEqual(1);
    // the job the resume does not mention (2019-2020) must not add to the total
    const backed = r.data.workExperience.slice(0, 2);
    expect(r.data.preferences.yearsOfExperience).toBe(String(Math.floor(monthsWorked(backed) / 12)));
  });
  it('does not check against text a scanned resume does not have', () => {
    const scan = verifyResume(model(), { text: '', links: [] }, 'm');
    expect(scan.workFlags.every((f) => f.length === 0)).toBe(true);
    expect(scan.data.skills).toContain('Kubernetes');
    expect(scan.data.personalInfo.email).toBe('ada@exampel.com');
  });
  it('survives garbage from the model', () => {
    const g = verifyResume('nope', { text: TEXT, links: [] }, 'm');
    expect(g.data.workExperience).toEqual([]);
    expect(g.data.personalInfo.email).toBe('ada@example.com');
  });
});

describe('helpers', () => {
  it('splitPhone reads country codes and leaves unlabelled numbers alone', () => {
    expect(splitPhone('+91 98765 43210')).toEqual({ phoneCountryCode: '+91', phoneNumber: '9876543210' });
    expect(splitPhone('+971 50 123 4567')).toEqual({ phoneCountryCode: '+971', phoneNumber: '501234567' });
    expect(splitPhone('(415) 555-0132')).toEqual({ phoneCountryCode: '', phoneNumber: '4155550132' });
    expect(splitPhone('')).toEqual({ phoneCountryCode: '', phoneNumber: '' });
  });
  it('mentions ignores case, spacing and punctuation', () => {
    expect(mentions('Samsung R&D India', 'samsung r&d  india')).toBe(true);
    expect(mentions('Samsung R&D India', 'Google')).toBe(false);
    expect(mentions('x', '')).toBe(false);
  });
  it('collectUrls prefers hyperlinks and finds printed addresses', () => {
    expect(collectUrls({ text: 'see github.com/ada/proj and mail a@b.co', links: [{ text: 'Site', url: 'https://ada.dev/' }] })).toEqual(['https://ada.dev/', 'github.com/ada/proj']);
  });
  it('monthsWorked counts overlapping jobs once', () => {
    const jobs = [
      { startDate: '2020-01', endDate: '2021-12', isCurrent: false },
      { startDate: '2021-01', endDate: '2022-12', isCurrent: false },
    ];
    expect(monthsWorked(jobs)).toBe(36);
    expect(monthsWorked([{ startDate: '2025-01', endDate: '', isCurrent: true }], new Date(2025, 5, 15))).toBe(6);
  });
  it('detects a scan', () => {
    expect(hasTextLayer('  ')).toBe(false);
    expect(hasTextLayer(TEXT)).toBe(true);
  });
  it('the prompt carries the text, the links and the page count', () => {
    const p = buildResumePrompt({ fileName: 'cv.pdf', images: [{ mimeType: 'image/jpeg', base64: 'x' }], text: TEXT, links: LINKS, pageCount: 3, truncated: true });
    expect(p).toContain('cv.pdf');
    expect(p).toContain('1 of 3');
    expect(p).toContain('ada@example.com');
    expect(p).toContain('linkedin.com/in/ada-lovelace');
    expect(buildResumePrompt({ fileName: 'scan.png', images: [], text: '', links: [], pageCount: 1 })).toMatch(/no text layer/);
  });
  it('the schema is strict: every property required, nothing extra', () => {
    const check = (n: any) => {
      if (n?.type === 'object') { expect(n.additionalProperties).toBe(false); expect([...n.required].sort()).toEqual(Object.keys(n.properties).sort()); Object.values(n.properties).forEach(check); }
      if (n?.type === 'array') check(n.items);
    };
    check(RESUME_SCHEMA);
  });
});
