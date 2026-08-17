import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { Limitador } from "../../common/limitador";
import { MercadoPagoClient } from "./mercadopago.client";
import { PaymentsService } from "./payments.service";
import { checkoutSchema, suscripcionSchema } from "./payment.schema";
import { ipDelCliente } from "../../common/ip-cliente";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly mp: MercadoPagoClient,
    private readonly limitador: Limitador,
  ) {}

  /** POST /api/v1/payments/checkout — devuelve la URL de Checkout Pro. */
  @Post("checkout")
  @HttpCode(HttpStatus.CREATED)
  checkout(@Body() cuerpo: unknown) {
    const validacion = checkoutSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }
    return this.service.iniciarCheckout(validacion.data);
  }

  /** POST /api/v1/payments/subscription — aporte recurrente. */
  @Post("subscription")
  @HttpCode(HttpStatus.CREATED)
  suscripcion(@Body() cuerpo: unknown) {
    const validacion = suscripcionSchema.safeParse(cuerpo);
    if (!validacion.success) {
      throw new BadRequestException(validacion.error.issues);
    }
    return this.service.iniciarSuscripcion(validacion.data);
  }

  /**
   * POST /api/v1/payments/webhook — notificaciones de MercadoPago.
   *
   * Responde 200 siempre, incluso ante firma inválida: devolver un error haría
   * que MercadoPago reintente indefinidamente y sirve de oráculo a quien esté
   * probando firmas. Lo que se rechaza queda anotado en `payment_events`.
   */
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() peticion: Request,
    @Body() cuerpo: Record<string, unknown>,
    @Query("data.id") dataIdQuery?: string,
    @Query("type") tipoQuery?: string,
  ) {
    const datos = cuerpo?.data as { id?: string | number } | undefined;
    const dataId = dataIdQuery ?? (datos?.id ? String(datos.id) : undefined);
    const tipo =
      (typeof cuerpo?.type === "string" ? cuerpo.type : undefined) ?? tipoQuery;

    // Se responde 200 también al limitar: quien sondee no debe distinguir.
    if (!this.limitador.permitido("webhook", ipDelCliente(peticion), 60, 60_000)) {
      return { recibido: true };
    }

    const firmaValida = this.mp.firmaValida({
      firma: peticion.get("x-signature"),
      requestId: peticion.get("x-request-id"),
      dataId,
    });

    await this.service.procesarWebhook({
      tipo,
      dataId,
      firmaValida,
      // Se guarda con qué se validó, no solo el cuerpo: sin la cabecera de
      // firma y la consulta original, un rechazo es indiagnosticable. La firma
      // es un código de autenticación, no un secreto.
      payload: {
        cuerpo,
        consulta: peticion.query,
        cabeceras: {
          "x-signature": peticion.get("x-signature") ?? null,
          "x-request-id": peticion.get("x-request-id") ?? null,
          "user-agent": peticion.get("user-agent") ?? null,
        },
      },
    });

    return { recibido: true };
  }

  /**
   * POST /api/v1/payments/{trackingCode}/return — lo llama la pantalla de
   * regreso. Público porque lo dispara el navegador del aportante, y limitado
   * porque es escritura sin credencial. Solo anota; no cambia estados.
   */
  @Post(":trackingCode/return")
  @HttpCode(HttpStatus.ACCEPTED)
  retorno(
    @Param("trackingCode") trackingCode: string,
    @Body("resultado") resultado: string,
    @Req() peticion: Request,
  ) {
    if (!this.limitador.permitido("retorno", ipDelCliente(peticion), 20, 60_000)) {
      return { registrado: false };
    }

    const admitidos = ["success", "pending", "failure"];
    return this.service.registrarRetorno(
      trackingCode,
      admitidos.includes(resultado) ? resultado : "desconocido",
    );
  }

  /** GET /api/v1/payments/{trackingCode} — estado para la pantalla de gracias. */
  @Get(":trackingCode")
  estado(@Param("trackingCode") trackingCode: string) {
    return this.service.estadoPublico(trackingCode);
  }
}
