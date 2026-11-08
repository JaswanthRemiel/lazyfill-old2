/**
 * Jobvite / Talemetry application forms (Material UI). Work history and education are added through
 * "Add New ... History" buttons that open an inline card form; each form is filled by its `autocomplete="tm-form-*"`
 * attributes (or id fragments), month/year selects inside "Start date"/"End date" fieldsets, then closed with Done.
 */
import { parseYearMonth, MONTHS, MONTH_ABBR } from '../../shared/dates';
import type { Education, ProfileData, WorkExperience } from '../../shared/profile';
import { degreeAlternatives } from './entries';
import {
  cityOf, emptyResult, entryBox, findButton, isShown, locationParts, norm, press, record, until, workLabel,
  type SiteResult,
} from './siteKit';
import { chooseNative, setComposed, sameName, sleep } from './sites3Kit';

const COUNTRY_CODES: Record<string, string> = {
  'united states': 'US', 'united states of america': 'US', usa: 'US', us: 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', gb: 'GB',
  india: 'IN', canada: 'CA', australia: 'AU', germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT',
  netherlands: 'NL', ireland: 'IE', singapore: 'SG', china: 'CN', japan: 'JP', brazil: 'BR', mexico: 'MX',
  'south africa': 'ZA', 'new zealand': 'NZ', sweden: 'SE', switzerland: 'CH', poland: 'PL', israel: 'IL',
  'united arab emirates': 'AE', uae: 'AE', pakistan: 'PK', philippines: 'PH', 'south korea': 'KR', korea: 'KR',
  portugal: 'PT', belgium: 'BE', norway: 'NO', denmark: 'DK', finland: 'FI', austria: 'AT', argentina: 'AR',
};

/** Two-letter code for a country name or abbreviation, or '' when unknown. */
export const countryCode = (name: string): string => COUNTRY_CODES[norm(name).replace(/\./g, '')] ?? '';

type Ctl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const shownIn = (root: ParentNode, sel: string): Ctl[] =>
  Array.from(root.querySelectorAll<Ctl>(sel)).filter((e) => isShown(e));

/** A visible control by autocomplete value, else by id fragment. */
function control(root: ParentNode, auto: string, tag: string, frags: string[]): Ctl | null {
  const byAuto = shownIn(root, `${tag}[autocomplete="tm-form-${auto}"]`)[0];
  if (byAuto) return byAuto;
  for (const f of frags) {
    const hit = shownIn(root, `${tag}[id*="${f}" i]`)[0];
    if (hit) return hit;
  }
  return null;
}

function setSelectOrText(el: Ctl | null, values: string[]): boolean {
  if (!el) return false;
  const want = values.filter(Boolean);
  if (!want.length) return false;
  if (el instanceof HTMLSelectElement) return chooseNative(el, want);
  return setComposed(el, want[0]);
}

async function chooseCountry(sel: HTMLSelectElement | null, name: string): Promise<boolean> {
  if (!sel || !name) return false;
  const code = countryCode(name);
  return chooseNative(sel, [code, name].filter(Boolean));
}

async function chooseState(sel: HTMLSelectElement | null, name: string): Promise<boolean> {
  if (!sel || !name) return false;
  // the state list is often loaded after the country is chosen
  await until(() => sel.options.length > 1, 1500, 60);
  return chooseNative(sel, [name]);
}

/** The month/year selects inside the fieldset whose legend says `which` ("start date" / "end date"). */
function dateFieldset(root: ParentNode, which: string): HTMLFieldSetElement | null {
  const sets = Array.from(root.querySelectorAll<HTMLFieldSetElement>('fieldset'));
  return sets.find((f) => {
    const legend = f.querySelector('legend');
    return !!legend && norm(legend.textContent).startsWith(which);
  }) ?? null;
}

function monthYearSelects(fs: HTMLFieldSetElement): { month?: HTMLSelectElement; year?: HTMLSelectElement } {
  const sels = Array.from(fs.querySelectorAll('select'));
  let month: HTMLSelectElement | undefined;
  let year: HTMLSelectElement | undefined;
  for (const s of sels) {
    const box = s.closest('.MuiFormControl-root');
    const label = norm(box?.querySelector('label')?.textContent);
    if (label.startsWith('month')) month = s;
    else if (label.startsWith('year')) year = s;
  }
  // unlabelled pickers: month first, year second
  month ??= sels.find((s) => s !== year && Array.from(s.options).some((o) => /^(jan|1$|01$)/i.test(o.textContent?.trim() ?? '')));
  year ??= sels.find((s) => s !== month);
  return { month, year };
}

