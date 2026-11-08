import { buildResumePrompt, RESUME_SCHEMA, RESUME_SYSTEM, verifyResume, type ResumeImport, type ResumeSource } from '../shared/resumeImport';
import { getItem, setItem } from '../shared/storage';
import type { AiSettings } from '../shared/types';

export const DEFAULT_MODELS: Record<AiSettings['provider'], string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
};

/** Used for resume import only: reading a layout takes a stronger model than answering a question does. */
export const IMPORT_MODELS: Record<AiSettings['provider'], string> = {
  gemini: 'gemini-2.5-pro',
  openai: 'gpt-4o',
};

interface LlmInput {
  system: string;
  prompt: string;
  /** page images, sent inline after the prompt */
  images?: { mimeType: string; base64: string }[];
  json?: boolean;
  /** a JSON Schema the reply must follow (strict) */
  schema?: object;
  temperature?: number;
  maxTokens?: number;
  /** use this model instead of the saved one (for the fallback retry) */
  model?: string;
}

async function settings(): Promise<AiSettings> {
  const s = await getItem('lf_ai_settings');
  if (!s?.apiKey) throw new Error('Add your Gemini or OpenAI API key in Settings first.');
  return { ...s, model: s.model || DEFAULT_MODELS[s.provider] };
}

async function httpJson(url: string, init: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Network error. AI features need an internet connection.');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j?.error?.message ?? `AI request failed (HTTP ${res.status})`), { status: res.status });
  return j;
}

export async function callLlm(input: LlmInput): Promise<string> {
  const s = await settings();
  if (input.model) s.model = input.model;
  if (s.provider === 'gemini') {
    const parts: unknown[] = [{ text: input.prompt }];
    for (const img of input.images ?? []) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    const j = await httpJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            ...(input.json || input.schema ? { responseMimeType: 'application/json' } : {}),
            ...(input.schema ? { responseJsonSchema: input.schema } : {}),
            ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
            ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
          },
        }),
      },
    );
    const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
    if (!text) throw new Error('The model returned no text.');
    return text;
  }

  const content: unknown[] = [{ type: 'text', text: input.prompt }];
  for (const img of input.images ?? []) content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'high' } });
  const j = await httpJson('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content },
      ],
      ...(input.schema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'resume', strict: true, schema: input.schema } } }
        : input.json ? { response_format: { type: 'json_object' } } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens ? { max_completion_tokens: input.maxTokens } : {}),
    }),
  });
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error('The model returned no text.');
  return text;
}

/** Model ids the key can use, cheapest class first. */
async function listModels(s: AiSettings): Promise<string[]> {
  if (s.provider === 'gemini') {
    const j = await httpJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': s.apiKey } });
    return (j?.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''));
  }
  const j = await httpJson('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${s.apiKey}` } });
  return (j?.data ?? []).map((m: { id: string }) => m.id);
}

export function pickModel(provider: AiSettings['provider'], models: string[]): string | null {
  const prefs = provider === 'gemini' ? [/flash-lite/, /flash/, /pro/] : [/gpt-4o-mini/, /mini/, /gpt-4o/];
  const usable = models.filter((m) => !/embed|image|tts|audio|vision|live|realtime|moderation|whisper|dall|transcribe|search|preview-\d{2}-\d{2}/i.test(m));
  for (const re of prefs) {
    const hit = usable.filter((m) => re.test(m)).sort().reverse()[0];
    if (hit) return hit;
  }
  return null;
}

/**
 * A 404 on the configured model usually means the provider retired or restricted it. Pick a live model
 * from the key's own list once, retry, and remember it so later calls do not hit the dead name again.
 */
export async function callLlmWithFallback(input: LlmInput): Promise<string> {
  try {
    return await callLlm(input);
  } catch (e) {
    if ((e as { status?: number }).status !== 404 || input.model) throw e;
    const s = await settings();
    let models: string[];
    try { models = await listModels(s); } catch { throw e; }
    const next = pickModel(s.provider, models);
    if (!next || next === s.model) throw e;
    const out = await callLlm({ ...input, model: next });
    await setItem('lf_ai_settings', { ...s, model: next });
    return out;
  }
}

export async function testAi(): Promise<string> {
  return callLlm({ system: 'Reply with the single word: ok', prompt: 'ping' });
}

/** Parses the first JSON object in a model reply, tolerating code fences and surrounding prose. */
export function parseJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('The model did not return any JSON. Try again, or try a different model in Settings.');
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('The model\'s reply was cut off or malformed. Try again, or use a different model in Settings.');
  }
}

/** A model this key cannot use (not found, no access, out of quota): worth trying the everyday model instead. */
const unavailable = (e: unknown) => {
  const status = (e as { status?: number })?.status;
  return status === 403 || status === 404 || status === 429 || /quota|not found|not supported|permission|billing/i.test((e as Error)?.message ?? '');
};

/**
 * Reads a resume from its page images, text layer and links. The stronger import model is tried first; if the key
 * cannot use it the everyday model is used and the result says so. The answer is checked against the resume text
 * before it is returned (see verifyResume).
 */
export async function extractProfileFromResume(src: ResumeSource): Promise<ResumeImport> {
  const s = await settings();
  const explicit = !!(await getItem('lf_ai_settings'))?.importModel?.trim();
  const preferred = (await getItem('lf_ai_settings'))?.importModel?.trim() || IMPORT_MODELS[s.provider];
  const ask = (model: string, temperature: number) =>
    callLlm({
      system: RESUME_SYSTEM,
      prompt: buildResumePrompt(src),
      images: src.images,
      schema: RESUME_SCHEMA,
      temperature,
      maxTokens: s.provider === 'gemini' ? 32000 : 16000,
      model,
    });

  let model = preferred;
  let usedFallback = false;
  const run = async (m: string): Promise<unknown> => {
    // a reply that is cut off or malformed is worth one more try
    try { return parseJsonObject(await ask(m, 0)); } catch (e) {
      if ((e as { status?: number }).status) throw e;
      return parseJsonObject(await ask(m, 0.2));
    }
  };

  let parsed: unknown;
  try {
    parsed = await run(model);
  } catch (e) {
    if (explicit || !unavailable(e) || preferred === s.model) throw e;
    model = s.model;
    usedFallback = true;
    parsed = await run(model);
  }
  const result = verifyResume(parsed, src, model);
  if (usedFallback) result.usedFallback = true;
  return result;
}
