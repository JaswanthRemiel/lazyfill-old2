/**
 * MathWorks profile page: a modal lists work-experience records as table rows; existing rows are filled, saved, and
 * further rows are added for the remaining jobs.
 */
import type { ProfileData, WorkExperience } from '../../shared/profile';
import {
  addNextEntry, dateString, emptyResult, findButton, isEnabled, norm, press, record, setText, type SiteResult, typeInto, workLabel,
} from './siteKit';
import { byId, guard, sameName, shown, sleep } from './sites2Kit';
import { until } from './siteKit';

const rowsNow = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('tr[id^="employment_"]'));
const PREFIX = 'employment_';
const ctl = <T extends HTMLElement>(row: HTMLElement, name: string): T | null =>
  byId<T>(row, `${name}_${row.id.slice(PREFIX.length)}`);

const editButton = (): HTMLElement | null =>
  document.getElementById('edit_employment') ?? findButton(document, 'edit work experience records');
const addButton = (): HTMLElement | null =>
  document.getElementById('add_employment') ?? findButton(document, 'add new work experience record');

function saveButton(): HTMLElement | null {
  const direct = document.getElementById('save_employment') ?? document.querySelector<HTMLElement>('button[id*="save_employment"]');
  if (direct) return direct;
  return document.querySelector<HTMLElement>('.modal.show .btn-primary, [role="dialog"] .btn-primary, dialog .btn-primary');
}

async function save(): Promise<void> {
  const btn = saveButton();
  if (btn && isEnabled(btn)) {
    press(btn);
    await sleep(250); // the modal re-renders its rows after a save
  }
}

function setSelectByText(sel: HTMLSelectElement, text: string): boolean {
  const opts = Array.from(sel.options);
  const i = opts.findIndex((o) => norm(o.textContent) === norm(text));
  if (i < 0) return false;
  if (sel.selectedIndex === i) return true;
  sel.selectedIndex = i;
  sel.dispatchEvent(new Event('input', { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return sel.selectedIndex === i;
}

async function setDate(input: HTMLInputElement, raw: string): Promise<boolean> {
  const want = dateString(raw, 'MM/YYYY');
  if (!want) return false;
  if (input.value === want) return false;
  if (await typeInto(input, want)) return true;
  return setText(input, want);
}

async function fillRow(row: HTMLElement, job: WorkExperience, res: SiteResult): Promise<void> {
  const label = workLabel(job);
  const step = (what: string, fn: () => unknown) => guard(`mathworks ${what}`, fn);
  const employer = ctl<HTMLInputElement>(row, 'employer');
  const title = ctl<HTMLInputElement>(row, 'job_title');
  const type = ctl<HTMLSelectElement>(row, 'employment_type');
  const start = ctl<HTMLInputElement>(row, 'start_date');
  const end = ctl<HTMLInputElement>(row, 'end_date');
  const current = ctl<HTMLInputElement>(row, 'is_current');

  await step('employer', () => { if (employer && job.companyName && setText(employer, job.companyName)) record(res, label, 'work.company', employer); });
  await step('title', () => { if (title && job.jobTitle && setText(title, job.jobTitle)) record(res, label, 'work.title', title); });
  await step('type', () => { if (type && setSelectByText(type, 'Employee')) res.touched.push(type); });
  await step('current', () => {
    if (current && current.checked !== job.isCurrent) current.click();
    if (current && current.checked === job.isCurrent && job.isCurrent) record(res, label, 'work.current', current);
  });
  await step('start', async () => { if (start && (await setDate(start, job.startDate))) record(res, label, 'work.startDate', start); });
  await step('end', async () => {
    if (!end) return;
    if (job.isCurrent) {
      if (end.value && setText(end, '')) res.touched.push(end);
    } else if (await setDate(end, job.endDate)) record(res, label, 'work.endDate', end);
  });
}

/** Fills the MathWorks work-experience modal. Null on other hosts or when the profile has no jobs. */
export async function fillMathWorks(p: ProfileData): Promise<SiteResult | null> {
  if (!/mathworks\.com/i.test(location.hostname)) return null;
  const jobs = p.workExperience.filter((w) => w.companyName.trim());
  if (!jobs.length) return null;
  const edit = editButton();
  if (!rowsNow().length && !edit && !addButton()) return null;

  const res = emptyResult('mathworks');
  if (edit && !rowsNow().some(shown)) {
    press(edit);
    await until(() => rowsNow().some(shown), 2500);
  }

  // phase 1: rows that are already there
  const claimed = new Set<Element>();
  const pending: WorkExperience[] = [];
  const employerOf = (r: HTMLElement) => ctl<HTMLInputElement>(r, 'employer')?.value.trim() ?? '';
  for (const job of jobs) {
    const same = rowsNow().find((r) => !claimed.has(r) && sameName(employerOf(r), job.companyName));
    if (same) { claimed.add(same); continue; }
    const empty = rowsNow().find((r) => !claimed.has(r) && !employerOf(r));
    if (empty) {
      claimed.add(empty);
      await guard('mathworks row', () => fillRow(empty, job, res));
    } else pending.push(job);
  }
  if (res.filled.length) await save();

  // phase 2: one new row per remaining job
  let added = false;
  for (const job of pending) {
    await guard('mathworks add', async () => {
      const add = addButton();
      if (!add || !isEnabled(add)) return;
      const fresh = await addNextEntry(add, rowsNow, 4000);
      if (!fresh) return;
      await until(() => ctl(fresh as HTMLElement, 'employer'), 2000);
      await fillRow(fresh as HTMLElement, job, res);
      added = true;
    });
  }
  if (added) await save();
  res.work = res.filled.length > 0;
  return res;
}
