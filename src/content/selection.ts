import { fillText } from './engine/fill';
import { findAnswerBox } from './answerBox';
import { detectAdapter } from './adapters/registry';
import { extractJobInfo } from './tracking';

const CARD_WIDTH = 360;
const GAP = 8;

interface Selected { text: string; rect: DOMRect | null; anchor: Node }

/** The selected text in this frame, whether it is in the page or inside an input/textarea. */
function currentSelection(): Selected | null {
  const sel = window.getSelection();
  const text = sel?.toString().trim() ?? '';
  if (text && sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const r = range.getBoundingClientRect?.();
    return { text, rect: r && (r.width || r.height) ? r : null, anchor: range.startContainer };
  }
  const a = document.activeElement;
  if ((a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement) && a.selectionStart !== null && a.selectionEnd !== null && a.selectionEnd > a.selectionStart) {
    return { text: a.value.slice(a.selectionStart, a.selectionEnd).trim(), rect: a.getBoundingClientRect(), anchor: a };
  }
  return null;
}

interface Card {
  answer: HTMLElement;
  insert: HTMLButtonElement;
  regenerate: HTMLButtonElement;
  setStatus: (text: string) => void;
  enableInsert: (on: boolean) => void;
  showUndo: (on: boolean) => void;
  undo: HTMLButtonElement;
  place: () => void;
  close: () => void;
}

let openCard: Card | null = null;

function createCard(anchor: () => DOMRect | null, onClose: () => void): Card {
  const width = Math.max(200, Math.min(CARD_WIDTH, window.innerWidth - GAP * 2));
  const host = document.createElement('div');
  host.setAttribute('data-lazyfill-ignore', '');
  host.style.cssText = `all: initial; position: fixed; z-index: 2147483647; display: block; width: ${width}px;`;
  const root = host.attachShadow({ mode: 'closed' });

  const css = document.createElement('style');
  css.textContent = `
    .card { box-sizing: border-box; width: 100%; padding: 14px; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif; letter-spacing: -0.01em;
      color: #111113; background: rgba(255,255,255,.92); backdrop-filter: blur(20px) saturate(1.4); border: 1px solid rgba(0,0,0,.08); border-radius: 18px; box-shadow: 0 18px 48px rgba(0,0,0,.22); }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .brand { font-size: 12px; font-weight: 600; color: #6e6e73; }
    button { font: inherit; cursor: pointer; }
    .x { border: 0; background: transparent; font-size: 18px; line-height: 1; color: #6e6e73; padding: 0 2px; }
    .status { color: #6e6e73; margin-bottom: 6px; }
    .answer { white-space: pre-wrap; max-height: 240px; overflow: auto; min-height: 16px; }
    .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; }
    .primary { border: 0; border-radius: 99px; background: #111113; color: #fff; padding: 7px 16px; font-weight: 500; }
    .primary:disabled { opacity: .35; cursor: default; }
    .link { border: 0; background: transparent; color: #6e6e73; padding: 6px 2px; }
    .link:hover { color: #111113; }
    .link:disabled { opacity: .45; cursor: default; }
    @media (prefers-color-scheme: dark) {
      .card { color: #f5f5f7; background: rgba(28,28,30,.92); border-color: rgba(255,255,255,.12); }
      .brand, .x, .status, .link { color: #98989f; } .link:hover { color: #f5f5f7; }
      .primary { background: #f5f5f7; color: #000; }
    }`;

  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Generate with lazyfill');

  const head = document.createElement('div');
  head.className = 'head';
  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = 'Generate with lazyfill';
  const x = document.createElement('button');
  x.className = 'x';
  x.type = 'button';
  x.textContent = '×';
  x.setAttribute('aria-label', 'Close');
  head.append(brand, x);

  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');
  const answer = document.createElement('div');
  answer.className = 'answer';
  answer.setAttribute('aria-live', 'polite');

  const foot = document.createElement('div');
  foot.className = 'foot';
  const insert = document.createElement('button');
  insert.className = 'primary';
  insert.type = 'button';
  insert.textContent = 'Insert this answer';
  const regenerate = document.createElement('button');
  regenerate.className = 'link';
  regenerate.type = 'button';
  regenerate.textContent = 'Regenerate';
  const undo = document.createElement('button');
  undo.className = 'link';
  undo.type = 'button';
  undo.textContent = 'Undo';
  undo.style.display = 'none';
  foot.append(insert, regenerate, undo);

  card.append(head, status, answer, foot);
  root.append(css, card);
  (document.body ?? document.documentElement).append(host);

  const setStatus = (text: string) => { status.textContent = text; status.style.display = text ? 'block' : 'none'; };
  const enableInsert = (on: boolean) => { insert.disabled = !on; };
  const showUndo = (on: boolean) => { undo.style.display = on ? 'inline' : 'none'; insert.style.display = on ? 'none' : ''; regenerate.style.display = on ? 'none' : ''; };

  const place = () => {
    try {
      const a = anchor();
      const r = a && (a.width || a.height) ? a : { left: GAP, right: GAP, top: GAP, bottom: GAP };
      const box = host.getBoundingClientRect();
      const left = Math.min(Math.max(GAP, r.left), Math.max(GAP, window.innerWidth - box.width - GAP));
      let top = r.bottom + GAP;
      if (top + box.height > window.innerHeight - GAP) top = Math.max(GAP, r.top - box.height - GAP);
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
    } catch { /* the selection went away */ }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  function close() {
    host.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
    onClose();
  }
  x.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);

  setStatus('Writing an answer...');
  enableInsert(false);
  regenerate.disabled = true;
  return { answer, insert, regenerate, undo, setStatus, enableInsert, showUndo, place, close };
}

