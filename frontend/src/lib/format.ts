import NepaliDate from 'nepali-date-converter';
import type { Agency, AlertStatus, CaseStatus, Priority, Role, Typology } from './types';

const TIME_ZONE = 'Asia/Kathmandu';

function kathmanduDay(date: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(date).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parse(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Bikram Sambat date: "10 Kartik 2083". */
export function bsDate(value?: string | Date | null): string {
  const date = parse(value);
  if (!date) return '—';
  return new NepaliDate(kathmanduDay(date)).format('DD MMMM YYYY', 'en').replace(/^0/, '');
}

/** Short BS date for chart axes and tables: "10 Kartik". Accepts a YYYY-MM-DD day key. */
export function bsShort(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new NepaliDate(new Date(y, m - 1, d)).format('DD MMMM', 'en').replace(/^0/, '');
  }
  const date = parse(value);
  return date ? new NepaliDate(kathmanduDay(date)).format('DD MMMM', 'en').replace(/^0/, '') : '—';
}

export function time(value?: string | Date | null): string {
  const date = parse(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function bsDateTime(value?: string | Date | null): string {
  return value ? `${bsDate(value)}, ${time(value)}` : '—';
}

/** Gregorian date shown next to BS where officials need both. */
export function adDate(value?: string | Date | null): string {
  const date = parse(value);
  return date ? new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(date) : '—';
}

export function relative(value?: string | Date | null): string {
  const date = parse(value);
  if (!date) return '—';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  const future = minutes < 0;
  const m = Math.abs(minutes);
  const say = (n: number, unit: string) => (future ? `in ${n} ${unit}${n === 1 ? '' : 's'}` : `${n} ${unit}${n === 1 ? '' : 's'} ago`);
  if (m < 60) return say(m, 'min');
  if (m < 1440) return say(Math.round(m / 60), 'hour');
  if (m < 60 * 24 * 45) return say(Math.round(m / 1440), 'day');
  return bsDate(date);
}

/** "Rs 12,34,567" with lakh grouping. */
export function rupees(amount: number | string): string {
  return `Rs ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(amount))}`;
}

/** "Rs 37.2 lakh" / "Rs 1.4 crore" for summaries. */
export function rupeesShort(amount: number | string): string {
  const n = Number(amount);
  if (n >= 1e7) return `Rs ${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} crore`;
  if (n >= 1e5) return `Rs ${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} lakh`;
  return rupees(n);
}

export const ROLE_LABEL: Record<Role, string> = {
  REPORTING_OFFICER: 'Compliance officer',
  ANALYST: 'Analyst',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrator',
};

export const CASE_STATUS: Record<CaseStatus, { label: string; tone: string }> = {
  OPEN: { label: 'Open', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  UNDER_INVESTIGATION: { label: 'Under investigation', tone: 'bg-brand-50 text-brand-700 ring-brand-100' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  DISSEMINATED: { label: 'Sent to agency', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  CLOSED: { label: 'Closed', tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export const ALERT_STATUS: Record<AlertStatus, { label: string; tone: string }> = {
  NEW: { label: 'New', tone: 'bg-brand-50 text-brand-700 ring-brand-100' },
  ESCALATED: { label: 'Escalated to case', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  FALSE_POSITIVE: { label: 'False positive', tone: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export const PRIORITY: Record<Priority, { label: string; tone: string }> = {
  CRITICAL: { label: 'Critical', tone: 'bg-crimson-50 text-crimson-700 ring-crimson-100' },
  HIGH: { label: 'High', tone: 'bg-orange-50 text-orange-800 ring-orange-200' },
  MEDIUM: { label: 'Medium', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
  LOW: { label: 'Low', tone: 'bg-slate-50 text-slate-500 ring-slate-200' },
};

export const TYPOLOGY: Record<Typology, string> = {
  STRUCTURING: 'Structuring',
  HUNDI: 'Hundi / informal transfer',
  TRADE_BASED: 'Trade-based laundering',
  FRAUD: 'Fraud',
  TAX_EVASION: 'Tax evasion',
  CORRUPTION: 'Corruption',
  TERRORISM_FINANCING: 'Terrorism financing',
  OTHER: 'Other',
};

export const AGENCY: Record<Agency, { short: string; name: string }> = {
  DMLI: { short: 'DMLI', name: 'Department of Money Laundering Investigation' },
  NEPAL_POLICE: { short: 'Nepal Police', name: 'Nepal Police, Central Investigation Bureau' },
  DRI: { short: 'DRI', name: 'Department of Revenue Investigation' },
  IRD: { short: 'IRD', name: 'Inland Revenue Department' },
  CIAA: { short: 'CIAA', name: 'Commission for the Investigation of Abuse of Authority' },
  NRB: { short: 'NRB', name: 'Nepal Rastra Bank, supervision departments' },
};

export const RULE_LABEL: Record<string, string> = {
  TTR_CASH: 'Cash ≥ Rs 10 lakh',
  STRUCTURING: 'Structuring',
  RAPID_MOVEMENT: 'Rapid movement',
  DORMANT_REACTIVATION: 'Dormant account',
  PEP_LARGE: 'PEP transaction',
  STR: 'Filed by institution',
};

export const CHANNEL_LABEL: Record<string, string> = {
  CASH: 'Cash', TRANSFER: 'Transfer', CONNECT_IPS: 'connectIPS', WALLET: 'Wallet', REMITTANCE: 'Remittance', CHEQUE: 'Cheque',
};
