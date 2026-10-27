export type Role = 'REPORTING_OFFICER' | 'ANALYST' | 'SUPERVISOR' | 'ADMIN';
export type AlertType = 'STR' | 'TTR' | 'RULE';
export type AlertStatus = 'NEW' | 'FALSE_POSITIVE' | 'ESCALATED';
export type CaseStatus = 'OPEN' | 'UNDER_INVESTIGATION' | 'PENDING_APPROVAL' | 'DISSEMINATED' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Typology = 'STRUCTURING' | 'HUNDI' | 'TRADE_BASED' | 'FRAUD' | 'TAX_EVASION' | 'CORRUPTION' | 'TERRORISM_FINANCING' | 'OTHER';
export type Agency = 'DMLI' | 'NEPAL_POLICE' | 'DRI' | 'IRD' | 'CIAA' | 'NRB';
export type Recommendation = 'DISSEMINATE' | 'CLOSE';

export interface Person { id: string; name: string; designation?: string | null; role?: Role }

export interface User {
  id: string;
  email: string;
  name: string;
  designation: string | null;
  role: Role;
  active: boolean;
  entity: { id: string; code: string; name: string; nameNe: string } | null;
}

export interface Entity { id: string; code: string; name: string; nameNe: string; type: string; _count?: { alerts: number; users: number } }

export interface Subject {
  id: string;
  kind: 'INDIVIDUAL' | 'ORGANIZATION';
  name: string;
  nameNe: string | null;
  citizenshipNo: string | null;
  panNo: string | null;
  dateOfBirth: string | null;
  district: string | null;
  occupation: string | null;
  isPep: boolean;
}

export interface Transaction {
  id: string;
  reference: string;
  direction: 'CREDIT' | 'DEBIT';
  channel: string;
  amount: string | number;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  narration: string | null;
  district: string | null;
  occurredAt: string;
  account?: { accountNo: string };
}

export interface AlertRow {
  id: string;
  reference: string;
  type: AlertType;
  status: AlertStatus;
  ruleCode: string | null;
  score: number;
  summary: string;
  createdAt: string;
  entity: { code: string; name: string };
  subject: { id: string; name: string; isPep: boolean };
}

export interface AlertDetail extends Omit<AlertRow, 'subject'> {
  narrative: string | null;
  triageNote: string | null;
  triagedAt: string | null;
  subject: Subject;
  case: { id: string; reference: string; status: CaseStatus; title: string } | null;
  transactions: { transaction: Transaction }[];
}

export interface CaseRow {
  id: string;
  reference: string;
  title: string;
  status: CaseStatus;
  priority: Priority;
  typology: Typology;
  dueAt: string;
  createdAt: string;
  assignee: Person | null;
  subjects: { subject: { id: string; name: string; isPep: boolean } }[];
  _count: { alerts: number };
}

export interface AuditEvent { id: string; action: string; detail: Record<string, unknown> | null; createdAt: string; actor: Person | null }

export interface CaseDetail extends Omit<CaseRow, 'subjects' | '_count'> {
  summary: string | null;
  recommendation: Recommendation | null;
  submittedById: string | null;
  agency: Agency | null;
  disseminatedAt: string | null;
  closedAt: string | null;
  closureReason: string | null;
  updatedAt: string;
  subjects: { role: string; subject: Subject & { accounts: { id: string; accountNo: string; entity: { code: string; name: string } }[] } }[];
  alerts: (Omit<AlertRow, 'subject'> & { transactions: { transaction: Transaction }[] })[];
  notes: { id: string; body: string; createdAt: string; author: Person }[];
  tasks: { id: string; title: string; dueAt: string | null; doneAt: string | null; assignee: Person | null }[];
  events: AuditEvent[];
}

export interface NetworkNode { id: string; kind: 'subject' | 'account' | 'counterparty'; label: string; sublabel?: string; subjectId?: string; isPep?: boolean }
export interface NetworkEdge { from: string; to: string; inflow: number; outflow: number; count: number }

export interface SubjectProfile extends Subject {
  accounts: { id: string; accountNo: string; entity: { code: string; name: string; type: string }; transactions: Transaction[] }[];
  alerts: Pick<AlertRow, 'id' | 'reference' | 'type' | 'status' | 'score' | 'summary' | 'createdAt'>[];
  cases: { case: { id: string; reference: string; title: string; status: CaseStatus; priority: Priority } }[];
  totals: { inflow: number; outflow: number; cash: number };
  network: { nodes: NetworkNode[]; edges: NetworkEdge[] };
}

export interface Page<T> { rows: T[]; total: number; page: number; pageSize: number }
