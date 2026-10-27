import NepaliDate from 'nepali-date-converter';

const TIME_ZONE = 'Asia/Kathmandu';

/** The calendar day in Nepal for an instant. */
function kathmanduDay(date: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Nepal's fiscal year runs from 1 Shrawan to the end of Ashadh, e.g. "2083/84".
 */
export function fiscalYear(date = new Date()): string {
  const bs = new NepaliDate(kathmanduDay(date));
  const year = bs.getYear();
  const start = bs.getMonth() >= 3 ? year : year - 1; // month 3 is Shrawan
  return `${start}/${String(start + 1).slice(-2)}`;
}

/** Cash transactions at or above this amount need a threshold transaction report. */
export const TTR_THRESHOLD = 1_000_000;

/** "Rs 12,34,567" with Nepali lakh/crore grouping. */
export function formatRupees(amount: number): string {
  return `Rs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)}`;
}

/** Nepali mobile numbers: 98XXXXXXXX or 97XXXXXXXX, optional +977. */
export function isNepaliMobile(value: string): boolean {
  return /^(\+?977-?)?9[78]\d{8}$/.test(value.replace(/\s/g, ''));
}
