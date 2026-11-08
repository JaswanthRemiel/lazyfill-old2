/**
 * Text and link extraction from a pdf.js page. Kept free of browser APIs so it runs in tests.
 * Links matter: "LinkedIn" in a resume is usually a word with the address hidden behind it.
 */

export interface PdfLink { text: string; url: string }

interface TextItem { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }
interface Annotation { subtype?: string; url?: string; unsafeUrl?: string; rect?: number[] }

export interface PdfPageLike {
  getTextContent(): Promise<{ items: unknown[] }>;
  getAnnotations(): Promise<unknown[]>;
}

const isText = (i: unknown): i is TextItem => !!i && typeof (i as TextItem).str === 'string' && Array.isArray((i as TextItem).transform);

/** Lines in the order the PDF draws them, which is reading order for nearly every generator, columns included. */
export function textFromItems(items: unknown[]): string {
  const lines: string[] = [];
  let line = '';
  let prev: TextItem | null = null;
  for (const raw of items) {
    if (!isText(raw)) continue;
    const it = raw;
    if (prev && it.str) {
      const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < Math.max(2, (prev.height || 8) * 0.4);
      const gap = it.transform[4] - (prev.transform[4] + prev.width);
      if (!sameLine && !prev.hasEOL) { lines.push(line); line = ''; }
      else if (sameLine && gap > (it.height || 8) * 0.18 && line && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' ';
    }
    line += it.str;
    if (it.str) prev = it;
    if (it.hasEOL) { lines.push(line); line = ''; }
  }
  if (line) lines.push(line);
  return lines.map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

/** Each link's visible words (what the reader sees) and its real address. */
export function linksFromAnnotations(annotations: unknown[], items: unknown[]): PdfLink[] {
  const texts = items.filter(isText);
  const out: PdfLink[] = [];
  for (const a of annotations as Annotation[]) {
    const url = a.url ?? a.unsafeUrl;
    if (a.subtype !== 'Link' || !url || !a.rect || a.rect.length < 4) continue;
    const [x1, y1, x2, y2] = a.rect;
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2), bottom = Math.min(y1, y2), top = Math.max(y1, y2);
    const words = texts
      .filter((t) => {
        const cx = t.transform[4] + t.width / 2;
        const cy = t.transform[5] + (t.height || 8) / 2;
        return cx >= lo - 2 && cx <= hi + 2 && cy >= bottom - 2 && cy <= top + 2;
      })
      .map((t) => t.str)
      .join('')
      .trim();
    out.push({ text: words, url });
  }
  return out;
}

export async function readPage(page: PdfPageLike): Promise<{ text: string; links: PdfLink[] }> {
  const content = await page.getTextContent();
  const annotations = await page.getAnnotations().catch(() => []);
  return { text: textFromItems(content.items), links: linksFromAnnotations(annotations, content.items) };
}
