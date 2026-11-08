import { FIREBASE_CONFIG } from '../../shared/config';
import { getValidSession } from './auth';

export class FirestoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
  /** Worth retrying later (offline, rate limited, server error, auth expired). */
  get retryable() {
    return this.status === 0 || this.status === 401 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

type FsValue = Record<string, unknown>;

export function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  throw new Error(`Cannot encode ${typeof v}`);
}

export function encodeFields(o: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = encode(v);
  return out;
}

export function decode(v: FsValue): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  return null;
}

export function decodeFields(f: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) out[k] = decode(v);
  return out;
}

async function request(method: string, path: string, body?: unknown, query = ''): Promise<unknown> {
  const session = await getValidSession();
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${path}${query}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${session.idToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new FirestoreError('Network error', 0);
  }
  if (res.status === 404 && method === 'GET') return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
    throw new FirestoreError(msg, res.status);
  }
  return json;
}

export async function getDoc(path: string): Promise<Record<string, unknown> | null> {
  const j = (await request('GET', path)) as { fields?: Record<string, FsValue> } | null;
  return j ? decodeFields(j.fields ?? {}) : null;
}

/** Creates or fully replaces the document. */
export async function setDoc(path: string, data: Record<string, unknown>): Promise<void> {
  await request('PATCH', path, { fields: encodeFields(data) });
}

export async function deleteDoc(path: string): Promise<void> {
  await request('DELETE', path);
}

export async function listDocs(collectionPath: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let token = '';
  do {
    const q = `?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const j = (await request('GET', collectionPath, undefined, q)) as {
      documents?: { fields?: Record<string, FsValue> }[];
      nextPageToken?: string;
    } | null;
    for (const d of j?.documents ?? []) out.push(decodeFields(d.fields ?? {}));
    token = j?.nextPageToken ?? '';
  } while (token);
  return out;
}

/** Paths (relative to the database root) of every document in a collection. */
export async function listDocPaths(collectionPath: string): Promise<string[]> {
  const out: string[] = [];
  let token = '';
  do {
    const q = `?pageSize=300&mask.fieldPaths=__name__${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const j = (await request('GET', collectionPath, undefined, q)) as { documents?: { name: string }[]; nextPageToken?: string } | null;
    for (const d of j?.documents ?? []) out.push(d.name.split('/documents/')[1]);
    token = j?.nextPageToken ?? '';
  } while (token);
  return out;
}
