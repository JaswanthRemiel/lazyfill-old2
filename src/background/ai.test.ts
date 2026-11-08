import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractProfileFromResume, parseJsonObject } from './ai';

const store: Record<string, unknown> = {};
const source = {
  fileName: 'cv.pdf',
  images: [{ mimeType: 'image/jpeg', base64: 'AAAA' }, { mimeType: 'image/jpeg', base64: 'BBBB' }],
  text: 'Ada Lovelace ada@example.com +1 555 123 4567 Engineer at Analytical Engines BSc University of London Math Poetry '.repeat(2),
  links: [{ text: 'LinkedIn', url: 'https://linkedin.com/in/ada' }],
  pageCount: 2,
};

const modelJson = {
  personalInfo: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phoneNumber: 5551234, junk: 1 },
  links: { linkedinUrl: 'https://linkedin.com/in/ada' },
  workExperience: [{ jobTitle: 'Engineer', companyName: 'Analytical Engines', startDate: '2021-03', endDate: '', isCurrent: true, description: 'Built things' }],
  education: [{ schoolName: 'University of London', degree: 'BSc', graduationDate: '2020' }],
  skills: ['Math', 'Poetry'],
  unknownTopLevel: true,
};

beforeEach(() => {
  vi.stubGlobal('chrome', { storage: { local: { get: async (k: string) => ({ [k]: store[k] }), set: async (o: object) => Object.assign(store, o) } } });
});
afterEach(() => { vi.unstubAllGlobals(); for (const k of Object.keys(store)) delete store[k]; });

const geminiReply = (text: string) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });

describe('parseJsonObject', () => {
  it('handles fences and prose', () => {
    expect(parseJsonObject('Sure!\n```json\n{"a":1}\n```\nHope that helps')).toEqual({ a: 1 });
  });
  it('rejects non-JSON and truncated JSON with a useful message', () => {
    expect(() => parseJsonObject('I cannot read this')).toThrow(/did not return any JSON/);
    expect(() => parseJsonObject('{"a": [1, 2')).toThrow(/did not return any JSON/);
    expect(() => parseJsonObject('{"a": [1, 2 }')).toThrow(/cut off or malformed/);
  });
});

describe('extractProfileFromResume', () => {
  it('Gemini: sends page images, text, links and a strict schema to the stronger model, then checks the answer', async () => {
    store.lf_ai_settings = { provider: 'gemini', apiKey: 'KEY', model: '' };
    const fetchMock = vi.fn().mockResolvedValue(geminiReply('```json\n' + JSON.stringify(modelJson) + '\n```'));
    vi.stubGlobal('fetch', fetchMock);

    const r = await extractProfileFromResume(source);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('models/gemini-2.5-pro:generateContent');
    expect(url).not.toContain('KEY'); // key must not leak into the URL
    expect(init.headers['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(init.body);
    const parts = body.contents[0].parts;
    expect(parts[0].text).toContain('ada@example.com');
    expect(parts[0].text).toContain('linkedin.com/in/ada');
    expect(parts.slice(1)).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }, { inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } }]);
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0 });
    expect(body.generationConfig.responseJsonSchema.additionalProperties).toBe(false);

    expect(r.model).toBe('gemini-2.5-pro');
    expect(r.usedFallback).toBeUndefined();
    expect(r.data.personalInfo.firstName).toBe('Ada');
    expect(r.data.personalInfo.email).toBe('ada@example.com'); // from the resume text
    expect(r.data.links.linkedinUrl).toBe('https://linkedin.com/in/ada'); // from the hyperlink
    expect(r.data.workExperience[0].isCurrent).toBe(true);
    expect(r.data.skills).toEqual(['Math', 'Poetry']);
    expect(r.data.resume).toBeNull();
  });

  it('OpenAI: sends images as high-detail image parts with a strict json_schema', async () => {
    store.lf_ai_settings = { provider: 'openai', apiKey: 'sk-x', model: 'gpt-4o-mini' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(modelJson) } }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await extractProfileFromResume(source);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-x');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-4o');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA', detail: 'high' } });
    expect(r.data.personalInfo.lastName).toBe('Lovelace');
  });

  it('uses the import model you set in Settings, and never falls back from it', async () => {
    store.lf_ai_settings = { provider: 'gemini', apiKey: 'KEY', model: '', importModel: 'gemini-2.5-flash' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { message: 'model not found' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(extractProfileFromResume(source)).rejects.toThrow(/not found/);
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes('gemini-2.5-flash:'))).toBe(true);
  });

  it('falls back to the everyday model when the key cannot use the stronger one, and says so', async () => {
    store.lf_ai_settings = { provider: 'gemini', apiKey: 'KEY', model: '' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'Quota exceeded for gemini-2.5-pro' } }) })
      .mockResolvedValueOnce(geminiReply(JSON.stringify(modelJson)));
    vi.stubGlobal('fetch', fetchMock);
    const r = await extractProfileFromResume(source);
    expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-2.5-pro');
    expect(String(fetchMock.mock.calls[1][0])).toContain('gemini-2.5-flash');
    expect(r.usedFallback).toBe(true);
    expect(r.model).toBe('gemini-2.5-flash');
  });

  it('retries once when the reply is cut off', async () => {
    store.lf_ai_settings = { provider: 'gemini', apiKey: 'KEY', model: '' };
    const fetchMock = vi.fn().mockResolvedValueOnce(geminiReply('{"personalInfo": {"firstName": "Ad')).mockResolvedValueOnce(geminiReply(JSON.stringify(modelJson)));
    vi.stubGlobal('fetch', fetchMock);
    const r = await extractProfileFromResume(source);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.data.personalInfo.firstName).toBe('Ada');
  });

  it('surfaces the provider error message (bad key)', async () => {
    store.lf_ai_settings = { provider: 'gemini', apiKey: 'bad', model: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } }) }));
    await expect(extractProfileFromResume(source)).rejects.toThrow('API key not valid');
  });

  it('tells you to add a key when none is saved', async () => {
    await expect(extractProfileFromResume(source)).rejects.toThrow(/Add your Gemini or OpenAI API key/);
  });

  it('reports a blocked/empty response clearly', async () => {
    store.lf_ai_settings = { provider: 'gemini', apiKey: 'k', model: '' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'SAFETY' }] }) }));
    await expect(extractProfileFromResume(source)).rejects.toThrow(/returned no text/);
  });
});
