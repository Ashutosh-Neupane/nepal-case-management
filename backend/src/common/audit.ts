import { Prisma } from '@prisma/client';

/** Records an audit event inside the caller's transaction. */
export function audit(
  tx: Prisma.TransactionClient,
  event: { action: string; actorId?: string | null; caseId?: string; alertId?: string; detail?: Prisma.InputJsonValue },
) {
  return tx.auditEvent.create({ data: event });
}
