/** Turns a Firebase Auth error into something a person can act on. */
export function authMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/missing-password': 'Enter your password.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead, or use “Forgot password”.',
    'auth/weak-password': 'Use a password of at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this project.',
    'auth/unauthorized-continue-uri': 'This page is not an authorized domain for the project, so Firebase cannot send the email.',
  };
  if (map[code]) return map[code];
  return err instanceof Error ? err.message.replace(/^Firebase: /, '') : 'Something went wrong. Try again.';
}

export const MIN_PASSWORD = 8;
