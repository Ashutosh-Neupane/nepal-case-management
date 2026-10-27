import { Agency, CaseStatus, Recommendation, Role } from '@prisma/client';
import { CaseState, dueDate, planTransition, WorkflowError } from '../src/cases/workflow';

const analyst = { id: 'a1', role: Role.ANALYST };
const otherAnalyst = { id: 'a2', role: Role.ANALYST };
const supervisor = { id: 's1', role: Role.SUPERVISOR };
const base: CaseState = { status: CaseStatus.OPEN, assigneeId: 'a1', submittedById: null, recommendation: null, agency: null };

describe('case workflow', () => {
  it('lets the assigned analyst start and submit an investigation', () => {
    expect(planTransition(base, { to: CaseStatus.UNDER_INVESTIGATION }, analyst).status).toBe(CaseStatus.UNDER_INVESTIGATION);
    const submitted = planTransition({ ...base, status: CaseStatus.UNDER_INVESTIGATION }, {
      to: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.DISSEMINATE, agency: Agency.DMLI, note: 'Layering through 4 accounts.',
    }, analyst);
    expect(submitted).toMatchObject({ status: CaseStatus.PENDING_APPROVAL, agency: Agency.DMLI, submittedById: 'a1' });
  });

  it('blocks other analysts', () => {
    expect(() => planTransition(base, { to: CaseStatus.UNDER_INVESTIGATION }, otherAnalyst)).toThrow(WorkflowError);
  });

  it('needs findings and an agency to submit for dissemination', () => {
    const s = { ...base, status: CaseStatus.UNDER_INVESTIGATION };
    expect(() => planTransition(s, { to: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.DISSEMINATE, note: 'x' }, analyst)).toThrow(/agency/);
    expect(() => planTransition(s, { to: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.CLOSE }, analyst)).toThrow(/findings/);
  });

  it('requires a second person to approve', () => {
    const pending: CaseState = { ...base, status: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.DISSEMINATE, agency: Agency.CIAA, submittedById: 's1', assigneeId: 's1' };
    expect(() => planTransition(pending, { to: CaseStatus.DISSEMINATED }, supervisor)).toThrow(/different supervisor/);
    expect(() => planTransition({ ...pending, submittedById: 'a1' }, { to: CaseStatus.DISSEMINATED }, analyst)).toThrow(/supervisor/);
    expect(planTransition({ ...pending, submittedById: 'a1' }, { to: CaseStatus.DISSEMINATED }, supervisor))
      .toMatchObject({ status: CaseStatus.DISSEMINATED, agency: Agency.CIAA });
  });

  it('only approves what the analyst recommended', () => {
    const pending: CaseState = { ...base, status: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.CLOSE, submittedById: 'a1' };
    expect(() => planTransition(pending, { to: CaseStatus.DISSEMINATED, agency: Agency.DMLI }, supervisor)).toThrow(/recommended closing/);
    expect(planTransition(pending, { to: CaseStatus.CLOSED }, supervisor).status).toBe(CaseStatus.CLOSED);
  });

  it('returns a case with a note and clears the recommendation', () => {
    const pending: CaseState = { ...base, status: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.CLOSE, submittedById: 'a1' };
    expect(() => planTransition(pending, { to: CaseStatus.UNDER_INVESTIGATION }, supervisor)).toThrow(/Explain/);
    expect(planTransition(pending, { to: CaseStatus.UNDER_INVESTIGATION, note: 'Get KYC documents.' }, supervisor))
      .toMatchObject({ status: CaseStatus.UNDER_INVESTIGATION, recommendation: null, submittedById: null });
  });

  it('never reopens finished cases', () => {
    expect(() => planTransition({ ...base, status: CaseStatus.CLOSED }, { to: CaseStatus.OPEN }, supervisor)).toThrow(/finished/);
  });

  it('sets the deadline from priority', () => {
    const from = new Date('2026-10-27T00:00:00Z');
    expect(dueDate('CRITICAL', from).toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(dueDate('LOW', from).toISOString()).toBe('2026-12-26T00:00:00.000Z');
  });
});
