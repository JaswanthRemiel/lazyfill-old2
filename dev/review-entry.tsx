import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../src/ui/theme.css';
import { ResumeReview } from '../src/dashboard/ResumeReview';
import { emptyProfileData, emptyWork } from '../src/shared/profile';
import { verifyResume } from '../src/shared/resumeImport';
import { buildReview } from '../src/shared/resumeReview';

const TEXT = 'Ada Lovelace ada@example.com +44 7700 900123 Staff Engineer Analytical Engines Engineer Difference Co University of London BSc Python React Node.js '.repeat(2);
const imp = verifyResume({
  personalInfo: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@exampel.com', phoneNumber: '+44 7700 900123', city: 'London', country: 'United Kingdom' },
  links: { linkedinUrl: 'https://linkedin.com/in/made-up' },
  workExperience: [
    { jobTitle: 'Staff Engineer', companyName: 'Analytical Engines', location: 'London, UK', startDate: 'Apr 2025', endDate: 'Present', isCurrent: false, description: 'Built backend services and REST APIs for an enterprise B2B ecommerce platform.\nMigrated 12 AWS Lambda functions into one NestJS backend.', sourceQuote: 'Staff Engineer Analytical Engines' },
    { jobTitle: 'Engineer', companyName: 'Difference Co', location: 'Leeds, UK', startDate: '05/2024', endDate: '01/2025', isCurrent: false, description: '', sourceQuote: 'Engineer Difference Co' },
    { jobTitle: 'CTO', companyName: 'Imaginary Labs', startDate: '2019', endDate: '2020', isCurrent: false, description: '', sourceQuote: 'CTO Imaginary Labs' },
  ],
  education: [{ schoolName: 'University of London', degree: 'BSc', fieldOfStudy: 'Mathematics', gpa: '3.9', startDate: '2021', graduationDate: '2025', sourceQuote: 'University of London' }],
  skills: ['Python', 'React', 'Node.js', 'Go'],
}, { text: TEXT, links: [{ text: 'LinkedIn', url: 'https://www.linkedin.com/in/ada-lovelace' }] }, 'gemini-2.5-pro');

const cur = emptyProfileData();
cur.personalInfo.firstName = 'Adaline';
cur.workExperience = [{ ...emptyWork(), jobTitle: 'Engineer', companyName: 'Difference Co' }];
cur.skills = ['Go'];

function App() {
  const [r, setR] = useState(buildReview(cur, imp));
  return <ResumeReview review={r} fileName="ada-lovelace-resume.pdf" onChange={setR} onApply={() => {}} onCancel={() => {}} />;
}
createRoot(document.getElementById('root')!).render(<App />);
