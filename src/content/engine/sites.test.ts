import { beforeEach, describe, expect, it, vi } from 'vitest';
import { b2Profile } from './siteFixtures';
import { emptyResult, type SiteResult } from './siteKit';

const fakes = vi.hoisted(() => ({ b3: [] as Array<(p: unknown) => Promise<unknown>>, b4: [] as Array<(p: unknown) => Promise<unknown>> }));
vi.mock('./sites2', () => ({ formWidgetHandlers: fakes.b3 }));
vi.mock('./sites3', () => ({ atsHandlers: fakes.b4 }));

import { fillSiteSpecific } from './sites';

const fake = (name: string, over: Partial<SiteResult> = {}) => async () => ({ ...emptyResult(name), ...over });

beforeEach(() => {
  document.body.innerHTML = '';
  fakes.b3.length = 0;
  fakes.b4.length = 0;
});

describe('fillSiteSpecific', () => {
  it('returns null on a page no handler recognises', async () => {
    document.body.innerHTML = '<form><input id="a"></form>';
    expect(await fillSiteSpecific(b2Profile())).toBeNull();
  });

  it('merges every handler that recognised the page, from sites2 and sites3 too', async () => {
    const el1 = document.createElement('i'), el2 = document.createElement('b');
    fakes.b3.push(fake('one', { work: true, filled: [{ label: 'a', key: 'work.title' }], touched: [el1] }));
    fakes.b4.push(async () => null, fake('two', { edu: true, filled: [{ label: 'b', key: 'edu.school' }], touched: [el2] }));
    const r = await fillSiteSpecific(b2Profile());
    expect(r?.name).toBe('one+two');
    expect(r?.work).toBe(true);
    expect(r?.edu).toBe(true);
    expect(r?.filled.map((f) => f.key)).toEqual(['work.title', 'edu.school']);
    expect(r?.touched).toEqual([el1, el2]);
  });

  it('logs and skips a handler that throws, without stopping the others', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    fakes.b3.push(async () => { throw new Error('boom'); });
    fakes.b4.push(fake('ok'));
    const r = await fillSiteSpecific(b2Profile());
    expect(r?.name).toBe('ok');
    expect(debug).toHaveBeenCalled();
    debug.mockRestore();
  });

  it('runs the built-in handlers: ByteDance markup is recognised', async () => {
    document.body.innerHTML = '<div id="formily-item-education_list"></div>';
    const r = await fillSiteSpecific(b2Profile());
    expect(r?.name).toBe('bytedance');
    expect(r?.edu).toBe(true);
    expect(r?.work).toBe(false);
  });

  it('ignores Google-looking markup on a non-Google host', async () => {
    document.body.innerHTML = '<input aria-label="Employer name"><input aria-label="Job title">';
    expect(await fillSiteSpecific(b2Profile())).toBeNull();
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('ignores a Meta-looking page with no employer button', async () => {
    document.body.innerHTML = '<button role="combobox" aria-label="Position">Position</button>';
    expect(await fillSiteSpecific(b2Profile())).toBeNull();
  });
});
