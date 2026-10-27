import { Controller, Get, Injectable, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FIU_STAFF, Roles } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';

interface NetworkNode {
  id: string;
  kind: 'subject' | 'account' | 'counterparty';
  label: string;
  sublabel?: string;
  subjectId?: string;
  isPep?: boolean;
}

interface NetworkEdge {
  from: string;
  to: string;
  inflow: number;
  outflow: number;
  count: number;
}

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  search(q: string) {
    const where: Prisma.SubjectWhereInput = q
      ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { nameNe: { contains: q } },
          { citizenshipNo: { contains: q } },
          { panNo: { contains: q } },
        ],
      }
      : {};
    return this.prisma.subject.findMany({
      where, take: 25, orderBy: { name: 'asc' },
      include: { _count: { select: { alerts: true, cases: true, accounts: true } } },
    });
  }

  async profile(id: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: {
        accounts: {
          include: {
            entity: { select: { code: true, name: true, type: true } },
            transactions: { orderBy: { occurredAt: 'desc' }, take: 200 },
          },
        },
        alerts: { orderBy: { createdAt: 'desc' }, select: { id: true, reference: true, type: true, status: true, score: true, summary: true, createdAt: true } },
        cases: { include: { case: { select: { id: true, reference: true, title: true, status: true, priority: true } } } },
      },
    });
    if (!subject) throw new NotFoundException('Subject not found.');

    const transactions = subject.accounts.flatMap((a) => a.transactions.map((t) => ({ ...t, amount: Number(t.amount) })));
    const totals = transactions.reduce(
      (acc, t) => {
        acc[t.direction === 'CREDIT' ? 'inflow' : 'outflow'] += t.amount;
        if (t.channel === 'CASH') acc.cash += t.amount;
        return acc;
      },
      { inflow: 0, outflow: 0, cash: 0 },
    );
    return { ...subject, totals, network: await this.network(subject) };
  }

  /**
   * Who the subject's accounts trade with. Counterparty accounts that belong to another
   * known subject are shown as that subject, so links between suspects become visible.
   */
  private async network(subject: { id: string; name: string; isPep: boolean; accounts: { id: string; accountNo: string; entity: { code: string }; transactions: { direction: string; amount: Prisma.Decimal; counterpartyName: string | null; counterpartyAccount: string | null }[] }[] }) {
    const nodes = new Map<string, NetworkNode>();
    const edges = new Map<string, NetworkEdge>();
    nodes.set(subject.id, { id: subject.id, kind: 'subject', label: subject.name, subjectId: subject.id, isPep: subject.isPep });

    const counterpartyAccounts = [...new Set(subject.accounts.flatMap((a) => a.transactions.map((t) => t.counterpartyAccount).filter(Boolean)))] as string[];
    const known = await this.prisma.account.findMany({
      where: { accountNo: { in: counterpartyAccounts }, subjectId: { not: subject.id } },
      include: { subject: { select: { id: true, name: true, isPep: true } } },
    });
    const knownByAccount = new Map(known.map((a) => [a.accountNo, a.subject]));

    for (const account of subject.accounts) {
      const accountNode = `acc:${account.id}`;
      nodes.set(accountNode, { id: accountNode, kind: 'account', label: account.accountNo, sublabel: account.entity.code });
      const own = edges.get(`${subject.id}>${accountNode}`) ?? { from: subject.id, to: accountNode, inflow: 0, outflow: 0, count: 0 };
      edges.set(`${subject.id}>${accountNode}`, own);

      for (const t of account.transactions) {
        const amount = Number(t.amount);
        own.count++;
        if (t.direction === 'CREDIT') own.inflow += amount; else own.outflow += amount;
        if (!t.counterpartyName && !t.counterpartyAccount) continue;
        const linked = t.counterpartyAccount ? knownByAccount.get(t.counterpartyAccount) : undefined;
        const nodeId = linked ? linked.id : `cp:${t.counterpartyAccount || t.counterpartyName}`;
        if (!nodes.has(nodeId)) {
          nodes.set(nodeId, linked
            ? { id: nodeId, kind: 'subject', label: linked.name, subjectId: linked.id, isPep: linked.isPep }
            : { id: nodeId, kind: 'counterparty', label: t.counterpartyName || t.counterpartyAccount!, sublabel: t.counterpartyAccount || undefined });
        }
        const key = `${accountNode}>${nodeId}`;
        const edge = edges.get(key) ?? { from: accountNode, to: nodeId, inflow: 0, outflow: 0, count: 0 };
        edge.count++;
        if (t.direction === 'CREDIT') edge.inflow += amount; else edge.outflow += amount;
        edges.set(key, edge);
      }
    }
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }
}

@Roles(...FIU_STAFF)
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  search(@Query('q') q = '') {
    return this.subjects.search(q.trim());
  }

  @Get(':id')
  profile(@Param('id') id: string) {
    return this.subjects.profile(id);
  }
}

@Module({ controllers: [SubjectsController], providers: [SubjectsService] })
export class SubjectsModule {}
