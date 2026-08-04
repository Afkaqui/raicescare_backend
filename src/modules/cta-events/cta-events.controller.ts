import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from "@nestjs/common";
import { CtaEventsService } from "./cta-events.service";
import { ctaEventSchema } from "./cta-event.schema";

@Controller("events/cta")
export class CtaEventsController {
  private readonly logger = new Logger(CtaEventsController.name);

  constructor(private readonly service: CtaEventsService) {}

  /**
   * POST /api/v1/events/cta
   *
   * Se responde 202 siempre: el registro analítico no debe bloquear ni
   * penalizar la navegación del visitante, incluso si el payload es inválido.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async registrar(@Body() cuerpo: unknown) {
    const validacion = ctaEventSchema.safeParse(cuerpo);

    if (!validacion.success) {
      this.logger.warn(
        `Payload de CTA inválido: ${validacion.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
      return { success: false, eventId: null };
    }

    const { eventId } = await this.service.registrar(validacion.data);
    return { success: eventId !== null, eventId };
  }
}
