import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { AlertStatus, CaseStatus, Prisma, Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/auth';
import { fiscalYear } from '../common/nepal';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE: CaseStatus[] = [CaseStatus.OPEN, CaseStatus.UNDER_INVESTIGATION, CaseStatus.PENDING_APPROVAL];
const TREND_DAYS = 30;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser) {
    const scope = user.role === Role.REPORTING_OFFICER ? { entityId: user.entityId ?? '__none__' } : {};
    const now = new Date();
    const trendStart = new Date(now.getTime() - (TREND_DAYS - 1) * 86_400_000);
    const entityFilter = user.role === Role.REPORTING_OFFICER
      ? Prisma.sql`AND "entityId" = ${user.entityId ?? '__none__'}`
      : Prisma.empty;

    const [alertsByStatus, alertsByRule, alertsByType, trendRows] = await Promise.all([
      this.prisma.alert.groupBy({ by: ['status'], where: scope, _count: true }),
      this.prisma.alert.groupBy({ by: ['ruleCode'], where: { ...scope, createdAt: { gte: trendStart } }, _count: true }),
      this.prisma.alert.groupBy({ by: ['type'], where: scope, _count: true }),
      this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Kathmandu')::date, 'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM "Alert"
        WHERE "createdAt" >= ${trendStart} ${entityFilter}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const trendMap = new Map(trendRows.map((r) => [r.day, Number(r.count)]));
    const trend = Array.from({ length: TREND_DAYS }, (_, i) => {
      const day = new Date(trendStart.getTime() + i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });
      return { day, count: trendMap.get(day) ?? 0 };
    });
    const alerts = {
      byStatus: Object.fromEntries(alertsByStatus.map((r) => [r.status, r._count])) as Partial<Record<AlertStatus, number>>,
      byType: Object.fromEntries(alertsByType.map((r) => [r.type, r._count])),
      byRule: alertsByRule.map((r) => ({ rule: r.ruleCode ?? 'STR', count: r._count })).sort((a, b) => b.count - a.count),
      trend,
    };
    if (user.role === Role.REPORTING_OFFICER) return { alerts, fiscalYear: fiscalYear(now) };

    const [casesByStatus, overdue, mine, awaitingApproval, disseminated, byEntity, dueSoon] = await Promise.all([
      this.prisma.case.groupBy({ by: ['status'], _count: true }),
      this.prisma.case.count({ where: { status: { in: ACTIVE }, dueAt: { lt: now } } }),
      this.prisma.case.count({ where: { status: { in: ACTIVE }, assigneeId: user.id } }),
      this.prisma.case.count({ where: { status: CaseStatus.PENDING_APPROVAL, submittedById: { not: user.id } } }),
      this.prisma.case.groupBy({ by: ['agency'], where: { status: CaseStatus.DISSEMINATED }, _count: true }),
      this.prisma.alert.groupBy({ by: ['entityId'], _count: true, orderBy: { _count: { entityId: 'desc' } }, take: 8 }),
      this.prisma.case.findMany({
        where: { status: { in: ACTIVE } }, orderBy: { dueAt: 'asc' }, take: 6,
        select: { id: true, reference: true, title: true, status: true, priority: true, dueAt: true, assignee: { select: { name: true } } },
      }),
    ]);
    const entities = await this.prisma.reportingEntity.findMany({ where: { id: { in: byEntity.map((e) => e.entityId) } } });
    const entityName = new Map(entities.map((e) => [e.id, e]));
    return {
      fiscalYear: fiscalYear(now),
      alerts,
      cases: {
        byStatus: Object.fromEntries(casesByStatus.map((r) => [r.status, r._count])),
        overdue,
        mine,
        awaitingApproval: user.role === Role.SUPERVISOR ? awaitingApproval : undefined,
        disseminatedByAgency: disseminated.map((r) => ({ agency: r.agency, count: r._count })),
        dueSoon,
      },
      reportingEntities: byEntity.map((r) => ({
        code: entityName.get(r.entityId)?.code, name: entityName.get(r.entityId)?.name, alerts: r._count,
      })),
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
