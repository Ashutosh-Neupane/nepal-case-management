import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query,
} from '@nestjs/common';
import { Agency, CaseStatus, Prisma, Priority, Recommendation, Role, SubjectRole, Typology } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { audit } from '../common/audit';
import { AuthUser, CurrentUser, FIU_STAFF, Roles } from '../common/auth';
import { asBadRequest, page } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { dueDate, planTransition } from './workflow';

class UpdateCaseDto {
  @IsOptional() @IsString() @Length(5, 150)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  summary?: string;

  @IsOptional() @IsEnum(Priority)
  priority?: Priority;

  @IsOptional() @IsEnum(Typology)
  typology?: Typology;

  /** null unassigns. */
  @IsOptional() @IsUUID()
  assigneeId?: string | null;
}

class TransitionDto {
  @IsEnum(CaseStatus)
  to: CaseStatus;

  @IsOptional() @IsString() @MaxLength(5000)
  note?: string;

  @IsOptional() @IsEnum(Recommendation)
  recommendation?: Recommendation;

  @IsOptional() @IsEnum(Agency)
  agency?: Agency;
}

class NoteDto {
  @IsString() @Length(1, 5000)
  body: string;
}

class TaskDto {
  @IsString() @Length(3, 200)
  title: string;

  @IsOptional() @IsUUID()
  assigneeId?: string;

  @IsOptional() @IsDateString()
  dueAt?: string;
}

class TaskUpdateDto {
  @IsBoolean()
  done: boolean;
}

class CaseSubjectDto {
  @IsUUID()
  subjectId: string;

  @IsEnum(SubjectRole)
  role: SubjectRole;
}

