import { FIREBASE_CONFIG } from '../../shared/config';
import { getItem, removeItem, setItem } from '../../shared/storage';
import type { Session } from '../../shared/types';

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
const SECURE_TOKEN = 'https://securetoken.googleapis.com/v1/token';
/** refresh a minute before actual expiry */
const SKEW_MS = 60_000;

export class AuthError extends Error {
  constructor(message: string, readonly code = '') {
    super(message);
  }
}

function friendly(code: string): string {
  const map: Record<string, string> = {
    INVALID_EMAIL: 'That email address is not valid.',
    MISSING_EMAIL: 'Enter your email address.',
    MISSING_PASSWORD: 'Enter your password.',
    EMAIL_EXISTS: 'An account with this email already exists. Sign in instead, or use “Forgot password”.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
    INVALID_PASSWORD: 'Wrong email or password.',
    EMAIL_NOT_FOUND: 'Wrong email or password.',
    WEAK_PASSWORD: 'Use a password of at least 8 characters.',
    OPERATION_NOT_ALLOWED: 'Email and password sign-in is not enabled for this project.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Try again in a few minutes.',
    QUOTA_EXCEEDED: 'Too many emails were sent today. Try again tomorrow.',
    INVALID_REFRESH_TOKEN: 'Your sign-in expired. Sign in again.',
    TOKEN_EXPIRED: 'Your sign-in expired. Sign in again.',
    USER_DISABLED: 'This account has been disabled.',
  };
  const key = code.split(/[ :]/)[0];
  return map[key] ?? code;
}

async function post(url: string, body: BodyInit, headers: Record<string, string>) {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch {
    throw new AuthError('Network error. Check your connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw: string = json?.error?.message ?? `HTTP ${res.status}`;
    throw new AuthError(friendly(raw), raw.split(/[ :]/)[0]);
  }
  return json;
}

async function identity(endpoint: 'signUp' | 'signInWithPassword', email: string, password: string) {
  return post(
    `${IDENTITY}/accounts:${endpoint}?key=${FIREBASE_CONFIG.apiKey}`,
    JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
    { 'Content-Type': 'application/json' },
  );
}

async function isVerified(idToken: string): Promise<boolean> {
  const j = await post(`${IDENTITY}/accounts:lookup?key=${FIREBASE_CONFIG.apiKey}`, JSON.stringify({ idToken }), { 'Content-Type': 'application/json' });
  return !!j?.users?.[0]?.emailVerified;
}

const sendVerification = (idToken: string) =>
  post(`${IDENTITY}/accounts:sendOobCode?key=${FIREBASE_CONFIG.apiKey}`, JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken }), { 'Content-Type': 'application/json' });

export const MIN_PASSWORD = 8;

/** `unverified` means the password was right but the address has not been confirmed yet; nothing is saved until it is. */
export type SignInResult = 'ok' | 'unverified';

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const j = await identity('signInWithPassword', email, password);
  if (!(await isVerified(j.idToken))) return 'unverified';
  await setItem('lf_session', {
    uid: j.localId, email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, expiresAt: Date.now() + Number(j.expiresIn) * 1000,
  } satisfies Session);
  return 'ok';
}

/** Creates the account and emails a verification link. */
export async function signUp(email: string, password: string): Promise<SignInResult> {
  if (password.length < MIN_PASSWORD) throw new AuthError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  const j = await identity('signUp', email, password);
  await sendVerification(j.idToken);
  return 'unverified';
}

/** Sends the verification email again (signing in with the same credentials to prove the request is theirs). */
export async function resendVerification(email: string, password: string): Promise<void> {
  const j = await identity('signInWithPassword', email, password);
  await sendVerification(j.idToken);
}

/** Always reports success, so the reply never reveals whether an address has an account. */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!email.trim()) throw new AuthError('Enter your email address first.');
  try {
    await post(`${IDENTITY}/accounts:sendOobCode?key=${FIREBASE_CONFIG.apiKey}`, JSON.stringify({ requestType: 'PASSWORD_RESET', email: email.trim() }), { 'Content-Type': 'application/json' });
  } catch (e) {
    if (e instanceof AuthError && e.code === 'EMAIL_NOT_FOUND') return;
    throw e;
  }
}

/**
 * Proves the person at the keyboard knows the password, and returns a fresh session. Deleting an account is
 * refused by Firebase unless the sign-in is recent, so this also satisfies that.
 */
export async function reauthenticate(password: string): Promise<Session> {
  const current = await getItem('lf_session');
  if (!current) throw new AuthError('Not signed in.');
  const j = await identity('signInWithPassword', current.email, password);
  if (j.localId !== current.uid) throw new AuthError('That password belongs to a different account.');
  const session: Session = { uid: j.localId, email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, expiresAt: Date.now() + Number(j.expiresIn) * 1000 };
  await setItem('lf_session', session);
  return session;
}

/** Deletes the Firebase account itself. Call after the account's data is gone. */
export async function deleteAuthAccount(idToken: string): Promise<void> {
  await post(`${IDENTITY}/accounts:delete?key=${FIREBASE_CONFIG.apiKey}`, JSON.stringify({ idToken }), { 'Content-Type': 'application/json' });
}

export async function signOut(): Promise<void> {
  await removeItem('lf_session');
}

export async function getSession(): Promise<Session | undefined> {
  return getItem('lf_session');
}

let refreshing: Promise<Session> | null = null;

/** Returns a valid session, refreshing the id token if it is (nearly) expired. */
export async function getValidSession(): Promise<Session> {
  const s = await getItem('lf_session');
  if (!s) throw new AuthError('Not signed in.');
  if (s.expiresAt - SKEW_MS > Date.now()) return s;
  refreshing ??= refresh(s).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refresh(s: Session): Promise<Session> {
  const j = await post(
    `${SECURE_TOKEN}?key=${FIREBASE_CONFIG.apiKey}`,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken }),
    { 'Content-Type': 'application/x-www-form-urlencoded' },
  );
  const next: Session = {
    ...s,
    idToken: j.id_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + Number(j.expires_in) * 1000,
  };
  await setItem('lf_session', next);
  return next;
}
