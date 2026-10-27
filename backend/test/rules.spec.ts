import { fiscalYear } from '../src/common/nepal';
import { dormantReactivation, evaluateRules, pepLarge, rapidMovement, RuleTransaction, structuring, thresholdCash } from '../src/detection/rules';

const LAKH = 100_000;
const at = (day: number, hour = 10) => new Date(Date.UTC(2026, 9, day, hour));
let n = 0;
const txn = (amount: number, occurredAt: Date, direction: 'CREDIT' | 'DEBIT' = 'CREDIT', channel = 'CASH'): RuleTransaction =>
  ({ id: `t${++n}`, amount, occurredAt, direction, channel });
const ctx = (transactions: RuleTransaction[], extra: Partial<Parameters<typeof evaluateRules>[0]> = {}) => ({
  transactions, newIds: new Set(transactions.map((t) => t.id)), subjectIsPep: false, previousActivityAt: null, ...extra,
});

describe('threshold cash (TTR)', () => {
  it('flags cash of exactly Rs 10 lakh', () => {
    expect(thresholdCash.evaluate(ctx([txn(10 * LAKH, at(1))]))).toHaveLength(1);
  });
  it('ignores cash just below the threshold and large transfers', () => {
    expect(thresholdCash.evaluate(ctx([txn(9.99 * LAKH, at(1)), txn(50 * LAKH, at(1), 'CREDIT', 'TRANSFER')]))).toHaveLength(0);
  });
});

describe('structuring', () => {
  it('flags three deposits under the threshold within a week', () => {
    const hits = structuring.evaluate(ctx([txn(9 * LAKH, at(1)), txn(8.5 * LAKH, at(3)), txn(9.5 * LAKH, at(6))]));
    expect(hits).toHaveLength(1);
    expect(hits[0].transactionIds).toHaveLength(3);
    expect(hits[0].summary).toContain('27 lakh');
  });
  it('does not flag deposits spread over more than 7 days', () => {
    expect(structuring.evaluate(ctx([txn(9 * LAKH, at(1)), txn(9 * LAKH, at(5)), txn(9 * LAKH, at(10))]))).toHaveLength(0);
  });
  it('only fires when a new transaction is part of the pattern', () => {
    const old = [txn(9 * LAKH, at(1)), txn(9 * LAKH, at(2)), txn(9 * LAKH, at(3))];
    const fresh = txn(1 * LAKH, at(20));
    expect(structuring.evaluate(ctx([...old, fresh], { newIds: new Set([fresh.id]) }))).toHaveLength(0);
  });
});

describe('rapid movement', () => {
  it('flags money sent straight out within 48 hours', () => {
    const hits = rapidMovement.evaluate(ctx([
      txn(20 * LAKH, at(1, 9), 'CREDIT', 'TRANSFER'),
      txn(19 * LAKH, at(2, 15), 'DEBIT', 'TRANSFER'),
    ]));
    expect(hits).toHaveLength(1);
  });
  it('ignores money that stays in the account', () => {
    expect(rapidMovement.evaluate(ctx([
      txn(20 * LAKH, at(1, 9), 'CREDIT', 'TRANSFER'),
      txn(5 * LAKH, at(2, 15), 'DEBIT', 'TRANSFER'),
    ]))).toHaveLength(0);
  });
});

describe('dormant reactivation', () => {
  it('flags a large transaction after a year of silence', () => {
    const hits = dormantReactivation.evaluate(ctx([txn(6 * LAKH, at(1))], { previousActivityAt: new Date(Date.UTC(2025, 6, 1)) }));
    expect(hits).toHaveLength(1);
  });
  it('ignores recently active accounts', () => {
    expect(dormantReactivation.evaluate(ctx([txn(6 * LAKH, at(1))], { previousActivityAt: new Date(Date.UTC(2026, 8, 1)) }))).toHaveLength(0);
  });
});

describe('politically exposed persons', () => {
  it('flags Rs 25 lakh or more only for PEPs', () => {
    const t = [txn(30 * LAKH, at(1), 'CREDIT', 'TRANSFER')];
    expect(pepLarge.evaluate(ctx(t, { subjectIsPep: true }))).toHaveLength(1);
    expect(pepLarge.evaluate(ctx(t, { subjectIsPep: false }))).toHaveLength(0);
  });
});

describe('fiscal year', () => {
  it('starts on 1 Shrawan', () => {
    expect(fiscalYear(new Date('2026-07-10T12:00:00Z'))).toBe('2082/83'); // Ashadh 2083
    expect(fiscalYear(new Date('2026-07-20T12:00:00Z'))).toBe('2083/84'); // Shrawan 2083
    expect(fiscalYear(new Date('2026-10-27T12:00:00Z'))).toBe('2083/84'); // Kartik 2083
  });
});
