/** Test-only helpers shared by the Meta, Google and ByteDance handler tests (fictional data). */
import { emptyProfileData, type ProfileData } from '../../shared/profile';

export function b2Profile(): ProfileData {
  const p = emptyProfileData();
  p.workExperience = [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London, England, United Kingdom', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Led the platform team.' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds, England, United Kingdom', startDate: '2018-09', endDate: '2021-02', isCurrent: false, description: 'Built compilers.' },
  ];
  p.education = [
    { schoolName: 'University of London', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2014-09', graduationDate: '2018-06', currentlyEnrolled: false },
  ];
  return p;
}

/** Makes an element report a layout box, so visibility checks pass in jsdom. */
export const shown = <T extends Element>(el: T): T => { (el as unknown as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList; return el; };
