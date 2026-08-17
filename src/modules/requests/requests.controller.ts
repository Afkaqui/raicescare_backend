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
import { DonorsService } from "../donors/donors.service";
import { COOKIE_APORTANTE } from "../donors/aportante.guard";
import { ipDelCliente } from "../../common/ip-cliente";

@Controller("requests")
export class RequestsController {
  constructor(
    private readonly service: RequestsService,
    private readonly donantes: DonorsService,
  ) {}

  /**
   * Devuelve la cuenta del aportante si hay sesión confirmada, o nada.
   *
   * Nunca bloquea: exigir registro antes de donar es la fricción que más
   * donaciones pierde. La cuenta sirve para que la persona vuelva a ver lo que
   * dio, no para dejarla fuera si no la quiere.
   */
  private async aportanteDe(peticion: Request): Promise<string | undefined> {
    const galleta = peticion.headers.cookie
      ?.split(";")
      .map((trozo) => trozo.trim().split("="))
      .find(([nombre]) => nombre === COOKIE_APORTANTE);

    if (!galleta) return undefined;

    const aportante = await this.donantes.aportanteDeToken(
      decodeURIComponent(galleta.slice(1).join("=")),
    );

    return aportante?.verificado ? aportante.id : undefined;
  }

  /** POST /api/v1/requests — abre el expediente y devuelve el código. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() cuerpo: unknown, @Req() peticion: Request) {
    const validacion = crearSolicitudSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }

    // Registrarse es opcional: quien tenga sesión ve el aporte en su historial,
    // quien no, aporta igual y puede reclamarlo después con el mismo correo.
    const donorId = await this.aportanteDe(peticion);

    return this.service.crear(
      validacion.data,
      { ip: ipDelCliente(peticion), ua: peticion.get("user-agent") },
      donorId,
    );
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
