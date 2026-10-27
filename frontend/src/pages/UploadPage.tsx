import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorText, PageHeader, Section } from '@/components/ui';
import { api } from '@/lib/api';
import { bsDateTime, CHANNEL_LABEL, rupees } from '@/lib/format';
import { parseCsv } from '@/lib/nepal';

const COLUMNS = ['reference', 'accountNo', 'direction', 'channel', 'amount', 'occurredAt', 'subjectKind', 'subjectName', 'citizenshipNo', 'panNo', 'isPep', 'counterpartyName', 'counterpartyAccount', 'narration', 'district'] as const;
const REQUIRED = ['reference', 'accountNo', 'direction', 'channel', 'amount', 'occurredAt', 'subjectName'] as const;
const SAMPLE = [
  COLUMNS.join(','),
  'ADB-CD-2001,0101-0045-9001,CREDIT,CASH,950000,2026-10-20T11:00:00+05:45,INDIVIDUAL,Ram Bahadur Shrestha,27-01-71-09001,,false,,,Cash deposit,Kathmandu',
  'ADB-TT-2002,0101-0045-9001,DEBIT,CONNECT_IPS,900000,2026-10-21T14:30:00+05:45,INDIVIDUAL,Ram Bahadur Shrestha,27-01-71-09001,,false,Sunrise Traders,3301-0099-1200,Payment,',
].join('\n');

type Row = Record<(typeof COLUMNS)[number], string>;
interface Parsed { row: Row; errors: string[] }

function validate(row: Row): string[] {
  const errors: string[] = REQUIRED.filter((c) => !row[c]?.trim()).map((c) => `${c} is missing`);
  if (row.direction && !['CREDIT', 'DEBIT'].includes(row.direction)) errors.push('direction must be CREDIT or DEBIT');
  if (row.channel && !(row.channel in CHANNEL_LABEL)) errors.push(`unknown channel ${row.channel}`);
  if (row.amount && !(Number(row.amount) > 0)) errors.push('amount must be a positive number');
  if (row.occurredAt && Number.isNaN(Date.parse(row.occurredAt))) errors.push('occurredAt is not a date');
  if (row.panNo && !/^\d{9}$/.test(row.panNo)) errors.push('PAN must be 9 digits');
  return errors;
}

function toTransaction(r: Row) {
  const opt = (v: string) => v.trim() || undefined;
  return {
    reference: r.reference.trim(), accountNo: r.accountNo.trim(), direction: r.direction, channel: r.channel,
    amount: Number(r.amount), occurredAt: new Date(r.occurredAt).toISOString(),
    counterpartyName: opt(r.counterpartyName), counterpartyAccount: opt(r.counterpartyAccount), narration: opt(r.narration), district: opt(r.district),
    subject: {
      kind: r.subjectKind === 'ORGANIZATION' ? 'ORGANIZATION' : 'INDIVIDUAL', name: r.subjectName.trim(),
      citizenshipNo: opt(r.citizenshipNo), panNo: opt(r.panNo), isPep: r.isPep?.toLowerCase() === 'true' || undefined,
    },
  };
}

