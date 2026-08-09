import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService, type Actor } from "../auth/auth.service";

const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  listar() {
    return this.prisma.user.findMany({
      select: { ...CAMPOS_PUBLICOS, lockedUntil: true },
      orderBy: [{ role: "desc" }, { fullName: "asc" }],
    });
  }

  /**
   * Crea la cuenta sin contraseña y manda la invitación. Nunca se fija una
   * contraseña inicial desde aquí: quien la elige es su titular, así que ni el
   * superadmin llega a conocerla.
   */
  async crear(
    datos: { email: string; fullName: string; role: string },
    actor: Actor,
    ip?: string,
  ) {
    const email = datos.email.toLowerCase().trim();

    const existente = await this.prisma.user.findUnique({ where: { email } });
    if (existente) {
      throw new ConflictException(`Ya existe una cuenta con el correo ${email}`);
    }

    const usuario = await this.prisma.user.create({
      data: {
        email,
        fullName: datos.fullName.trim(),
        role: datos.role,
        createdById: actor.id,
      },
      select: CAMPOS_PUBLICOS,
    });

    await this.auth.auditar(actor.id, "usuario.creado", "user", usuario.id, ip, {
      email,
      role: datos.role,
    });

    const enviado = await this.auth.enviarEnlace(usuario.id, "invitation");

    return {
      usuario,
      invitacionEnviada: enviado,
      aviso: enviado
        ? undefined
        : "La cuenta quedó creada pero no se pudo enviar la invitación. Reenvíala cuando el correo esté disponible.",
    };
  }

  /** Reenvía la invitación o dispara una recuperación en nombre del titular. */
  async reenviarEnlace(id: string, actor: Actor, ip?: string) {
    const usuario = await this.exigir(id);

    const proposito = usuario.passwordHash ? "recovery" : "invitation";
    const enviado = await this.auth.enviarEnlace(id, proposito);

    await this.auth.auditar(actor.id, "usuario.enlace_reenviado", "user", id, ip, {
      proposito,
      enviado,
    });

    return { enviado, proposito };
  }

  async cambiarEstado(
    id: string,
    status: "active" | "suspended",
    actor: Actor,
    ip?: string,
  ) {
    const usuario = await this.exigir(id);
    this.protegerUltimoSuperadmin(usuario, actor, status === "suspended");

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const resultado = await tx.user.update({
        where: { id },
        data: { status },
        select: CAMPOS_PUBLICOS,
      });

      // Suspender debe surtir efecto ya, no cuando venza la sesión.
      if (status === "suspended") {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return resultado;
    });

    await this.auth.auditar(actor.id, `usuario.${status}`, "user", id, ip);
    return actualizado;
  }

  async eliminar(id: string, actor: Actor, ip?: string) {
    const usuario = await this.exigir(id);
    this.protegerUltimoSuperadmin(usuario, actor, true);

    // Se conserva la bitácora: el rastro de lo que hizo no se borra con la
    // cuenta. Por eso `audit_logs.actor_user_id` no tiene clave foránea.
    await this.prisma.user.delete({ where: { id } });
    await this.auth.auditar(actor.id, "usuario.eliminado", "user", id, ip, {
      email: usuario.email,
    });

    return { eliminado: true };
  }

  /** Fuerza el cambio de contraseña de otra cuenta enviándole el enlace. */
  async forzarCambio(id: string, actor: Actor, ip?: string) {
    await this.exigir(id);

    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const enviado = await this.auth.enviarEnlace(id, "recovery");
    await this.auth.auditar(actor.id, "usuario.cambio_forzado", "user", id, ip, {
      enviado,
    });

    return { enviado };
  }

  private async exigir(id: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id } });
    if (!usuario) throw new NotFoundException(`No existe la cuenta ${id}`);
    return usuario;
  }

  /**
   * Nadie puede dejar el sistema sin superadmin, ni quitarse a sí mismo el
   * acceso por accidente. Es la única forma de quedar bloqueados sin remedio
   * desde la propia interfaz.
   */
  private protegerUltimoSuperadmin(
    usuario: { id: string; role: string },
    actor: Actor,
    esRetiro: boolean,
  ) {
    if (!esRetiro) return;

    if (usuario.id === actor.id) {
      throw new BadRequestException(
        "No puedes suspender ni eliminar tu propia cuenta",
      );
    }
  }

  /** Se comprueba aparte porque necesita consultar la base. */
  async quedaOtroSuperadmin(id: string): Promise<boolean> {
    const otros = await this.prisma.user.count({
      where: { role: "superadmin", status: "active", id: { not: id } },
    });
    return otros > 0;
  }
}
