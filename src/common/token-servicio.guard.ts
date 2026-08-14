import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { ipDelCliente } from "./ip-cliente";

/**
 * Protección provisional de los endpoints internos con un token compartido.
 *
 * No es un sistema de usuarios: no distingue quién hace qué, así que el
 * historial de los expedientes seguirá sin poder decir quién decidió. Es el
 * mínimo para que dejen de estar abiertos mientras se construye el modelo real
 * de usuarios y roles.
 *
 * Falla cerrado: sin token configurado, nadie entra.
 */
@Injectable()
export class TokenServicioGuard implements CanActivate {
  private readonly logger = new Logger(TokenServicioGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<Request>();
    const esperado = this.config.get<string>("ADMIN_API_TOKEN");

    if (!esperado) {
      this.logger.error(
        "Falta ADMIN_API_TOKEN: los endpoints internos quedan cerrados",
      );
      throw new UnauthorizedException();
    }

    const cabecera = peticion.get("authorization") ?? "";
    const recibido = cabecera.startsWith("Bearer ")
      ? cabecera.slice(7).trim()
      : "";

    if (!this.iguales(recibido, esperado)) {
      this.logger.warn(
        `Acceso rechazado a ${peticion.method} ${peticion.path} desde ${ipDelCliente(peticion)}`,
      );
      throw new UnauthorizedException();
    }

    return true;
  }

  /** Comparación en tiempo constante: la longitud no debe filtrar nada. */
  private iguales(recibido: string, esperado: string): boolean {
    const a = Buffer.from(recibido, "utf8");
    const b = Buffer.from(esperado, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