function setDate(fs: HTMLFieldSetElement | null, raw: string): boolean {
  const { year, month } = parseYearMonth(raw);
  if (!fs || !year) return false;
  const { month: ms, year: ys } = monthYearSelects(fs);
  let ok = false;
  if (ys) ok = chooseNative(ys, [year]);
  if (!ok) return false;
  if (ms && month) {
    chooseNative(ms, [MONTHS[month - 1], MONTH_ABBR[month - 1], String(month).padStart(2, '0'), String(month)]);
  }
  return true;
}

function toggleSwitch(fs: HTMLFieldSetElement | null): HTMLInputElement | null {
  const sw = fs?.querySelector<HTMLInputElement>('input.MuiSwitch-input') ?? null;
  if (!sw) return null;
  if (sw.checked) return sw;
  const base = (sw.closest('.MuiSwitch-switchBase') as HTMLElement | null) ?? sw;
  press(base);
  if (!sw.checked) sw.click();
  return sw.checked ? sw : null;
}

const doneButton = (root: ParentNode): HTMLElement | null => {
  const icon = root.querySelector('svg[data-testid="DoneIcon"]');
  const btn = icon?.closest('button') as HTMLElement | null;
  if (btn && !(btn as HTMLButtonElement).disabled) return btn;
  return findButton(root, 'done');
};

/** The card form that holds `anchor`: its nearest ancestor that also has a Done button. */
function formRoot(anchor: Element): ParentNode {
  for (let n = anchor.parentElement; n && n !== document.body; n = n.parentElement) {
    if (n.querySelector('svg[data-testid="DoneIcon"]')) return n;
  }
  return entryBox(anchor, anchor.tagName.toLowerCase() + '[autocomplete="' + anchor.getAttribute('autocomplete') + '"]') ?? document.body;
}

const WORK_BTN = 'add new work history';
const EDU_BTN = 'add new education history';

function cardTitles(addBtn: HTMLElement | null, otherBtn: HTMLElement | null): string[] {
  const titles = (root: ParentNode) =>
    Array.from(root.querySelectorAll('[class*="MultiFieldGroupCard-summaryRoot"] [class*="MultiFieldGroupCard-title"], [class*="MultiFieldGroupCard-title"]'))
      .map((t) => norm(t.textContent));
  if (addBtn) {
    for (let n = addBtn.parentElement; n && n !== document.body; n = n.parentElement) {
      if (n.querySelector('[class*="MultiFieldGroupList-root"]')) {
        if (otherBtn && n.contains(otherBtn)) break;
        return titles(n);
      }
    }
  }
  return titles(document);
}

type Form = { root: ParentNode; anchor: Ctl };

async function openForm(add: HTMLElement, anchorAuto: string, frags: string[]): Promise<Form | null> {
  press(add);
  const anchor = await until(() => control(document, anchorAuto, 'input', frags), 3000, 60);
  if (!anchor) return null;
  await sleep(80);
  return { root: formRoot(anchor), anchor };
}

async function closeForm(form: Form): Promise<boolean> {
  const done = doneButton(form.root);
  if (!done) return false;
  press(done);
  const closed = await until(() => !form.anchor.isConnected || !isShown(form.anchor), 2500, 60);
  return !!closed;
}

async function fillCommonPlace(form: Form, place: string, label: string, res: SiteResult, pre: 'work' | 'edu'): Promise<void> {
  const parts = locationParts(place);
  if (!parts.length) return;
  const rec = (key: string, el: Element) => record(res, label, key as `work.location`, el);
  const frag = pre === 'work' ? 'field_wh_' : 'field_eh_';
  const cityEl = control(form.root, 'city', 'input', [`${frag}city`, 'city']);
  if (cityEl && setSelectOrText(cityEl, [cityOf(place)])) rec(`${pre}.location`, cityEl);
  const countryName = parts.length > 1 ? parts[parts.length - 1] : '';
  const countrySel = control(form.root, 'country', 'select', [`${frag}country`, 'country']) as HTMLSelectElement | null;
  let stateName = parts.length > 2 ? parts[1] : '';
  if (countryName) {
    const ok = await chooseCountry(countrySel, countryName);
    // "City, ST" with no country: the last part is more likely a state
    if (!ok && parts.length === 2) stateName = parts[1];
    else if (ok && countrySel) rec(`${pre}.location`, countrySel);
  }
  if (stateName) {
    const stateSel = control(form.root, 'state', 'select', [`${frag}state`, 'state']) as HTMLSelectElement | null;
    if (stateSel && (await chooseState(stateSel, stateName))) rec(`${pre}.location`, stateSel);
  }
}

