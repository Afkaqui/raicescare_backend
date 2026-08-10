import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  SesionGuard,
  SoloSuperadmin,
  type PeticionConActor,
} from "../auth/sesion.guard";
import { ContentService } from "./content.service";
import { TIPOS_CONTENIDO, contenidoSchema } from "./content.schema";

/** Lo que consume el sitio público: solo lectura y solo lo publicado. */
@Controller("content")
export class ContentPublicoController {
  constructor(private readonly service: ContentService) {}

  @Get()
  listar(@Query("kind") kind?: string, @Query("program") program?: string) {
    if (kind && !TIPOS_CONTENIDO.includes(kind as never)) {
      throw new BadRequestException("Tipo de contenido desconocido");
    }
    return this.service.publicos(kind, program);
  }

  @Get(":kind/:slug")
  detalle(@Param("kind") kind: string, @Param("slug") slug: string) {
    if (!TIPOS_CONTENIDO.includes(kind as never)) {
      throw new BadRequestException("Tipo de contenido desconocido");
    }
    return this.service.publicoPorSlug(kind, slug);
  }
}

/**
 * Gestión desde el panel. Un administrador crea, edita y publica; eliminar
 * queda para el superadmin porque es lo único que no tiene vuelta atrás:
 * despublicar deja el contenido recuperable.
 */
@UseGuards(SesionGuard)
@Controller("backoffice/content")
export class ContentAdminController {
  constructor(private readonly service: ContentService) {}

  @Get()
  listar(@Query("kind") kind?: string) {
    return this.service.listarAdmin(kind);
  }

  @Get(":id")
  detalle(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detalleAdmin(id);
  }

  @Post()
  crear(@Body() cuerpo: unknown, @Req() peticion: PeticionConActor) {
    const validacion = contenidoSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);
    return this.service.crear(validacion.data, peticion.actor!, peticion.ip);
  }

  @Put(":id")
  actualizar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConActor,
  ) {
    const validacion = contenidoSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);
    return this.service.actualizar(id, validacion.data, peticion.actor!, peticion.ip);
  }

  @SoloSuperadmin()
  @Delete(":id")
  eliminar(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() peticion: PeticionConActor,
  ) {
    return this.service.eliminar(id, peticion.actor!, peticion.ip);
  }
}