interface GenerateReply { ok: boolean; answer?: string; source?: 'ai' | 'saved'; error?: string; sensitive?: boolean }

/** Context menu "Generate with lazyfill": show the card next to the selection. Does nothing when this frame has no selection. */
export function startSelection(): boolean {
  const sel = currentSelection();
  if (!sel) return false;

  const question = sel.text.slice(0, 4000);
  const target = findAnswerBox(sel.anchor);
  openCard?.close();

  const card: Card = createCard(() => sel.rect, () => { if (openCard === card) openCard = null; });
  openCard = card;
  let answer = '';
  let busy = false;
  let undoTo: { box: HTMLInputElement | HTMLTextAreaElement; value: string } | null = null;

  const generate = async (again: boolean) => {
    if (busy) return;
    busy = true;
    card.regenerate.disabled = true;
    card.enableInsert(false);
    card.setStatus(again ? 'Writing another answer...' : 'Writing an answer...');
    card.place();
    try {
      const job = extractJobInfo(detectAdapter(new URL(location.href)).id);
      const r = await chrome.runtime.sendMessage({
        action: 'generateAnswer',
        question,
        job: { title: job.jobTitle, company: job.company, description: job.description ?? '' },
      }) as { success: boolean; data?: GenerateReply; error?: string } | undefined;
      const res = r?.data;
      if (!r?.success || !res) throw new Error(r?.error || 'no response');
      if (res.ok && res.answer) {
        answer = res.answer;
        card.answer.textContent = answer;
        card.setStatus(res.source === 'saved' ? 'From your saved answers' : target ? '' : 'No answer box found next to this question. Copy the answer or click into the box and try again.');
        card.enableInsert(!!target);
        // a saved answer is the same every time, so there is nothing to regenerate
        card.regenerate.style.display = res.source === 'saved' ? 'none' : '';
      } else {
        answer = '';
        card.answer.textContent = '';
        card.setStatus(res.error ?? 'Could not write an answer.');
        if (res.sensitive) card.regenerate.style.display = 'none';
      }
    } catch (e) {
      answer = '';
      card.answer.textContent = '';
      card.setStatus(e instanceof Error && e.message && e.message !== 'no response' ? e.message : 'Could not reach lazyfill. Reload the page and try again.');
    } finally {
      busy = false;
      card.regenerate.disabled = false;
      card.place();
    }
  };

  card.insert.addEventListener('click', () => {
    if (!answer || !target || busy) return;
    undoTo = { box: target, value: target.value };
    if (!fillText(target, answer)) {
      undoTo = null;
      card.setStatus('The site did not accept the answer. Copy it from here instead.');
      return;
    }
    target.scrollIntoView?.({ block: 'center' });
    card.setStatus('Inserted.');
    card.showUndo(true);
    card.place();
    window.setTimeout(() => { if (openCard === card) card.close(); }, 10000);
  });
  card.undo.addEventListener('click', () => {
    if (undoTo) fillText(undoTo.box, undoTo.value);
    card.close();
  });
  card.regenerate.addEventListener('click', () => { void generate(true); });

  card.place();
  void generate(false);
  return true;
}
