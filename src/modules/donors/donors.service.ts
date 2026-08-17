import {
  ConflictException,
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
import { bienvenida, recuperacionAportante } from "./plantillas-aportante";

const HORAS_SESION = 24 * 30; // Un mes: aportar no debería exigir entrar cada día.
const HORAS_VERIFICACION = 48;
const MINUTOS_RECUPERACION = 30;
const INTENTOS_MAXIMOS = 5;
const MINUTOS_BLOQUEO = 15;

export type Aportante = {
  id: string;
  email: string;
  fullName: string;
  verificado: boolean;
};

@Injectable()
export class DonorsService {
  private readonly logger = new Logger(DonorsService.name);

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

  private hash(valor: string): string {
    return createHash("sha256").update(valor).digest("hex");
  }

  // ------------------------------------------------------------- registro

  /**
   * Crea la cuenta y manda el enlace de verificación.
   *
   * Si el correo ya existe se responde igual que si se hubiera creado, y se le
   * avisa a quien sí es su dueño. Decir «ese correo ya está registrado»
   * convertiría este formulario en una forma de averiguar quién ha aportado.
   */
  async registrar(
    datos: {
      email: string;
      fullName: string;
      password: string;
      phone?: string;
      country?: string;
    },
    huella: { ip?: string },
  ) {
    const problema = problemaDeContrasena(datos.password);
    if (problema) throw new ConflictException(problema);

    const email = datos.email.toLowerCase().trim();
    const existente = await this.prisma.donor.findUnique({ where: { email } });

    if (existente) {
      // Ya registrado: se le avisa al titular por si no fue él quien lo intentó.
      if (existente.emailVerifiedAt) {
        await this.enviarEnlace(existente.id, "recovery");
      } else {
        await this.enviarEnlace(existente.id, "verification");
      }
      return { registrado: true, verificacionEnviada: true };
    }

    const donante = await this.prisma.donor.create({
      data: {
        email,
        fullName: datos.fullName.trim(),
        passwordHash: await cifrarContrasena(datos.password),
        phone: datos.phone,
        country: datos.country,
      },
    });

    this.logger.log(`Aportante registrado desde ${huella.ip ?? "origen desconocido"}`);
    await this.enviarEnlace(donante.id, "verification");

    return { registrado: true, verificacionEnviada: true };
  }

  async enviarEnlace(donorId: string, proposito: "verification" | "recovery") {
    const donante = await this.prisma.donor.findUnique({ where: { id: donorId } });
    if (!donante || donante.status !== "active") return false;

    const minutos =
      proposito === "verification" ? HORAS_VERIFICACION * 60 : MINUTOS_RECUPERACION;
    const token = randomBytes(32).toString("base64url");

    await this.prisma.$transaction([
      this.prisma.donorToken.updateMany({
        where: { donorId, purpose: proposito, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.donorToken.create({
        data: {
          donorId,
          tokenHash: this.hash(token),
          purpose: proposito,
          expiresAt: new Date(Date.now() + minutos * 60_000),
        },
      }),
    ]);

    const ruta = proposito === "verification" ? "verificar" : "clave";
    const url = `${this.urlBase}/cuenta/${ruta}?token=${token}`;

    const mensaje =
      proposito === "verification"
        ? bienvenida({ nombre: donante.fullName, url, horas: HORAS_VERIFICACION })
        : recuperacionAportante({
            nombre: donante.fullName,
            url,
            minutos: MINUTOS_RECUPERACION,
          });

    return this.correo.enviar({
      para: donante.email,
      asunto: mensaje.asunto,
      html: mensaje.html,
      texto: mensaje.texto,
    });
  }

  /** Consume el enlace de verificación y deja la cuenta lista para aportar. */
  async verificar(token: string) {
    const registro = await this.prisma.donorToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });

    if (
      !registro ||
      registro.usedAt ||
      registro.purpose !== "verification" ||
      registro.expiresAt < new Date()
    ) {
      throw new UnauthorizedException("El enlace venció o ya se usó. Pide uno nuevo.");
    }

    await this.prisma.$transaction([
      this.prisma.donor.update({
        where: { id: registro.donorId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.donorToken.update({
        where: { id: registro.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { verificado: true };
  }

  // --------------------------------------------------------------- sesión

  async entrar(email: string, contrasena: string, huella: { ip?: string; ua?: string }) {
    const generico = new UnauthorizedException("Correo o contraseña incorrectos");

    const donante = await this.prisma.donor.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!donante || donante.status !== "active") {
      await verificarContrasena(contrasena, null);
      throw generico;
    }

    if (donante.lockedUntil && donante.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        "Cuenta bloqueada temporalmente por intentos fallidos. Prueba en unos minutos.",
      );
    }

    if (!(await verificarContrasena(contrasena, donante.passwordHash))) {
      const fallos = donante.failedLogins + 1;
      const bloquear = fallos >= INTENTOS_MAXIMOS;
      await this.prisma.donor.update({
        where: { id: donante.id },
        data: {
          failedLogins: bloquear ? 0 : fallos,
          lockedUntil: bloquear
            ? new Date(Date.now() + MINUTOS_BLOQUEO * 60_000)
            : null,
        },
      });
      throw generico;
    }

    const token = randomBytes(32).toString("base64url");
    const expira = new Date(Date.now() + HORAS_SESION * 3_600_000);

    await this.prisma.$transaction([
      this.prisma.donorSession.create({
        data: {
          donorId: donante.id,
          tokenHash: this.hash(token),
          ipHash: huella.ip ? this.hash(huella.ip) : null,
          userAgent: huella.ua?.slice(0, 300),
          expiresAt: expira,
        },
      }),
      this.prisma.donor.update({
        where: { id: donante.id },
        data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null },
      }),
    ]);

    return { token, expiraEn: expira, aportante: this.publico(donante) };
  }

  async aportanteDeToken(token: string): Promise<Aportante | null> {
    const sesion = await this.prisma.donorSession.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { donante: true },
    });

    if (!sesion || sesion.revokedAt || sesion.expiresAt < new Date()) return null;
    if (sesion.donante.status !== "active") return null;

    void this.prisma.donorSession
      .update({ where: { id: sesion.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);

    return this.publico(sesion.donante);
  }

  async salir(token: string) {
    await this.prisma.donorSession
      .updateMany({
        where: { tokenHash: this.hash(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
    return { cerrada: true };
  }

  /** Igual que en el personal: la respuesta no revela si la cuenta existe. */
  async pedirRecuperacion(email: string) {
    const donante = await this.prisma.donor.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    if (donante) await this.enviarEnlace(donante.id, "recovery");

    return {
      mensaje:
        "Si el correo corresponde a una cuenta activa, enviamos un enlace para elegir una contraseña nueva.",
    };
  }

  async definirContrasena(token: string, contrasena: string) {
    const problema = problemaDeContrasena(contrasena);
    if (problema) throw new UnauthorizedException(problema);

    const registro = await this.prisma.donorToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });

    if (
      !registro ||
      registro.usedAt ||
      registro.purpose !== "recovery" ||
      registro.expiresAt < new Date()
    ) {
      throw new UnauthorizedException("El enlace venció o ya se usó. Pide uno nuevo.");
    }

    await this.prisma.$transaction([
      this.prisma.donor.update({
        where: { id: registro.donorId },
        data: {
          passwordHash: await cifrarContrasena(contrasena),
          failedLogins: 0,
          lockedUntil: null,
          // Recuperar la clave por correo demuestra que el buzón es suyo.
          emailVerifiedAt: new Date(),
        },
      }),
      this.prisma.donorToken.update({
        where: { id: registro.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.donorSession.updateMany({
        where: { donorId: registro.donorId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { definida: true };
  }

  // ------------------------------------------------------------ historial

  /** Los aportes de quien pregunta, y solo los suyos. */
  async misAportes(donorId: string) {
    const expedientes = await this.prisma.institutionalRequest.findMany({
      where: { donorId },
      select: {
        trackingCode: true,
        category: true,
        status: true,
        submittedAt: true,
        formData: true,
        pagos: {
          select: {
            amount: true,
            currency: true,
            status: true,
            approvedAt: true,
            paymentTypeId: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        suscripcion: {
          select: {
            amount: true,
            currency: true,
            frequency: true,
            status: true,
            nextPaymentDate: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const acreditados = expedientes.filter(
      (item) => item.pagos[0]?.status === "approved",
    );

    return {
      total: expedientes.length,
      // Solo suma lo acreditado: un intento fallido no es un aporte.
      sumaPorMoneda: acreditados.reduce<Record<string, number>>((suma, item) => {
        const pago = item.pagos[0]!;
        suma[pago.currency] = (suma[pago.currency] ?? 0) + Number(pago.amount);
        return suma;
      }, {}),
      aportes: expedientes.map((item) => ({
        trackingCode: item.trackingCode,
        modalidad: item.category,
        estado: item.status,
        fecha: item.submittedAt,
        destino: (item.formData as { destino?: string } | null)?.destino ?? null,
        pago: item.pagos[0] ?? null,
        suscripcion: item.suscripcion,
      })),
    };
  }

  private publico(donante: {
    id: string;
    email: string;
    fullName: string;
    emailVerifiedAt: Date | null;
  }): Aportante {
    return {
      id: donante.id,
      email: donante.email,
      fullName: donante.fullName,
      verificado: Boolean(donante.emailVerifiedAt),
    };
  }
}
