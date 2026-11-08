// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { linksFromAnnotations, readPage, textFromItems } from './pdfText';

const item = (str: string, x: number, y: number, width = str.length * 5, hasEOL = false) => ({ str, transform: [1, 0, 0, 1, x, y], width, height: 10, hasEOL });

describe('textFromItems', () => {
  it('joins pieces on a line, breaks lines, and spaces separate words', () => {
    const t = textFromItems([item('Software', 10, 700), item('Engineer', 10 + 40 + 4, 700, 40), item('Acme', 10, 680, 20, true), item('Corp', 10, 660)]);
    expect(t).toBe('Software Engineer\nAcme\nCorp');
  });
  it('ignores marked-content items that are not text', () => {
    expect(textFromItems([{ type: 'beginMarkedContent' }, item('Hi', 0, 0)])).toBe('Hi');
  });
});

describe('linksFromAnnotations', () => {
  it('pairs a hidden address with the words drawn on top of it', () => {
    const items = [item('LinkedIn', 20, 500, 40), item('elsewhere', 200, 400, 45)];
    const links = linksFromAnnotations([{ subtype: 'Link', url: 'https://linkedin.com/in/ada', rect: [18, 498, 62, 512] }, { subtype: 'Widget' }], items);
    expect(links).toEqual([{ text: 'LinkedIn', url: 'https://linkedin.com/in/ada' }]);
  });
});

describe('a real two-column designed resume', () => {
  it('extracts every section and the real link addresses', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync('tests/fixtures/two-column.pdf'));
    const doc = await pdfjs.getDocument({ data }).promise;
    expect(doc.numPages).toBe(1);
    const { text, links } = await readPage(await doc.getPage(1));
    for (const s of ['Ada', 'Lovelace', 'ada@example.com', 'Staff Engineer', 'Analytical Engines', 'Difference Co', 'University of London', 'Python']) expect(text).toContain(s);
    const byText = Object.fromEntries(links.map((l) => [l.text, l.url]));
    expect(byText.LinkedIn).toBe('https://www.linkedin.com/in/ada-lovelace');
    expect(byText.GitHub).toBe('https://github.com/ada');
    expect(links.some((l) => l.url.includes('ada.dev'))).toBe(true);
  });
});
