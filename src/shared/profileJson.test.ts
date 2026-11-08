import { describe, expect, it } from 'vitest';
import { emptyProfileData } from './profile';
import { buildExport, buildTemplate, parseProfileImport } from './profileJson';

const filled = (over: Record<string, unknown> = {}) => ({
  name: 'Front End Developer',
  data: {
    personalInfo: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
    workExperience: [{ jobTitle: 'Engineer', companyName: 'Acme', startDate: '2021-03', endDate: '', isCurrent: true }],
    education: [{ schoolName: 'UoL', degree: 'BSc', graduationDate: '2018-06' }],
    skills: ['TypeScript', 'React'],
    ...over,
  },
});

describe('template', () => {
  it('contains every profile field, help text and one blank entry per list', () => {
    const t = buildTemplate();
    const blank = emptyProfileData();
    expect(Object.keys(t.data.personalInfo)).toEqual(Object.keys(blank.personalInfo));
    expect(Object.keys(t.data.links)).toEqual(Object.keys(blank.links));
    expect(Object.keys(t.data.preferences)).toEqual(Object.keys(blank.preferences));
    expect(Object.keys(t.data.demographics)).toEqual(Object.keys(blank.demographics));
    expect(Object.keys(t.data.workExperience[0])).toEqual(['jobTitle', 'companyName', 'location', 'startDate', 'endDate', 'isCurrent', 'description']);
    expect(Object.keys(t.data.education[0])).toEqual(['schoolName', 'degree', 'fieldOfStudy', 'gpa', 'startDate', 'graduationDate', 'currentlyEnrolled']);
    expect(t._help).toBeTruthy();
    expect('resume' in t.data).toBe(false);
  });

  it('an unfilled template is rejected with a helpful message, not imported as an empty profile', () => {
    const r = parseProfileImport(JSON.stringify(buildTemplate()));
    expect(r.profiles).toHaveLength(0);
    expect(r.errors[0]).toMatch(/nothing to import/i);
  });

  it('a filled-in template imports cleanly with no warnings', () => {
    const t = buildTemplate();
    t.data.personalInfo.firstName = 'Ada';
    t.data.workExperience[0].companyName = 'Acme';
    const r = parseProfileImport(JSON.stringify(t));
    expect(r.errors).toEqual([]);
    expect(r.profiles[0].warnings).toEqual([]);
    expect(r.profiles[0].data.workExperience).toHaveLength(1);
  });
});

describe('export -> import round trip', () => {
  it('preserves everything except the resume file', () => {
    const src = parseProfileImport(JSON.stringify(filled())).profiles[0];
    src.data.resume = { fileName: 'cv.pdf', mimeType: 'application/pdf', size: 5 };
    const out = parseProfileImport(JSON.stringify(buildExport([src])));
    expect(out.errors).toEqual([]);
    expect({ ...out.profiles[0].data, resume: null }).toEqual({ ...src.data, resume: null });
    expect(out.profiles[0].data.resume).toBeNull();
  });
  it('several profiles export as a list and import as several', () => {
    const a = parseProfileImport(JSON.stringify(filled())).profiles[0];
    const b = { ...a, name: 'Data Analyst' };
    const r = parseProfileImport(JSON.stringify(buildExport([a, b])));
    expect(r.profiles.map((p) => p.name)).toEqual(['Front End Developer', 'Data Analyst']);
  });
});

