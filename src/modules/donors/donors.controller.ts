import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { Limitador } from "../../common/limitador";
import { ipDelCliente } from "../../common/ip-cliente";
import { DonorsService } from "./donors.service";
import {
  AportanteGuard,
  COOKIE_APORTANTE,
  type PeticionConAportante,
} from "./aportante.guard";

const MINUTO = 60_000;

const registroSchema = z.object({
  email: z.string().email().max(180),
  fullName: z.string().min(2).max(180),
  password: z.string().min(1).max(200),
  phone: z.string().max(40).optional(),
  country: z.string().max(100).optional(),
});

const entrarSchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(1).max(200),
});

const tokenSchema = z.object({ token: z.string().min(20).max(200) });

const claveSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(200),
});

@Controller("donors")
export class DonorsController {
  constructor(
    private readonly donantes: DonorsService,
    private readonly limitador: Limitador,
  ) {}

  private exigirCupo(cubo: string, ip: string, limite: number) {
    if (!this.limitador.permitido(cubo, ip, limite, MINUTO)) {
      throw new HttpException(
        "Demasiados intentos. Espera un minuto y vuelve a probar.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private ponerCookie(respuesta: Response, token: string, expira: Date) {
    respuesta.cookie(COOKIE_APORTANTE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      domain: ".raicescare.earth",
      path: "/",
      expires: expira,
    });
  }

  /** POST /api/v1/donors/register */
  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  registrar(@Body() cuerpo: unknown, @Req() peticion: PeticionConAportante) {
    const validacion = registroSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    const ip = ipDelCliente(peticion);
    this.exigirCupo("registro", ip, 5);

    return this.donantes.registrar(validacion.data, { ip });
  }

  /** POST /api/v1/donors/verify — consume el enlace de confirmación. */
  @Post("verify")
  @HttpCode(HttpStatus.OK)
  verificar(@Body() cuerpo: unknown, @Req() peticion: PeticionConAportante) {
    const validacion = tokenSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    this.exigirCupo("verificar", ipDelCliente(peticion), 10);
    return this.donantes.verificar(validacion.data.token);
  }

  /** POST /api/v1/donors/login */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async entrar(
    @Body() cuerpo: unknown,
    @Req() peticion: PeticionConAportante,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const validacion = entrarSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    const ip = ipDelCliente(peticion);
    this.exigirCupo("login-aportante", ip, 10);

    const sesion = await this.donantes.entrar(
      validacion.data.email,
      validacion.data.password,
      { ip, ua: peticion.get("user-agent") },
    );

    this.ponerCookie(respuesta, sesion.token, sesion.expiraEn);
    this.limitador.olvidar("login-aportante", ip);

    return { aportante: sesion.aportante, expiraEn: sesion.expiraEn };
  }

  /** POST /api/v1/donors/logout */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async salir(
    @Req() peticion: PeticionConAportante,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const galleta = peticion.headers.cookie
      ?.split(";")
      .map((t) => t.trim().split("="))
      .find(([nombre]) => nombre === COOKIE_APORTANTE);

    if (galleta) {
      await this.donantes.salir(decodeURIComponent(galleta.slice(1).join("=")));
    }

    respuesta.clearCookie(COOKIE_APORTANTE, {
      domain: ".raicescare.earth",
      path: "/",
    });
    return { cerrada: true };
  }

  /**
   * GET /api/v1/donors/me — sin guarda a propósito: la interfaz necesita saber
   * si hay sesión aunque el correo no esté confirmado, para poder decírselo.
   */
  @Get("me")
  async yo(@Req() peticion: PeticionConAportante) {
    const galleta = peticion.headers.cookie
      ?.split(";")
      .map((t) => t.trim().split("="))
      .find(([nombre]) => nombre === COOKIE_APORTANTE);

    if (!galleta) return { aportante: null };

    const aportante = await this.donantes.aportanteDeToken(
      decodeURIComponent(galleta.slice(1).join("=")),
    );
    return { aportante };
  }

  /** POST /api/v1/donors/recovery */
  @Post("recovery")
  @HttpCode(HttpStatus.ACCEPTED)
  recuperar(@Body() cuerpo: unknown, @Req() peticion: PeticionConAportante) {
    const validacion = z
      .object({ email: z.string().email().max(180) })
      .safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    this.exigirCupo("recuperacion-aportante", ipDelCliente(peticion), 5);
    return this.donantes.pedirRecuperacion(validacion.data.email);
  }

  /** POST /api/v1/donors/password */
  @Post("password")
  @HttpCode(HttpStatus.OK)
  definir(@Body() cuerpo: unknown, @Req() peticion: PeticionConAportante) {
    const validacion = claveSchema.safeParse(cuerpo);
    if (!validacion.success) throw new BadRequestException(validacion.error.issues);

    this.exigirCupo("clave-aportante", ipDelCliente(peticion), 10);
    return this.donantes.definirContrasena(
      validacion.data.token,
      validacion.data.password,
    );
  }

  /** GET /api/v1/donors/me/contributions — historial propio. */
  @UseGuards(AportanteGuard)
  @Get("me/contributions")
  misAportes(@Req() peticion: PeticionConAportante) {
    return this.donantes.misAportes(peticion.aportante!.id);
  }
}
