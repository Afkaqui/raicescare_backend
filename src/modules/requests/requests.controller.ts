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
import { TokenServicioGuard } from "../../common/token-servicio.guard";
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
   * Quien envía un formulario recibe el id de su expediente; sin esta guarda
   * podría avanzarlo él mismo.
   */
  @UseGuards(TokenServicioGuard)
  @Post(":id/status-transitions")
  transicionar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    const validacion = transicionSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }
    return this.service.transicionar(id, validacion.data);
  }
}
