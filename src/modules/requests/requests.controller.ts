import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  SesionGuard,
  type PeticionConActor,
} from "../auth/sesion.guard";
import type { Request } from "express";
import { RequestsService } from "./requests.service";
import { crearSolicitudSchema, transicionSchema } from "./request.schema";

@Controller("requests")
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  /** POST /api/v1/requests — abre el expediente y devuelve el código. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(@Body() cuerpo: unknown, @Req() peticion: Request) {
    const validacion = crearSolicitudSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }

    return this.service.crear(validacion.data, {
      ip: peticion.ip,
      ua: peticion.get("user-agent"),
    });
  }

  /** GET /api/v1/requests/{trackingCode} — seguimiento público. */
  @Get(":trackingCode")
  consultar(@Param("trackingCode") trackingCode: string) {
    return this.service.consultarPorCodigo(trackingCode);
  }

  /**
   * POST /api/v1/requests/{id}/status-transitions — solo back-office.
   *
   * Exige sesión, no un token compartido: el historial del expediente debe
   * poder decir quién decidió, no solo que alguien lo hizo. `changedBy` sale
   * de la sesión y no del cuerpo, para que nadie firme en nombre de otro.
   */
  @UseGuards(SesionGuard)
  @Post(":id/status-transitions")
  transicionar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConActor,
  ) {
    const validacion = transicionSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }
    return this.service.transicionar(id, {
      ...validacion.data,
      changedBy: peticion.actor!.id,
    });
  }
}
