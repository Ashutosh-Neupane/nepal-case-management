import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { serializeUser } from '../auth/auth.module';
import { audit } from '../common/audit';
import { AuthUser, CurrentUser, FIU_STAFF, Roles } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';

class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString() @Length(3, 100)
  name: string;

  @IsOptional() @IsString() @MaxLength(100)
  designation?: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional() @IsUUID()
  entityId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsEnum(Role)
  role?: Role;

  @IsOptional() @IsString() @MaxLength(100)
  designation?: string;
}

/** Readable one-time password, e.g. "kx7q-m2pd-9fha". */
function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async users() {
    const users = await this.prisma.user.findMany({ include: { entity: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return users.map(serializeUser);
  }

  entities() {
    return this.prisma.reportingEntity.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { alerts: true, users: true } } } });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    if (dto.role === Role.REPORTING_OFFICER && !dto.entityId) throw new BadRequestException('Choose the institution this officer reports for.');
    if (dto.role !== Role.REPORTING_OFFICER && dto.entityId) throw new BadRequestException('Only reporting officers belong to an institution.');
    if (await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } })) {
      throw new ConflictException('A user with this email already exists.');
    }
    const password = temporaryPassword();
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(), name: dto.name, designation: dto.designation, role: dto.role, entityId: dto.entityId,
          passwordHash: await bcrypt.hash(password, 10),
        },
        include: { entity: true },
      });
      await audit(tx, { action: 'user.created', actorId: actor.id, detail: { email: created.email, role: created.role } });
      return created;
    });
    return { user: serializeUser(user), temporaryPassword: password };
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== Role.ADMIN))) {
      throw new BadRequestException('You cannot deactivate yourself or remove your own admin role.');
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    if (dto.role && (dto.role === Role.REPORTING_OFFICER) !== (existing.role === Role.REPORTING_OFFICER)) {
      throw new BadRequestException('Institution officers and unit staff are separate accounts.');
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: dto, include: { entity: true } });
      await audit(tx, { action: 'user.updated', actorId: actor.id, detail: { email: updated.email, ...dto } });
      return updated;
    });
    return serializeUser(user);
  }

  async resetPassword(actor: AuthUser, id: string) {
    const password = temporaryPassword();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
      await audit(tx, { action: 'user.password_reset', actorId: actor.id, detail: { email: user.email } });
    });
    return { temporaryPassword: password };
  }
}

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Roles(Role.ADMIN)
  @Get('users')
  users() {
    return this.admin.users();
  }

  @Roles(...FIU_STAFF)
  @Get('entities')
  entities() {
    return this.admin.entities();
  }

  @Roles(Role.ADMIN)
  @Post('users')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateUserDto) {
    return this.admin.create(user, body);
  }

  @Roles(Role.ADMIN)
  @Patch('users/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.admin.update(user, id, body);
  }

  @Roles(Role.ADMIN)
  @Post('users/:id/reset-password')
  resetPassword(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.resetPassword(user, id);
  }

  /** Analysts and supervisors who can take cases, for assignment pickers. */
  @Roles(...FIU_STAFF)
  @Get('investigators')
  async investigators() {
    const users = await this.admin.users();
    return users.filter((u) => u.active && (u.role === Role.ANALYST || u.role === Role.SUPERVISOR));
  }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
