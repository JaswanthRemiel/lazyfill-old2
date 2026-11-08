import { beforeEach, describe, expect, it } from 'vitest';
import {
  addNextEntry, cityOf, countryOf, dateString, deepQuery, deepQueryAll, emptyResult, entryBox, findButton, fire, isEnabled,
  isShown, locationParts, mergeResults, monthNameOf, norm, pickOption, pressKey, record, setText, textOf, typeInto,
  visibleOptions, workLabel,
} from './siteKit';

beforeEach(() => { document.body.innerHTML = ''; });

describe('text helpers', () => {
  it('norm collapses whitespace, trims and lower-cases', () => {
    expect(norm('  Hello \n  World ')).toBe('hello world');
    expect(norm(null)).toBe('');
  });
  it('textOf prefers aria-label, uses value for input buttons', () => {
    document.body.innerHTML = '<button id="a" aria-label=" Add  Job ">x</button><button id="b"> Save </button><input id="c" type="button" value="Go">';
    expect(textOf(document.getElementById('a')!)).toBe('add job');
    expect(textOf(document.getElementById('b')!)).toBe('save');
    expect(textOf(document.getElementById('c')!)).toBe('go');
  });
  it('isShown honours skip, hidden ancestors and layout', () => {
    document.body.innerHTML = '<div hidden><b id="h">x</b></div><b id="v">y</b>';
    const v = document.getElementById('v')!;
    expect(isShown(v)).toBe(false); // jsdom has no layout
    expect(isShown(v, true)).toBe(true);
    v.getClientRects = () => [{}] as unknown as DOMRectList;
    expect(isShown(v)).toBe(true);
    const h = document.getElementById('h')!;
    h.getClientRects = () => [{}] as unknown as DOMRectList;
    expect(isShown(h)).toBe(false);
  });
  it('isEnabled', () => {
    document.body.innerHTML = '<button id="a" disabled></button><div id="b" aria-disabled="true"></div><button id="c"></button>';
    expect(['a', 'b', 'c'].map((i) => isEnabled(document.getElementById(i)!))).toEqual([false, false, true]);
  });
});

describe('events and writing', () => {
  it('fire dispatches each event, composed and bubbling', () => {
    const seen: string[] = [];
    document.body.addEventListener('foo', (e) => seen.push(`${e.type}:${e.composed}`));
    document.body.addEventListener('bar', (e) => seen.push(e.type));
    fire(document.body.appendChild(document.createElement('i')), ['foo', 'bar']);
    expect(seen).toEqual(['foo:true', 'bar']);
  });
  it('pressKey sends keydown, keypress, keyup with legacy codes', () => {
    const el = document.body.appendChild(document.createElement('input'));
    const log: string[] = [];
    for (const t of ['keydown', 'keypress', 'keyup']) {
      el.addEventListener(t, (e) => { const k = e as KeyboardEvent; log.push(`${t}:${k.key}:${k.code}:${k.keyCode}:${k.which}:${k.charCode}`); });
    }
    pressKey(el, 'Enter');
    expect(log).toEqual(['keydown:Enter:Enter:13:13:0', 'keypress:Enter:Enter:13:13:13', 'keyup:Enter:Enter:13:13:0']);
  });
  it('setText writes through the native setter and reports success', () => {
    document.body.innerHTML = '<input id="a"><input id="b" type="number">';
    const a = document.getElementById('a') as HTMLInputElement;
    const events: string[] = [];
    ['input', 'change', 'blur'].forEach((t) => a.addEventListener(t, () => events.push(t)));
    expect(setText(a, 'hello')).toBe(true);
    expect(a.value).toBe('hello');
    expect(events).toEqual(['input', 'change', 'blur']);
    expect(setText(document.getElementById('b') as HTMLInputElement, 'abc')).toBe(false);
  });
  it('typeInto types char by char, firing key and input events, and verifies', async () => {
    document.body.innerHTML = '<input id="a">';
    const a = document.getElementById('a') as HTMLInputElement;
    const log: string[] = [];
    a.addEventListener('keydown', (e) => log.push(`d${(e as KeyboardEvent).key}`));
    a.addEventListener('input', () => log.push(`i${a.value}`));
    expect(await typeInto(a, '03/2021', { delayMs: 0 })).toBe(true);
    expect(a.value).toBe('03/2021');
    expect(log.slice(0, 4)).toEqual(['d0', 'i0', 'd3', 'i03']);
  });
  it('typeInto clears first and copes with a mask that inserts the separator', async () => {
    document.body.innerHTML = '<input id="a" value="old">';
    const a = document.getElementById('a') as HTMLInputElement;
    a.addEventListener('input', () => { if (/^\d{2}$/.test(a.value)) a.value += '/'; });
    expect(await typeInto(a, '03/2021', { delayMs: 0 })).toBe(true);
    expect(a.value).toBe('03/2021');
  });
  it('typeInto reports failure when the control rejects the text', async () => {
    document.body.innerHTML = '<input id="a">';
    const a = document.getElementById('a') as HTMLInputElement;
    a.addEventListener('input', () => { a.value = a.value.replace(/\D/g, ''); a.value = a.value.slice(0, 2); });
    expect(await typeInto(a, '03/2021', { delayMs: 0 })).toBe(false);
  });
});