const ACTIVE: CaseStatus[] = [CaseStatus.OPEN, CaseStatus.UNDER_INVESTIGATION, CaseStatus.PENDING_APPROVAL];
const PERSON = { select: { id: true, name: true, designation: true, role: true } } as const;

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: Record<string, string>) {
    const { take, skip, page: number, pageSize } = page(query);
    const now = new Date();
    const where: Prisma.CaseWhereInput = {
      ...(query.status === 'ACTIVE' ? { status: { in: ACTIVE } } : query.status ? { status: query.status as CaseStatus } : {}),
      ...(query.priority && { priority: query.priority as Priority }),
      ...(query.typology && { typology: query.typology as Typology }),
      ...(query.assignee === 'me' ? { assigneeId: user.id } : query.assignee === 'none' ? { assigneeId: null } : query.assignee ? { assigneeId: query.assignee } : {}),
      ...(query.overdue === '1' && { dueAt: { lt: now }, status: { in: ACTIVE } }),
      ...(query.q && {
        OR: [
          { reference: { contains: query.q, mode: 'insensitive' } },
          { title: { contains: query.q, mode: 'insensitive' } },
          { subjects: { some: { subject: { name: { contains: query.q, mode: 'insensitive' } } } } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.case.findMany({
        where, take, skip,
        orderBy: [{ dueAt: 'asc' }],
        include: {
          assignee: PERSON,
          subjects: { include: { subject: { select: { id: true, name: true, isPep: true } } } },
          _count: { select: { alerts: true } },
        },
      }),
      this.prisma.case.count({ where }),
    ]);
    return { rows, total, page: number, pageSize };
  }

  async get(idOrRef: string) {
    const found = await this.prisma.case.findFirst({
      where: /^[0-9a-f-]{36}$/i.test(idOrRef) ? { id: idOrRef } : { reference: idOrRef },
      include: {
        assignee: PERSON,
        subjects: { include: { subject: { include: { accounts: { include: { entity: { select: { code: true, name: true } } } } } } } },
        alerts: {
          include: {
            entity: { select: { code: true, name: true } },
            transactions: { include: { transaction: { include: { account: { select: { accountNo: true } } } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
        notes: { include: { author: PERSON }, orderBy: { createdAt: 'asc' } },
        tasks: { include: { assignee: PERSON }, orderBy: { createdAt: 'asc' } },
        events: { include: { actor: PERSON }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!found) throw new NotFoundException('Case not found.');
    return found;
  }

  async update(user: AuthUser, id: string, dto: UpdateCaseDto) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.case.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Case not found.');
      if (!ACTIVE.includes(current.status)) throw new BadRequestException('This case is finished and cannot change.');

      const data: Prisma.CaseUncheckedUpdateInput = {};
      if (dto.assigneeId !== undefined && dto.assigneeId !== current.assigneeId) {
        // Analysts may pick up an unassigned case for themselves; reassignment is for supervisors.
        const selfAssign = dto.assigneeId === user.id && !current.assigneeId;
        if (user.role !== Role.SUPERVISOR && !selfAssign) throw new ForbiddenException('Only a supervisor can reassign cases.');
        if (dto.assigneeId) {
          const assignee = await tx.user.findUnique({ where: { id: dto.assigneeId } });
          if (!assignee?.active || !FIU_STAFF.includes(assignee.role) || assignee.role === Role.ADMIN) {
            throw new BadRequestException('Cases can only be assigned to active analysts or supervisors.');
          }
        }
        data.assigneeId = dto.assigneeId;
      }
      if (dto.priority && dto.priority !== current.priority) {
        data.priority = dto.priority;
        data.dueAt = dueDate(dto.priority, current.createdAt);
      }
      if (dto.title) data.title = dto.title;
      if (dto.summary !== undefined) data.summary = dto.summary;
      if (dto.typology) data.typology = dto.typology;

      const updated = await tx.case.update({ where: { id }, data });
      await audit(tx, { action: 'case.updated', caseId: id, actorId: user.id, detail: JSON.parse(JSON.stringify(dto)) });
      return updated;
    });
  }

  async transition(user: AuthUser, id: string, dto: TransitionDto) {
    return asBadRequest(() => this.prisma.$transaction(async (tx) => {
      const current = await tx.case.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Case not found.');
      const changes = planTransition(current, dto, user);
      const updated = await tx.case.update({ where: { id }, data: changes });
      if (dto.note?.trim()) {
        await tx.caseNote.create({ data: { caseId: id, authorId: user.id, body: dto.note.trim() } });
      }
      await audit(tx, {
        action: 'case.status',
        caseId: id,
        actorId: user.id,
        detail: { from: current.status, to: dto.to, recommendation: dto.recommendation, agency: changes.agency ?? undefined },
      });
      return updated;
    }));
  }

  async addNote(user: AuthUser, id: string, body: string) {
    await this.prisma.case.findUniqueOrThrow({ where: { id } });
    return this.prisma.caseNote.create({ data: { caseId: id, authorId: user.id, body: body.trim() }, include: { author: PERSON } });
  }

  async addTask(user: AuthUser, id: string, dto: TaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.caseTask.create({
        data: { caseId: id, title: dto.title, assigneeId: dto.assigneeId, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined },
        include: { assignee: PERSON },
      });
      await audit(tx, { action: 'task.added', caseId: id, actorId: user.id, detail: { title: dto.title } });
      return task;
    });
  }

  async updateTask(user: AuthUser, caseId: string, taskId: string, done: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.caseTask.findFirst({ where: { id: taskId, caseId } });
      if (!task) throw new NotFoundException('Task not found.');
      const updated = await tx.caseTask.update({ where: { id: taskId }, data: { doneAt: done ? new Date() : null } });
      await audit(tx, { action: done ? 'task.done' : 'task.reopened', caseId, actorId: user.id, detail: { title: task.title } });
      return updated;
    });
  }

  async addSubject(user: AuthUser, caseId: string, dto: CaseSubjectDto) {
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.caseSubject.upsert({
        where: { caseId_subjectId: { caseId, subjectId: dto.subjectId } },
        create: { caseId, subjectId: dto.subjectId, role: dto.role },
        update: { role: dto.role },
      });
      await audit(tx, { action: 'subject.linked', caseId, actorId: user.id, detail: { subjectId: dto.subjectId, role: dto.role } });
      return link;
    });
  }
}

@Roles(...FIU_STAFF)
@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.cases.list(user, query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.cases.get(id);
  }

  @Roles(Role.ANALYST, Role.SUPERVISOR)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateCaseDto) {
    return this.cases.update(user, id, body);
  }

  @Roles(Role.ANALYST, Role.SUPERVISOR)
  @Post(':id/transition')
  transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: TransitionDto) {
    return this.cases.transition(user, id, body);
  }

  @Roles(Role.ANALYST, Role.SUPERVISOR)
  @Post(':id/notes')
  addNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: NoteDto) {
    return this.cases.addNote(user, id, body.body);
  }

  @Roles(Role.ANALYST, Role.SUPERVISOR)
  @Post(':id/tasks')
  addTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: TaskDto) {
    return this.cases.addTask(user, id, body);
  }

  @Roles(Role.ANALYST, Role.SUPERVISOR)
  @Patch(':id/tasks/:taskId')
  updateTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('taskId') taskId: string, @Body() body: TaskUpdateDto) {
    return this.cases.updateTask(user, id, taskId, body.done);
  }

  @Roles(Role.ANALYST, Role.SUPERVISOR)
  @Post(':id/subjects')
  addSubject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CaseSubjectDto) {
    return this.cases.addSubject(user, id, body);
  }
}

@Module({ controllers: [CasesController], providers: [CasesService] })
export class CasesModule {}
