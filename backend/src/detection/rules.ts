import { TTR_THRESHOLD } from '../common/nepal';

/** A transaction as the rules see it. */
export interface RuleTransaction {
  id: string;
  direction: 'CREDIT' | 'DEBIT';
  channel: string;
  amount: number;
  occurredAt: Date;
}

export interface RuleContext {
  /** All transactions on the account in the look-back window, any order. */
  transactions: RuleTransaction[];
  /** Ids of the transactions just submitted; rules only fire when one of these is involved. */
  newIds: Set<string>;
  subjectIsPep: boolean;
  /** When the account was last active before this submission. */
  previousActivityAt: Date | null;
}

export interface RuleHit {
  code: string;
  score: number;
  summary: string;
  transactionIds: string[];
}

const LAKH = 100_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const lakh = (amount: number) => `Rs ${(amount / LAKH).toLocaleString('en-IN', { maximumFractionDigits: 2 })} lakh`;
const byTime = (a: RuleTransaction, b: RuleTransaction) => a.occurredAt.getTime() - b.occurredAt.getTime();

export interface Rule {
  code: string;
  title: string;
  description: string;
  evaluate(ctx: RuleContext): RuleHit[];
}

/** Each cash transaction at or above Rs 10 lakh needs a threshold transaction report. */
export const thresholdCash: Rule = {
  code: 'TTR_CASH',
  title: 'Cash at or above Rs 10 lakh',
  description: 'A single cash deposit or withdrawal of Rs 10 lakh or more.',
  evaluate: ({ transactions, newIds }) =>
    transactions
      .filter((t) => newIds.has(t.id) && t.channel === 'CASH' && t.amount >= TTR_THRESHOLD)
      .map((t) => ({
        code: 'TTR_CASH',
        score: 40,
        summary: `Cash ${t.direction === 'CREDIT' ? 'deposit' : 'withdrawal'} of ${lakh(t.amount)}`,
        transactionIds: [t.id],
      })),
};

/** Several cash deposits just under the threshold within a week. */
export const structuring: Rule = {
  code: 'STRUCTURING',
  title: 'Deposits split to stay under the threshold',
  description: 'Three or more cash deposits of Rs 5–10 lakh within 7 days that together reach Rs 10 lakh.',
  evaluate: ({ transactions, newIds }) => {
    const deposits = transactions
      .filter((t) => t.channel === 'CASH' && t.direction === 'CREDIT' && t.amount >= 5 * LAKH && t.amount < TTR_THRESHOLD)
      .sort(byTime);
    let best: RuleTransaction[] = [];
    for (let i = 0; i < deposits.length; i++) {
      const window = deposits.filter((t) => t.occurredAt >= deposits[i].occurredAt && t.occurredAt.getTime() - deposits[i].occurredAt.getTime() <= 7 * DAY);
      if (window.length > best.length) best = window;
    }
    const total = best.reduce((sum, t) => sum + t.amount, 0);
    if (best.length < 3 || total < TTR_THRESHOLD || !best.some((t) => newIds.has(t.id))) return [];
    return [{
      code: 'STRUCTURING',
      score: 80,
      summary: `${best.length} cash deposits totalling ${lakh(total)} within 7 days, each below Rs 10 lakh`,
      transactionIds: best.map((t) => t.id),
    }];
  },
};

/** Money that comes in and leaves again within two days. */
export const rapidMovement: Rule = {
  code: 'RAPID_MOVEMENT',
  title: 'Funds moved straight through',
  description: 'At least 90% of Rs 5 lakh or more in credits leaves the account within 48 hours.',
  evaluate: ({ transactions, newIds }) => {
    const sorted = [...transactions].sort(byTime);
    for (const credit of sorted.filter((t) => t.direction === 'CREDIT')) {
      const start = credit.occurredAt.getTime();
      const inWindow = sorted.filter((t) => t.occurredAt.getTime() >= start && t.occurredAt.getTime() - start <= 48 * HOUR);
      const credits = inWindow.filter((t) => t.direction === 'CREDIT');
      const debits = inWindow.filter((t) => t.direction === 'DEBIT');
      const inflow = credits.reduce((sum, t) => sum + t.amount, 0);
      const outflow = debits.reduce((sum, t) => sum + t.amount, 0);
      if (inflow >= 5 * LAKH && debits.length && outflow >= inflow * 0.9 && inWindow.some((t) => newIds.has(t.id))) {
        return [{
          code: 'RAPID_MOVEMENT',
          score: 70,
          summary: `${lakh(inflow)} received and ${lakh(outflow)} sent out within 48 hours`,
          transactionIds: inWindow.map((t) => t.id),
        }];
      }
    }
    return [];
  },
};

/** A quiet account that suddenly moves large amounts. */
export const dormantReactivation: Rule = {
  code: 'DORMANT_REACTIVATION',
  title: 'Dormant account reactivated',
  description: 'No activity for a year, then a transaction of Rs 5 lakh or more.',
  evaluate: ({ transactions, newIds, previousActivityAt }) => {
    const fresh = transactions.filter((t) => newIds.has(t.id) && t.amount >= 5 * LAKH).sort(byTime);
    if (!fresh.length || !previousActivityAt) return [];
    if (fresh[0].occurredAt.getTime() - previousActivityAt.getTime() < 365 * DAY) return [];
    return [{
      code: 'DORMANT_REACTIVATION',
      score: 60,
      summary: `Account inactive for over a year, then ${lakh(fresh[0].amount)} moved`,
      transactionIds: fresh.map((t) => t.id),
    }];
  },
};

/** Large transactions by politically exposed persons. */
export const pepLarge: Rule = {
  code: 'PEP_LARGE',
  title: 'Large transaction by a politically exposed person',
  description: 'A politically exposed person moves Rs 25 lakh or more in one transaction.',
  evaluate: ({ transactions, newIds, subjectIsPep }) => {
    if (!subjectIsPep) return [];
    const large = transactions.filter((t) => newIds.has(t.id) && t.amount >= 25 * LAKH);
    if (!large.length) return [];
    return [{
      code: 'PEP_LARGE',
      score: 75,
      summary: `Politically exposed person moved ${lakh(large.reduce((s, t) => s + t.amount, 0))} in ${large.length} transaction(s)`,
      transactionIds: large.map((t) => t.id),
    }];
  },
};

export const RULES: Rule[] = [thresholdCash, structuring, rapidMovement, dormantReactivation, pepLarge];

export function evaluateRules(ctx: RuleContext, rules = RULES): RuleHit[] {
  return rules.flatMap((rule) => rule.evaluate(ctx));
}
