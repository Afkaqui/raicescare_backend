import { Global, Module } from "@nestjs/common";
import { AportanteGuard } from "./aportante.guard";
import { DonorsController } from "./donors.controller";
import { DonorsService } from "./donors.service";

/** Global: la guarda de aportante también la usan expedientes y pagos. */
@Global()
@Module({
  controllers: [DonorsController],
  providers: [DonorsService, AportanteGuard],
  exports: [DonorsService, AportanteGuard],
})
export class DonorsModule {}
