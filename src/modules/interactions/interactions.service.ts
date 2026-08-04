import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  ActualizarInteraccionDto,
  EventoCtaLegacyDto,
  EventoInteraccionDto,
  RegistrarInteraccionDto,
  VincularSolicitudDto,
} from "./interaction.schema";

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra el clic. Es idempotente por interactionId: si el visitante vuelve
   * con el mismo identificador no se duplica la fila, solo se añade el evento.
   */
  async registrar(
    datos: RegistrarInteraccionDto,
  ): Promise<{ interactionId: string | null }> {
    if (!this.prisma.disponible) {
      this.logger.warn(`Interacción no persistida: ${datos.ctaCode}`);
      return { interactionId: null };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // El catálogo puede recibir códigos nuevos antes de sembrarse.
        await tx.ctaDefinition.upsert({
          where: { code: datos.ctaCode },
          create: {
            code: datos.ctaCode,
            label: datos.visibleLabel,
            destination: datos.destination.slice(0, 300),
            processType: datos.processType,
            analyticsCategory: datos.analyticsCategory,
          },
          update: {},
        });

        await tx.ctaInteraction.upsert({
          where: { interactionId: datos.interactionId },
          create: {
            interactionId: datos.interactionId,
            ctaCode: datos.ctaCode,
            visibleLabel: datos.visibleLabel,
            sourcePage: datos.sourcePage,
            sourceSection: datos.sourceSection,
            destination: datos.destination,
            processType: datos.processType,
            analyticsCategory: datos.analyticsCategory,
            sessionId: datos.sessionId,
            anonymousUserId: datos.anonymousUserId,
            programCode: datos.context?.programCode,
            campaignId: datos.context?.campaignId,
            initiativeId: datos.context?.initiativeId,
            projectId: datos.context?.projectId,
            opportunityId: datos.context?.opportunityId,
          },
          update: {},
        });

        await tx.interactionEvent.create({
          data: {
            interactionId: datos.interactionId,
            eventName: "cta_click",
            eventCategory: datos.analyticsCategory,
            payload: {
              ctaCode: datos.ctaCode,
              sourceSection: datos.sourceSection,
              destination: datos.destination,
            } as Prisma.InputJsonValue,
          },
        });
      });

      return { interactionId: datos.interactionId };
    } catch (error) {
      this.logger.error(
        `Error al registrar interacción ${datos.interactionId}: ${(error as Error).message}`,
      );
      return { interactionId: null };
    }
  }

  /** Traduce el payload heredado de /events/cta al modelo transversal. */
  async registrarLegacy(
    datos: EventoCtaLegacyDto,
  ): Promise<{ interactionId: string | null }> {
    const codigo =
      datos.ctaCode ??
      datos.ctaId.replace(`${datos.location}_`, "").toUpperCase();

    return this.registrar({
      interactionId: datos.interactionId,
      ctaCode: codigo,
      visibleLabel: datos.ctaLabel,
      sourcePage: datos.sourcePage ?? "/",
      sourceSection: datos.location,
      destination: datos.destination,
      processType: "unknown",
      analyticsCategory: "engagement",
      sessionId: datos.sessionId,
      anonymousUserId: datos.anonymousUserId,
      context: datos.campaign ? { programCode: datos.campaign } : undefined,
    });
  }

  /** Avance progresivo: los datos se añaden conforme el visitante los entrega. */
  async actualizar(interactionId: string, datos: ActualizarInteraccionDto) {
    await this.exigirInteraccion(interactionId);

    const actualizada = await this.prisma.ctaInteraction.update({
      where: { interactionId },
      data: {
        status: datos.status,
        categoryOfInterest: datos.categoryOfInterest,
        userType: datos.userType,
        personId: datos.personId,
        organizationId: datos.organizationId,
        programCode: datos.context?.programCode,
        campaignId: datos.context?.campaignId,
        initiativeId: datos.context?.initiativeId,
        projectId: datos.context?.projectId,
        opportunityId: datos.context?.opportunityId,
      },
    });

    if (datos.status) {
      await this.prisma.interactionEvent.create({
        data: {
          interactionId,
          eventName: `status_${datos.status}`,
          eventCategory: "lifecycle",
          payload: { status: datos.status } as Prisma.InputJsonValue,
        },
      });
    }

    return actualizada;
  }

  async registrarEvento(interactionId: string, datos: EventoInteraccionDto) {
    await this.exigirInteraccion(interactionId);

    return this.prisma.interactionEvent.create({
      data: {
        interactionId,
        eventName: datos.eventName,
        eventCategory: datos.eventCategory,
        payload: (datos.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** Cierra el círculo: la interacción se convierte en expediente. */
  async vincularSolicitud(interactionId: string, datos: VincularSolicitudDto) {
    await this.exigirInteraccion(interactionId);

    const actualizada = await this.prisma.ctaInteraction.update({
      where: { interactionId },
      data: {
        requestType: datos.requestType,
        requestId: datos.requestId,
        status: "converted",
      },
    });

    await this.prisma.interactionEvent.create({
      data: {
        interactionId,
        eventName: "request_linked",
        eventCategory: "conversion",
        payload: {
          requestType: datos.requestType,
          requestId: datos.requestId,
        } as Prisma.InputJsonValue,
      },
    });

    return actualizada;
  }

  async consultar(interactionId: string) {
    const interaccion = await this.prisma.ctaInteraction.findUnique({
      where: { interactionId },
      include: { eventos: { orderBy: { occurredAt: "asc" } } },
    });

    if (!interaccion) {
      throw new NotFoundException(`Interacción ${interactionId} no encontrada`);
    }

    return interaccion;
  }

  private async exigirInteraccion(interactionId: string) {
    const existe = await this.prisma.ctaInteraction.findUnique({
      where: { interactionId },
      select: { id: true },
    });

    if (!existe) {
      throw new NotFoundException(`Interacción ${interactionId} no encontrada`);
    }
  }
}
