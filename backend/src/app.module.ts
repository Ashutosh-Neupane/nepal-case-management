import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/auth';
import { PrismaModule } from './prisma/prisma.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'change-me-in-production',
      signOptions: { expiresIn: Number(process.env.JWT_TTL_HOURS || 10) * 3600 },
    }),
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
