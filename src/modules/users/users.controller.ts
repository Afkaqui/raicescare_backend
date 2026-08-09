import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SesionGuard, SoloSuperadmin, type PeticionConActor } from "../auth/sesion.guard";
import { UsersService } from "./users.service";
import { crearUsuarioSchema, estadoUsuarioSchema } from "./user.schema";

/**
 * Gestión de cuentas: reservada por completo al superadministrador. Un
 * administrador opera todo el trabajo diario pero no decide quién más entra.
 */
@UseGuards(SesionGuard)
@SoloSuperadmin()
@Controller("users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  crear(@Body() cuerpo: unknown, @Req() peticion: PeticionConActor) {
    const validacion = crearUsuarioSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);
    return this.service.crear(validacion.data, peticion.actor!, peticion.ip);
  }

  @Post(":id/resend-link")
  reenviar(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() peticion: PeticionConActor,
  ) {
    return this.service.reenviarEnlace(id, peticion.actor!, peticion.ip);
  }

  /** Cierra sus sesiones y le manda un enlace para elegir contraseña nueva. */
  @Post(":id/force-password-change")
  forzar(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() peticion: PeticionConActor,
  ) {
    return this.service.forzarCambio(id, peticion.actor!, peticion.ip);
  }

  @Patch(":id/status")
  async estado(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConActor,
  ) {
    const validacion = estadoUsuarioSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    if (validacion.data.status === "suspended" && !(await this.service.quedaOtroSuperadmin(id))) {
      throw new BadRequestException(
        "No se puede suspender: dejaría al sistema sin superadministrador activo",
      );
    }
    return this.service.cambiarEstado(id, validacion.data.status, peticion.actor!, peticion.ip);
  }

  @Delete(":id")
  async eliminar(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() peticion: PeticionConActor,
  ) {
    if (!(await this.service.quedaOtroSuperadmin(id))) {
      throw new BadRequestException(
        "No se puede eliminar: dejaría al sistema sin superadministrador activo",
      );
    }
    return this.service.eliminar(id, peticion.actor!, peticion.ip);
  }
}
