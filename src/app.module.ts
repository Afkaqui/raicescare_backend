import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { InteractionsModule } from "./modules/interactions/interactions.module";
import { RequestsModule } from "./modules/requests/requests.module";
import { PaymentsModule } from "./modules/payments/payments.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    InteractionsModule,
    RequestsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
