import { describe, expect, it } from 'vitest';
import { authMessage } from './errors';

describe('authMessage', () => {
  it('does not reveal whether an email has an account', () => {
    expect(authMessage({ code: 'auth/user-not-found' })).toBe(authMessage({ code: 'auth/wrong-password' }));
    expect(authMessage({ code: 'auth/invalid-credential' })).toMatch(/Wrong email or password/);
  });
  it('explains an existing account and a weak password', () => {
    expect(authMessage({ code: 'auth/email-already-in-use' })).toMatch(/already exists/);
    expect(authMessage({ code: 'auth/weak-password' })).toMatch(/8 characters/);
  });
  it('falls back to a readable message', () => {
    expect(authMessage(new Error('Firebase: something odd'))).toBe('something odd');
    expect(authMessage('nope')).toMatch(/Something went wrong/);
  });
});
