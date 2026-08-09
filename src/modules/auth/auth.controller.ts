import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { SesionGuard, type PeticionConActor } from "./sesion.guard";
import {
  definirContrasenaSchema,
  entrarSchema,
  pedirRecuperacionSchema,
} from "./auth.schema";

const COOKIE = "rc_sesion";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/v1/auth/login */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async entrar(
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConActor,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const validacion = entrarSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    const sesion = await this.auth.entrar(
      validacion.data.email,
      validacion.data.password,
      { ip: peticion.ip, ua: peticion.get("user-agent") },
    );

    // httpOnly: ni un script inyectado en la página puede leer la sesión.
    // El dominio abarca los subdominios porque la API y el sitio están
    // separados; ambos cuelgan de raicescare.earth, así que sigue siendo
    // el mismo sitio y `lax` alcanza.
    respuesta.cookie(COOKIE, sesion.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      domain: ".raicescare.earth",
      path: "/",
      expires: sesion.expiraEn,
    });

    return { usuario: sesion.usuario, expiraEn: sesion.expiraEn };
  }

  /** POST /api/v1/auth/logout */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async salir(
    @Req() peticion: PeticionConActor,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const galleta = peticion.headers.cookie
      ?.split(";")
      .map((t) => t.trim().split("="))
      .find(([nombre]) => nombre === COOKIE);

    if (galleta) await this.auth.salir(decodeURIComponent(galleta.slice(1).join("=")));

    respuesta.clearCookie(COOKIE, { domain: ".raicescare.earth", path: "/" });
    return { cerrada: true };
  }

  /** GET /api/v1/auth/me — quién soy, para que la interfaz sepa qué mostrar. */
  @UseGuards(SesionGuard)
  @Get("me")
  yo(@Req() peticion: PeticionConActor) {
    return { usuario: peticion.actor };
  }

  /**
   * POST /api/v1/auth/recovery — pedido público.
   * Responde lo mismo exista o no la cuenta.
   */
  @Post("recovery")
  @HttpCode(HttpStatus.ACCEPTED)
  pedirRecuperacion(@Body() cuerpo: unknown) {
    const validacion = pedirRecuperacionSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);
    return this.auth.pedirRecuperacion(validacion.data.email);
  }

  /** POST /api/v1/auth/password — consume el enlace y fija la contraseña. */
  @Post("password")
  @HttpCode(HttpStatus.OK)
  definir(@Body() cuerpo: unknown) {
    const validacion = definirContrasenaSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);
    return this.auth.definirContrasena(
      validacion.data.token,
      validacion.data.password,
    );
  }
}
