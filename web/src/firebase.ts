import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut as fbSignOut, type User,
} from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../../src/shared/config';

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
// the extension leaves optional fields out; the web page should too
export const db = (() => {
  try { return initializeFirestore(app, { ignoreUndefinedProperties: true }); } catch { return getFirestore(app); }
})();

const EMAIL_KEY = 'lf_last_email';

/** The page this one is served from; emails link back here when they can. */
export const pageUrl = () => `${location.origin}${location.pathname}`;

const actionSettings = () => ({ url: pageUrl(), handleCodeInApp: false });

export const signInWithPassword = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password).then((c) => c.user);

/** Creates the account and emails a verification link. Nothing is saved until the address is verified. */
export async function signUpWithPassword(email: string, password: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(user, actionSettings());
  return user;
}

export const resendVerification = (user: User) => sendEmailVerification(user, actionSettings());
export const sendReset = (email: string) => sendPasswordResetEmail(auth, email, actionSettings());

/** Re-reads the account and refreshes the token, so the verified flag reaches Firestore's rules. */
export async function refreshVerification(user: User): Promise<boolean> {
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
}

export const rememberedEmail = () => localStorage.getItem(EMAIL_KEY) ?? '';
export const rememberEmail = (email: string) => localStorage.setItem(EMAIL_KEY, email);

export const signOut = () => fbSignOut(auth);
export const watchUser = (cb: (u: User | null) => void) => onAuthStateChanged(auth, cb);
