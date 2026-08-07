import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { InteractionsService } from "../interactions/interactions.service";
import {
  TIPOS_SOLICITUD,
  TRANSICIONES,
  type CrearSolicitudDto,
  type EstadoGeneral,
  type TransicionDto,
} from "./request.schema";

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly interacciones: InteractionsService,
  ) {}

  /**
   * Abre un expediente. Todo ocurre en una transacción: el código de
   * seguimiento se reserva con la secuencia, de modo que dos solicitudes
   * simultáneas nunca reciben el mismo número.
   */
  async crear(datos: CrearSolicitudDto, huella?: { ip?: string; ua?: string }) {
    if (!this.prisma.disponible) {
      throw new ServiceUnavailableException("Base de datos no disponible");
    }

    const prefijo = TIPOS_SOLICITUD[datos.requestType];
    const anio = new Date().getFullYear();

    // La trazabilidad no puede bloquear el proceso: si la interacción no llegó
    // a registrarse (API caída al hacer clic, bloqueador de anuncios, sesión
    // vieja), el expediente se abre igual, solo que sin enlazar.
    const interactionId = await this.interaccionValida(datos.interactionId);

    const solicitud = await this.prisma.$transaction(async (tx) => {
      const secuencia = await tx.requestSequence.upsert({
        where: { prefix_year: { prefix: prefijo, year: anio } },
        create: { prefix: prefijo, year: anio, lastValue: 1 },
        update: { lastValue: { increment: 1 } },
      });

      const trackingCode = `RC-${prefijo}-${anio}-${String(
        secuencia.lastValue,
      ).padStart(6, "0")}`;

      const persona = datos.applicant
        ? await tx.person.create({
            data: {
              fullName: datos.applicant.fullName,
              email: datos.applicant.email,
              phone: datos.applicant.phone,
              country: datos.applicant.country,
            },
          })
        : null;

      const organizacion = datos.organization
        ? await tx.organization.create({
            data: {
              legalName: datos.organization.legalName,
              organizationType: datos.organization.organizationType,
              registrationNumber: datos.organization.registrationNumber,
              country: datos.organization.country,
              website: datos.organization.website,
            },
          })
        : null;

      const creada = await tx.institutionalRequest.create({
        data: {
          trackingCode,
          requestType: datos.requestType,
          interactionId,
          applicantPersonId: persona?.id,
          applicantOrganizationId: organizacion?.id,
          category: datos.category,
          source: datos.source,
          formData: (datos.formData ?? undefined) as never,
          status: "received",
        },
      });

      // El expediente nace con su historial: nunca hay un estado sin registro.
      await tx.requestStatusHistory.create({
        data: {
          requestId: creada.id,
          previousStatus: null,
          newStatus: "received",
          internalComment: "Solicitud recibida",
        },
      });

      if (datos.consents?.length) {
        await tx.consent.createMany({
          data: datos.consents.map((consentimiento) => ({
            personId: persona?.id,
            requestId: creada.id,
            consentType: consentimiento.consentType,
            policyVersion: consentimiento.policyVersion,
            accepted: consentimiento.accepted,
            acceptedAt: consentimiento.accepted ? new Date() : null,
            sourceIpHash: this.hash(huella?.ip),
            userAgentHash: this.hash(huella?.ua),
          })),
        });
      }

      return creada;
    });

    // Cierra el círculo de trazabilidad: el clic se volvió expediente.
    if (interactionId) {
      await this.interacciones
        .vincularSolicitud(interactionId, {
          requestType: datos.requestType,
          requestId: solicitud.id,
        })
        .catch((error: Error) =>
          this.logger.warn(`No se pudo vincular la interacción: ${error.message}`),
        );
    }

    return {
      id: solicitud.id,
      trackingCode: solicitud.trackingCode,
      status: solicitud.status,
      submittedAt: solicitud.submittedAt,
    };
  }

  /** Consulta pública por código de seguimiento: solo información no sensible. */
  async consultarPorCodigo(trackingCode: string) {
    const solicitud = await this.prisma.institutionalRequest.findUnique({
      where: { trackingCode },
      select: {
        trackingCode: true,
        requestType: true,
        category: true,
        status: true,
        submittedAt: true,
        updatedAt: true,
        closedAt: true,
        historial: {
          select: {
            newStatus: true,
            publicComment: true,
            changedAt: true,
          },
          orderBy: { changedAt: "asc" },
        },
        resultado: {
          select: { outcomeCode: true, publicMessage: true, decidedAt: true },
        },
      },
    });

    if (!solicitud) {
      throw new NotFoundException(`No existe la solicitud ${trackingCode}`);
    }

    return solicitud;
  }

  /** Cambia el estado validando la transición y conservando el anterior. */
  async transicionar(id: string, datos: TransicionDto) {
    const solicitud = await this.prisma.institutionalRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!solicitud) {
      throw new NotFoundException(`No existe la solicitud ${id}`);
    }

    const actual = solicitud.status as EstadoGeneral;
    const permitidas = TRANSICIONES[actual] ?? [];

    if (!permitidas.includes(datos.newStatus)) {
      throw new ConflictException(
        `Transición no permitida: ${actual} → ${datos.newStatus}. ` +
          `Desde ${actual} solo se puede pasar a: ${permitidas.join(", ") || "ningún estado"}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.institutionalRequest.update({
        where: { id },
        data: {
          status: datos.newStatus,
          closedAt: datos.newStatus === "closed" ? new Date() : undefined,
        },
      });

      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          previousStatus: actual,
          newStatus: datos.newStatus,
          publicComment: datos.publicComment,
          internalComment: datos.internalComment,
          reasonCode: datos.reasonCode,
          changedBy: datos.changedBy,
        },
      });

      return {
        trackingCode: actualizada.trackingCode,
        previousStatus: actual,
        status: actualizada.status,
      };
    });
  }

  /**
   * Devuelve el interactionId solo si se puede enlazar sin romper nada: debe
   * existir y no estar ya tomado por otro expediente.
   *
   * Las dos comprobaciones nacen del mismo principio: la trazabilidad no puede
   * impedir que alguien haga un trámite. Un identificador huérfano rompería la
   * clave foránea; uno repetido, la restricción de unicidad. En ambos casos lo
   * que se pierde es el enlace, nunca la solicitud.
   */
  private async interaccionValida(
    interactionId?: string,
  ): Promise<string | undefined> {
    if (!interactionId) return undefined;

    const existe = await this.prisma.ctaInteraction.findUnique({
      where: { interactionId },
      select: { id: true },
    });

    if (!existe) {
      this.logger.warn(
        `Interacción ${interactionId} no registrada: el expediente se abre sin enlazar`,
      );
      return undefined;
    }

    // Una misma sesión puede originar varios expedientes: quien reintenta un
    // aporte rechazado, o aporta dos veces, reenvía el mismo identificador.
    const yaTomada = await this.prisma.institutionalRequest.findUnique({
      where: { interactionId },
      select: { trackingCode: true },
    });

    if (yaTomada) {
      this.logger.warn(
        `Interacción ${interactionId} ya enlazada a ${yaTomada.trackingCode}: ` +
          "el nuevo expediente se abre sin enlazar",
      );
      return undefined;
    }

    return interactionId;
  }

  /** Nunca se guarda la IP ni el user agent en claro. */
  private hash(valor?: string): string | undefined {
    if (!valor) return undefined;
    return createHash("sha256").update(valor).digest("hex");
  }
}
