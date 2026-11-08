# Clean-room specification: site-specific form fillers

This directory is a clean-room workspace. You are implementing modules that were deliberately removed from it. This
document is the only description of them you will receive.

## 0. Rules (read first, they are not optional)

1. Work only inside this directory. Do not read, list, search, copy from or run anything in
   the original checkout of this project, any other checkout of this project, any git history, any `graft/`, `.trail/` or
   `docs/` folder, `~/.claude`, or any transcript. If you notice a path outside this directory that might contain
   earlier versions of these modules, do not open it and say so in your report.
2. Do not try to recreate earlier implementations from memory, from compiled output, or from anything you might have
   seen elsewhere. Design and write your own code. Choose your own internal names, structure, algorithms, timeouts and
   comments. Only the names in section 3 (the public contract) are fixed.
3. Sections 4 and 5 are facts about third-party web pages (what their markup looks like) and the behaviour the user
   needs. Treat them as requirements and interoperability facts, not as a design to follow.
4. Do not edit the existing files listed in section 2 as "kept". If you believe one needs a change, say so in your
   report instead. Existing tests must keep passing without modification. You may add new test files.
5. Plain ASCII in source and comments. No emoji, no em dashes, no en dashes (use "-" or words). No personal data in
   fixtures: use fictional names.
6. The markup facts below were recorded from the sites over time and are NOT verified against live pages by this
   process. Prefer the more stable hooks (ARIA labels, data-* attributes, ids with meaningful names) over generated
   class names, and where a fact is marked "fragile" add a graceful fallback. A handler that does not recognise the
   page must do nothing and return `null`.

## 1. What this code is

lazyfill is a Chrome extension. Its content script fills job-application forms from a saved profile. The generic engine
(label matching, filling inputs, selects, comboboxes) already exists. This work covers the parts that deal with
repeating "work experience" and "education" sections, and with career sites whose forms use custom widgets that
generic label matching cannot drive.

Tests run with vitest in jsdom: `npx vitest run` (from this directory). Type checking: `npx tsc --noEmit -p .`
(some include paths in tsconfig do not exist here, which is fine; only errors in `src/` matter).

## 2. Files

Kept, read freely, do not modify: everything under `src/` that exists now, notably `src/content/engine/types.ts`,
`detect.ts`, `fill.ts`, `match.ts`, `options.ts`, `values.ts`, `repeaters.ts` (it exports `press` and `until`),
`run.ts` (shows how your modules are called), `src/shared/profile.ts`, `src/shared/dates.ts`, and the tests
`entries.test.ts`, `engine.test.ts`, `learn.test.ts`.

To write (they do not exist yet):

| File | Phase | Contents |
|---|---|---|
| `src/content/engine/entries.ts` | A | Section/entry classification and filling for generic repeating sections. |
| `src/content/engine/siteKit.ts` | A | Small shared DOM helpers for the site modules (you design the API, see 3.2). |
| `src/content/engine/workday.ts` | B1 | Workday "My Experience" page. |
| `src/content/engine/sites.ts` | B2 | Entry point `fillSiteSpecific` plus Meta, Google (work), ByteDance/TikTok handlers. |
| `src/content/engine/sites2.ts` | B3 | Avature, MathWorks, SAP UI5, Meta education, Google education. |
| `src/content/engine/sites3.ts` | B4 | SmartRecruiters, Jobvite/Talemetry, Workable. |

Phase A must be finished before phase B starts, because phase B modules import `siteKit.ts` and `entries.ts`.
Each B module may be split into more files if that makes it cleaner, but the public names in section 3 must exist.

## 3. Public contract

### 3.1 `entries.ts` (used by `run.ts`, `repeaters.ts`, `candidates.ts` and tests)

```ts
export type EntryKind = 'work' | 'edu';
export type EntryKey =
  | 'work.title' | 'work.company' | 'work.location' | 'work.startMonth' | 'work.startYear' | 'work.startDate'
  | 'work.endMonth' | 'work.endYear' | 'work.endDate' | 'work.current' | 'work.description'
  | 'edu.school' | 'edu.degree' | 'edu.field' | 'edu.gpa' | 'edu.startMonth' | 'edu.startYear' | 'edu.startDate'
  | 'edu.endMonth' | 'edu.endYear' | 'edu.endDate' | 'edu.current';
export interface EntryField { f: FieldInfo; kind: EntryKind; key: EntryKey; index: number }

export const wait: (ms: number) => Promise<unknown>;
export function sectionOf(el: Element): EntryKind | null;
export function entryKeyOf(f: FieldInfo, kind: EntryKind): EntryKey | null;
export function classifyEntryFields(fields: FieldInfo[]): EntryField[];
export function entryValue(key: EntryKey, p: ProfileData, index: number): string;
export function degreeAlternatives(degree: string): string[];
export function fillEntryField(ef: EntryField, p: ProfileData): Promise<'ok' | 'skip'>;
export function addButtonsFor(kind: EntryKind, near: Element | null, opts: DetectOptions): HTMLElement[];
export function ensureEntryCount(kind: EntryKind, needed: number, opts?: DetectOptions, root?: ParentNode): Promise<number>;
```

