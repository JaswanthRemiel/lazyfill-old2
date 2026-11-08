/** Where a generated answer should go: the answer box that belongs to the question the user selected. */

const BOX = 'textarea, input:not([type]), input[type="text"], input[type="search"]';

const usable = (el: HTMLElement, skipVisibility = false) =>
  !(el as HTMLInputElement).disabled &&
  !(el as HTMLInputElement).readOnly &&
  (skipVisibility || el.getClientRects().length > 0);

/**
 * Starting at the selected text, widen the search one ancestor at a time (up to 8 levels). Inside the first
 * container that holds any answer box, prefer one after the selection in the page, and prefer a textarea.
 */
export function findAnswerBox(from: Node, opts: { skipVisibility?: boolean } = {}): HTMLInputElement | HTMLTextAreaElement | null {
  const start = from.nodeType === 1 ? (from as Element) : from.parentElement;
  for (let node: Element | null = start, up = 0; node && up < 8; node = node.parentElement, up++) {
    const boxes = Array.from(node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(BOX)).filter((b) => usable(b, opts.skipVisibility));
    if (!boxes.length) continue;
    const after = boxes.filter((b) => !!(from.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    const pool = after.length ? after : boxes;
    const textareas = pool.filter((b) => b.tagName === 'TEXTAREA');
    const empty = (list: typeof pool) => list.find((b) => !b.value.trim()) ?? list[0];
    // a lone long-answer box beats the closest small input (name, email) that happens to be nearer
    return empty(textareas.length ? textareas : pool) ?? null;
  }
  return null;
}
