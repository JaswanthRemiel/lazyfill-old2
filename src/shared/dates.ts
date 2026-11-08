export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_ABBR = MONTHS.map((m) => m.slice(0, 3));

export interface YearMonth { year?: string; month?: number }

/**
 * Reads the date formats people actually write: 2021-03, 2021, 03/2021, 3/2021, March 2021,
 * Mar 2021, 03-2021, 2021/03. Returns what it could find; never throws.
 */
export function parseYearMonth(input: string): YearMonth {
  const v = (input ?? '').trim();
  if (!v) return {};
  let m = v.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (m) return { year: m[1], month: clampMonth(+m[2]) };
  m = v.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return { year: m[2], month: clampMonth(+m[1]) };
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // MM/DD/YYYY
  if (m) return { year: m[3], month: clampMonth(+m[1]) };
  m = v.match(/^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) {
    const i = MONTHS.findIndex((n) => n.toLowerCase().startsWith(m![1].toLowerCase().slice(0, 3)));
    if (i >= 0) return { year: m[2], month: i + 1 };
  }
  m = v.match(/^(\d{4})$/);
  if (m) return { year: m[1] };
  return {};
}

const clampMonth = (n: number) => (n >= 1 && n <= 12 ? n : undefined);

/** Canonical "YYYY-MM" (or "YYYY"), or '' when the input cannot be understood. */
export function toYearMonth(input: string): string {
  const { year, month } = parseYearMonth(input);
  if (!year) return '';
  return month ? `${year}-${String(month).padStart(2, '0')}` : year;
}
