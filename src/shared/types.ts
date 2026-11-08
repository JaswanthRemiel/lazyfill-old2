import type { ProfileData } from './profile';

export interface FirebaseConfig {
  apiKey: string;
  projectId: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

export interface Session {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  /** epoch ms when idToken expires */
  expiresAt: number;
}

export interface Profile {
  id: string;
  name: string;
  /** 1-10, picks one of the bundled avatars */
  avatarId?: number;
  data: ProfileData;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationStatus =
  | 'filled'
  | 'submitted'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn';

export interface Application {
  id: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  platform: string;
  location?: string;
  profileId?: string;
  status: ApplicationStatus;
  filledAt?: string;
  submittedAt?: string;
  notes?: string;
  jobDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiSettings {
  provider: 'gemini' | 'openai';
  apiKey: string;
  model: string;
  /** model used to read resumes; empty means the provider's stronger default */
  importModel?: string;
}

export interface PendingWrite {
  id: string;
  op: 'set' | 'delete';
  /** document path relative to the documents root, e.g. users/{uid}/applications/{id} */
  path: string;
  data?: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}
