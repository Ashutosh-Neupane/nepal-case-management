import { Agency, CaseStatus, Priority, Recommendation, Role } from '@prisma/client';

/** Days allowed to finish an investigation, by priority. */
export const DUE_DAYS: Record<Priority, number> = { CRITICAL: 7, HIGH: 15, MEDIUM: 30, LOW: 60 };

export function dueDate(priority: Priority, from = new Date()): Date {
  return new Date(from.getTime() + DUE_DAYS[priority] * 86_400_000);
}

export interface TransitionRequest {
  to: CaseStatus;
  note?: string;
  recommendation?: Recommendation;
  agency?: Agency;
}

export interface CaseState {
  status: CaseStatus;
  assigneeId: string | null;
  submittedById: string | null;
  recommendation: Recommendation | null;
  agency: Agency | null;
}

export interface Actor {
  id: string;
  role: Role;
}

/** Thrown with a message that can be shown to the user. */
export class WorkflowError extends Error {}

/**
 * Checks a status change and returns the fields to update.
 *
 *   OPEN ─► UNDER_INVESTIGATION ─► PENDING_APPROVAL ─► DISSEMINATED
 *                  ▲                     │        └──► CLOSED
 *                  └──── returned ◄──────┘
 *
 * The officer who submits a case for approval can never approve it.
 */
export function planTransition(state: CaseState, req: TransitionRequest, actor: Actor) {
  const isSupervisor = actor.role === Role.SUPERVISOR;
  const isAssignee = state.assigneeId === actor.id;
  const note = req.note?.trim();
  const from = state.status;
  const to = req.to;

  if (from === to) throw new WorkflowError('The case already has this status.');
  if (from === CaseStatus.DISSEMINATED || from === CaseStatus.CLOSED) {
    throw new WorkflowError('This case is finished and cannot change.');
  }

  if (from === CaseStatus.OPEN && to === CaseStatus.UNDER_INVESTIGATION) {
    if (!state.assigneeId) throw new WorkflowError('Assign an analyst before starting the investigation.');
    if (!isAssignee && !isSupervisor) throw new WorkflowError('Only the assigned analyst can start this investigation.');
    return { status: to };
  }

  if (from === CaseStatus.UNDER_INVESTIGATION && to === CaseStatus.PENDING_APPROVAL) {
    if (!isAssignee) throw new WorkflowError('Only the assigned analyst can submit this case.');
    if (!req.recommendation) throw new WorkflowError('Choose a recommendation: send to an agency or close.');
    if (req.recommendation === Recommendation.DISSEMINATE && !req.agency) throw new WorkflowError('Choose the agency to send the case to.');
    if (!note) throw new WorkflowError('Write the findings that support your recommendation.');
    return {
      status: to,
      recommendation: req.recommendation,
      agency: req.recommendation === Recommendation.DISSEMINATE ? req.agency! : null,
      submittedById: actor.id,
    };
  }

  if (from === CaseStatus.PENDING_APPROVAL) {
    if (!isSupervisor) throw new WorkflowError('Only a supervisor can decide on a submitted case.');
    if (state.submittedById === actor.id) throw new WorkflowError('A different supervisor must approve a case you submitted.');
    if (to === CaseStatus.UNDER_INVESTIGATION) {
      if (!note) throw new WorkflowError('Explain what more is needed before returning the case.');
      return { status: to, recommendation: null, agency: null, submittedById: null };
    }
    if (to === CaseStatus.DISSEMINATED) {
      if (state.recommendation !== Recommendation.DISSEMINATE) throw new WorkflowError('The analyst recommended closing this case.');
      const agency = req.agency ?? state.agency;
      if (!agency) throw new WorkflowError('Choose the agency to send the case to.');
      return { status: to, agency, disseminatedAt: new Date() };
    }
    if (to === CaseStatus.CLOSED) {
      if (state.recommendation !== Recommendation.CLOSE) throw new WorkflowError('The analyst recommended sending this case to an agency.');
      return { status: to, closedAt: new Date(), closureReason: note || 'Closed on the analyst\'s recommendation.' };
    }
  }

  // A supervisor may close an open case early, e.g. a duplicate.
  if (to === CaseStatus.CLOSED && isSupervisor && (from === CaseStatus.OPEN || from === CaseStatus.UNDER_INVESTIGATION)) {
    if (!note) throw new WorkflowError('Give the reason for closing the case.');
    return { status: to, closedAt: new Date(), closureReason: note };
  }

  throw new WorkflowError(`A case cannot move from ${from} to ${to}.`);
}
