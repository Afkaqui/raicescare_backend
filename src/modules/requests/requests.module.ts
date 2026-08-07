import { Module } from "@nestjs/common";
import { TokenServicioGuard } from "../../common/token-servicio.guard";
import { InteractionsModule } from "../interactions/interactions.module";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";

@Module({
  imports: [InteractionsModule],
  controllers: [RequestsController],
  providers: [RequestsService, TokenServicioGuard],
  exports: [RequestsService],
})
export class RequestsModule {}
