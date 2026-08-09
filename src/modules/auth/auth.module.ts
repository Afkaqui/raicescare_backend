import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SesionGuard } from "./sesion.guard";

/** Global: la guarda de sesión se usa desde cualquier módulo con back-office. */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SesionGuard],
  exports: [AuthService, SesionGuard],
})
export class AuthModule {}
