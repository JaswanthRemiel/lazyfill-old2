import { tableAdapter } from './index';

export const lever = tableAdapter(
  'lever',
  'Lever',
  (u) => /(^|\.)lever\.co$/.test(u.hostname),
  {},
  {
    name: 'fullName',
    email: 'email',
    phone: 'phone',
    org: 'currentCompany',
    location: 'city',
    resume: 'resume',
    'urls[LinkedIn]': 'linkedin',
    'urls[GitHub]': 'github',
    'urls[Github]': 'github',
    'urls[Portfolio]': 'portfolio',
    'urls[Twitter]': 'twitter',
    'urls[Other]': 'website',
    'eeo[gender]': 'gender',
    'eeo[race]': 'race',
    'eeo[veteran]': 'veteran',
    'eeo[disability]': 'disability',
  },
);