Behaviour (the existing tests in `entries.test.ts` and `engine.test.ts` are the executable definition; read them
first and make them pass unmodified; the list below adds what they do not spell out):

- `classifyEntryFields`: for every detected field that belongs to a work or education entry, say which entry kind,
  which `EntryKey`, and which entry index (0-based). Entry numbering comes from numbers in ids/names when they form a
  clean sequence for the entry's anchor field (company for work, school for education), starting at 0 or 1 (normalise
  to 0); otherwise from order of appearance (the nth company-like field is entry n). Ignore file inputs and radios.
  Checkboxes only count when they are about "current"/"enrolled"/"present". A textarea only counts as the work
  description. The `current` keys only apply to checkboxes. Fields whose id or name appears in the table in 4.1 are
  classified directly from the table, whatever surrounds them.
  A control's section is decided from, in order of trust: how the control names itself (id, name, label, aria-label,
  placeholder says company/job title versus school/degree), the attributes and headings of enclosing containers (up to
  a sensible number of levels, never leaving the form), and finally the nearest enclosing block that contains a
  company/title (or school/degree) field and nothing of the other kind. Never misread a work section as education or
  the reverse.
- `entryValue`: maps an `EntryKey` and entry index to a string from the profile. Month/year/date keys return the raw
  profile date string (conversion to a display format is done when filling). End-date keys are empty for a current
  position / currently enrolled education. Boolean current keys return `'yes'` or `''`. Out of range index returns `''`.
- `degreeAlternatives`: the ways one degree might be worded in a dropdown, best first, always starting with the input
  itself. Recognise abbreviations (B.S., BA, BSc, B.Tech, B.E., M.S., MSc, MBA, M.Tech, PhD, Ph.D.), "Bachelor of ...",
  "Master of ...", doctorate, associate, and high school/diploma/GED, and add the usual dropdown wordings
  ("Bachelor's Degree", "Bachelor's", "Master's Degree", "Doctor of Philosophy (Ph.D.)", "Associate's Degree",
  "High School", ...). No duplicates.
- `fillEntryField`: writes one classified field. Returns `'skip'` when the profile has no value, or nothing could be
  set. Checkboxes: click only when unchecked. Selects and comboboxes: try each acceptable spelling until one works.
  Text: set the first spelling. Date keys need a display format chosen from the control: `type=month` gives
  `YYYY-MM`, `type=date` gives `YYYY-MM-01`, a placeholder or label that says mm/dd/yyyy, yyyy-mm, "Month YYYY",
  mmm yyyy picks that style, otherwise offer `MM/YYYY` then `YYYY-MM`; month-only keys offer the full month name,
  its 3-letter abbreviation, a zero padded number and the plain number; year-only keys give the year. Two custom date
  pickers need dedicated handling, see 4.2 and 4.3.
- `addButtonsFor`: the buttons or links that would add one more entry of this kind. A button qualifies if it is
  enabled, visible (unless `opts.skipVisibilityCheck`), and either carries a recognised "add another" style class/id
  or its label is of the shape "Add", "Add another", "Add more", "+ Add" optionally followed by words like
  work/job/employment/experience/position/education/school/degree/qualification/history/entry/role. A bare "Add" with
  no section words must be proven to belong to the section (its own enclosing section is of the right kind), or it is
  not returned (a standalone "Add" button elsewhere on a page must never be clicked). With `near`, sort by closeness
  (fewest ancestors up to a common container).
- `ensureEntryCount`: click add buttons until the page shows `needed` entries (cap 8), waiting a bounded time after
  each click for new fields to appear; stop when nothing grows or there is no button. Returns the final count.
  Never adds beyond `needed`.

### 3.2 `siteKit.ts` (you design this in phase A; phase B imports it)

Small, well-tested helpers for the site modules. At minimum they need (names and shapes are yours):

- text normalisation (collapse whitespace, trim, lower case) and a visibility test;
- dispatching a list of events on an element;
- "set a text control the way a user would" (focus, native value setter, `input`/`change`/`blur`) using the existing
  `fillText` from `fill.ts`; returns whether the value ended up set;
- "type character by character" into masked inputs (dates like `MM/YYYY`), firing key and input events, verifying the
  final value;
