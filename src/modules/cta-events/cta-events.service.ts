import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CtaEventDto } from "./cta-event.schema";

@Injectable()
export class CtaEventsService {
  private readonly logger = new Logger(CtaEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra el evento. Si la base no está disponible se deja constancia en el
   * log y se responde igual: la analítica nunca debe romper la navegación.
   */
  async registrar(evento: CtaEventDto): Promise<{ eventId: string | null }> {
    if (!this.prisma.disponible) {
      this.logger.warn(
        `Evento no persistido (base no disponible): ${evento.ctaId}`,
      );
      return { eventId: null };
    }

    try {
      const creado = await this.prisma.ctaEvent.create({
        data: {
          interactionId: evento.interactionId,
          ctaId: evento.ctaId,
          ctaLabel: evento.ctaLabel,
          ctaCode: evento.ctaCode,
          location: evento.location,
          destination: evento.destination,
          sourcePage: evento.sourcePage,
          campaign: evento.campaign,
          sessionId: evento.sessionId,
          anonymousUserId: evento.anonymousUserId,
          occurredAt: new Date(evento.timestamp),
        },
        select: { id: true },
      });

      return { eventId: creado.id };
    } catch (error) {
      this.logger.error(
        `Error al registrar evento ${evento.ctaId}: ${(error as Error).message}`,
      );
      return { eventId: null };
    }
  }
}
