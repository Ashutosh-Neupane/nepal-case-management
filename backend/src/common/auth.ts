import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  entityId: string | null;
}

const ROLES_KEY = 'roles';
const PUBLIC_KEY = 'public';

/** Restricts a route to the given roles. Admins are not implied; list them where needed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Marks a route that needs no login. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const FIU_STAFF: Role[] = [Role.ANALYST, Role.SUPERVISOR, Role.ADMIN];

/**
 * Global guard: every route needs a valid token from an active user unless marked @Public().
 * The user is re-read from the database so deactivation and role changes apply at once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const [scheme, token] = String(request.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sign in to continue.');

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedException('This account is not active.');
    request.user = { id: user.id, name: user.name, email: user.email, role: user.role, entityId: user.entityId } satisfies AuthUser;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('Your role cannot do this.');
    }
    return true;
  }
}