- converting a profile date to `MM/YYYY`, `MM-YYYY`, `YYYY/MM`, `YYYY-MM` strings (via `parseYearMonth`);
- choosing one option from a list of elements by visible text (exact match first, then containment either way,
  optionally strict meaning "no match, no click", otherwise the first), including skipping "no results" placeholders;
- collecting currently visible options from a root using a selector;
- finding the container that holds exactly one entry's controls, given one control of the entry (the repeated entry
  boxes share a parent; the box is the largest ancestor that still contains only that one entry);
- "add the next entry": click an add control, wait up to a bounded time for a new entry to appear, return it;
- finding a button by label text (aria-label or text), enabled only;
- the shared result type for site handlers, and a helper to build an empty one.

Use `press` and `until` from `repeaters.ts` for clicking and polling.

### 3.3 Site entry point (`sites.ts`)

```ts
export interface SiteResult { name: string; filled: { label: string; key: FilledKey }[]; touched: Element[]; work: boolean; edu: boolean }
export async function fillSiteSpecific(p: ProfileData): Promise<SiteResult | null>;
```

Runs every site handler. Each handler returns a `SiteResult` or `null` ("this page is not mine, I did nothing").
Results of all handlers that recognised the page are merged (names joined with `+`, lists concatenated, `work`/`edu`
OR-ed). A handler that throws is logged with `console.debug` and skipped; one failing handler never stops the others
or throws out of `fillSiteSpecific`.

`work: true` / `edu: true` mean "this handler took care of that whole section, so the generic engine must not also try
it" (see how `run.ts` uses the result). `touched` lists every control the handler wrote, so the generic pass leaves
them alone. `filled` entries are `{ label, key }` where `label` is `"<jobTitle> @ <companyName>"` for work entries and
the school name for education entries, and `key` is a `FilledKey` such as `work.company`, `work.title`,
`work.location`, `work.startDate`, `work.endDate`, `work.current`, `work.description`, `edu.school`, `edu.degree`,
`edu.field`, `edu.gpa`, `edu.startDate`, `edu.endDate`. Only report a field as filled if it really ended up set.

Handler order does not matter semantically; they must be mutually exclusive by their recognition rules.

Handlers in `sites2.ts` and `sites3.ts` are exported as an array of handlers that `sites.ts` includes; you may arrange
the imports as you like as long as there is no import cycle.

### 3.4 `workday.ts` (called from `run.ts`)

```ts
export interface WorkdayResult { filled: { label: string; key: FilledKey }[]; touched: Element[] }
export function fillWorkdayExperience(p: ProfileData): Promise<WorkdayResult | null>;
export function fillWorkdayEducation(p: ProfileData): Promise<WorkdayResult | null>;
export function fillWorkdaySkills(p: ProfileData, opts?: DetectOptions, max?: number): Promise<{ count: number; input: Element } | null>;
export function fillWorkdayWebsites(p: ProfileData): Promise<{ count: number; touched: Element[] } | null>;
export function uploadWorkdayResume(
  getResume: () => Promise<{ fileName: string; mimeType: string; base64: string } | null>,
): Promise<{ ok: boolean; input: Element } | null>;
```

`max` defaults to 15. Each returns `null` when the page is not the relevant Workday section (so nothing is done).

## 4. Facts about generic repeating sections

### 4.1 Identifier patterns that name the entry and field exactly

When a control's id or name matches, the capture group is the entry number and the meaning is fixed.

Greenhouse-style job boards (ids, numbers 0-based or 1-based per page):

| Pattern | Meaning |
|---|---|
| `company-name-N` | work.company |
| `title-N` | work.title |
| `start-date-month-N`, `start-date-year-N` | work.startMonth, work.startYear |
| `end-date-month-N`, `end-date-year-N` | work.endMonth, work.endYear |
| `current-role-N` or `current-role-N_M` | work.current (checkbox) |
| `school--N` or `university--N` | edu.school |
| `degree--N` | edu.degree |
| `discipline--N` or `major--N` | edu.field |
| `start-month--N`, `start-year--N`, `end-month--N`, `end-year--N` | edu month/year parts |
| `education_school_name_N`, `education_degree_N`, `education_discipline_N` | edu.school, edu.degree, edu.field |
| `education_start_month_N`, `education_start_year_N`, `education_end_month_N`, `education_end_year_N` | edu month/year parts |

Tesla careers (names): `workExperience.employers[N].companyName` (work.company), `.jobTitle` (work.title), `.startDate`
(work.startDate), `.endDate` (work.endDate), `.isCurrent` (work.current), `.summaryDuties` (work.description).

Array-style forms (names): `experienceData[N].title`, `.companyName`, `.location`, `.description` or `.roleDescription`,
`.fromTo.startDate`, `.fromTo.endDate`, `.fromTo.currentlyWorkHere` (work.*), and `educationData[N].schoolName`,
`.degree`, `.major` or `.fieldOfStudy`, `.gradeAverage` (edu.gpa), `.fromTo.startDate`, `.fromTo.endDate` (edu.*).