describe('dates and places', () => {
  it.each([
    ['2021-03', 'MM/YYYY', '03/2021'], ['2021-03', 'MM-YYYY', '03-2021'], ['2021-03', 'YYYY/MM', '2021/03'], ['2021-03', 'YYYY-MM', '2021-03'],
    ['March 2021', 'MM/YYYY', '03/2021'], ['2021', 'MM/YYYY', ''], ['', 'YYYY-MM', ''], ['junk', 'MM/YYYY', ''],
  ] as const)('dateString(%s, %s)', (raw, style, out) => expect(dateString(raw, style)).toBe(out));
  it('monthNameOf', () => { expect(monthNameOf('2018-09')).toBe('September'); expect(monthNameOf('2018')).toBe(''); });
  it('location helpers', () => {
    expect(locationParts(' Austin, TX , United States ')).toEqual(['Austin', 'TX', 'United States']);
    expect(cityOf('Austin, TX, United States')).toBe('Austin');
    expect(countryOf('Austin, TX, United States')).toBe('United States');
    expect(countryOf('London')).toBe('');
    expect(cityOf('')).toBe('');
  });
});

describe('option lists', () => {
  const opts = (...t: string[]) => t.map((x) => { const d = document.createElement('div'); d.textContent = x; d.setAttribute('role', 'option'); document.body.appendChild(d); return d; });
  it('prefers an exact match, then containment either way, then the first', () => {
    const list = opts('Acme Corporation', 'Acme', 'Other');
    const clicked: string[] = [];
    list.forEach((o) => o.addEventListener('click', () => clicked.push(o.textContent!)));
    expect(pickOption(list, 'acme')?.textContent).toBe('Acme');
    expect(pickOption(list, 'Acme Corporation Ltd')?.textContent).toBe('Acme Corporation');
    expect(pickOption(list, 'zzz')?.textContent).toBe('Acme Corporation');
    expect(clicked).toEqual(['Acme', 'Acme Corporation', 'Acme Corporation']);
  });
  it('tries each wanted spelling in order', () => {
    const list = opts("Bachelor's", 'PhD');
    expect(pickOption(list, ['Doctorate', 'PhD'], { strict: true })?.textContent).toBe('PhD');
  });
  it('strict means no match, no click', () => {
    const list = opts('A', 'B');
    let clicks = 0;
    list.forEach((o) => o.addEventListener('click', () => clicks++));
    expect(pickOption(list, 'zzz', { strict: true })).toBeNull();
    expect(clicks).toBe(0);
    expect(pickOption(list, 'B', { click: false })?.textContent).toBe('B');
    expect(clicks).toBe(0);
  });
  it('skips "no results" placeholders and empty items', () => {
    const list = opts('No results found', '', 'Real');
    expect(pickOption(list, 'whatever')?.textContent).toBe('Real');
    expect(pickOption(opts('No items'), 'x')).toBeNull();
    expect(pickOption([], 'x')).toBeNull();
  });
  it('visibleOptions filters by selector, placeholders and visibility', () => {
    document.body.innerHTML = '<ul><li role="option">One</li><li role="option">No results</li><li role="option">Two</li><li>Three</li></ul>';
    expect(visibleOptions(document, '[role="option"]', true).map((o) => o.textContent)).toEqual(['One', 'Two']);
    expect(visibleOptions(document, '[role="option"]')).toEqual([]); // nothing is laid out in jsdom
  });
});

