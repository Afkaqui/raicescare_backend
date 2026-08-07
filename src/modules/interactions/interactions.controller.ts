import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { TokenServicioGuard } from "../../common/token-servicio.guard";
import { InteractionsService } from "./interactions.service";
import {
  actualizarInteraccionSchema,
  eventoCtaLegacySchema,
  eventoInteraccionSchema,
  registrarInteraccionSchema,
  vincularSolicitudSchema,
} from "./interaction.schema";

@Controller()
export class InteractionsController {
  private readonly logger = new Logger(InteractionsController.name);

  constructor(private readonly service: InteractionsService) {}

  /**
   * POST /api/v1/events/cta — formato heredado que usa el frontend publicado.
   * Responde 202 siempre: la analítica no debe bloquear la navegación.
   *
   * Único endpoint de escritura de interacciones abierto: lo llama el navegador
   * de cada visitante, así que no puede exigir credencial. Lo peor que permite
   * es ensuciar la analítica, nunca tocar un expediente.
   */
  @Post("events/cta")
  @HttpCode(HttpStatus.ACCEPTED)
  async registrarLegacy(@Body() cuerpo: unknown) {
    const validacion = eventoCtaLegacySchema.safeParse(cuerpo);

    if (!validacion.success) {
      this.logger.warn(
        `Payload de CTA inválido: ${validacion.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
      return { success: false, interactionId: null };
    }

    const { interactionId } = await this.service.registrarLegacy(
      validacion.data,
    );
    return { success: interactionId !== null, interactionId };
  }

  /** POST /api/v1/interactions */
  @UseGuards(TokenServicioGuard)
  @Post("interactions")
  @HttpCode(HttpStatus.ACCEPTED)
  async registrar(@Body() cuerpo: unknown) {
    const validacion = registrarInteraccionSchema.safeParse(cuerpo);

    if (!validacion.success) {
      this.logger.warn(`Interacción inválida: ${validacion.error.message}`);
      return { success: false, interactionId: null };
    }

    const { interactionId } = await this.service.registrar(validacion.data);
    return { success: interactionId !== null, interactionId };
  }

  /** GET /api/v1/interactions/{interactionId} */
  @UseGuards(TokenServicioGuard)
  @Get("interactions/:interactionId")
  consultar(@Param("interactionId", ParseUUIDPipe) interactionId: string) {
    return this.service.consultar(interactionId);
  }

  /** PATCH /api/v1/interactions/{interactionId} */
  @UseGuards(TokenServicioGuard)
  @Patch("interactions/:interactionId")
  actualizar(
    @Param("interactionId", ParseUUIDPipe) interactionId: string,
    @Body() cuerpo: unknown,
  ) {
    const validacion = actualizarInteraccionSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }
    return this.service.actualizar(interactionId, validacion.data);
  }

  /** POST /api/v1/interactions/{interactionId}/events */
  @UseGuards(TokenServicioGuard)
  @Post("interactions/:interactionId/events")
  @HttpCode(HttpStatus.CREATED)
  registrarEvento(
    @Param("interactionId", ParseUUIDPipe) interactionId: string,
    @Body() cuerpo: unknown,
  ) {
    const validacion = eventoInteraccionSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }
    return this.service.registrarEvento(interactionId, validacion.data);
  }

  /** POST /api/v1/interactions/{interactionId}/link-request */
  @UseGuards(TokenServicioGuard)
  @Post("interactions/:interactionId/link-request")
  vincular(
    @Param("interactionId", ParseUUIDPipe) interactionId: string,
    @Body() cuerpo: unknown,
  ) {
    const validacion = vincularSolicitudSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }
    return this.service.vincularSolicitud(interactionId, validacion.data);
  }
}