### 4.2 Month pickers built on react-datepicker (used by Workable-like and other sites)

Click the input (or its calendar icon) to open `.react-datepicker` (often inside `.react-datepicker-popper`). It may
offer a year `<select>`; or a header `.react-datepicker__current-month` whose text includes the year with previous and
next buttons `.react-datepicker__navigation--previous` / `--next`. Months are cells `.react-datepicker__month-text`;
the cell for month m (0-based) also has the class `react-datepicker__month-m`. In day mode, days are
`.react-datepicker__day` and out-of-range ones carry `--disabled` or `--outside-month`. Selecting a cell must go
through the full pointer event sequence (pointerdown, mousedown, pointerup, mouseup, click) to register. After it, the
input's value is non-empty.

### 4.3 Tesla date picker

An input inside `.tds-form-input` opens `.tds-date-picker` as a sibling. The caption `.tds-date-picker-month label`
shows "Month YYYY" text. Two buttons live in `.tds-date-picker-month`: the first goes back one month, the second
forward. Days are `.tds-day`; days from other months also have `.tds-day--not-this-month`. Step to the wanted month,
then click day 1.

### 4.4 Add buttons

- Greenhouse: element with class `add-another-button` inside an ancestor shared with the entry's fields.
- Array-style forms: `button.array-button-add` whose id contains `experienceData` (work) or `educationData` (education).
- Tesla work history: a button with text "Add employer" (it also carries a generated, unstable class beginning
  `style_Add__`; use the text first).
- Generic labels: see 3.1 `addButtonsFor`.

## 5. Facts and required behaviour per site

General rules for every handler below:

- Recognise the page from markup (and hostname only where stated). Otherwise return `null` and touch nothing.
- Process profile entries in order. Reuse an existing empty entry before adding a new one. Add a new entry only when
  needed. Do not add more entries than the profile has. If the entry already exists and is filled (same employer or
  school), leave it alone. Running twice must not duplicate or damage entries.
- Fill only inside the entry being worked on; never read or write another entry's controls.
- Widgets mount asynchronously. After a click, poll for the expected change with a bounded timeout (a few seconds),
  then continue. Never loop without a bound. A handler must finish in bounded time.
- A single bad field or entry must not stop the rest: guard each step.
- Location strings look like `City, State, Country` (the city is the first comma-separated part, the country the last).
- Dates in the profile are strings parsed with `parseYearMonth` (year string, month number).
- Never invent data the profile does not have.
- Report only what was actually set.

### 5.1 Workday ("My Experience" page, hosts like `*.myworkdayjobs.com`)

Recognise Workday by elements with `data-automation-id` or `data-fkit-id` attributes. Sections are `role="group"`
containers with a heading (`h2`, `h3`, `h4` or `role="heading"`).

**Work experience**
- Section heading text (case-insensitive): "Work Experience", "Work or Other Experience", "Professional Experience" or
  "Work History". Headings of individual entries look like "Work Experience 2" (ends with a number): those are entries,
  not the section.
- Entries are groups inside the section. A job's title input has an id containing `--jobTitle` (for example
  `workExperience-4--jobTitle`); also seen: `data-automation-id` containing `jobTitle`, name containing `jobTitle`.
  Other controls in the entry: input id containing `--companyName`; input id containing `--location`; textarea id
  containing `--roleDescription`; checkbox id/name/automation-id containing `currentlyWorkHere`.
- Dates are split into month and year text inputs. Their ids contain `startDate` or `endDate` together with
  `Month-input` / `Year-input`, or `dateSectionMonth` / `dateSectionYear`. Month is a two-digit number, year four
  digits. Fire input, change and blur after setting; clicking the input first helps.
- Add button inside the section: `button[data-automation-id="add-button"]` or a button whose aria-label contains
  "Add".
- Behaviour: a job already on the page (same company) is left alone; an empty entry is reused; otherwise click Add,
  wait for a new entry, and fill only it. Tick "currently work here" for the current job only (never untick). Skip the
  end date for the current job. Report keys: work.title, work.company, work.location, work.description, work.current,
  work.startDate, work.endDate.

**Skills** (multi-select search)
- Input id `skills--skills` (or any input whose id ends with `--skills`). Do nothing if it is hidden (unless
  `opts.skipVisibilityCheck`), disabled or read-only, or the profile has no skills. De-duplicate skills, trim, at most
  `max`.
- The list only searches when Enter is pressed in the input, and Workday's handlers read `keyCode`, so send a full key
  sequence (keydown, keypress, keyup) with `key`, `code`, `keyCode`, `which`, `charCode` set.
