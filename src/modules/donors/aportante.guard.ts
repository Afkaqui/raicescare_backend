import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { DonorsService, type Aportante } from "./donors.service";

export const COOKIE_APORTANTE = "rc_aportante";

export type PeticionConAportante = Request & { aportante?: Aportante };

/**
 * Sesión de aportante.
 *
 * Resuelve el token únicamente contra `donor_sessions`, así que una sesión de
 * aportante jamás puede abrir una puerta del back-office ni al revés: no es una
 * comprobación de rol que alguien pueda equivocarse en escribir, sino dos
 * tablas que no se conocen.
 */
@Injectable()
export class AportanteGuard implements CanActivate {
  constructor(private readonly donantes: DonorsService) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionConAportante>();
    const token = this.tokenDe(peticion);

    if (!token) throw new UnauthorizedException("Necesitas iniciar sesión");

    const aportante = await this.donantes.aportanteDeToken(token);
    if (!aportante) throw new UnauthorizedException("Sesión inválida o vencida");

    // Sin correo confirmado no se aporta: de lo contrario, registrarse con el
    // correo de otra persona bastaría para acabar viendo su historial.
    if (!aportante.verificado) {
      throw new ForbiddenException(
        "Confirma tu correo antes de continuar. Te enviamos un enlace al registrarte.",
      );
    }

    peticion.aportante = aportante;
    return true;
  }

  private tokenDe(peticion: Request): string | null {
    const galletas = peticion.headers.cookie;
    if (!galletas) return null;

    for (const trozo of galletas.split(";")) {
      const [nombre, ...resto] = trozo.trim().split("=");
      if (nombre === COOKIE_APORTANTE) {
        return decodeURIComponent(resto.join("=")) || null;
      }
    }
    return null;
  }
}
