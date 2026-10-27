import { bsDate, CHANNEL_LABEL, rupees, time } from '@/lib/format';
import type { Transaction } from '@/lib/types';
import { Empty } from './ui';

export function TransactionsTable({ rows, showAccount = true }: { rows: Transaction[]; showAccount?: boolean }) {
  if (!rows.length) return <Empty>No transactions.</Empty>;
  const sorted = [...rows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Date (BS)</th>
            {showAccount && <th className="th">Account</th>}
            <th className="th">Channel</th>
            <th className="th">Counterparty</th>
            <th className="th text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((t) => (
            <tr key={t.id}>
              <td className="td whitespace-nowrap">
                {bsDate(t.occurredAt)}
                <span className="block text-xs text-slate-400">{time(t.occurredAt)} · {t.reference}</span>
              </td>
              {showAccount && <td className="td whitespace-nowrap font-mono text-xs">{t.account?.accountNo ?? '—'}</td>}
              <td className="td">{CHANNEL_LABEL[t.channel] ?? t.channel}{t.district && <span className="block text-xs text-slate-400">{t.district}</span>}</td>
              <td className="td">
                {t.counterpartyName ?? <span className="text-slate-400">—</span>}
                {t.narration && <span className="block max-w-xs truncate text-xs text-slate-400" title={t.narration}>{t.narration}</span>}
              </td>
              <td className="td whitespace-nowrap text-right">
                <span className="font-medium tabular-nums text-slate-900">{rupees(t.amount)}</span>
                <span className={`block text-xs ${t.direction === 'CREDIT' ? 'text-emerald-700' : 'text-slate-500'}`}>{t.direction === 'CREDIT' ? '↓ Credit' : '↑ Debit'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
