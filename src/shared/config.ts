import type { FirebaseConfig } from './types';

export const FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyBaCO4tSOzbKW39tYo4V0Al-5K168g1SyE',
  authDomain: 'lazyfill-remiel.firebaseapp.com',
  projectId: 'lazyfill-remiel',
  storageBucket: 'lazyfill-remiel.firebasestorage.app',
  messagingSenderId: '91872899012',
  appId: '1:91872899012:web:ff2222d2d0bb73c8a03e91',
  measurementId: 'G-6WTX27B3XJ',
};

export const SITE_URL = 'https://jaswanthremiel.github.io/lazyfill/';

export const siteConfigured = () => !SITE_URL.includes('YOUR-GITHUB-USERNAME');

export const PRIVACY_URL = `${SITE_URL}privacy.html`;
export const TERMS_URL = `${SITE_URL}terms.html`;

/** Shown wherever the app talks about other companies' products. */
export const NOT_AFFILIATED =
  'lazyfill is an independent project. It is not affiliated with, endorsed by or sponsored by any employer, job board, applicant tracking system or AI provider. Product and company names belong to their owners and are used only to describe what lazyfill works with.';
