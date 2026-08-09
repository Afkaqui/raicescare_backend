import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { ConsultaBandejaDto } from "./backoffice.schema";

/** Un expediente sin resolver es más urgente que uno cerrado. */
const ESTADOS_ABIERTOS = [
  "received",
  "automatic_validation",
  "under_review",
  "additional_information_requested",
  "eligible",
  "in_process",
];

@Injectable()
export class BackofficeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Contadores para saber de un vistazo qué hay pendiente. */
  async resumen() {
    const [porEstado, porTipo, sinAsignar] = await Promise.all([
      this.prisma.institutionalRequest.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.institutionalRequest.groupBy({
        by: ["requestType"],
        _count: { _all: true },
        where: { status: { in: ESTADOS_ABIERTOS } },
      }),
      this.prisma.institutionalRequest.count({
        where: { status: { in: ESTADOS_ABIERTOS }, assignedOwnerId: null },
      }),
    ]);

    return {
      porEstado: Object.fromEntries(
        porEstado.map((fila) => [fila.status, fila._count._all]),
      ),
      porTipo: Object.fromEntries(
        porTipo.map((fila) => [fila.requestType, fila._count._all]),
      ),
      abiertos: porEstado
        .filter((fila) => ESTADOS_ABIERTOS.includes(fila.status))
        .reduce((suma, fila) => suma + fila._count._all, 0),
      sinAsignar,
    };
  }

  /**
   * Listado paginado. Devuelve solo lo necesario para la tabla: el detalle
   * completo, con datos personales, exige abrir el expediente.
   */
  async listar(consulta: ConsultaBandejaDto) {
    const donde: Prisma.InstitutionalRequestWhereInput = {};

    if (consulta.type) donde.requestType = consulta.type;
    if (consulta.status === "abiertos") {
      donde.status = { in: ESTADOS_ABIERTOS };
    } else if (consulta.status) {
      donde.status = consulta.status;
    }

    if (consulta.q) {
      const texto = consulta.q.trim();
      donde.OR = [
        { trackingCode: { contains: texto, mode: "insensitive" } },
        { persona: { fullName: { contains: texto, mode: "insensitive" } } },
        { persona: { email: { contains: texto, mode: "insensitive" } } },
        { organizacion: { legalName: { contains: texto, mode: "insensitive" } } },
      ];
    }

    const porPagina = 25;
    const [total, filas] = await Promise.all([
      this.prisma.institutionalRequest.count({ where: donde }),
      this.prisma.institutionalRequest.findMany({
        where: donde,
        select: {
          id: true,
          trackingCode: true,
          requestType: true,
          category: true,
          status: true,
          submittedAt: true,
          assignedOwnerId: true,
          persona: { select: { fullName: true } },
          organizacion: { select: { legalName: true } },
          pagos: {
            select: { amount: true, currency: true, status: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { submittedAt: "desc" },
        skip: (consulta.page - 1) * porPagina,
        take: porPagina,
      }),
    ]);

    return {
      total,
      pagina: consulta.page,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
      filas: filas.map((fila) => ({
        id: fila.id,
        trackingCode: fila.trackingCode,
        requestType: fila.requestType,
        category: fila.category,
        status: fila.status,
        submittedAt: fila.submittedAt,
        asignado: Boolean(fila.assignedOwnerId),
        solicitante:
          fila.persona?.fullName ?? fila.organizacion?.legalName ?? null,
        pago: fila.pagos[0] ?? null,
      })),
    };
  }

  /** Detalle completo. Aquí sí viajan los datos personales. */
  async detalle(id: string) {
    const solicitud = await this.prisma.institutionalRequest.findUnique({
      where: { id },
      include: {
        persona: true,
        organizacion: true,
        historial: { orderBy: { changedAt: "asc" } },
        consentimientos: {
          select: {
            consentType: true,
            policyVersion: true,
            accepted: true,
            acceptedAt: true,
          },
        },
        pagos: { orderBy: { createdAt: "desc" } },
        suscripcion: true,
        resultado: true,
        interaccion: {
          select: {
            ctaCode: true,
            visibleLabel: true,
            sourcePage: true,
            sourceSection: true,
            occurredAt: true,
          },
        },
      },
    });

    if (!solicitud) throw new NotFoundException(`No existe el expediente ${id}`);

    // Los nombres de quienes decidieron, para que el historial se lea.
    const autores = solicitud.historial
      .map((paso) => paso.changedBy)
      .filter((valor): valor is string => Boolean(valor));

    const usuarios = autores.length
      ? await this.prisma.user.findMany({
          where: { id: { in: autores } },
          select: { id: true, fullName: true, role: true },
        })
      : [];

    const porId = new Map(usuarios.map((usuario) => [usuario.id, usuario]));

    return {
      ...solicitud,
      historial: solicitud.historial.map((paso) => ({
        ...paso,
        autor: paso.changedBy ? (porId.get(paso.changedBy) ?? null) : null,
      })),
    };
  }
}
