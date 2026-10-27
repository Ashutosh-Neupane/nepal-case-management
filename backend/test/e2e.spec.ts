import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';

const DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:5544/cms_test';
process.env.DATABASE_URL = DATABASE_URL;
const PASSWORD = 'Test@12345';
const LAKH = 100_000;

describe('case management API (end to end)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    if (!/test/i.test(new URL(DATABASE_URL).pathname)) throw new Error('Run the end-to-end tests against a database whose name contains "test".');
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL }, stdio: 'ignore' });
    prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
    const bank = await prisma.reportingEntity.create({ data: { code: 'TB1', name: 'Test Bank One', nameNe: 'टेस्ट बैंक', type: 'COMMERCIAL_BANK' } });
    const other = await prisma.reportingEntity.create({ data: { code: 'TB2', name: 'Test Bank Two', nameNe: 'टेस्ट बैंक २', type: 'COMMERCIAL_BANK' } });
    const hash = await bcrypt.hash(PASSWORD, 4);
    const users: [string, Role, string | null][] = [
      ['bank', Role.REPORTING_OFFICER, bank.id], ['otherbank', Role.REPORTING_OFFICER, other.id],
      ['analyst', Role.ANALYST, null], ['analyst2', Role.ANALYST, null],
      ['supervisor', Role.SUPERVISOR, null], ['admin', Role.ADMIN, null],
    ];
    for (const [key, role, entityId] of users) {
      const u = await prisma.user.create({ data: { email: `${key}@test.np`, name: key, role, entityId, passwordHash: hash } });
      ids[key] = u.id;
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    for (const [key] of users) {
      const res = await http().post('/api/auth/login').send({ email: `${key}@test.np`, password: PASSWORD });
      tokens[key] = res.body.token;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('rejects requests without a token and wrong passwords', async () => {
    await http().get('/api/alerts').expect(401);
    await http().post('/api/auth/login').send({ email: 'bank@test.np', password: 'wrong-password' }).expect(401);
  });

  it('raises a structuring alert from a bank batch, without duplicates on resubmission', async () => {
    const subject = { kind: 'INDIVIDUAL', name: 'Test Customer', citizenshipNo: '27-01-75-99999', district: 'Kathmandu' };
    const transactions = [9.1, 9.4, 9.6].map((amount, i) => ({
      reference: `S-${i}`, accountNo: '0001-0001', subject, direction: 'CREDIT', channel: 'CASH',
      amount: amount * LAKH, occurredAt: new Date(Date.now() - (3 - i) * 86_400_000).toISOString(),
    }));
    const res = await http().post('/api/reports/transactions').set(as('bank')).send({ transactions }).expect(201);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0]).toMatch(/^ALT-\d{4}\/\d{2}-0001$/);

    const again = await http().post('/api/reports/transactions').set(as('bank')).send({ transactions }).expect(201);
    expect(again.body).toMatchObject({ accepted: 0, duplicates: 3, alerts: [] });
  });

  it('validates input', async () => {
    await http().post('/api/reports/transactions').set(as('bank'))
      .send({ transactions: [{ reference: 'x', accountNo: '1', amount: -5 }] }).expect(400);
  });

  it('keeps institutions to their own alerts and away from cases', async () => {
    const own = await http().get('/api/alerts').set(as('bank')).expect(200);
    expect(own.body.total).toBe(1);
    ids.alert = own.body.rows[0].id;
    const other = await http().get('/api/alerts').set(as('otherbank')).expect(200);
    expect(other.body.total).toBe(0);
    await http().get(`/api/alerts/${ids.alert}`).set(as('otherbank')).expect(404);
    await http().get('/api/cases').set(as('bank')).expect(403);
    await http().post(`/api/alerts/${ids.alert}/triage`).set(as('bank')).send({ decision: 'NEW_CASE' }).expect(403);
  });

  it('turns an alert into a case and runs the workflow with second-person approval', async () => {
    const triage = await http().post(`/api/alerts/${ids.alert}/triage`).set(as('analyst'))
      .send({ decision: 'NEW_CASE', title: 'Structured cash deposits', priority: 'HIGH' }).expect(201);
    ids.case = triage.body.caseId;
    await http().post(`/api/alerts/${ids.alert}/triage`).set(as('analyst')).send({ decision: 'FALSE_POSITIVE', note: 'x' }).expect(400);

    // Analysts may pick up an unassigned case, but not take one from a colleague.
    await http().patch(`/api/cases/${ids.case}`).set(as('analyst')).send({ assigneeId: ids.analyst }).expect(200);
    await http().patch(`/api/cases/${ids.case}`).set(as('analyst2')).send({ assigneeId: ids.analyst2 }).expect(403);
    await http().post(`/api/cases/${ids.case}/transition`).set(as('analyst2')).send({ to: 'UNDER_INVESTIGATION' }).expect(400);

    await http().post(`/api/cases/${ids.case}/transition`).set(as('analyst')).send({ to: 'UNDER_INVESTIGATION' }).expect(201);
    await http().post(`/api/cases/${ids.case}/transition`).set(as('analyst'))
      .send({ to: 'PENDING_APPROVAL', recommendation: 'DISSEMINATE', agency: 'DMLI' }).expect(400); // findings missing
    await http().post(`/api/cases/${ids.case}/transition`).set(as('analyst'))
      .send({ to: 'PENDING_APPROVAL', recommendation: 'DISSEMINATE', agency: 'DMLI', note: 'Three deposits below the threshold in three days.' })
      .expect(201);

    await http().post(`/api/cases/${ids.case}/transition`).set(as('analyst')).send({ to: 'DISSEMINATED' }).expect(400);
    const done = await http().post(`/api/cases/${ids.case}/transition`).set(as('supervisor')).send({ to: 'DISSEMINATED' }).expect(201);
    expect(done.body).toMatchObject({ status: 'DISSEMINATED', agency: 'DMLI' });

    const detail = await http().get(`/api/cases/${ids.case}`).set(as('supervisor')).expect(200);
    const actions = detail.body.events.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['case.opened', 'case.updated', 'case.status']));
    expect(detail.body.notes).toHaveLength(1);
    expect(detail.body.subjects[0].subject.name).toBe('Test Customer');
  });

  it('hides the unit\'s notes from the reporting institution', async () => {
    const res = await http().get(`/api/alerts/${ids.alert}`).set(as('bank')).expect(200);
    expect(res.body.status).toBe('ESCALATED');
    expect(res.body.caseId).toBeNull();
    expect(res.body.case).toBeNull();
  });

  it('shows the subject network and dashboard', async () => {
    const subjects = await http().get('/api/subjects?q=Test').set(as('analyst')).expect(200);
    const profile = await http().get(`/api/subjects/${subjects.body[0].id}`).set(as('analyst')).expect(200);
    expect(profile.body.totals.cash).toBeCloseTo(28.1 * LAKH);
    expect(profile.body.network.nodes.length).toBeGreaterThanOrEqual(2);
    const dash = await http().get('/api/dashboard').set(as('supervisor')).expect(200);
    expect(dash.body.cases.byStatus.DISSEMINATED).toBe(1);
    expect(dash.body.alerts.trend).toHaveLength(30);
  });

  it('lets admins manage users, and deactivation takes effect immediately', async () => {
    await http().get('/api/admin/users').set(as('analyst')).expect(403);
    const created = await http().post('/api/admin/users').set(as('admin'))
      .send({ email: 'new@test.np', name: 'New Analyst', role: 'ANALYST' }).expect(201);
    expect(created.body.temporaryPassword).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const login = await http().post('/api/auth/login').send({ email: 'new@test.np', password: created.body.temporaryPassword }).expect(201);
    await http().get('/api/auth/me').set({ Authorization: `Bearer ${login.body.token}` }).expect(200);
    await http().patch(`/api/admin/users/${created.body.user.id}`).set(as('admin')).send({ active: false }).expect(200);
    await http().get('/api/auth/me').set({ Authorization: `Bearer ${login.body.token}` }).expect(401);
    await http().patch(`/api/admin/users/${ids.admin}`).set(as('admin')).send({ active: false }).expect(400);
  });
});
