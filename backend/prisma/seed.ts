/**
 * Demo data: fictional institutions, people and companies. Transactions go through the
 * real reporting service so the detection rules raise the alerts, then a few cases are
 * worked through the workflow. Run on an empty, migrated database: npm run db:seed
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Agency, CaseStatus, Channel, Direction, EntityType, PrismaClient, Priority, Recommendation, Role, SubjectKind, Typology } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AlertsService, TriageDecision } from '../src/alerts/alerts.module';
import { AppModule } from '../src/app.module';
import { CasesService } from '../src/cases/cases.module';
import { AuthUser } from '../src/common/auth';
import { ReportsService, SubjectDto } from '../src/detection/reports.module';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2083';
const LAKH = 100_000;
const prisma = new PrismaClient();
const now = Date.now();
const daysAgo = (d: number, hour = 11) => {
  const t = new Date(now - d * 86_400_000);
  t.setUTCHours(hour - 6, (d * 7) % 60, 0, 0); // hour in Nepal time (UTC+5:45, rounded)
  return t.toISOString();
};

const ENTITIES = [
  { code: 'ADB', name: 'Annapurna Demo Bank Ltd.', nameNe: 'अन्नपूर्ण डेमो बैंक लि.', type: EntityType.COMMERCIAL_BANK },
  { code: 'KDB', name: 'Koshi Demo Bank Ltd.', nameNe: 'कोशी डेमो बैंक लि.', type: EntityType.COMMERCIAL_BANK },
  { code: 'BDV', name: 'Bagmati Demo Development Bank', nameNe: 'बागमती डेमो विकास बैंक', type: EntityType.DEVELOPMENT_BANK },
  { code: 'GSC', name: 'Gandaki Demo Saving & Credit Cooperative', nameNe: 'गण्डकी डेमो बचत तथा ऋण सहकारी', type: EntityType.COOPERATIVE },
  { code: 'LRM', name: 'Lumbini Demo Remit', nameNe: 'लुम्बिनी डेमो रेमिट', type: EntityType.REMITTANCE },
];

const STAFF = [
  { email: 'admin@demo.np', name: 'Rajesh Shrestha', designation: 'System Administrator', role: Role.ADMIN },
  { email: 'supervisor@demo.np', name: 'Sabina Joshi', designation: 'Director, Analysis Division', role: Role.SUPERVISOR },
  { email: 'supervisor2@demo.np', name: 'Prakash Bhandari', designation: 'Deputy Director', role: Role.SUPERVISOR },
  { email: 'analyst@demo.np', name: 'Anil Gurung', designation: 'Financial Analyst', role: Role.ANALYST },
  { email: 'analyst2@demo.np', name: 'Puja Thapa', designation: 'Financial Analyst', role: Role.ANALYST },
  { email: 'analyst3@demo.np', name: 'Nabin Rai', designation: 'Assistant Analyst', role: Role.ANALYST },
];

type Txn = {
  reference: string; accountNo: string; subject: SubjectDto; direction: Direction; channel: Channel; amount: number;
  counterpartyName?: string; counterpartyAccount?: string; narration?: string; district?: string; occurredAt: string;
};

const person = (name: string, nameNe: string, citizenshipNo: string, district: string, occupation: string, isPep = false): SubjectDto =>
  ({ kind: SubjectKind.INDIVIDUAL, name, nameNe, citizenshipNo, district, occupation, isPep });
const company = (name: string, nameNe: string, panNo: string, district: string, occupation: string): SubjectDto =>
  ({ kind: SubjectKind.ORGANIZATION, name, nameNe, panNo, district, occupation });

const ram = person('Ram Prasad Adhikari', 'राम प्रसाद अधिकारी', '27-01-75-01234', 'Kathmandu', 'Land broker');
const everest = company('Everest Trading House Pvt. Ltd.', 'एभरेस्ट ट्रेडिङ हाउस प्रा. लि.', '601234567', 'Morang', 'Importer');
const mahakali = company('Mahakali Impex', 'महाकाली इम्पेक्स', '602345678', 'Kanchanpur', 'Importer');
const bishnu = person('Bishnu Kumar Thapa', 'विष्णु कुमार थापा', '35-02-70-04567', 'Kaski', 'Provincial assembly member', true);
const sita = person('Sita Devi Karki', 'सीता देवी कार्की', '22-03-68-07788', 'Jhapa', 'Homemaker');
const himal = company('Himal Hardware Suppliers Pvt. Ltd.', 'हिमाल हार्डवेयर सप्लायर्स प्रा. लि.', '603456789', 'Lalitpur', 'Hardware wholesaler');
const hari = person('Hari Bahadur Gurung', 'हरि बहादुर गुरुङ', '41-01-80-02211', 'Rupandehi', 'Driver');
const kamal = person('Kamal Raj Pandey', 'कमल राज पाण्डे', '27-02-72-03344', 'Bhaktapur', 'Shopkeeper');

function scenarioTransactions() {
  const adb: Txn[] = [];
  const kdb: Txn[] = [];
  const bdv: Txn[] = [];
  const gsc: Txn[] = [];
  const lrm: Txn[] = [];

  // Structuring: four cash deposits just under Rs 10 lakh in five days.
  [[9.2, 12, 'Kathmandu'], [9.5, 11, 'Lalitpur'], [8.8, 10, 'Kathmandu'], [9.7, 8, 'Bhaktapur']].forEach(([amount, d, district], i) =>
    adb.push({ reference: `ADB-CD-${1001 + i}`, accountNo: '0101-0045-7781', subject: ram, direction: 'CREDIT', channel: 'CASH',
      amount: Number(amount) * LAKH, narration: 'Cash deposit', district: String(district), occurredAt: daysAgo(Number(d)) }));

  // Trade-based / hundi pattern: large inflows leave at once to several counterparties.
  kdb.push(
    { reference: 'KDB-TT-5001', accountNo: '2201-0099-0012', subject: everest, direction: 'CREDIT', channel: 'TRANSFER', amount: 48 * LAKH,
      counterpartyName: 'Overseas buyer (LC 2083/112)', counterpartyAccount: 'SWIFT-HK-88213', narration: 'Inward remittance against invoice', occurredAt: daysAgo(9, 10) },
    { reference: 'KDB-TT-5002', accountNo: '2201-0099-0012', subject: everest, direction: 'DEBIT', channel: 'CONNECT_IPS', amount: 15 * LAKH,
      counterpartyName: 'Mahakali Impex', counterpartyAccount: '3301-0007-4410', narration: 'Payment for goods', occurredAt: daysAgo(9, 15) },
    { reference: 'KDB-TT-5003', accountNo: '2201-0099-0012', subject: everest, direction: 'DEBIT', channel: 'CONNECT_IPS', amount: 14.5 * LAKH,
      counterpartyName: 'Kamal Raj Pandey', counterpartyAccount: '0101-0088-1200', narration: 'Advance', occurredAt: daysAgo(8, 11) },
    { reference: 'KDB-TT-5004', accountNo: '2201-0099-0012', subject: everest, direction: 'DEBIT', channel: 'CASH', amount: 9.8 * LAKH,
      narration: 'Cash withdrawal', district: 'Morang', occurredAt: daysAgo(8, 14) },
    { reference: 'KDB-TT-5005', accountNo: '2201-0099-0012', subject: everest, direction: 'DEBIT', channel: 'TRANSFER', amount: 6.2 * LAKH,
      counterpartyName: 'Hari Bahadur Gurung', counterpartyAccount: '7701-0003-9001', narration: 'Transport charges', occurredAt: daysAgo(8, 16) },
  );
  bdv.push(
    { reference: 'BDV-IN-301', accountNo: '3301-0007-4410', subject: mahakali, direction: 'CREDIT', channel: 'CONNECT_IPS', amount: 15 * LAKH,
      counterpartyName: 'Everest Trading House Pvt. Ltd.', counterpartyAccount: '2201-0099-0012', occurredAt: daysAgo(9, 15) },
    { reference: 'BDV-OUT-302', accountNo: '3301-0007-4410', subject: mahakali, direction: 'DEBIT', channel: 'CASH', amount: 14.2 * LAKH,
      narration: 'Cash withdrawal', district: 'Kanchanpur', occurredAt: daysAgo(8, 10) },
  );
  adb.push({ reference: 'ADB-IN-2290', accountNo: '0101-0088-1200', subject: kamal, direction: 'CREDIT', channel: 'CONNECT_IPS', amount: 14.5 * LAKH,
    counterpartyName: 'Everest Trading House Pvt. Ltd.', counterpartyAccount: '2201-0099-0012', occurredAt: daysAgo(8, 11) });

  // Politically exposed person.
  bdv.push({ reference: 'BDV-RT-410', accountNo: '3301-0021-0090', subject: bishnu, direction: 'CREDIT', channel: 'TRANSFER', amount: 42 * LAKH,
    counterpartyName: 'Shree Construction Pvt. Ltd.', counterpartyAccount: '4401-0300-1120', narration: 'Consultancy', occurredAt: daysAgo(15) });

  // Dormant account suddenly active.
  kdb.push(
    { reference: 'KDB-OLD-0001', accountNo: '2201-0001-3344', subject: sita, direction: 'CREDIT', channel: 'CASH', amount: 5000, occurredAt: new Date(now - 520 * 86_400_000).toISOString() },
  );
  const sitaLater: Txn[] = [
    { reference: 'KDB-CD-7710', accountNo: '2201-0001-3344', subject: sita, direction: 'CREDIT', channel: 'CASH', amount: 12 * LAKH, district: 'Jhapa', occurredAt: daysAgo(4) },
  ];

  // Ordinary business cash, likely a false positive.
  adb.push({ reference: 'ADB-CD-3301', accountNo: '0101-0300-5000', subject: himal, direction: 'CREDIT', channel: 'CASH', amount: 15.5 * LAKH,
    narration: 'Daily sales deposit', district: 'Lalitpur', occurredAt: daysAgo(6) });

  // Remittances drawn out in cash immediately.
  [[3.1, 20, 9], [2.9, 20, 12]].forEach(([amount, d, h], i) =>
    lrm.push({ reference: `LRM-IN-90${i}`, accountNo: 'LRM-W-55120', subject: hari, direction: 'CREDIT', channel: 'REMITTANCE', amount: Number(amount) * LAKH,
      counterpartyName: 'Sender, Doha', occurredAt: daysAgo(Number(d), Number(h)) }));
  lrm.push({ reference: 'LRM-OUT-911', accountNo: 'LRM-W-55120', subject: hari, direction: 'DEBIT', channel: 'CASH', amount: 5.8 * LAKH,
    district: 'Rupandehi', occurredAt: daysAgo(19, 10) });

  // Cooperative members depositing just under the threshold.
  const coopMember = person('Gita Kumari Poudel', 'गीता कुमारी पौडेल', '39-01-78-05566', 'Tanahun', 'Teacher');
  [[9.1, 3], [9.4, 2], [8.9, 1]].forEach(([amount, d], i) =>
    gsc.push({ reference: `GSC-DP-${60 + i}`, accountNo: 'GSC-M-0420', subject: coopMember, direction: 'CREDIT', channel: 'CASH', amount: Number(amount) * LAKH,
      district: 'Tanahun', occurredAt: daysAgo(Number(d)) }));

  return { adb, kdb, bdv, gsc, lrm, sitaLater };
}

/** Everyday threshold reports spread over the month, so the queue and trend look real. */
function backgroundTransactions(code: string, count: number, seed: number): Txn[] {
  const names = [
    ['Suman Shrestha', 'सुमन श्रेष्ठ'], ['Binod Khadka', 'विनोद खड्का'], ['Laxmi Maharjan', 'लक्ष्मी महर्जन'], ['Dipak Bhattarai', 'दीपक भट्टराई'],
    ['Rita Tamang', 'रीता तामाङ'], ['Mohan Yadav', 'मोहन यादव'], ['Kiran Basnet', 'किरण बस्नेत'], ['Sarita Chaudhary', 'सरिता चौधरी'],
  ];
  const districts = ['Kathmandu', 'Morang', 'Sunsari', 'Kaski', 'Rupandehi', 'Chitwan', 'Parsa', 'Banke', 'Jhapa', 'Dhanusha'];
  return Array.from({ length: count }, (_, i) => {
    const k = (seed * 31 + i * 17) % 997;
    const [name, nameNe] = names[(seed + i) % names.length];
    const subject = person(`${name}`, nameNe, `${10 + (k % 60)}-0${(k % 3) + 1}-${70 + (k % 20)}-${String(10000 + k * 7).slice(-5)}`,
      districts[k % districts.length], 'Business');
    return {
      reference: `${code}-BG-${seed}${i}`, accountNo: `${code}-${String(4000 + k).padStart(6, '0')}`, subject,
      direction: k % 4 === 0 ? 'DEBIT' : 'CREDIT', channel: 'CASH', amount: (10 + (k % 23)) * LAKH + (k % 9) * 1000,
      district: districts[k % districts.length], occurredAt: daysAgo(1 + (k % 28), 10 + (k % 6)),
    } as Txn;
  });
}

