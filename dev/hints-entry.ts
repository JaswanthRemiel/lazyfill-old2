import { setHint } from '../src/content/hints';
setHint(document.getElementById('a')!, false);
setHint(document.getElementById('b')!, true);   // already learned
setHint(document.getElementById('c')!, false);
setHint(document.getElementById('d')!, false);
// show one tooltip as if hovered
requestAnimationFrame(() => setTimeout(() => {
  const root = document.getElementById('lazyfill-hints')!.shadowRoot!;
  const tip = root.querySelectorAll<HTMLElement>('.tip')[2];
  tip.style.opacity = '1'; tip.style.transform = 'scale(1)';
}, 100));
