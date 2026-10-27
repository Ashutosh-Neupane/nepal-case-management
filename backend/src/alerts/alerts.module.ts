import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { AlertStatus, AlertType, Prisma, Priority, Role, Typology } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { dueDate } from '../cases/workflow';
import { audit } from '../common/audit';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { page } from '../common/http';
import { nextReference } from '../common/references';
import { PrismaService } from '../prisma/prisma.service';

export enum TriageDecision {
  FALSE_POSITIVE = 'FALSE_POSITIVE',
  NEW_CASE = 'NEW_CASE',
  LINK_CASE = 'LINK_CASE',
}

class TriageDto {
  @IsEnum(TriageDecision)
  decision: TriageDecision;

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string;

  @IsOptional() @IsUUID()
  caseId?: string;

  @IsOptional() @IsString() @Length(5, 150)
  title?: string;

  @IsOptional() @IsEnum(Priority)
  priority?: Priority;

  @IsOptional() @IsEnum(Typology)
  typology?: Typology;
}

const DETAIL = {
  entity: true,
  subject: true,
  case: { select: { id: true, reference: true, status: true, title: true } },
  transactions: { include: { transaction: { include: { account: { select: { accountNo: true } } } } } },
} satisfies Prisma.AlertInclude;

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(user: AuthUser): Prisma.AlertWhereInput {
    return user.role === Role.REPORTING_OFFICER ? { entityId: user.entityId ?? '__none__' } : {};
  }

  async list(user: AuthUser, query: Record<string, string>) {
    const { take, skip, page: number, pageSize } = page(query);
    const where: Prisma.AlertWhereInput = {
      ...this.scope(user),
      ...(query.status && { status: query.status as AlertStatus }),
      ...(query.type && { type: query.type as AlertType }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.minScore && { score: { gte: Number(query.minScore) } }),
      ...(query.q && {
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { summary: { contains: query.q, mode: 'insensitive' } },
          { subject: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.alert.findMany({
        where, take, skip,
        orderBy: query.status === 'NEW' ? [{ score: 'desc' }, { createdAt: 'asc' }] : { createdAt: 'desc' },
        include: { entity: { select: { code: true, name: true } }, subject: { select: { id: true, name: true, isPep: true } } },
      }),
      this.prisma.alert.count({ where }),
    ]);
    return { rows: rows.map((a) => this.redact(user, a)), total, page: number, pageSize };
  }

  async get(user: AuthUser, id: string) {
    const alert = await this.prisma.alert.findFirst({ where: { ...this.scope(user), OR: [{ id: isUuid(id) ? id : undefined }, { reference: id }] }, include: DETAIL });
    if (!alert) throw new NotFoundException('Alert not found.');
    return this.redact(user, alert);
  }

  /** Reporting institutions see their alert's status but not the unit's notes or case. */
  private redact<T extends { triageNote: string | null; caseId: string | null }>(user: AuthUser, alert: T): T {
    if (user.role !== Role.REPORTING_OFFICER) return alert;
    return { ...alert, triageNote: null, caseId: null, case: null };
  }

  async triage(user: AuthUser, id: string, dto: TriageDto) {
    return this.prisma.$transaction(async (tx) => {
      const alert = await tx.alert.findUnique({ where: { id } });
      if (!alert) throw new NotFoundException('Alert not found.');
      if (alert.status !== AlertStatus.NEW) throw new BadRequestException('This alert has already been triaged.');
      const base = { triagedById: user.id, triagedAt: new Date(), triageNote: dto.note?.trim() || null };

      if (dto.decision === TriageDecision.FALSE_POSITIVE) {
        if (!dto.note?.trim()) throw new BadRequestException('Explain why this alert is a false positive.');
        await tx.alert.update({ where: { id }, data: { ...base, status: AlertStatus.FALSE_POSITIVE } });
        await audit(tx, { action: 'alert.dismissed', alertId: id, actorId: user.id, detail: { note: dto.note } });
        return { status: AlertStatus.FALSE_POSITIVE };
      }

      let caseId: string;
      if (dto.decision === TriageDecision.LINK_CASE) {
        const target = dto.caseId ? await tx.case.findUnique({ where: { id: dto.caseId } }) : null;
        if (!target) throw new BadRequestException('Choose the case to add this alert to.');
        if (target.status === 'DISSEMINATED' || target.status === 'CLOSED') throw new BadRequestException('That case is already finished.');
        caseId = target.id;
      } else {
        const priority = dto.priority ?? (alert.score >= 80 ? Priority.HIGH : Priority.MEDIUM);
        const created = await tx.case.create({
          data: {
            reference: await nextReference(tx, 'CASE'),
            title: dto.title?.trim() || alert.summary.slice(0, 150),
            priority,
            typology: dto.typology ?? (alert.ruleCode === 'STRUCTURING' ? Typology.STRUCTURING : Typology.OTHER),
            dueAt: dueDate(priority),
            createdById: user.id,
          },
        });
        caseId = created.id;
        await audit(tx, { action: 'case.opened', caseId, actorId: user.id, detail: { fromAlert: alert.reference } });
      }

      await tx.caseSubject.upsert({
        where: { caseId_subjectId: { caseId, subjectId: alert.subjectId } },
        create: { caseId, subjectId: alert.subjectId },
        update: {},
      });
      await tx.alert.update({ where: { id }, data: { ...base, status: AlertStatus.ESCALATED, caseId } });
      await audit(tx, { action: 'alert.escalated', alertId: id, caseId, actorId: user.id, detail: { alert: alert.reference } });
      return { status: AlertStatus.ESCALATED, caseId };
    });
  }
}

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.alerts.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.alerts.get(user, id);
  }

  @Roles(Role.ANALYST, Role.SUPERVISOR)
  @Post(':id/triage')
  triage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: TriageDto) {
    return this.alerts.triage(user, id, body);
  }
}

@Module({ controllers: [AlertsController], providers: [AlertsService] })
export class AlertsModule {}

