import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post } from '@nestjs/common';
import { AlertType, Channel, Direction, Prisma, Role, SubjectKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString,
  Length, MaxLength, ValidateNested,
} from 'class-validator';
import { audit } from '../common/audit';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { nextReference } from '../common/references';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateRules, RULES } from './rules';

export class SubjectDto {
  @IsEnum(SubjectKind)
  kind: SubjectKind;

  @IsString() @Length(2, 120)
  name: string;

  @IsOptional() @IsString() @MaxLength(120)
  nameNe?: string;

  @IsOptional() @IsString() @MaxLength(30)
  citizenshipNo?: string;

  @IsOptional() @IsString() @Length(9, 9)
  panNo?: string;

  @IsOptional() @IsDateString()
  dateOfBirth?: string;

  @IsOptional() @IsString() @MaxLength(40)
  district?: string;

  @IsOptional() @IsString() @MaxLength(80)
  occupation?: string;

  @IsOptional() @IsBoolean()
  isPep?: boolean;
}

class TransactionDto {
  @IsString() @Length(1, 60)
  reference: string;

  @IsString() @Length(4, 30)
  accountNo: string;

  @ValidateNested() @Type(() => SubjectDto)
  subject: SubjectDto;

  @IsEnum(Direction)
  direction: Direction;

  @IsEnum(Channel)
  channel: Channel;

  @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive()
  amount: number;

  @IsOptional() @IsString() @MaxLength(120)
  counterpartyName?: string;

  @IsOptional() @IsString() @MaxLength(40)
  counterpartyAccount?: string;

  @IsOptional() @IsString() @MaxLength(200)
  narration?: string;

  @IsOptional() @IsString() @MaxLength(40)
  district?: string;

  @IsDateString()
  occurredAt: string;
}

class TransactionBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => TransactionDto)
  transactions: TransactionDto[];
}

class SuspiciousReportDto {
  @ValidateNested() @Type(() => SubjectDto)
  subject: SubjectDto;

  @IsString() @Length(10, 200)
  summary: string;

  @IsString() @Length(30, 5000)
  narrative: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  transactionReferences?: string[];
}