describe('entries', () => {
  it('entryBox is the largest ancestor with a single anchor', () => {
    document.body.innerHTML = `<div id="all"><div id="e1" class="box"><div><input class="co"><input id="x"></div></div><div id="e2" class="box"><div><input class="co"><input id="y"></div></div></div>`;
    expect(entryBox(document.getElementById('x')!, '.co')?.id).toBe('e1');
    expect(entryBox(document.getElementById('y')!, '.co')?.id).toBe('e2');
    expect(entryBox(document.getElementById('x')!, '.nothing')).toBeNull();
  });
  it('entryBox gives the whole container for a single entry', () => {
    document.body.innerHTML = '<section id="s"><input class="co" id="x"></section>';
    expect(entryBox(document.getElementById('x')!, '.co')?.id).toBe('s');
  });
  it('addNextEntry clicks and returns the new entry', async () => {
    document.body.innerHTML = '<div id="list"><p class="e"></p></div><button id="add">Add</button>';
    document.getElementById('add')!.addEventListener('click', () => setTimeout(() => document.getElementById('list')!.insertAdjacentHTML('beforeend', '<p class="e" id="new"></p>'), 50));
    const e = await addNextEntry(document.getElementById('add')!, () => Array.from(document.querySelectorAll('.e')), 1000);
    expect(e?.id).toBe('new');
  });
  it('addNextEntry gives up after the timeout', async () => {
    document.body.innerHTML = '<div class="e"></div><button id="add">Add</button>';
    const t = Date.now();
    expect(await addNextEntry(document.getElementById('add')!, () => Array.from(document.querySelectorAll('.e')), 200)).toBeNull();
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe('findButton', () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="a" aria-label="Add another job">+</button><button id="b" disabled>Add job</button>
      <a id="c" href="#">Add</a><div role="button" id="d">Add education</div><button id="e">Save</button>`;
  });
  it('matches aria-label or text, enabled only', () => {
    expect(findButton(document, 'add another job')?.id).toBe('a');
    expect(findButton(document, 'Add job')).toBeNull(); // the only button with that text is disabled
  });
  it('exact before containment', () => {
    expect(findButton(document, 'add')?.id).toBe('c');
    expect(findButton(document, 'educ')?.id).toBe('d');
    expect(findButton(document, 'educ', { exact: true })).toBeNull();
  });
  it('accepts a list of labels and regexes', () => {
    expect(findButton(document, ['nothing', /^save$/])?.id).toBe('e');
    expect(findButton(document, 'zzz')).toBeNull();
  });
  it('can require visibility', () => {
    expect(findButton(document, 'save', { visible: true })).toBeNull();
  });
});

describe('shadow dom', () => {
  it('deepQuery looks inside open shadow roots, nested too', () => {
    document.body.innerHTML = '<div id="h1"></div><b class="t" id="light"></b>';
    const r1 = document.getElementById('h1')!.attachShadow({ mode: 'open' });
    r1.innerHTML = '<div id="h2"></div><i class="t" id="mid"></i>';
    const r2 = r1.getElementById('h2')!.attachShadow({ mode: 'open' });
    r2.innerHTML = '<u class="t" id="deep"></u>';
    expect(deepQueryAll(document, '.t').map((e) => e.id).sort()).toEqual(['deep', 'light', 'mid']);
    expect(deepQuery(document, '#deep')?.id).toBe('deep');
    expect(deepQuery(document, '#nope')).toBeNull();
  });
});

describe('results', () => {
  it('emptyResult and record', () => {
    const r = emptyResult('Test');
    const el = document.createElement('input');
    record(r, 'Eng @ Acme', 'work.company', el);
    record(r, 'Eng @ Acme', 'work.company', el);
    record(r, 'Eng @ Acme', 'work.title');
    expect(r).toEqual({ name: 'Test', filled: [{ label: 'Eng @ Acme', key: 'work.company' }, { label: 'Eng @ Acme', key: 'work.title' }], touched: [el], work: false, edu: false });
  });
  it('mergeResults joins names, concatenates and ORs flags', () => {
    const a = emptyResult('A'); a.work = true; record(a, 'x', 'work.title', document.body);
    const b = emptyResult('B'); b.edu = true; record(b, 'y', 'edu.school');
    const m = mergeResults([a, b])!;
    expect(m.name).toBe('A+B');
    expect(m.filled.map((f) => f.key)).toEqual(['work.title', 'edu.school']);
    expect(m.touched).toEqual([document.body]);
    expect([m.work, m.edu]).toEqual([true, true]);
    expect(mergeResults([])).toBeNull();
  });
  it('workLabel', () => { expect(workLabel({ jobTitle: 'Engineer', companyName: 'Acme' })).toBe('Engineer @ Acme'); });
});
