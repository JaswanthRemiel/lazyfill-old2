/**
 * The small bolt that marks a question lazyfill can remember an answer to. Drawn in a shadow-DOM layer above the page
 * instead of wrapping the input, because moving a field in the DOM can break framework-managed forms.
 */
const HOST_ID = 'lazyfill-hints';
const TEXT_PENDING = 'Type your answer once. lazyfill remembers it for next time.';
const TEXT_SAVED = 'Answer saved. You can edit or delete it in your dashboard.';

interface Hint { el: Element; node: HTMLElement; saved: boolean }
const hints = new Map<Element, Hint>();
let layer: HTMLElement | null = null;
let raf = 0;

const CSS = `
:host{all:initial}
.wrap{position:fixed;inset:0;pointer-events:none;z-index:2147483646}
.h{position:fixed;width:22px;height:22px;display:none;align-items:center;justify-content:center;pointer-events:auto;cursor:help;border-radius:50%;background:#111113;box-shadow:0 1px 3px rgba(0,0,0,.25),0 0 0 1.5px #fff;}
.h svg{width:12px;height:12px}
.tip{position:absolute;right:0;top:calc(100% + 8px);padding:7px 11px;white-space:nowrap;background:#111113;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.25);
  font:500 12px/1 -apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif;letter-spacing:-.01em;color:#fff;pointer-events:none;opacity:0;transform:scale(.92) translateY(-2px);transform-origin:top right;transition:opacity .15s ease,transform .2s cubic-bezier(.22,1,.36,1)}
.h:hover .tip{opacity:1;transform:none}
`;

const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 1.5 4 13.2h6.2L9.3 22.5 20 9.8h-6.4l-.1-8.3Z" fill="#fff"/></svg>';

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><div class="wrap"></div>`;
  document.documentElement.appendChild(host);
  layer = root.querySelector('.wrap') as HTMLElement;
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.setInterval(schedule, 700); // layout shifts without scroll (accordions, async validation)
  return layer;
}

function place(h: Hint) {
  const el = h.el as HTMLElement;
  if (!el.isConnected) { h.node.remove(); hints.delete(h.el); return; }
  const r = el.getBoundingClientRect();
  const visible = r.width > 40 && r.height > 12 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  if (!visible || getComputedStyle(el).visibility === 'hidden') { h.node.style.display = 'none'; return; }
  const multiline = r.height > 60;
  h.node.style.display = 'flex';
  // dropdown arrows and textarea resize handles live at the right edge: sit just left of them
  const inset = el instanceof HTMLSelectElement || multiline ? 46 : 29;
  h.node.style.left = `${Math.round(r.right - inset)}px`;
  h.node.style.top = `${Math.round(multiline ? r.bottom - 29 : r.top + r.height / 2 - 11)}px`;
}

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; hints.forEach(place); });
}

export function setHint(el: Element, saved: boolean) {
  const known = hints.get(el);
  if (known) {
    if (known.saved !== saved) {
      known.saved = saved;
      known.node.classList.toggle('saved', saved);
      known.node.querySelector('.tip')!.textContent = saved ? TEXT_SAVED : TEXT_PENDING;
    }
    return;
  }
  // keep typed text clear of the icon
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const pad = parseInt(getComputedStyle(el).paddingRight, 10) || 0;
    if (pad < 34) el.style.paddingRight = '34px';
  }
  const node = document.createElement('div');
  node.className = `h${saved ? ' saved' : ''}`;
  node.innerHTML = `${BOLT}<span class="tip">${saved ? TEXT_SAVED : TEXT_PENDING}</span>`;
  ensureLayer().appendChild(node);
  hints.set(el, { el, node, saved });
  schedule();
}

export function clearHints() {
  hints.forEach((h) => h.node.remove());
  hints.clear();
}
