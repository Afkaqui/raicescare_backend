import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { InteractionsModule } from "./modules/interactions/interactions.module";
import { RequestsModule } from "./modules/requests/requests.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { AuthModule } from "./modules/auth/auth.module";
import { EmailModule } from "./modules/email/email.module";
import { UsersModule } from "./modules/users/users.module";
import { BackofficeModule } from "./modules/backoffice/backoffice.module";
import { MediaModule } from "./modules/media/media.module";
import { ContentModule } from "./modules/content/content.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    InteractionsModule,
    RequestsModule,
    PaymentsModule,
    EmailModule,
    AuthModule,
    UsersModule,
    BackofficeModule,
    MediaModule,
    ContentModule,
  ],
})
export class AppModule {}
