import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Limitador } from "../../common/limitador";
import { AuthService } from "./auth.service";
import { SesionGuard, type PeticionConActor } from "./sesion.guard";
import {
  definirContrasenaSchema,
  entrarSchema,
  pedirRecuperacionSchema,
} from "./auth.schema";
import { ipDelCliente } from "../../common/ip-cliente";

const COOKIE = "rc_sesion";
const MINUTO = 60_000;

/**
 * Límites por origen. El bloqueo por cuenta ya frena el ataque contra una
 * persona concreta, pero no impide probar una contraseña común contra muchas
 * cuentas, ni sondear qué correos existen. Esto lo ataja.
 */
const LIMITE_LOGIN = 10;
const LIMITE_RECUPERACION = 5;
const LIMITE_CLAVE = 10;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limitador: Limitador,
  ) {}

  /** Mismo mensaje que un rechazo normal: no se delata que hubo límite. */
  private exigirCupo(cubo: string, ip: string, limite: number) {
    if (!this.limitador.permitido(cubo, ip, limite, MINUTO)) {
      throw new HttpException(
        "Demasiados intentos. Espera un minuto y vuelve a probar.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

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

    const ip = ipDelCliente(peticion);
    this.exigirCupo("login", ip, LIMITE_LOGIN);

    const sesion = await this.auth.entrar(
      validacion.data.email,
      validacion.data.password,
      { ip: ipDelCliente(peticion), ua: peticion.get("user-agent") },
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

    // Quien acertó deja de consumir cupo: el límite es contra quien prueba.
    this.limitador.olvidar("login", ip);

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
  pedirRecuperacion(@Body() cuerpo: unknown, @Req() peticion: PeticionConActor) {
    const validacion = pedirRecuperacionSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    // Sin límite, esto sería un cañón de correos hacia cualquier buzón.
    this.exigirCupo("recuperacion", ipDelCliente(peticion), LIMITE_RECUPERACION);

    return this.auth.pedirRecuperacion(validacion.data.email);
  }

  /** POST /api/v1/auth/password — consume el enlace y fija la contraseña. */
  @Post("password")
  @HttpCode(HttpStatus.OK)
  definir(@Body() cuerpo: unknown, @Req() peticion: PeticionConActor) {
    const validacion = definirContrasenaSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    // Frena el probado de enlaces de un uso a fuerza de intentos.
    this.exigirCupo("clave", ipDelCliente(peticion), LIMITE_CLAVE);

    return this.auth.definirContrasena(
      validacion.data.token,
      validacion.data.password,
    );
  }
}
