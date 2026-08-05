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
import { MercadoPagoClient } from "./mercadopago.client";
import { PaymentsService } from "./payments.service";
import { checkoutSchema, suscripcionSchema } from "./payment.schema";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly mp: MercadoPagoClient,
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

    const firmaValida = this.mp.firmaValida({
      firma: peticion.get("x-signature"),
      requestId: peticion.get("x-request-id"),
      dataId,
    });

    await this.service.procesarWebhook({
      tipo,
      dataId,
      firmaValida,
      payload: cuerpo,
    });

    return { recibido: true };
  }

  /** GET /api/v1/payments/{trackingCode} — estado para la pantalla de gracias. */
  @Get(":trackingCode")
  estado(@Param("trackingCode") trackingCode: string) {
    return this.service.estadoPublico(trackingCode);
  }
}
