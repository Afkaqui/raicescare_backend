import { Global, Injectable, Logger, Module } from "@nestjs/common";

/**
 * Ventana deslizante en memoria, con cubos con nombre.
 *
 * Es por proceso, no compartido: con un solo contenedor alcanza, y si algún
 * día hay varios habrá que moverlo a la base o a un Redis. Se prefiere esto
 * antes que sumar una dependencia para contar peticiones.
 */
@Injectable()
export class Limitador {
  private readonly logger = new Logger(Limitador.name);
  private readonly marcas = new Map<string, number[]>();
  private readonly clavesMaximas = 5_000;

  /**
   * Devuelve si se permite la petición y la anota. `cubo` separa los límites:
   * agotar los intentos de login no debe cerrar el webhook de pagos.
   */
  permitido(
    cubo: string,
    identidad: string,
    limite: number,
    ventanaMs: number,
  ): boolean {
    const clave = `${cubo}:${identidad}`;
    const ahora = Date.now();
    const vigentes = (this.marcas.get(clave) ?? []).filter(
      (marca) => ahora - marca < ventanaMs,
    );

    if (vigentes.length >= limite) {
      this.marcas.set(clave, vigentes);
      this.logger.warn(
        `Límite alcanzado en «${cubo}» para ${identidad}: ${vigentes.length} en ${Math.round(ventanaMs / 1000)} s`,
      );
      return false;
    }

    vigentes.push(ahora);
    this.marcas.set(clave, vigentes);

    if (this.marcas.size > this.clavesMaximas) this.purgar(ahora, ventanaMs);
    return true;
  }

  /** Un intento acertado no debe seguir contando contra quien acertó. */
  olvidar(cubo: string, identidad: string): void {
    this.marcas.delete(`${cubo}:${identidad}`);
  }

  /** Evita que el mapa crezca sin techo si nos golpean desde muchas IP. */
  private purgar(ahora: number, ventanaMs: number): void {
    for (const [clave, marcas] of this.marcas) {
      if (marcas.every((marca) => ahora - marca >= ventanaMs)) {
        this.marcas.delete(clave);
      }
    }
  }
}

@Global()
@Module({
  providers: [Limitador],
  exports: [Limitador],
})
export class LimitadorModule {}
