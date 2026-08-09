import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SesionGuard } from "../auth/sesion.guard";
import { BackofficeService } from "./backoffice.service";
import { consultaBandejaSchema } from "./backoffice.schema";

/**
 * Todo el back-office bajo un prefijo propio y una sola guarda.
 *
 * Separarlo de los controladores públicos es deliberado: en `requests` conviven
 * rutas abiertas y cerradas, y basta olvidar un decorador para publicar datos
 * personales. Aquí la guarda está en la clase; no hay ruta que se escape.
 */
@UseGuards(SesionGuard)
@Controller("backoffice")
export class BackofficeController {
  constructor(private readonly service: BackofficeService) {}

  /** GET /api/v1/backoffice/resumen */
  @Get("resumen")
  resumen() {
    return this.service.resumen();
  }

  /** GET /api/v1/backoffice/requests?type=&status=&q=&page= */
  @Get("requests")
  listar(@Query() consulta: unknown) {
    const validacion = consultaBandejaSchema.safeParse(consulta);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);
    return this.service.listar(validacion.data);
  }

  /** GET /api/v1/backoffice/requests/{id} */
  @Get("requests/:id")
  detalle(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detalle(id);
  }
}
