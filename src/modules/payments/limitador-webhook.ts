import { Injectable, Logger } from "@nestjs/common";

/**
 * Ventana deslizante en memoria para el webhook.
 *
 * Al dejar de exigir firma válida, quien descubra la URL podría hacernos
 * consultar a MercadoPago en ráfaga. No puede inventar un aporte —el estado se
 * relee de la fuente autenticada— pero sí gastarnos peticiones. Este límite
 * ataja eso sin sumar dependencias: el volumen real de una asociación cabe de
 * sobra en el margen.
 *
 * Es por proceso, no compartido: con un solo contenedor alcanza, y si algún día
 * hay varios habrá que moverlo a la base o a un Redis.
 */
@Injectable()
export class LimitadorWebhook {
  private readonly logger = new Logger(LimitadorWebhook.name);
  private readonly marcas = new Map<string, number[]>();

  private readonly ventanaMs = 60_000;
  private readonly maximo = 60;
  private readonly clavesMaximas = 1_000;

  permitido(clave: string): boolean {
    const ahora = Date.now();
    const vigentes = (this.marcas.get(clave) ?? []).filter(
      (marca) => ahora - marca < this.ventanaMs,
    );

    if (vigentes.length >= this.maximo) {
      this.marcas.set(clave, vigentes);
      this.logger.warn(`Webhook limitado para ${clave}: ${vigentes.length} en un minuto`);
      return false;
    }

    vigentes.push(ahora);
    this.marcas.set(clave, vigentes);

    if (this.marcas.size > this.clavesMaximas) this.purgar(ahora);
    return true;
  }

  /** Evita que el mapa crezca sin techo si nos golpean desde muchas IP. */
  private purgar(ahora: number): void {
    for (const [clave, marcas] of this.marcas) {
      if (marcas.every((marca) => ahora - marca >= this.ventanaMs)) {
        this.marcas.delete(clave);
      }
    }
  }
}
