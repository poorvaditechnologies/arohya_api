import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './database/prisma.module';
import { SecurityModule } from './security/security.module';
import { I18nModule } from './common/i18n/i18n.module';
import { AuthModule } from './modules/auth/auth.module';
import { FinancingSolutionsModule } from './modules/financing-solutions/financing-solutions.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LoanFacilitiesModule } from './modules/loan-facilities/loan-facilities.module';
import { UsersModule } from './modules/users/users.module';
import { SupportModule } from './modules/support/support.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FilesModule } from './modules/files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    SecurityModule,
    I18nModule,
    AuthModule,
    FinancingSolutionsModule,
    ApplicationsModule,
    DashboardModule,
    LoanFacilitiesModule,
    UsersModule,
    SupportModule,
    NotificationsModule,
    FilesModule,
  ],
})
export class AppModule {}
