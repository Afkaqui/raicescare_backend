import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const API = "https://api.resend.com/emails";

/**
 * Envío de correo por Resend, con `fetch` nativo en vez del SDK: es una sola
 * llamada HTTP, igual que con MercadoPago.
 *
 * Nunca se envía una contraseña por correo, solo enlaces de un uso para
 * elegirla. Un correo queda en bandejas, copias de seguridad y servidores
 * intermedios durante años; un enlace que caduca, no.
 */
@Injectable()
export class ResendClient {
  private readonly logger = new Logger(ResendClient.name);

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(this.config.get<string>("RESEND_API_KEY"));
  }

  private get remitente(): string {
    return (
      this.config.get<string>("EMAIL_REMITENTE") ??
      "RaícesCare <no-responder@raicescare.earth>"
    );
  }

  /**
   * Devuelve si se pudo enviar. Nunca lanza: que falle el correo no debe tumbar
   * la operación que lo originó — crear una cuenta sigue siendo válido aunque
   * el aviso no salga, y el superadmin puede reenviar la invitación.
   */
  async enviar(mensaje: {
    para: string;
    asunto: string;
    html: string;
    texto: string;
  }): Promise<boolean> {
    const clave = this.config.get<string>("RESEND_API_KEY");

    if (!clave) {
      this.logger.error(
        `Falta RESEND_API_KEY: no se envió «${mensaje.asunto}» a ${this.ofuscar(mensaje.para)}`,
      );
      return false;
    }

    try {
      const respuesta = await fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clave}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.remitente,
          to: [mensaje.para],
          subject: mensaje.asunto,
          html: mensaje.html,
          text: mensaje.texto,
        }),
      });

      if (!respuesta.ok) {
        const detalle = await respuesta.text();
        this.logger.error(
          `Resend respondió ${respuesta.status}: ${detalle.slice(0, 300)}`,
        );
        return false;
      }

      this.logger.log(
        `Correo «${mensaje.asunto}» enviado a ${this.ofuscar(mensaje.para)}`,
      );
      return true;
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo contactar a Resend: ${detalle}`);
      return false;
    }
  }

  /** El log no es lugar para una dirección completa. */
  private ofuscar(correo: string): string {
    const [nombre, dominio] = correo.split("@");
    if (!dominio) return "«dirección inválida»";
    return `${nombre.slice(0, 2)}***@${dominio}`;
  }
}