async function main() {
  if (await prisma.user.count()) throw new Error('The database already has users; seed an empty database.');
  const hash = await bcrypt.hash(PASSWORD, 10);
  const entities = Object.fromEntries(await Promise.all(ENTITIES.map(async (e) => [e.code, await prisma.reportingEntity.create({ data: e })])));
  const staff = Object.fromEntries(await Promise.all(STAFF.map(async (s) => [s.email, await prisma.user.create({ data: { ...s, passwordHash: hash } })])));
  const officers: Record<string, AuthUser> = {};
  const officerNames: Record<string, string> = { ADB: 'Manisha Koirala', KDB: 'Sunil Lama', BDV: 'Rabin Shahi', GSC: 'Kopila Sapkota', LRM: 'Dinesh Oli' };
  for (const e of ENTITIES) {
    const u = await prisma.user.create({
      data: { email: `${e.code.toLowerCase()}@demo.np`, name: officerNames[e.code], designation: 'Compliance Officer', role: Role.REPORTING_OFFICER, entityId: entities[e.code].id, passwordHash: hash },
    });
    officers[e.code] = { id: u.id, name: u.name, email: u.email, role: u.role, entityId: u.entityId };
  }
  const asUser = (email: string): AuthUser => ({ ...staff[email], entityId: null });

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const reports = app.get(ReportsService);
  const alerts = app.get(AlertsService);
  const cases = app.get(CasesService);

  const s = scenarioTransactions();
  await reports.submitTransactions(officers.KDB, { transactions: s.kdb.filter((t) => t.reference === 'KDB-OLD-0001') });
  for (const [code, list] of [['ADB', s.adb], ['KDB', s.kdb.filter((t) => t.reference !== 'KDB-OLD-0001')], ['BDV', s.bdv], ['GSC', s.gsc], ['LRM', s.lrm], ['KDB', s.sitaLater]] as const) {
    await reports.submitTransactions(officers[code], { transactions: [...list] });
  }
  for (const [code, n, seed] of [['ADB', 7, 1], ['KDB', 6, 2], ['BDV', 5, 3], ['GSC', 3, 4], ['LRM', 3, 5]] as const) {
    await reports.submitTransactions(officers[code], { transactions: backgroundTransactions(code, n, seed) });
  }
  await reports.fileSuspiciousReport(officers.KDB, {
    subject: everest,
    summary: 'Import invoices do not match goods cleared at customs',
    narrative: 'Everest Trading House received Rs 48 lakh against an invoice for kitchen equipment, but the customs declaration at Biratnagar shows goods worth about Rs 9 lakh. Funds were moved out to three parties within two days, one in cash. The customer could not explain the price difference.',
    transactionReferences: ['KDB-TT-5001', 'KDB-TT-5002', 'KDB-TT-5003'],
  });

  // Alerts get the time of their latest transaction, so the trend reflects when activity happened.
  await prisma.$executeRaw`
    UPDATE "Alert" a SET "createdAt" = sub.latest + interval '2 hours'
    FROM (SELECT at."alertId", MAX(t."occurredAt") AS latest FROM "AlertTransaction" at JOIN "Transaction" t ON t.id = at."transactionId" GROUP BY 1) sub
    WHERE a.id = sub."alertId"`;
  await prisma.$executeRaw`UPDATE "Alert" SET "createdAt" = now() - interval '7 days' WHERE type = 'STR'`;

  const find = (rule: string, subjectName: string) =>
    prisma.alert.findFirstOrThrow({ where: { ruleCode: rule === 'STR' ? null : rule, type: rule === 'STR' ? 'STR' : undefined, subject: { name: subjectName } } });
  const anil = asUser('analyst@demo.np');
  const puja = asUser('analyst2@demo.np');
  const sabina = asUser('supervisor@demo.np');
  const prakash = asUser('supervisor2@demo.np');

  // 1. Structuring — under investigation by Anil.
  const a1 = await find('STRUCTURING', ram.name);
  const c1 = await alerts.triage(anil, a1.id, { decision: TriageDecision.NEW_CASE, title: 'Cash structuring by a land broker in Kathmandu Valley', priority: Priority.HIGH, typology: Typology.STRUCTURING, note: 'Deposits at three branches in five days.' });
  await cases.update(anil, c1.caseId!, { assigneeId: anil.id, summary: 'Four cash deposits of Rs 8.8–9.7 lakh at different branches within five days, total Rs 37.2 lakh. Customer profile: land broker, declared monthly income Rs 1.5 lakh.' });
  await cases.transition(anil, c1.caseId!, { to: CaseStatus.UNDER_INVESTIGATION });
  await cases.addNote(anil, c1.caseId!, 'Requested KYC file and source-of-funds declaration from Annapurna Demo Bank.');
  await cases.addTask(anil, c1.caseId!, { title: 'Check land registration records at Kathmandu Land Revenue Office', assigneeId: anil.id });
  await cases.addTask(anil, c1.caseId!, { title: 'Get CCTV and deposit slips from the three branches', assigneeId: anil.id });

  // 2. Trade-based laundering — submitted by Puja, awaiting approval.
  const a2 = await find('RAPID_MOVEMENT', everest.name);
  const c2 = await alerts.triage(puja, a2.id, { decision: TriageDecision.NEW_CASE, title: 'Over-invoiced imports and onward payments — Everest Trading House', priority: Priority.CRITICAL, typology: Typology.TRADE_BASED });
  const str = await find('STR', everest.name);
  await alerts.triage(puja, str.id, { decision: TriageDecision.LINK_CASE, caseId: c2.caseId, note: 'Same customer and transactions.' });
  const mahakaliAlert = await prisma.alert.findFirst({ where: { subject: { name: mahakali.name }, status: 'NEW' } });
  if (mahakaliAlert) await alerts.triage(puja, mahakaliAlert.id, { decision: TriageDecision.LINK_CASE, caseId: c2.caseId, note: 'Recipient of Rs 15 lakh, withdrawn in cash next day.' });
  await cases.update(puja, c2.caseId!, { assigneeId: puja.id });
  await cases.transition(puja, c2.caseId!, { to: CaseStatus.UNDER_INVESTIGATION });
  await cases.addNote(puja, c2.caseId!, 'Customs data from Biratnagar: declared value about Rs 9 lakh against Rs 48 lakh received.');
  await cases.transition(puja, c2.caseId!, {
    to: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.DISSEMINATE, agency: Agency.DMLI,
    note: 'Price gap of about Rs 39 lakh moved within 48 hours to two related parties and cash. Pattern fits trade-based laundering; recommend sending to the Department of Money Laundering Investigation.',
  });

  // 3. PEP — sent to the CIAA.
  const a3 = await find('PEP_LARGE', bishnu.name);
  const c3 = await alerts.triage(anil, a3.id, { decision: TriageDecision.NEW_CASE, title: 'Consultancy payment to a provincial assembly member', priority: Priority.HIGH, typology: Typology.CORRUPTION });
  await cases.update(anil, c3.caseId!, { assigneeId: anil.id });
  await cases.transition(anil, c3.caseId!, { to: CaseStatus.UNDER_INVESTIGATION });
  await cases.transition(anil, c3.caseId!, {
    to: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.DISSEMINATE, agency: Agency.CIAA,
    note: 'Payer won provincial road contracts in the same period. No consultancy agreement on file.',
  });
  await cases.transition(sabina, c3.caseId!, { to: CaseStatus.DISSEMINATED, note: 'Approved. Send with contract award list.' });

  // 4. Ordinary business cash — false positive.
  const a4 = await find('TTR_CASH', himal.name);
  await alerts.triage(puja, a4.id, { decision: TriageDecision.FALSE_POSITIVE, note: 'Registered wholesaler; deposits match VAT returns and daily sales pattern.' });

  // 5. Dormant account — open, waiting for an analyst.
  const a5 = await find('DORMANT_REACTIVATION', sita.name);
  await alerts.triage(anil, a5.id, { decision: TriageDecision.NEW_CASE, title: 'Dormant account reactivated with Rs 12 lakh cash', priority: Priority.MEDIUM, typology: Typology.OTHER });

  // 6. Remittance cash-out — closed after review.
  const a6 = await find('RAPID_MOVEMENT', hari.name);
  const c6 = await alerts.triage(puja, a6.id, { decision: TriageDecision.NEW_CASE, title: 'Remittances withdrawn in cash on arrival', priority: Priority.LOW, typology: Typology.HUNDI });
  await cases.update(puja, c6.caseId!, { assigneeId: puja.id });
  await cases.transition(puja, c6.caseId!, { to: CaseStatus.UNDER_INVESTIGATION });
  await cases.transition(puja, c6.caseId!, {
    to: CaseStatus.PENDING_APPROVAL, recommendation: Recommendation.CLOSE,
    note: 'Family remittance from a son working in Doha; withdrawals used for house construction (receipts verified).',
  });
  await cases.transition(prakash, c6.caseId!, { to: CaseStatus.CLOSED, note: 'Agree, no suspicion remains.' });

  // Case activity happened over the last weeks, not all just now.
  await prisma.$executeRaw`UPDATE "Case" SET "createdAt" = "createdAt" - interval '6 days', "dueAt" = "dueAt" - interval '6 days'`;
  await prisma.$executeRaw`UPDATE "AuditEvent" SET "createdAt" = "createdAt" - interval '6 days' + (random() * interval '5 days')`;
  await prisma.$executeRaw`UPDATE "CaseNote" SET "createdAt" = "createdAt" - interval '3 days'`;

  await app.close();
  const counts = { alerts: await prisma.alert.count(), cases: await prisma.case.count(), transactions: await prisma.transaction.count() };
  console.log('Demo data loaded:', counts);
  console.log(`Logins (password ${PASSWORD}): admin@, supervisor@, supervisor2@, analyst@, analyst2@, analyst3@demo.np; institutions adb@, kdb@, bdv@, gsc@, lrm@demo.np`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
