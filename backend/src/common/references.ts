import { Prisma } from '@prisma/client';
import { fiscalYear } from './nepal';

/** Next reference for a prefix in the current fiscal year, e.g. "CASE-2083/84-0007". */
export async function nextReference(tx: Prisma.TransactionClient, prefix: string, now = new Date()): Promise<string> {
  const fy = fiscalYear(now);
  const key = `${prefix}:${fy}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${fy}-${String(counter.value).padStart(4, '0')}`;
}
