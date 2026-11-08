import { describe, expect, it } from 'vitest';
import { emptyProfileData, emptyWork } from './profile';
import { verifyResume } from './resumeImport';
import { applyReview, buildReview, reviewCount } from './resumeReview';

const TEXT = 'Ada Lovelace ada@example.com +44 7700 900123 Staff Engineer Analytical Engines Engineer Difference Co University of London BSc Python React '.repeat(2);
const imp = verifyResume({
  personalInfo: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phoneNumber: '+44 7700 900123' },
  workExperience: [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', startDate: '2025-04', endDate: '', isCurrent: true, sourceQuote: 'Staff Engineer Analytical Engines' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', startDate: '2024-05', endDate: '2025-01', isCurrent: false, sourceQuote: 'Engineer Difference Co' },
    { jobTitle: 'CTO', companyName: 'Imaginary Labs', startDate: '2019', endDate: '2020', isCurrent: false, sourceQuote: 'CTO Imaginary Labs' },
  ],
  education: [{ schoolName: 'University of London', degree: 'BSc', startDate: '2021', graduationDate: '2025', sourceQuote: 'University of London' }],
  skills: ['Python', 'React'],
}, { text: TEXT, links: [] }, 'gemini-2.5-pro');

describe('buildReview', () => {
  it('on an empty profile, fills everything verified and leaves the doubtful job unticked', () => {
    const r = buildReview(emptyProfileData(), imp);
    expect(r.fields.find((f) => f.key === 'email')).toMatchObject({ found: 'ada@example.com', take: true });
    expect(r.work.map((w) => w.take)).toEqual([true, true, false]);
    expect(r.work[2].flags.join(' ')).toMatch(/not in the resume text/);
    expect(r.education[0].take).toBe(true);
    expect(r.skills.map((s) => s.take)).toEqual([true, true]);
  });

  it('never replaces what you typed unless you tick it, and hides what already matches', () => {
    const cur = emptyProfileData();
    cur.personalInfo.firstName = 'Adaline';
    cur.personalInfo.lastName = 'Lovelace';
    cur.workExperience = [{ ...emptyWork(), jobTitle: 'Staff Engineer', companyName: 'Analytical Engines' }];
    cur.skills = ['python'];
    const r = buildReview(cur, imp);
    expect(r.fields.find((f) => f.key === 'firstName')).toMatchObject({ current: 'Adaline', found: 'Ada', take: false });
    expect(r.fields.find((f) => f.key === 'lastName')).toBeUndefined();
    expect(r.work[0]).toMatchObject({ present: true, take: false });
    expect(r.skills[0]).toMatchObject({ name: 'Python', present: true, take: false });
  });
});

describe('applyReview', () => {
  it('adds only what is ticked and keeps everything else as it was', () => {
    const cur = emptyProfileData();
    cur.personalInfo.firstName = 'Adaline';
    cur.skills = ['Go'];
    const r = buildReview(cur, imp);
    r.work[2].take = true; // the user decides the flagged job is real
    r.fields.find((f) => f.key === 'firstName')!.take = true; // and replaces the first name
    r.skills[1].take = false;
    const next = applyReview(cur, r);
    expect(next.personalInfo.firstName).toBe('Ada');
    expect(next.personalInfo.email).toBe('ada@example.com');
    expect(next.workExperience.map((w) => w.companyName)).toEqual(['Analytical Engines', 'Difference Co', 'Imaginary Labs']);
    expect(next.skills).toEqual(['Go', 'Python']);
    expect(cur.skills).toEqual(['Go']); // the original is untouched
    expect(reviewCount(r)).toBeGreaterThan(0);
  });
});
