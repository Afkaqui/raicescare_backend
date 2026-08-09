/**
 * Rescate por SSH: crear el primer superadministrador, o devolverle el acceso a
 * uno que perdió su contraseña.
 *
 * Existe porque solo el superadmin cambia contraseñas: si el único que hay
 * pierde la suya, nadie puede administrar el sistema. Quien tiene acceso al
 * servidor ya podría hacerlo a mano contra la base; mejor que sea un camino
 * explícito y que quede en la bitácora.
 *
 *   docker compose exec raicescare_api node dist/scripts/rescate.js crear "correo" "Nombre"
 *   docker compose exec raicescare_api node dist/scripts/rescate.js enlace "correo"
 *
 * Nunca imprime ni fija una contraseña: emite un enlace de un solo uso, igual
 * que el resto del sistema.
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const HORAS = 72;

function hash(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

async function emitirEnlace(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await prisma.$transaction([
    prisma.passwordToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordToken.create({
      data: {
        userId,
        tokenHash: hash(token),
        purpose: "invitation",
        expiresAt: new Date(Date.now() + HORAS * 3_600_000),
      },
    }),
  ]);

  const base = process.env.PUBLIC_SITE_URL ?? "https://www.raicescare.earth";
  return `${base}/admin/clave?token=${token}`;
}

async function main() {
  const [accion, correo, nombre] = process.argv.slice(2);

  if (!accion || !correo) {
    console.error(
      "Uso:\n" +
        '  rescate.js crear "correo" "Nombre Completo"   crea el superadministrador\n' +
        '  rescate.js enlace "correo"                    reemite su enlace de acceso',
    );
    process.exit(1);
  }

  const email = correo.toLowerCase().trim();

  if (accion === "crear") {
    if (!nombre) {
      console.error("Falta el nombre completo.");
      process.exit(1);
    }

    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) {
      console.error(
        `Ya existe una cuenta con ${email}. Usa «enlace» para reemitir su acceso.`,
      );
      process.exit(1);
    }

    const usuario = await prisma.user.create({
      data: { email, fullName: nombre.trim(), role: "superadmin" },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: null,
        action: "superadmin.creado_por_rescate",
        targetType: "user",
        targetId: usuario.id,
        detail: { email },
      },
    });

    console.log(`\nSuperadministrador creado: ${email}`);
    console.log(`Enlace para elegir contraseña (vence en ${HORAS} h):\n`);
    console.log(await emitirEnlace(usuario.id));
    console.log("\nÁbrelo en el navegador. Sirve una sola vez.\n");
    return;
  }

  if (accion === "enlace") {
    const usuario = await prisma.user.findUnique({ where: { email } });
    if (!usuario) {
      console.error(`No existe una cuenta con ${email}.`);
      process.exit(1);
    }

    await prisma.$transaction([
      // El rescate reactiva: de nada sirve el enlace si la cuenta está
      // suspendida o bloqueada por intentos fallidos.
      prisma.user.update({
        where: { id: usuario.id },
        data: { status: "active", failedLogins: 0, lockedUntil: null },
      }),
      prisma.session.updateMany({
        where: { userId: usuario.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: null,
          action: "acceso.rescatado_por_ssh",
          targetType: "user",
          targetId: usuario.id,
          detail: { email },
        },
      }),
    ]);

    console.log(`\nSesiones cerradas y cuenta reactivada: ${email}`);
    console.log(`Enlace para elegir contraseña (vence en ${HORAS} h):\n`);
    console.log(await emitirEnlace(usuario.id));
    console.log("\nÁbrelo en el navegador. Sirve una sola vez.\n");
    return;
  }

  console.error(`Acción desconocida: ${accion}`);
  process.exit(1);
}

main()
  .catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