export function UploadPage() {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [parseError, setParseError] = useState('');
  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: () => api.get<{ code: string; title: string; description: string }[]>('/reports/rules') });
  const upload = useMutation({
    mutationFn: (rows: Row[]) => api.post<{ accepted: number; duplicates: number; alerts: string[] }>('/reports/transactions', { transactions: rows.map(toTransaction) }),
  });
  const invalid = useMemo(() => parsed?.filter((p) => p.errors.length).length ?? 0, [parsed]);

  async function read(file: File) {
    setFileName(file.name);
    upload.reset();
    setParseError('');
    const [header, ...body] = parseCsv(await file.text());
    const missing = REQUIRED.filter((c) => !header?.includes(c));
    if (!header || missing.length) { setParsed(null); setParseError(`The file needs these columns: ${missing.join(', ')}.`); return; }
    if (body.length > 1000) { setParsed(null); setParseError('Upload at most 1,000 transactions at a time.'); return; }
    setParsed(body.map((cells) => {
      const row = Object.fromEntries(COLUMNS.map((c) => [c, cells[header.indexOf(c)] ?? ''])) as Row;
      return { row, errors: validate(row) };
    }));
  }

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`;
  return (
    <>
      <PageHeader title="Upload transactions" subtitle="Send threshold and other reportable transactions as CSV. Detection rules run on every account in the file." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Section title="File" actions={<a href={template} download="transactions-template.csv" className="text-xs font-semibold text-brand-700">Download template</a>}>
            <label className="m-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-brand-400">
              <span className="text-sm font-medium text-slate-800">{fileName || 'Choose a CSV file'}</span>
              <span className="mt-1 text-xs text-slate-500">Dates in ISO format with the Nepal offset, e.g. 2026-10-20T11:00:00+05:45 · up to 1,000 rows</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
            </label>
            {parseError && <div className="px-5 pb-5"><ErrorText error={parseError} /></div>}
          </Section>

          {parsed && (
            <Section title={`Preview · ${parsed.length} rows${invalid ? ` · ${invalid} with problems` : ''}`}
              actions={<button className="btn-primary btn-sm" disabled={!!invalid || !parsed.length || upload.isPending || !!upload.data}
                onClick={() => upload.mutate(parsed.map((p) => p.row))}>{upload.isPending ? 'Uploading…' : `Submit ${parsed.length} transaction${parsed.length === 1 ? '' : 's'}`}</button>}>
              {upload.data && (
                <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
                  <p className="font-semibold">{upload.data.accepted} accepted{upload.data.duplicates ? `, ${upload.data.duplicates} already received` : ''}.</p>
                  {upload.data.alerts.length
                    ? <p className="mt-1">Raised {upload.data.alerts.length} alert{upload.data.alerts.length === 1 ? '' : 's'}: {upload.data.alerts.map((r, i) => <span key={r}>{i > 0 && ', '}<Link className="font-mono underline" to={`/alerts/${encodeURIComponent(r)}`}>{r}</Link></span>)}</p>
                    : <p className="mt-1">No rule was triggered.</p>}
                </div>
              )}
              <ErrorText error={upload.error} />
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr><th className="th">#</th><th className="th">Reference</th><th className="th">Customer</th><th className="th">Channel</th><th className="th">When</th><th className="th text-right">Amount</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.map(({ row, errors }, i) => (
                      <tr key={i} className={errors.length ? 'bg-crimson-50/60' : ''}>
                        <td className="td text-xs text-slate-400">{i + 2}</td>
                        <td className="td font-mono text-xs">{row.reference}{errors.length > 0 && <span className="mt-1 block font-sans text-crimson-700">{errors.join('; ')}</span>}</td>
                        <td className="td">{row.subjectName}<span className="block whitespace-nowrap font-mono text-xs text-slate-400">{row.accountNo}</span></td>
                        <td className="td">{CHANNEL_LABEL[row.channel] ?? row.channel}<span className="block text-xs text-slate-400">{row.direction === 'CREDIT' ? 'Credit' : 'Debit'}</span></td>
                        <td className="td whitespace-nowrap text-xs">{Date.parse(row.occurredAt) ? bsDateTime(row.occurredAt) : row.occurredAt}</td>
                        <td className="td whitespace-nowrap text-right tabular-nums">{Number(row.amount) > 0 ? rupees(row.amount) : row.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>

        <Section title="Detection rules" className="self-start">
          <ul className="divide-y divide-slate-100">
            {rules?.map((r) => (
              <li key={r.code} className="px-5 py-3 text-sm">
                <p className="font-medium text-slate-900">{r.title}</p>
                <p className="mt-0.5 text-slate-500">{r.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
