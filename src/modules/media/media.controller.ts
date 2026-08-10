import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { SesionGuard, type PeticionConActor } from "../auth/sesion.guard";
import { MediaService } from "./media.service";

@Controller()
export class MediaController {
  constructor(private readonly service: MediaService) {}

  /** POST /api/v1/backoffice/media — subir una imagen. */
  @UseGuards(SesionGuard)
  @Post("backoffice/media")
  @UseInterceptors(FileInterceptor("archivo"))
  subir(
    @UploadedFile() archivo: Express.Multer.File,
    @Body("altText") altText: string | undefined,
    @Req() peticion: PeticionConActor,
  ) {
    return this.service.guardar(archivo, { altText }, peticion.actor!.id);
  }

  /** GET /api/v1/backoffice/media — biblioteca para elegir portada. */
  @UseGuards(SesionGuard)
  @Get("backoffice/media")
  listar() {
    return this.service.listar();
  }

  /**
   * GET /api/v1/media/{clave} — público: las imágenes de un contenido
   * publicado las ve cualquiera. Se sirven desde aquí y no como estáticos para
   * validar la clave contra la base antes de tocar el disco.
   */
  @Get("media/:clave")
  async servir(@Param("clave") clave: string, @Res() respuesta: Response) {
    const { flujo, registro } = await this.service.abrir(clave);

    respuesta.setHeader("Content-Type", registro.mimeType);
    respuesta.setHeader("Content-Length", registro.sizeBytes);
    // El nombre en disco deriva del contenido, así que nunca cambia: se puede
    // cachear para siempre.
    respuesta.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    respuesta.setHeader("X-Content-Type-Options", "nosniff");

    flujo.pipe(respuesta);
  }
}