describe('forgiving input', () => {
  it('accepts a bare data object, a plain list, and {profiles}', () => {
    expect(parseProfileImport(JSON.stringify(filled().data)).profiles[0].name).toBe('Imported profile');
    expect(parseProfileImport(JSON.stringify([filled(), filled({ skills: [] })])).profiles).toHaveLength(2);
    expect(parseProfileImport(JSON.stringify({ profiles: [filled()] })).profiles).toHaveLength(1);
  });
  it('normalises dates, yes/no, booleans and skills', () => {
    const r = parseProfileImport(JSON.stringify(filled({
      workExperience: [{ jobTitle: 'Eng', companyName: 'Acme', startDate: '3/2021', endDate: 'Present', isCurrent: 'yes' }, { jobTitle: 'Intern', companyName: 'B', startDate: 'June 2017', endDate: '08/2017', isCurrent: 'false' }],
      education: [{ schoolName: 'UoL', graduationDate: 'May 2018', currentlyEnrolled: 'no' }],
      preferences: { requiresSponsorship: 'n', willingToRelocate: true },
      skills: 'TypeScript, React ,  Go',
    })));
    const d = r.profiles[0].data;
    expect(d.workExperience[0]).toMatchObject({ startDate: '2021-03', endDate: '', isCurrent: true });
    expect(d.workExperience[1]).toMatchObject({ startDate: '2017-06', endDate: '2017-08', isCurrent: false });
    expect(d.education[0]).toMatchObject({ graduationDate: '2018-05', currentlyEnrolled: false });
    expect(d.preferences.requiresSponsorship).toBe('No');
    expect(d.preferences.willingToRelocate).toBe('Yes');
    expect(d.skills).toEqual(['TypeScript', 'React', 'Go']);
  });
  it('treats "Present" as a current job even after blank entries were dropped', () => {
    const r = parseProfileImport(JSON.stringify(filled({ workExperience: [{}, { jobTitle: 'Eng', companyName: 'Acme', startDate: '2021-03', endDate: 'Present' }] })));
    expect(r.profiles[0].data.workExperience).toHaveLength(1);
    expect(r.profiles[0].data.workExperience[0]).toMatchObject({ isCurrent: true, endDate: '' });
  });
  it('drops blank list entries and tolerates missing sections', () => {
    const r = parseProfileImport(JSON.stringify({ name: 'X', data: { personalInfo: { firstName: 'Ada' }, workExperience: [{}, { jobTitle: '' }] } }));
    expect(r.profiles[0].data.workExperience).toEqual([]);
    expect(r.profiles[0].data.education).toEqual([]);
  });
  it('ignores keys starting with _ silently, warns about real unknown keys', () => {
    const r = parseProfileImport(JSON.stringify({ _help: 'x', name: 'N', data: { _note: 1, personalInfo: { firstName: 'Ada', shoeSize: 9 }, hobbies: [] } }));
    expect(r.profiles[0].warnings.join(' ')).toMatch(/personalInfo\.shoeSize/);
    expect(r.profiles[0].warnings.join(' ')).toMatch(/hobbies/);
    expect(r.profiles[0].warnings.join(' ')).not.toMatch(/_note|_help/);
  });
  it('warns about dates it cannot read but still imports the rest', () => {
    const r = parseProfileImport(JSON.stringify(filled({ workExperience: [{ jobTitle: 'E', companyName: 'A', startDate: 'last spring' }] })));
    expect(r.profiles[0].warnings.join(' ')).toMatch(/workExperience\[0\]\.startDate/);
    expect(r.profiles[0].data.workExperience[0].companyName).toBe('A');
  });
  it('never imports a resume and says so', () => {
    const r = parseProfileImport(JSON.stringify(filled({ resume: { fileName: 'cv.pdf', mimeType: 'application/pdf', size: 3 } })));
    expect(r.profiles[0].data.resume).toBeNull();
    expect(r.profiles[0].warnings.join(' ')).toMatch(/resume/i);
  });
  it('reports bad input instead of throwing', () => {
    expect(parseProfileImport('not json').errors[0]).toMatch(/not valid JSON/);
    expect(parseProfileImport('[]').errors[0]).toMatch(/no profiles/);
    expect(parseProfileImport('{"profiles":[1,"x"]}').errors).toHaveLength(2);
    expect(parseProfileImport('42').errors).toHaveLength(1);
  });
});
