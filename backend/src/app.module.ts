import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { CasesModule } from './cases/cases.module';
import { AuthGuard } from './common/auth';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './detection/reports.module';
import { PrismaModule } from './prisma/prisma.service';
import { SubjectsModule } from './subjects/subjects.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'change-me-in-production',
      signOptions: { expiresIn: Number(process.env.JWT_TTL_HOURS || 10) * 3600 },
    }),
    AuthModule,
    ReportsModule,
    AlertsModule,
    CasesModule,
    SubjectsModule,
    DashboardModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