const LOOKBACK_DAYS = 30;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Finds a subject by citizenship number or PAN, or creates one. */
  private async upsertSubject(tx: Prisma.TransactionClient, s: SubjectDto) {
    const match = s.citizenshipNo ? { citizenshipNo: s.citizenshipNo } : s.panNo ? { panNo: s.panNo } : { name: s.name, kind: s.kind };
    const existing = await tx.subject.findFirst({ where: match });
    const data = {
      kind: s.kind, name: s.name, nameNe: s.nameNe, citizenshipNo: s.citizenshipNo, panNo: s.panNo,
      dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : undefined, district: s.district, occupation: s.occupation,
      isPep: s.isPep ?? undefined,
    };
    return existing ? tx.subject.update({ where: { id: existing.id }, data }) : tx.subject.create({ data });
  }

  /** Stores a batch of transactions, then runs the detection rules on every account it touched. */
  async submitTransactions(user: AuthUser, batch: TransactionBatchDto) {
    const entityId = requireEntity(user);
    return this.prisma.$transaction(async (tx) => {
      const touched = new Map<string, { previousActivityAt: Date | null; newIds: Set<string> }>();
      let duplicates = 0;

      for (const t of batch.transactions) {
        const subject = await this.upsertSubject(tx, t.subject);
        let account = await tx.account.findUnique({ where: { entityId_accountNo: { entityId, accountNo: t.accountNo } } });
        if (account && account.subjectId !== subject.id) {
          throw new BadRequestException(`Account ${t.accountNo} belongs to a different customer.`);
        }
        account ??= await tx.account.create({ data: { entityId, accountNo: t.accountNo, subjectId: subject.id } });
        if (!touched.has(account.id)) touched.set(account.id, { previousActivityAt: account.lastActiveAt, newIds: new Set() });

        const exists = await tx.transaction.findUnique({ where: { accountId_reference: { accountId: account.id, reference: t.reference } } });
        if (exists) { duplicates++; continue; }
        const created = await tx.transaction.create({
          data: {
            accountId: account.id, reference: t.reference, direction: t.direction, channel: t.channel, amount: t.amount,
            counterpartyName: t.counterpartyName, counterpartyAccount: t.counterpartyAccount, narration: t.narration,
            district: t.district, occurredAt: new Date(t.occurredAt),
          },
        });
        touched.get(account.id)!.newIds.add(created.id);
      }

      const alerts: string[] = [];
      for (const [accountId, { previousActivityAt, newIds }] of touched) {
        if (!newIds.size) continue;
        const account = await tx.account.findUniqueOrThrow({ where: { id: accountId }, include: { subject: true } });
        const newest = await tx.transaction.findFirstOrThrow({ where: { id: { in: [...newIds] } }, orderBy: { occurredAt: 'desc' } });
        const since = new Date(newest.occurredAt.getTime() - LOOKBACK_DAYS * 86_400_000);
        const window = await tx.transaction.findMany({ where: { accountId, occurredAt: { gte: since } } });
        const hits = evaluateRules({
          transactions: window.map((w) => ({ id: w.id, direction: w.direction, channel: w.channel, amount: Number(w.amount), occurredAt: w.occurredAt })),
          newIds,
          subjectIsPep: account.subject.isPep,
          previousActivityAt,
        });
        for (const hit of hits) {
          // Skip a hit whose transactions are all already covered by an alert for the same rule.
          const covered = await tx.alertTransaction.count({
            where: { transactionId: { in: hit.transactionIds }, alert: { ruleCode: hit.code } },
          });
          if (covered >= hit.transactionIds.length) continue;
          const type = hit.code === 'TTR_CASH' ? AlertType.TTR : AlertType.RULE;
          const reference = await nextReference(tx, type === AlertType.TTR ? 'TTR' : 'ALT');
          const alert = await tx.alert.create({
            data: {
              reference, type, ruleCode: hit.code, score: hit.score, summary: hit.summary, entityId,
              subjectId: account.subjectId,
              transactions: { create: hit.transactionIds.map((transactionId) => ({ transactionId })) },
            },
          });
          await audit(tx, { action: 'alert.raised', alertId: alert.id, actorId: user.id, detail: { rule: hit.code, score: hit.score } });
          alerts.push(reference);
        }
        await tx.account.update({ where: { id: accountId }, data: { lastActiveAt: newest.occurredAt } });
      }
      return { accepted: batch.transactions.length - duplicates, duplicates, alerts };
    }, { timeout: 60_000 });
  }

  /** A suspicious transaction report written by the institution's compliance officer. */
  async fileSuspiciousReport(user: AuthUser, report: SuspiciousReportDto) {
    const entityId = requireEntity(user);
    return this.prisma.$transaction(async (tx) => {
      const subject = await this.upsertSubject(tx, report.subject);
      const linked = report.transactionReferences?.length
        ? await tx.transaction.findMany({ where: { reference: { in: report.transactionReferences }, account: { entityId } } })
        : [];
      const reference = await nextReference(tx, 'STR');
      const alert = await tx.alert.create({
        data: {
          reference, type: AlertType.STR, score: 65, summary: report.summary, narrative: report.narrative, entityId,
          subjectId: subject.id, transactions: { create: linked.map((t) => ({ transactionId: t.id })) },
        },
      });
      await audit(tx, { action: 'str.filed', alertId: alert.id, actorId: user.id });
      return { reference, linkedTransactions: linked.length };
    });
  }
}

function requireEntity(user: AuthUser): string {
  if (!user.entityId) throw new ForbiddenException('Only reporting institutions can submit reports.');
  return user.entityId;
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(Role.REPORTING_OFFICER)
  @Post('transactions')
  submitTransactions(@CurrentUser() user: AuthUser, @Body() body: TransactionBatchDto) {
    return this.reports.submitTransactions(user, body);
  }

  @Roles(Role.REPORTING_OFFICER)
  @Post('str')
  fileSuspiciousReport(@CurrentUser() user: AuthUser, @Body() body: SuspiciousReportDto) {
    return this.reports.fileSuspiciousReport(user, body);
  }

  /** The detection rules, for the UI's rule reference. */
  @Get('rules')
  rules() {
    return RULES.map(({ code, title, description }) => ({ code, title, description }));
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
