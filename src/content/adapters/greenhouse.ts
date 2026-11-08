import { tableAdapter } from './index';

// Greenhouse application forms use stable ids for the standard fields; custom
// questions (question_123…) are left to the generic label matcher.
export const greenhouse = tableAdapter(
  'greenhouse',
  'Greenhouse',
  (u) => /(^|\.)greenhouse\.io$/.test(u.hostname),
  {
    first_name: 'firstName',
    last_name: 'lastName',
    preferred_name: 'preferredName',
    email: 'email',
    phone: 'phone',
    resume: 'resume',
    'candidate-location': 'city',
    gender: 'gender',
    hispanic_ethnicity: 'race',
    race: 'race',
    veteran_status: 'veteran',
    disability_status: 'disability',
  },
);
