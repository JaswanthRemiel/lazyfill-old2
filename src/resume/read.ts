import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ResumeSource } from '../shared/resumeImport';
import { readPage } from './pdfText';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 4;
/** wide enough for small print to stay legible to a vision model, small enough to keep the request light */
const TARGET_WIDTH = 1500;
const JPEG_QUALITY = 0.86;

const jpeg = (canvas: HTMLCanvasElement) => ({ mimeType: 'image/jpeg', base64: canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] });

export class ResumeReadError extends Error {}

/** Reads a resume PDF or image in the page, so the AI gets what a person would see plus the exact text and links. */
export async function readResume(file: File): Promise<ResumeSource> {
  if (file.type.startsWith('image/')) return readImage(file);
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string })?.name ?? '';
    if (name === 'PasswordException') throw new ResumeReadError('This PDF is password protected. Save an unprotected copy and try again.');
    throw new ResumeReadError('Could not open this PDF. Try exporting it again, or import a PNG or JPG of the resume.');
  }
  try {
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const images: ResumeSource['images'] = [];
    const texts: string[] = [];
    const links: ResumeSource['links'] = [];
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const { text, links: l } = await readPage(page);
      texts.push(text);
      links.push(...l);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, Math.max(1, TARGET_WIDTH / base.width)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff'; // transparent regions would turn black in a JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      images.push(jpeg(canvas));
      page.cleanup();
    }
    return { fileName: file.name, images, text: texts.join('\n\n'), links, pageCount: doc.numPages, truncated: doc.numPages > pages };
  } finally {
    void task.destroy();
  }
}

async function readImage(file: File): Promise<ResumeSource> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, TARGET_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { fileName: file.name, images: [jpeg(canvas)], text: '', links: [], pageCount: 1 };
}