- Results appear in `[data-automation-id="activeListContainer"][role="listbox"]`. Each result is a `role="option"` that
  contains `[data-automation-id="promptOption"]`; its text is in the attribute `data-automation-label` (or its text
  content). An empty search shows one option whose aria-label starts with "No Items".
- Clicking the `promptOption` toggles it. A skill must only be clicked if it is not already checked: checked state is
  visible as an aria-label containing " checked" (but not "not checked"), or a `[data-automation-id="promptLeafNode"]`
  with `data-automation-checked="checked"`, or a checked checkbox input / `aria-checked="true"`, or a
  `[data-automation-id="checkbox"]` with attribute `data-automationcheckboxchecked="true"`.
- Already chosen skills are shown in `[data-automation-id="multiSelectContainer"] [data-automation-id="selectedItem"]`
  (text in the `title` attribute), or in `[data-automation-id="selectedItemList"] [data-automation-id="promptOption"]`.
  Those must be counted and skipped so a second run does not toggle them off.
- Search precision: a long skill name may not match as typed. Try a shortened term first (the first word or two), then
  the full text, and choose the result whose label equals the skill exactly (case-insensitive). Wait for the list for
  this search to load (the list can briefly show stale results from the previous search). Give up on a skill after a
  bounded time (several seconds) and go on.
- When finished, close the list the way a user would: clear the input, Escape, blur, click elsewhere on the page.
- Returns the number of skills that are selected (including those already selected) and the input.

**Resume / CV**
- Section: element with `aria-labelledby="Resume/CV-section"`, or the `role="group"` that contains
  `[data-fkit-id="resumeAttachments--null"]`. File input: `input[data-automation-id="file-upload-input-ref"]`.
- Attached files are listed in `[data-fkit-id="resumeAttachments--attachments"]`; the name is in
  `[data-automation-id="file-upload-file-name"]`; each has a delete button `button[data-automation-id="delete-file"]`.
- After a successful upload the section contains `[data-automation-id="file-upload-successful"]`; failures show
  `[data-automation-id="file-upload-error"]` or `[data-automation-id="errorMessage"]`.
- Workday renames a repeated upload `name_2.pdf`, `name_3.pdf`, and so on.
- Behaviour: if no section or no file input, return `null` before calling `getResume`. If `getResume` gives nothing,
  return `null`. Refuse files over 5 MB (decode size from the base64 length) with `{ ok: false, input }`. If the file
  already attached is the same file (same name, or the name with `_N` appended before the extension), do nothing and
  return `ok: true`. Otherwise delete whatever is attached (bounded number of deletes), upload with the existing
  `fillFile`, then wait up to about 20 seconds for success or error; `ok` is true only on success.

**Websites**
- Section: element with `aria-labelledby` of `Websites-section`, `Professional-Websites(s)-section` or
  `Professional-Website(s)-section`; failing that a group whose heading is "Websites", "Professional Websites(s)" or
  "Professional Website(s)"; failing that a group headed "Portfolio" (then use only the portfolio and website URLs).
- URL inputs: id containing `webAddress` and ending `--url`, or name `url`. Add button
  `[data-automation-id="add-button"]`. Existing entries are removed with a button holding a trash icon (class
  `wd-icon-trash` or `svg[data-automation-id="trashIcon"]`) or text "Delete".
- URLs to add: LinkedIn, GitHub, portfolio, website (from `p.links`), de-duplicated, non-empty. If the page already
  has exactly those URLs (compare ignoring scheme, `www.` and trailing slash), do nothing. Otherwise clear the existing
  entries and add them one by one (fill an empty input if there is one, else click Add).
- Do nothing on pages that are not Workday.

**Education**
- Section heading "Education". Entries are found by their school control: `[data-automation-id="formField-school"]`,
  `input[name="schoolName"]` or an input id containing `--schoolName`.
- School: usually a searchable multi-select inside `formField-school` (`multiSelectContainer`): type, press Enter as
  for skills, then click the best result (exact, contains, the first). The result may contain a radio input; clicking
  it is fine. Otherwise it is a plain text input.
- Degree: a button (`name="degree"`, id containing `--degree`, or aria-label containing "Degree") that opens a
  listbox of options; pick using `degreeAlternatives`.
- Field of study: searchable multi-select in `[data-automation-id="formField-fieldOfStudy"]`, same procedure as school.
- GPA: input id containing `gradeAverage` or name `gradeAverage`.
- Years: year-only inputs with id containing `firstYearAttended` / `lastYearAttended` and
  `data-automation-id="dateSectionYear-input"`.
- Add button as in work experience. A school already present (same school, comparing the first 12 characters) is
  left alone. Report edu.school, edu.degree, edu.field, edu.gpa, edu.startYear, edu.endYear.

### 5.2 Meta Careers (hostname not required; recognise from markup)