async function fillWorkForm(job: WorkExperience, form: Form, res: SiteResult): Promise<void> {
  const label = workLabel(job);
  const guard = async (key: `work.${string}`, fn: () => Promise<Element | null | boolean> | Element | null | boolean, el?: Element | null) => {
    try { const r = await fn(); if (r) record(res, label, key, r === true ? el : (r as Element)); } catch (e) { console.debug('jobvite work step failed', key, e); }
  };
  const r = form.root;
  const company = control(r, 'companyName', 'input', ['company_name', 'companyName']);
  await guard('work.company', () => !!company && setSelectOrText(company, [job.companyName]), company);
  const title = control(r, 'title', 'input', ['field_title', 'jobTitle']);
  await guard('work.title', () => !!title && setSelectOrText(title, [job.jobTitle]), title);
  const desc = control(r, 'description', 'textarea', ['description']) ?? control(r, 'description', 'input', ['description']);
  await guard('work.description', () => !!desc && !!job.description && setSelectOrText(desc, [job.description]), desc);
  try { await fillCommonPlace(form, job.location, label, res, 'work'); } catch (e) { console.debug('jobvite place failed', e); }
  const start = dateFieldset(r, 'start date');
  await guard('work.startDate', () => setDate(start, job.startDate), start);
  const endSet = dateFieldset(r, 'end date');
  if (job.isCurrent || !job.endDate) {
    if (job.isCurrent) await guard('work.current', () => toggleSwitch(endSet));
  } else {
    await guard('work.endDate', () => setDate(endSet, job.endDate), endSet);
  }
}

async function fillEduForm(ed: Education, form: Form, res: SiteResult): Promise<void> {
  const label = ed.schoolName;
  const guard = async (key: `edu.${string}`, fn: () => Promise<Element | null | boolean> | Element | null | boolean, el?: Element | null) => {
    try { const r = await fn(); if (r) record(res, label, key, r === true ? el : (r as Element)); } catch (e) { console.debug('jobvite edu step failed', key, e); }
  };
  const r = form.root;
  const school = control(r, 'institution', 'input', ['institution', 'school']);
  await guard('edu.school', () => !!school && setSelectOrText(school, [ed.schoolName]), school);
  const degree = control(r, 'degree', 'select', ['degree']) ?? control(r, 'degree', 'input', ['degree']);
  await guard('edu.degree', () => !!degree && !!ed.degree && setSelectOrText(degree, degreeAlternatives(ed.degree)), degree);
  const major = control(r, 'major', 'input', ['major']) ?? control(r, 'major', 'select', ['major']);
  await guard('edu.field', () => !!major && !!ed.fieldOfStudy && setSelectOrText(major, [ed.fieldOfStudy]), major);
  const start = dateFieldset(r, 'start date');
  await guard('edu.startDate', () => setDate(start, ed.startDate), start);
  const end = dateFieldset(r, 'end date');
  if (!ed.currentlyEnrolled && ed.graduationDate) await guard('edu.endDate', () => setDate(end, ed.graduationDate), end);
}

async function run(
  kind: 'work' | 'edu', p: ProfileData, res: SiteResult,
): Promise<void> {
  const btnText = kind === 'work' ? WORK_BTN : EDU_BTN;
  const other = kind === 'work' ? EDU_BTN : WORK_BTN;
  const names = kind === 'work' ? p.workExperience.map((w) => w.companyName) : p.education.map((e) => e.schoolName);
  const count = names.length;
  for (let i = 0; i < count; i++) {
    const name = names[i];
    if (!name.trim()) continue;
    const add = findButton(document, btnText);
    if (!add) return;
    const titles = cardTitles(add, findButton(document, other));
    if (titles.some((t) => sameName(t, name))) continue;
    const form = await openForm(
      add,
      kind === 'work' ? 'companyName' : 'institution',
      kind === 'work' ? ['company_name', 'companyName'] : ['institution', 'school'],
    );
    if (!form) return;
    try {
      if (kind === 'work') await fillWorkForm(p.workExperience[i], form, res);
      else await fillEduForm(p.education[i], form, res);
    } catch (e) {
      console.debug('jobvite form failed', e);
    }
    if (!(await closeForm(form))) return; // an open, unfinished form blocks the next one
  }
}

export async function jobviteHandler(p: ProfileData): Promise<SiteResult | null> {
  const addWork = findButton(document, WORK_BTN);
  const addEdu = findButton(document, EDU_BTN);
  const tm = document.querySelector('[autocomplete^="tm-form-"]');
  if (!addWork && !addEdu && !tm) return null;
  const res = emptyResult('jobvite');
  if (addWork) { res.work = true; await run('work', p, res); }
  if (addEdu) { res.edu = true; await run('edu', p, res); }
  return res;
}
