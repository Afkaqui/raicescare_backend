import { Module } from "@nestjs/common";
import { TokenServicioGuard } from "../../common/token-servicio.guard";
import { InteractionsController } from "./interactions.controller";
import { InteractionsService } from "./interactions.service";

@Module({
  controllers: [InteractionsController],
  providers: [InteractionsService, TokenServicioGuard],
  exports: [InteractionsService],
})
export class InteractionsModule {}
