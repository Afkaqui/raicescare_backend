import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.mercadopago.com";

type Preferencia = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

type Preaprobacion = {
  id: string;
  init_point: string;
  status: string;
  next_payment_date?: string;
  payer_email?: string;
};

/** Solo los campos que se usan; MercadoPago devuelve bastante más. */
export type PagoRemoto = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  payment_type_id?: string;
  payment_method_id?: string;
  date_approved?: string | null;
  payer?: { email?: string };
  metadata?: Record<string, unknown>;
};

/**
 * Cliente mínimo sobre la API de MercadoPago. Se usa `fetch` nativo en vez del
 * SDK oficial: son cuatro llamadas y no justifica sumar el árbol de
 * dependencias del paquete.
 */
@Injectable()
export class MercadoPagoClient {
  private readonly logger = new Logger(MercadoPagoClient.name);

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(this.config.get<string>("MP_ACCESS_TOKEN"));
  }

  private get token(): string {
    const token = this.config.get<string>("MP_ACCESS_TOKEN");
    if (!token) throw new Error("Falta MP_ACCESS_TOKEN");
    return token;
  }

  private async pedir<T>(
    ruta: string,
    opciones: { metodo?: string; cuerpo?: unknown; idempotencia?: string } = {},
  ): Promise<T> {
    const cabeceras: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    // MercadoPago deduplica por esta cabecera: si el usuario recarga, no se
    // crea una preferencia distinta para el mismo expediente.
    if (opciones.idempotencia) {
      cabeceras["X-Idempotency-Key"] = opciones.idempotencia;
    }

    const respuesta = await fetch(`${API}${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: cabeceras,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
    });

    const texto = await respuesta.text();

    if (!respuesta.ok) {
      this.logger.error(
        `MercadoPago ${opciones.metodo ?? "GET"} ${ruta} -> ${respuesta.status}: ${texto.slice(0, 400)}`,
      );
      throw new Error(`MercadoPago respondió ${respuesta.status}`);
    }

    return JSON.parse(texto) as T;
  }

  /** Checkout Pro: crea la preferencia y devuelve la URL de pago. */
  crearPreferencia(datos: {
    trackingCode: string;
    titulo: string;
    monto: number;
    moneda: string;
    email?: string;
    urlBase: string;
  }): Promise<Preferencia> {
    return this.pedir<Preferencia>("/checkout/preferences", {
      metodo: "POST",
      idempotencia: `pref-${datos.trackingCode}`,
      cuerpo: {
        items: [
          {
            id: datos.trackingCode,
            title: datos.titulo,
            quantity: 1,
            unit_price: datos.monto,
            currency_id: datos.moneda,
          },
        ],
        // La llave de toda la trazabilidad: el pago vuelve identificado con el
        // código del expediente que lo originó.
        external_reference: datos.trackingCode,
        payer: datos.email ? { email: datos.email } : undefined,
        back_urls: {
          success: `${datos.urlBase}/aportes/gracias?codigo=${datos.trackingCode}`,
          pending: `${datos.urlBase}/aportes/gracias?codigo=${datos.trackingCode}`,
          failure: `${datos.urlBase}/aportes/gracias?codigo=${datos.trackingCode}&estado=fallido`,
        },
        auto_return: "approved",
        statement_descriptor: "RAICESCARE",
      },
    });
  }

  /** Suscripción sin plan asociado: el aportante define su propio monto. */
  crearPreaprobacion(datos: {
    trackingCode: string;
    razon: string;
    monto: number;
    moneda: string;
    frecuencia: number;
    tipoFrecuencia: string;
    email: string;
    urlBase: string;
  }): Promise<Preaprobacion> {
    return this.pedir<Preaprobacion>("/preapproval", {
      metodo: "POST",
      idempotencia: `preap-${datos.trackingCode}`,
      cuerpo: {
        reason: datos.razon,
        external_reference: datos.trackingCode,
        payer_email: datos.email,
        back_url: `${datos.urlBase}/aportes/gracias?codigo=${datos.trackingCode}`,
        status: "pending",
        auto_recurring: {
          frequency: datos.frecuencia,
          frequency_type: datos.tipoFrecuencia,
          transaction_amount: datos.monto,
          currency_id: datos.moneda,
        },
      },
    });
  }

  obtenerPago(id: string): Promise<PagoRemoto> {
    return this.pedir<PagoRemoto>(`/v1/payments/${id}`);
  }

  obtenerPreaprobacion(id: string): Promise<Preaprobacion & { external_reference?: string }> {
    return this.pedir(`/preapproval/${id}`);
  }

  /**
   * Valida la firma del webhook. MercadoPago firma un manifiesto armado con el
   * id del recurso, el `x-request-id` y la marca de tiempo — no el cuerpo. Sin
   * esto, cualquiera que conozca la URL podría dar un aporte por aprobado.
   */
  firmaValida(entrada: {
    firma?: string;
    requestId?: string;
    dataId?: string;
  }): boolean {
    const secreto = this.config.get<string>("MP_WEBHOOK_SECRET");
    if (!secreto) {
      this.logger.error("Falta MP_WEBHOOK_SECRET: no se puede validar el webhook");
      return false;
    }

    if (!entrada.firma || !entrada.dataId) return false;

    const partes = Object.fromEntries(
      entrada.firma.split(",").map((trozo) => {
        const [clave, valor] = trozo.split("=");
        return [clave?.trim(), valor?.trim()];
      }),
    );

    const ts = partes.ts;
    const v1 = partes.v1;
    if (!ts || !v1) return false;

    // El id va en minúsculas cuando es alfanumérico, según la documentación.
    const id = entrada.dataId.toLowerCase();

    let manifiesto = `id:${id};`;
    if (entrada.requestId) manifiesto += `request-id:${entrada.requestId};`;
    manifiesto += `ts:${ts};`;

    const esperada = createHmac("sha256", secreto)
      .update(manifiesto)
      .digest("hex");

    const a = Buffer.from(esperada, "utf8");
    const b = Buffer.from(v1, "utf8");
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
  }
}
