import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestsService } from "../requests/requests.service";
import { MercadoPagoClient, type PagoRemoto } from "./mercadopago.client";
import type { CheckoutDto, SuscripcionDto } from "./payment.schema";

/** Estados de MercadoPago que significan «la plata entró». */
const APROBADOS = new Set(["approved", "authorized"]);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mp: MercadoPagoClient,
    private readonly solicitudes: RequestsService,
  ) {}

  private get urlBase(): string {
    return (
      this.config.get<string>("PUBLIC_SITE_URL") ?? "https://www.raicescare.earth"
    );
  }

  /** Crea la preferencia de Checkout Pro para un expediente ya abierto. */
  async iniciarCheckout(datos: CheckoutDto) {
    const solicitud = await this.expedienteDeAporte(datos.trackingCode);

    const preferencia = await this.mp.crearPreferencia({
      trackingCode: solicitud.trackingCode,
      titulo: "Aporte a RaícesCare",
      monto: datos.amount,
      moneda: datos.currency,
      urlBase: this.urlBase,
    });

    await this.prisma.payment.create({
      data: {
        requestId: solicitud.id,
        preferenceId: preferencia.id,
        amount: new Prisma.Decimal(datos.amount),
        currency: datos.currency,
        status: "pending",
        payerEmail: datos.email,
      },
    });

    return {
      trackingCode: solicitud.trackingCode,
      preferenceId: preferencia.id,
      initPoint: preferencia.init_point,
    };
  }

  /** Crea la suscripción (preapproval) para un aporte recurrente. */
  async iniciarSuscripcion(datos: SuscripcionDto) {
    const solicitud = await this.expedienteDeAporte(datos.trackingCode);

    const existente = await this.prisma.subscription.findUnique({
      where: { requestId: solicitud.id },
    });

    if (existente?.providerPreapprovalId) {
      throw new BadRequestException(
        `El expediente ${solicitud.trackingCode} ya tiene una suscripción activa`,
      );
    }

    const preaprobacion = await this.mp.crearPreaprobacion({
      trackingCode: solicitud.trackingCode,
      razon: "Aporte recurrente a RaícesCare",
      monto: datos.amount,
      moneda: datos.currency,
      frecuencia: datos.frequency,
      tipoFrecuencia: datos.frequencyType,
      email: datos.email,
      urlBase: this.urlBase,
    });

    await this.prisma.subscription.upsert({
      where: { requestId: solicitud.id },
      create: {
        requestId: solicitud.id,
        providerPreapprovalId: preaprobacion.id,
        amount: new Prisma.Decimal(datos.amount),
        currency: datos.currency,
        frequency: datos.frequency,
        frequencyType: datos.frequencyType,
        status: preaprobacion.status ?? "pending",
        payerEmail: datos.email,
      },
      update: {
        providerPreapprovalId: preaprobacion.id,
        amount: new Prisma.Decimal(datos.amount),
        currency: datos.currency,
        frequency: datos.frequency,
        frequencyType: datos.frequencyType,
        status: preaprobacion.status ?? "pending",
        payerEmail: datos.email,
      },
    });

    return {
      trackingCode: solicitud.trackingCode,
      preapprovalId: preaprobacion.id,
      initPoint: preaprobacion.init_point,
    };
  }

  /**
   * Procesa una notificación. Nunca se confía en lo que trae el cuerpo: solo se
   * toma el identificador del recurso y se relee el estado desde MercadoPago
   * con nuestro propio token.
   */
  async procesarWebhook(entrada: {
    tipo?: string;
    dataId?: string;
    firmaValida: boolean;
    payload: unknown;
  }) {
    const evento = await this.prisma.paymentEvent.create({
      data: {
        eventType: entrada.tipo ?? "desconocido",
        resourceId: entrada.dataId ?? "",
        signatureValid: entrada.firmaValida,
        payload: (entrada.payload ?? {}) as never,
      },
    });

    if (!entrada.firmaValida || !entrada.dataId) {
      await this.anotar(evento.id, false, "Firma inválida o recurso ausente");
      return { procesado: false };
    }

    try {
      if (entrada.tipo === "payment") {
        await this.sincronizarPago(entrada.dataId);
      } else if (
        entrada.tipo === "subscription_preapproval" ||
        entrada.tipo === "preapproval"
      ) {
        await this.sincronizarSuscripcion(entrada.dataId);
      } else {
        await this.anotar(evento.id, false, `Tipo no manejado: ${entrada.tipo}`);
        return { procesado: false };
      }

      await this.anotar(evento.id, true, null);
      return { procesado: true };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(`Webhook ${entrada.dataId} falló: ${mensaje}`);
      await this.anotar(evento.id, false, mensaje);
      // Se responde 200 igual: MercadoPago reintenta y el evento queda anotado.
      return { procesado: false };
    }
  }

  /** Relee el pago desde MercadoPago y refleja su estado en el expediente. */
  private async sincronizarPago(idPago: string) {
    const remoto = await this.mp.obtenerPago(idPago);
    const trackingCode = remoto.external_reference;

    if (!trackingCode) {
      throw new Error(`El pago ${idPago} no trae external_reference`);
    }

    const solicitud = await this.prisma.institutionalRequest.findUnique({
      where: { trackingCode },
      select: { id: true, status: true, trackingCode: true },
    });

    if (!solicitud) {
      throw new Error(`No existe el expediente ${trackingCode}`);
    }

    const suscripcion = await this.prisma.subscription.findUnique({
      where: { requestId: solicitud.id },
      select: { id: true },
    });

    // Idempotente: los reintentos de MercadoPago actualizan la misma fila.
    await this.prisma.payment.upsert({
      where: { providerPaymentId: String(remoto.id) },
      create: {
        requestId: solicitud.id,
        subscriptionId: suscripcion?.id,
        providerPaymentId: String(remoto.id),
        amount: new Prisma.Decimal(remoto.transaction_amount ?? 0),
        currency: remoto.currency_id ?? "PEN",
        ...this.camposDeEstado(remoto),
      },
      update: this.camposDeEstado(remoto),
    });

    if (APROBADOS.has(remoto.status)) {
      await this.confirmarAporte(solicitud, Boolean(suscripcion));
    }
  }

  private camposDeEstado(remoto: PagoRemoto) {
    return {
      status: remoto.status,
      statusDetail: remoto.status_detail,
      paymentTypeId: remoto.payment_type_id,
      paymentMethodId: remoto.payment_method_id,
      payerEmail: remoto.payer?.email,
      approvedAt: remoto.date_approved ? new Date(remoto.date_approved) : null,
    };
  }

  /** Refleja el estado de la suscripción; el cobro individual llega aparte. */
  private async sincronizarSuscripcion(idPreaprobacion: string) {
    const remoto = await this.mp.obtenerPreaprobacion(idPreaprobacion);

    const suscripcion = await this.prisma.subscription.findUnique({
      where: { providerPreapprovalId: idPreaprobacion },
      select: { id: true, requestId: true },
    });

    if (!suscripcion) {
      throw new Error(`No existe la suscripción ${idPreaprobacion}`);
    }

    const cancelada = remoto.status === "cancelled";

    await this.prisma.subscription.update({
      where: { id: suscripcion.id },
      data: {
        status: remoto.status,
        nextPaymentDate: remoto.next_payment_date
          ? new Date(remoto.next_payment_date)
          : null,
        cancelledAt: cancelada ? new Date() : null,
      },
    });

    if (cancelada) {
      await this.transicionSilenciosa(suscripcion.requestId, "closed", {
        publicComment: "El aporte recurrente fue cancelado.",
        internalComment: `Suscripción ${idPreaprobacion} cancelada en MercadoPago`,
      });
    }
  }

  /**
   * Un aporte confirmado avanza el expediente. Un aporte único se cierra: no
   * hay nada más que revisar. Uno recurrente queda en proceso mientras la
   * suscripción siga viva.
   */
  private async confirmarAporte(
    solicitud: { id: string; status: string; trackingCode: string },
    esRecurrente: boolean,
  ) {
    if (solicitud.status === "received") {
      await this.transicionSilenciosa(solicitud.id, "automatic_validation", {
        publicComment: "Aporte confirmado por la pasarela de pago.",
        internalComment: `Pago aprobado para ${solicitud.trackingCode}`,
      });
    }

    const destino = esRecurrente ? "in_process" : "closed";
    await this.transicionSilenciosa(solicitud.id, destino, {
      publicComment: esRecurrente
        ? "Aporte recurrente activo. Gracias por sostener el trabajo."
        : "Aporte recibido. Gracias por tu apoyo.",
      internalComment: esRecurrente
        ? "Suscripción activa"
        : "Aporte único completado",
    });
  }

  /**
   * Una transición ya aplicada no debe tumbar el webhook: si MercadoPago
   * reintenta, el expediente ya avanzó y el conflicto es esperable.
   */
  private async transicionSilenciosa(
    requestId: string,
    newStatus: Parameters<RequestsService["transicionar"]>[1]["newStatus"],
    comentarios: { publicComment?: string; internalComment?: string },
  ) {
    try {
      await this.solicitudes.transicionar(requestId, {
        newStatus,
        ...comentarios,
      });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Transición a ${newStatus} omitida: ${mensaje}`);
    }
  }

  private async anotar(id: string, procesado: boolean, nota: string | null) {
    await this.prisma.paymentEvent.update({
      where: { id },
      data: { processed: procesado, processingNote: nota },
    });
  }

  /** El expediente debe existir y ser de tipo aporte. */
  private async expedienteDeAporte(trackingCode: string) {
    if (!this.prisma.disponible) {
      throw new ServiceUnavailableException("Base de datos no disponible");
    }

    if (!this.mp.configurado) {
      throw new ServiceUnavailableException(
        "La pasarela de pagos no está configurada",
      );
    }

    const solicitud = await this.prisma.institutionalRequest.findUnique({
      where: { trackingCode },
      select: { id: true, trackingCode: true, requestType: true, status: true },
    });

    if (!solicitud) {
      throw new NotFoundException(`No existe la solicitud ${trackingCode}`);
    }

    if (solicitud.requestType !== "contribution") {
      throw new BadRequestException(
        `El expediente ${trackingCode} no es un aporte`,
      );
    }

    if (solicitud.status === "closed") {
      throw new BadRequestException(
        `El expediente ${trackingCode} ya está cerrado`,
      );
    }

    return solicitud;
  }

  /** Estado de pago de un expediente, para la pantalla de gracias. */
  async estadoPublico(trackingCode: string) {
    const solicitud = await this.prisma.institutionalRequest.findUnique({
      where: { trackingCode },
      select: {
        trackingCode: true,
        status: true,
        pagos: {
          select: {
            amount: true,
            currency: true,
            status: true,
            approvedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        suscripcion: {
          select: {
            amount: true,
            currency: true,
            frequency: true,
            frequencyType: true,
            status: true,
            nextPaymentDate: true,
          },
        },
      },
    });

    if (!solicitud) {
      throw new NotFoundException(`No existe la solicitud ${trackingCode}`);
    }

    return {
      trackingCode: solicitud.trackingCode,
      status: solicitud.status,
      pago: solicitud.pagos[0] ?? null,
      suscripcion: solicitud.suscripcion,
    };
  }
}
