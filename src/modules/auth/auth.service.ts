import {
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import {
  cifrarContrasena,
  problemaDeContrasena,
  verificarContrasena,
} from "../../common/password";
import { ResendClient } from "../email/resend.client";
import {
  contrasenaCambiada,
  invitacion,
  recuperacion,
} from "../email/plantillas";

/** Una sesión dura una jornada de trabajo; renovarla es volver a entrar. */
const HORAS_SESION = 12;
const HORAS_INVITACION = 72;
const MINUTOS_RECUPERACION = 30;

/** Tras estos intentos seguidos la cuenta se bloquea un rato. */
const INTENTOS_MAXIMOS = 5;
const MINUTOS_BLOQUEO = 15;

export type Actor = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly correo: ResendClient,
  ) {}

  private get urlBase(): string {
    return (
      this.config.get<string>("PUBLIC_SITE_URL") ?? "https://www.raicescare.earth"
    );
  }

  /** Los tokens se guardan hasheados: leer la base no permite suplantar. */
  private hash(valor: string): string {
    return createHash("sha256").update(valor).digest("hex");
  }

  private generarToken(): string {
    return randomBytes(32).toString("base64url");
  }

  // ------------------------------------------------------------------ entrar

  /**
   * Verifica credenciales y abre sesión. El mensaje de error es siempre el
   * mismo: decir «ese correo no existe» le regala a un atacante la lista de
   * quién tiene cuenta.
   */
  async entrar(
    email: string,
    contrasena: string,
    huella: { ip?: string; ua?: string },
  ) {
    const generico = new UnauthorizedException(
      "Correo o contraseña incorrectos",
    );

    const usuario = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!usuario || usuario.status !== "active") {
      // Se gasta el mismo tiempo que en una verificación real para no delatar
      // por demora si la cuenta existe.
      await verificarContrasena(contrasena, null);
      throw generico;
    }

    if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        "Cuenta bloqueada temporalmente por intentos fallidos. Vuelve a probar en unos minutos.",
      );
    }

    const correcta = await verificarContrasena(contrasena, usuario.passwordHash);

    if (!correcta) {
      await this.registrarFallo(usuario.id, usuario.failedLogins);
      throw generico;
    }

    const token = this.generarToken();
    const expira = new Date(Date.now() + HORAS_SESION * 3_600_000);

    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          userId: usuario.id,
          tokenHash: this.hash(token),
          ipHash: huella.ip ? this.hash(huella.ip) : null,
          userAgent: huella.ua?.slice(0, 300),
          expiresAt: expira,
        },
      }),
      this.prisma.user.update({
        where: { id: usuario.id },
        data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null },
      }),
    ]);

    await this.auditar(usuario.id, "sesion.iniciada", "user", usuario.id, huella.ip);

    return {
      token,
      expiraEn: expira,
      usuario: this.publico(usuario),
    };
  }

  private async registrarFallo(userId: string, fallosPrevios: number) {
    const fallos = fallosPrevios + 1;
    const bloquear = fallos >= INTENTOS_MAXIMOS;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: bloquear ? 0 : fallos,
        lockedUntil: bloquear
          ? new Date(Date.now() + MINUTOS_BLOQUEO * 60_000)
          : null,
      },
    });

    if (bloquear) {
      this.logger.warn(`Usuario ${userId} bloqueado por ${INTENTOS_MAXIMOS} intentos fallidos`);
      await this.auditar(null, "sesion.bloqueada", "user", userId);
    }
  }

  /** Resuelve el token de sesión a un actor, o null si no vale. */
  async actorDeToken(token: string): Promise<Actor | null> {
    const sesion = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { usuario: true },
    });

    if (!sesion || sesion.revokedAt || sesion.expiresAt < new Date()) return null;
    if (sesion.usuario.status !== "active") return null;

    // Marca de actividad, útil para ver sesiones vivas. No extiende el plazo.
    void this.prisma.session
      .update({ where: { id: sesion.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    return this.publico(sesion.usuario);
  }

  async salir(token: string) {
    await this.prisma.session
      .updateMany({
        where: { tokenHash: this.hash(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
    return { cerrada: true };
  }

  // ------------------------------------------------- contraseñas y su rescate

  /** Crea el enlace de un uso y lo manda por correo. */
  async enviarEnlace(
    userId: string,
    proposito: "invitation" | "recovery",
  ): Promise<boolean> {
    const usuario = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!usuario || usuario.status !== "active") return false;

    const minutos =
      proposito === "invitation" ? HORAS_INVITACION * 60 : MINUTOS_RECUPERACION;
    const token = this.generarToken();

    // Un enlace nuevo invalida los anteriores del mismo tipo: si alguien pidió
    // recuperación dos veces, solo el último debe servir.
    await this.prisma.$transaction([
      this.prisma.passwordToken.updateMany({
        where: { userId, purpose: proposito, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordToken.create({
        data: {
          userId,
          tokenHash: this.hash(token),
          purpose: proposito,
          expiresAt: new Date(Date.now() + minutos * 60_000),
        },
      }),
    ]);

    const url = `${this.urlBase}/admin/clave?token=${token}`;
    const mensaje =
      proposito === "invitation"
        ? invitacion({
            nombre: usuario.fullName,
            url,
            horasValidez: HORAS_INVITACION,
          })
        : recuperacion({
            nombre: usuario.fullName,
            url,
            minutosValidez: MINUTOS_RECUPERACION,
          });

    return this.correo.enviar({
      para: usuario.email,
      asunto: mensaje.asunto,
      html: mensaje.html,
      texto: mensaje.texto,
    });
  }

  /**
   * Pedido de recuperación desde la pantalla pública. Responde igual exista o
   * no la cuenta: si dijera «ese correo no está registrado», cualquiera podría
   * averiguar quién tiene acceso al sistema.
   */
  async pedirRecuperacion(email: string) {
    const usuario = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    if (usuario) await this.enviarEnlace(usuario.id, "recovery");

    return {
      mensaje:
        "Si el correo corresponde a una cuenta activa, enviamos un enlace para elegir una contraseña nueva.",
    };
  }

  /** Consume el enlace y fija la contraseña. */
  async definirContrasena(token: string, contrasena: string) {
    const problema = problemaDeContrasena(contrasena);
    if (problema) throw new UnauthorizedException(problema);

    const registro = await this.prisma.passwordToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { usuario: true },
    });

    if (!registro || registro.usedAt || registro.expiresAt < new Date()) {
      throw new UnauthorizedException(
        "El enlace venció o ya se usó. Pide uno nuevo.",
      );
    }

    const hash = await cifrarContrasena(contrasena);

    // Cambiar la contraseña cierra toda sesión abierta: si alguien había
    // entrado sin permiso, aquí se queda fuera.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: registro.userId },
        data: { passwordHash: hash, failedLogins: 0, lockedUntil: null },
      }),
      this.prisma.passwordToken.update({
        where: { id: registro.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: registro.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditar(
      registro.userId,
      registro.purpose === "invitation"
        ? "contrasena.definida"
        : "contrasena.recuperada",
      "user",
      registro.userId,
    );

    const aviso = contrasenaCambiada({
      nombre: registro.usuario.fullName,
      cuando: new Date(),
    });
    void this.correo.enviar({
      para: registro.usuario.email,
      asunto: aviso.asunto,
      html: aviso.html,
      texto: aviso.texto,
    });

    return { definida: true };
  }

  // ------------------------------------------------------------------ bitácora

  async auditar(
    actorUserId: string | null,
    action: string,
    targetType?: string,
    targetId?: string,
    ip?: string,
    detail: Record<string, unknown> = {},
  ) {
    await this.prisma.auditLog
      .create({
        data: {
          actorUserId,
          action,
          targetType,
          targetId,
          ipHash: ip ? this.hash(ip) : null,
          detail: detail as never,
        },
      })
      .catch((error: Error) =>
        this.logger.error(`No se pudo auditar ${action}: ${error.message}`),
      );
  }

  private publico(usuario: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  }): Actor {
    return {
      id: usuario.id,
      email: usuario.email,
      fullName: usuario.fullName,
      role: usuario.role,
    };
  }
}