**Work** (`work: true`)
- Employer: `button[role="combobox"][aria-label="Employer name"]`. Its text is "Employer name" (the placeholder) when
  unset. Clicking opens a popover (the button's `aria-controls` points at it, or it is a `role="dialog"` /
  `role="listbox"`) with a text search box; type the company, wait about a second for results, click the matching
  `role="option"`. Retry a couple of times because popovers sometimes fail to open; press Escape between attempts.
- Position: `button[role="combobox"][aria-label="Position"]` inside the same entry, same procedure.
- Location: `input[role="combobox"][type="text"]` in the entry (the date inputs share the type but their placeholder
  contains "/"); type the city one character at a time, wait for suggestions (`role="option"`, appears within a few
  seconds), pick the match.
- Dates: text inputs `type="text"` with `autocomplete="on"` in the entry; a label per input mentioning start or end
  and "mm/yyyy". These are masked: type `MM/YYYY` one character at a time with key events. Order: start, then end.
- Current: first checkbox in the entry (click its label). If current, no end date.
- Description: the entry's `textarea`.
- Add: a button/link with text "Add another job". One box per entry; an empty entry has the unset placeholder.
- Skip or reuse entries as in the general rules. Report the keys listed in 3.3.

**Education** (`edu: true`; entry markup parallels the work entries)
- School: `button[role="combobox"][aria-label="School name"]`; degree `[role="combobox"][aria-label="Degree"]` (try
  `degreeAlternatives` until one works); field of study: first text input with `autocomplete="on"` in the entry.
- Add: "Add another degree" or "Add degree".

### 5.3 Google Careers (hostname contains `google.com`, or `careers.google`)

**Work**
- Employer: `input[aria-label="Employer name"]` (free text with autocomplete). Type the company, send ArrowDown, and if
  a suggestion list (`ul[role="listbox"]`, not `aria-hidden`) shows, pick the exact match; then change/blur.
