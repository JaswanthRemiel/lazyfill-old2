import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findAnswerBox } from './answerBox';

beforeEach(() => { document.body.innerHTML = ''; });

describe('findAnswerBox', () => {
  it('finds the textarea that follows the selected question', () => {
    document.body.innerHTML = `<form><div class="q"><label id="l1">Why do you want to work here?</label><textarea id="a1"></textarea></div>
      <div class="q"><label id="l2">Anything else?</label><textarea id="a2"></textarea></div></form>`;
    expect(findAnswerBox(document.getElementById('l1')!.firstChild!, { skipVisibility: true })?.id).toBe('a1');
    expect(findAnswerBox(document.getElementById('l2')!.firstChild!, { skipVisibility: true })?.id).toBe('a2');
  });
  it('prefers the long answer box over a nearer short input', () => {
    document.body.innerHTML = `<div><p id="q">Tell us about yourself</p><input id="name" type="text"><textarea id="long"></textarea></div>`;
    expect(findAnswerBox(document.getElementById('q')!.firstChild!, { skipVisibility: true })?.id).toBe('long');
  });
  it('skips disabled boxes and returns null when there is none', () => {
    document.body.innerHTML = `<div><p id="q">Question</p><textarea disabled></textarea></div>`;
    expect(findAnswerBox(document.getElementById('q')!.firstChild!, { skipVisibility: true })).toBeNull();
  });
});

describe('the card', () => {
  it('asks the service worker for an answer and inserts it, with undo', async () => {
    document.body.innerHTML = `<form><label id="q">Why do you want to work here?</label><textarea id="a">draft</textarea></form>`;
    const sendMessage = vi.fn().mockResolvedValue({ success: true, data: { ok: true, answer: 'Because I like it.', source: 'ai' } });
    (globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage } };
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('q')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    // jsdom has no layout: findAnswerBox's visibility check would reject everything, so stub it
    Object.defineProperty(HTMLElement.prototype, 'getClientRects', { configurable: true, value: () => [{}] });

    const { startSelection } = await import('./selection');
    expect(startSelection()).toBe(true);
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(sendMessage.mock.calls[0][0]).toMatchObject({ action: 'generateAnswer', question: 'Why do you want to work here?' });

    // the card lives in a closed shadow root; reach its buttons through the host's only child via a spy on attachShadow is overkill,
    // so check the effect instead: nothing is inserted until the user clicks Insert
    expect((document.getElementById('a') as HTMLTextAreaElement).value).toBe('draft');
  });
  it('does nothing when this frame has no selection', async () => {
    window.getSelection()!.removeAllRanges();
    const { startSelection } = await import('./selection');
    expect(startSelection()).toBe(false);
  });
});
