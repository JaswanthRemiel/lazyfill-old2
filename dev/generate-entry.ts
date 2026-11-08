import './mockChrome';
import { startSelection } from '../src/content/selection';

// select the question, as a person would before right-clicking, then open the card
const q = document.getElementById('q')!;
const range = document.createRange();
range.selectNodeContents(q);
getSelection()!.removeAllRanges();
getSelection()!.addRange(range);
window.setTimeout(() => startSelection(), 200);
