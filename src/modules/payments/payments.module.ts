import { Module } from "@nestjs/common";
import { RequestsModule } from "../requests/requests.module";
import { MercadoPagoClient } from "./mercadopago.client";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [RequestsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MercadoPagoClient],
})
export class PaymentsModule {}
