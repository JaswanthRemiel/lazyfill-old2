import { readResume } from '../src/resume/read';

const out = document.getElementById('out')!;
document.getElementById('f')!.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files![0];
  const t0 = performance.now();
  try {
    const r = await readResume(file);
    out.textContent = JSON.stringify({
      ms: Math.round(performance.now() - t0), pages: r.pageCount, images: r.images.map((i) => ({ type: i.mimeType, kb: Math.round(i.base64.length * 0.75 / 1024) })),
      textChars: r.text.length, links: r.links, head: r.text.slice(0, 120),
    });
    const box = document.getElementById('imgs')!;
    for (const i of r.images) { const im = new Image(); im.src = `data:${i.mimeType};base64,${i.base64}`; im.style.width = '560px'; box.append(im); }
  } catch (err) { out.textContent = 'ERROR ' + (err as Error).message; }
});
