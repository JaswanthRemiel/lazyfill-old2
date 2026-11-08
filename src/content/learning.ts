import { normalizeLabel, sameValue, type LearnedMap } from '../shared/learned';
import type { Profile } from '../shared/types';
import { detectAdapter } from './adapters/registry';
import { learnCandidates } from './engine/candidates';
import { detectFields } from './engine/detect';
import { readAnswer, type LearnField } from './engine/learn';
import { setHint } from './hints';

interface Ctx { profile: Profile; scope: string }

let ctx: Ctx | null = null;
let ctxAt = 0;
let learned: LearnedMap = {};
let learnedAt = 0;
const watching = new WeakSet<Element>();

async function context(): Promise<Ctx | null> {
  if (ctx && Date.now() - ctxAt < 15_000) return ctx;
  const r = await chrome.runtime.sendMessage({ action: 'getActiveProfile' }).catch(() => null);
  const profile = r?.data as Profile | null;
  ctxAt = Date.now();
  ctx = profile ? { profile, scope: detectAdapter(new URL(location.href)).id } : null;
  return ctx;
}

export async function loadLearned(force = false): Promise<LearnedMap> {
  const c = await context();
  if (!c) return {};
  if (!force && Date.now() - learnedAt < 5_000) return learned;
  const r = await chrome.runtime.sendMessage({ action: 'getLearned', profileId: c.profile.id, scope: c.scope }).catch(() => null);
  learned = (r?.data as LearnedMap) ?? {};
  learnedAt = Date.now();
  return learned;
}

async function remember(lf: LearnField) {
  const c = await context();
  if (!c) return;
  const answer = readAnswer(lf);
  if (!answer) return;
  const key = normalizeLabel(lf.label);
  const known = (await loadLearned())[key];
  if (known && sameValue(known.value, answer.value)) return; // nothing new

  await chrome.runtime.sendMessage({
    action: 'saveLearned', profileId: c.profile.id, scope: c.scope, label: lf.label,
    entry: { ...answer, originalLabel: lf.label, lastUrl: location.href },
  }).catch(() => {});
  learned = { ...learned, [key]: { ...(known ?? {}), ...answer, originalLabel: lf.label, lastUrl: location.href } as LearnedMap[string] };
  setHint(lf.f.el, true);
}

function watch(lf: LearnField) {
  const els: Element[] = lf.boxes ?? (lf.f.group ?? [lf.f.el]);
  if (els.every((e) => watching.has(e))) return;
  els.forEach((e) => watching.add(e));

  let timer: number | undefined;
  const handler = (e: Event) => {
    // only what the user does: autofill's own events are synthetic
    if (!e.isTrusted) return;
    window.clearTimeout(timer);
    // comboboxes paint their chosen value a moment after the click
    timer = window.setTimeout(() => void remember(lf), lf.kind === 'combobox' ? 350 : 250);
  };
  for (const e of els) {
    e.addEventListener('change', handler, true);
    e.addEventListener('blur', handler, true);
    e.addEventListener('focusout', handler, true);
  }
}

/** Look for questions lazyfill can learn from, watch them, and mark them with the hint icon. */
export async function scanForLearning(): Promise<void> {
  const c = await context();
  if (!c) return;
  const adapter = detectAdapter(new URL(location.href));
  const known = await loadLearned();
  for (const lf of learnCandidates(detectFields(document, { deep: false }), adapter, c.profile.data)) {
    watch(lf);
    if (lf.kind === 'radio' || lf.kind === 'checkboxes') continue; // no single box to hang an icon on
    setHint(lf.f.el, !!known[normalizeLabel(lf.label)]);
  }
}

let started = false;
/** Called once the page looks like an application; keeps watching as the form changes. */
export function startLearning() {
  if (started) return;
  started = true;
  void scanForLearning();
  let timer: number | undefined;
  new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void scanForLearning(), 1200);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
