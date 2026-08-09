import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService, type Actor } from "./auth.service";

export const CLAVE_ROLES = "roles_requeridos";

/**
 * Marca los endpoints que solo puede el superadmin: crear y quitar
 * administradores, cambiar contraseñas ajenas, el registro de organizaciones y
 * todo lo irreversible o que saca datos personales del sistema.
 */
export const SoloSuperadmin = () => SetMetadata(CLAVE_ROLES, ["superadmin"]);

/** La petición autenticada lleva a su actor; así el historial sabe quién actuó. */
export type PeticionConActor = Request & { actor?: Actor };

@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionConActor>();
    const token = this.tokenDe(peticion);

    if (!token) throw new UnauthorizedException("Sesión requerida");

    const actor = await this.auth.actorDeToken(token);
    if (!actor) throw new UnauthorizedException("Sesión inválida o vencida");

    peticion.actor = actor;

    const requeridos = this.reflector.getAllAndOverride<string[] | undefined>(
      CLAVE_ROLES,
      [contexto.getHandler(), contexto.getClass()],
    );

    if (requeridos?.length && !requeridos.includes(actor.role)) {
      throw new ForbiddenException(
        "Esta acción está reservada al superadministrador",
      );
    }

    return true;
  }

  /**
   * La cookie es la vía normal: al ser httpOnly, un script inyectado en la
   * página no puede leerla. Se admite además la cabecera para automatizaciones.
   */
  private tokenDe(peticion: Request): string | null {
    const cabecera = peticion.get("authorization") ?? "";
    if (cabecera.startsWith("Bearer ")) return cabecera.slice(7).trim() || null;

    const galletas = peticion.headers.cookie;
    if (!galletas) return null;

    for (const trozo of galletas.split(";")) {
      const [nombre, ...resto] = trozo.trim().split("=");
      if (nombre === "rc_sesion") return decodeURIComponent(resto.join("=")) || null;
    }
    return null;
  }
}
