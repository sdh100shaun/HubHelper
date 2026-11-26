/**
 * Day-string helpers for Copilot Insights. All days are UTC `YYYY-MM-DD`.
 *
 * @module services/copilot/dates
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isValidDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidMonth(value: string): boolean {
  if (!MONTH_RE.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
  return toDay(new Date(Date.parse(`${day}T00:00:00Z`) + delta * MS_PER_DAY));
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

/** Inclusive list of days from `from` to `to`. Empty when `from` is after `to`. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Build a range from CLI options. GitHub publishes a day's report after it
 * ends, so the default range ends yesterday.
 */
export function resolveRange(
  options: { days?: number; from?: string; to?: string },
  now: Date = new Date()
): DateRange {
  const yesterday = addDays(toDay(now), -1);
  const to = options.to ?? yesterday;
  const from = options.from ?? addDays(to, -((options.days ?? 28) - 1));
  if (!isValidDay(from) || !isValidDay(to)) {
    throw new Error('Dates must be valid days in YYYY-MM-DD format');
  }
  if (from > to) throw new Error('--from must be on or before --to');
  if (daysBetween(from, to) > 730) throw new Error('Date range cannot exceed two years');
  return { from, to };
}

/** First and last day of a `YYYY-MM` month. */
export function monthRange(month: string): DateRange {
  if (!isValidMonth(month)) throw new Error('Month must be in YYYY-MM format');
  const from = `${month}-01`;
  const next = new Date(Date.parse(`${from}T00:00:00Z`));
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(toDay(next), -1) };
}
