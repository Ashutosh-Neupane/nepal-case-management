import { Body, Controller, Get, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { entity: true } });
    // Same message for unknown email and wrong password.
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    const token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { token, user: serializeUser(user) };
  }

  async me(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: { entity: true } });
    return serializeUser(user);
  }

  async changePassword(id: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new UnauthorizedException('Current password is incorrect.');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  }
}

export function serializeUser(user: {
  id: string; email: string; name: string; designation: string | null; role: string; active: boolean;
  entity?: { id: string; name: string; nameNe: string; code: string } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    designation: user.designation,
    role: user.role,
    active: user.active,
    entity: user.entity ? { id: user.entity.id, code: user.entity.code, name: user.entity.name, nameNe: user.entity.nameNe } : null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() body: ChangePasswordDto) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    return { changed: true };
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