- Job title: `input[aria-label="Job title"]`.
- Dates: under a caption whose text is "Start date" / "End date" there is a Material dropdown for the month
  (`[role="combobox"]`, options are `li[role="option"]` in a `ul[role="listbox"]`; the trigger has
  `aria-expanded`; the selected text is shown in a child span, its selection display classes are generated and
  fragile, so also compare the trigger's text) and a year text input with an aria-label containing "year". Pick the
  month by full English name.
- Current: checkbox in the entry (value contains "current job", or id contains "current", else the first checkbox).
  Set it to match `isCurrent` (it may need unticking). If current, no end date.
- Location: city input with aria-label containing "City"; country is a `[role="combobox"]` Material dropdown whose
  enclosing control (a `[jscontroller]` ancestor) text mentions "country"; pick the last part of the location.
- Add: "Add another job" (also "Add job", "Add work", "Add experience").

**Education**
- School container: element `[jsname="ouDqDb"]` holding a text input (autocomplete like the employer one).
- Degree: a Material dropdown under `[jsname="sFKGad"]`; its options are exactly "Bachelor's", "Master's", "PhD",
  "Associate" (map the profile's degree to one of these, else try the raw text).
- Status: a Material dropdown under `[jsname="LrfOX"]` with options "Now attending" and "Graduated": choose "Now
  attending" when currently enrolled or the graduation date is in the future, else "Graduated".
- Field of study: input under `[jsname="uS8Kcc"]`. GPA: input with aria-label containing "GPA".
- Add: "Add another degree", "Add degree" or "Add education". (The jsname values are generated and fragile.)

### 5.4 TikTok / ByteDance careers

- Recognise by any of `#formily-item-career_list`, `#formily-item-internship_list`, `#formily-item-education_list`.
- Each list holds cards (elements whose class contains `apply-form-array-card__`). The add control inside the list has a
  class containing `apply-form-array-card-add-float-right`.
- Within a card each field is found by `[data-form-field-id="<id>"]`: `company`, `title`, `desc` (textarea), `school`,
  `field_of_study`, `degree` (custom select with `.ud__select__selector`; options are `[role="option"]`,
  `.ud__select__option` or `.ud__select-option`), `start_end_time`.
- Dates: `[data-form-field-id="start_end_time"] .throne-biz-date-range-picker-input input` gives two inputs (start,
  end) taking `YYYY-MM`. For a current job the end input wants the word "Present": click the end input to open the
  panel and click the cell reading "Present" (else type it).
- If an internship list exists, positions whose title contains "intern" or "trainee" go there and the rest in the
  career list; otherwise all go in the career list. Education fills school, field of study, degree (use
  `degreeAlternatives`, strict matching) and start/end.
- `work: true` when the career list exists; `edu: true` when the education list exists.
- Return `null` if none of the three list ids exist.

### 5.5 Avature "datasetField" forms (Siemens, Jacobs, Epic and other Avature tenants)

- Rows: `.datasetField__row`, excluding `.datasetField__row--sample`, hidden rows and rows with `display: none`.
  Add control: an element with id starting `addRowFor_`, class `datasetField__addButton`, or an add-looking
  button/link.
- A section is a container (`[id^="fieldSpecContainer"]`, fieldset or section) holding rows, whose heading
  (`legend`, `h1`-`h4`, `.sectionTitle`, `label`) says work experience/employment/experience (work) or
  education/academic/qualification (education).
- Fill each row's controls by their labels using the generic field detection and the entry key rules from
  `entries.ts` (`detectFields` on the row, `entryKeyOf`, `fillEntryField`). A "current position" question appears as a
  select with Yes/No or as a pair of Yes/No radios under a group whose label mentions current or present.
- Do two passes over a row because choosing one value can reveal other fields.
- Skills as checkbox groups: a `fieldset`, `role="group"` or `role="checkboxgroup"` with at least three checkboxes and
  a legend/label that talks about skills, tools, technologies, frameworks, languages, databases, "which of these",
  "have you used" or proficiency. Tick the boxes whose text equals or contains a profile skill (or the reverse for
  skills of two or more characters). Never untick. Report `skills` for each tick.
- `work`/`edu` true when that section existed and had rows. Return `null` if the page has neither rows nor skill groups.

### 5.6 MathWorks (hostname contains `mathworks.com`)

- A modal lists work experience rows `tr[id^="employment_"]`; the suffix after `employment_` is the row id. It is
  opened by `#edit_employment` or a button with aria-label "Edit work experience records".
- Row controls have ids `employer_<id>`, `job_title_<id>`, `employment_type_<id>` (select; choose "Employee"),
  `start_date_<id>`, `end_date_<id>` (text, `MM/YYYY`), `is_current_<id>` (checkbox).
- Add: `#add_employment` or a button with aria-label "Add new work experience record(s)". Save: `#save_employment`
  (or a button whose id contains it, or the modal's primary button). Fill existing rows, save, add rows for the
  remaining jobs and save again. For a current job tick the checkbox and clear the end date; for a past job untick it.
- `work: true` only if something was filled; return `null` if the host does not match or the profile has no jobs.

### 5.7 SAP SuccessFactors "UI5" forms (L3Harris and others)

- All custom elements carry the suffix `-xweb-dynamic-content`. Entry headings are `ui5-title-xweb-dynamic-content`
  with text `Previous Employment N` (N from 1). Each entry has a form `ui5-form-xweb-dynamic-content` (usually with an
  empty `header-text`) in a shared ancestor of its heading.
- Fields are `ui5-input-xweb-dynamic-content` and `ui5-date-picker-xweb-dynamic-content` elements with attribute
  `accessible-name` equal to the label, or found by label text inside `ui5-form-item-xweb-dynamic-content` (label in
  `ui5-label-xweb-dynamic-content`). Labels: "Company Name", "Job Title", "From Date", "End Date". Do NOT fill "Reason
  For Leaving" (the profile has no such data).
- The real `<input id="inner">` (or `data-sap-focus-ref`) lives in the element's shadow root; for the date picker it
  is one shadow level deeper inside `ui5-datetime-input-xweb-dynamic-content`. Set it with composed input and change
  events, and also set the host's `value` attribute and property.
- Date format is `Mon D, YYYY`, for example `Jun 1, 2021` (use day 1).
- Add: a `ui5-button-xweb-dynamic-content` whose text/aria-label/tooltip is "Add"; the clickable `<button>` is in its
  shadow root. Click until there are as many entries as jobs.
- `work: true` if anything was filled; `null` if there are no such titles or no jobs.

### 5.8 SmartRecruiters (web components `spl-*` / `oc-*`)

- Recognise by `oc-button[data-test="add-experience"]`, `oc-button[data-test="add-education"]` or
  `[data-test="experience-entry"]`.
- Entries: `[data-test="experience-entry"]` and `[data-test="education-entry"]`; an empty entry has no text. Add:
  `oc-button[data-test="add-experience"]` / `add-education`; the real button is the `button` inside the shadow root of
  the `spl-button` inside it.
- Work fields: autocompletes `spl-autocomplete[data-test*="company"]`, `[data-test*="title"]` (also
  `job-title`), `[data-test*="location"]`; description `oc-textarea[data-test="experience-description"] spl-textarea`
  (a `textarea.c-spl-textarea` in the shadow root, possibly one level deeper inside `spl-internal-form-field`); two
  `spl-date-field` elements (start, end), each with `spl-date-picker` in its shadow root holding
  `input.c-spl-date-picker-input` taking `MM/YYYY`; `spl-checkbox` (current) whose shadow root holds a checkbox input.
- Education fields: `spl-autocomplete[data-test="institution-autocomplete"]`;
  `oc-input[data-test="education-degree"] spl-input` and `oc-input[data-test="education-major"] spl-input` (plain
  text, the `<input class="c-spl-input">` is in the shadow root, possibly one level deeper); two `spl-date-field`;
  `spl-checkbox` (currently enrolled).
- Events set from inside shadow roots must be `bubbles: true, composed: true`.
- Autocomplete behaviour: clear, type the text, fire input and keyup, wait for options (a `spl-dropdown` in the
  autocomplete's shadow root exposes `spl-select-option` elements, via slot `menu` or directly; each option's shadow
  root holds `spl-dropdown-item` whose shadow root holds `.c-spl-dropdown-item`, the clickable part). Click the first
  option. If that leaves the input empty, send ArrowDown then Enter keys (keyCode 40 and 13) as a fallback.
- Locations use at most the first two comma-separated parts.
- `work`/`edu` true when that section existed.

### 5.9 Jobvite / Talemetry (Material UI based)

- Recognise by a button with text "Add New Work History" or "Add New Education History", or any element whose
  `autocomplete` attribute starts with `tm-form-`.
- Clicking an add button opens a card form (wait about a second). Controls are found by `autocomplete` values:
  `tm-form-companyName`, `tm-form-title`, `tm-form-description`, `tm-form-institution`, `tm-form-degree`,
  `tm-form-major`, `tm-form-city`, and selects `tm-form-country`, `tm-form-state`. Fallbacks by id fragment:
  `company_name`, `companyName`, `field_title`, `jobTitle`, `description`, `institution`, `school`, `degree`, `major`,
  `city`, `country`, `state` (work forms use `field_wh_city/country/state`, education forms `field_eh_*`). Only
  consider visible controls.
- Country select options use two-letter codes as values (for example `US`, `GB`, `IN`); map the common English
  country names (and abbreviations like USA, UK) to codes, else match by option text.
- Dates: a `fieldset` whose legend (class containing `BaseFieldLayout-inputLabelQuestion`) says "Start date" or "End
  date" contains two `<select>`s; each sits in a `.MuiFormControl-root` whose label says Month or Year. Month options
  are English month names. The "End date" fieldset also holds a Material switch (`input.MuiSwitch-input`) meaning
  present/current: toggle by clicking the switch base.
- Finish an entry by clicking the button that contains `svg[data-testid="DoneIcon"]` (text includes "Done").
- Already added entries appear as cards (`[class*="MultiFieldGroupCard-summaryRoot"]`, titles
  `[class*="MultiFieldGroupCard-title"]`) inside lists (`[class*="MultiFieldGroupList-root"]`) next to the add button.
  Skip a job or school whose name already appears in a card title. Add only the missing ones.
- `work`/`edu` true when the corresponding add button existed.

### 5.10 Workable

- Recognise by `[data-ui="experience"]` or `[data-ui="education"]`. Add: `[data-ui="add-section"]` inside the section
  (do nothing if it is disabled). The opened inline form is `[data-ui="editor"]`; its save button is
  `[data-ui="save-section"]` (or a button reading "Save" or "Update"). Existing entries appear as `li` items or
  `[data-ui="group"]` in the section; skip a job whose title and company already appear in an entry's text, or a
  school whose name does.
- Work editor controls: `input#title`/`input[name="title"]`, `input#company`/`input[name="company"]`,
  `textarea#summary`/`textarea[name="summary"]`, date inputs `input[name="start_date"]` and `input[name="end_date"]`
  (month pickers, see 4.2; the calendar icon is `[data-ui="icon"]` in a button next to the input), checkbox whose
  name contains `current`. Current job (or empty end date): tick it and skip the end date.
- Education editor controls: `input#school`, `input#field_of_study`, `input#degree` (by id or name),
  `input[name="start_date"]`, `input[name="end_date"]`.
- After filling an entry, click save and wait for the editor to close before adding the next.

## 6. Quality bar

- TypeScript strict, no `any` unless justified, `noUnusedLocals` clean.
- Each module has a short header comment saying what page it handles, in your own words.
- Every B module comes with tests in a new file (for example `workday.test.ts`) that build jsdom fixtures from the
  markup facts above and assert on every field, including: first run fills, second run changes nothing, an existing
  filled entry is not duplicated, a page that is not the handler's returns `null`, and a failure inside one field does
  not stop the rest. Real browsers are not available; jsdom supports shadow roots. Look at how the existing tests deal
  with visibility (`getClientRects`) and timing.
- Run the whole suite and the type check before you report. Report: files written, test counts, anything in this spec
  you found contradictory or impossible, any assumption you made, and confirm you did not read outside this directory.
