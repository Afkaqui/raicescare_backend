/**
 * Correos para aportantes. Tono distinto al del personal: aquí escribe la
 * organización a alguien de fuera que decidió apoyarla, no un sistema interno
 * a su equipo.
 */

const VERDE = "#2d5016";
const HOJA = "#458823";

function envoltura(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f4f5f3;font-family:Helvetica,Arial,sans-serif;color:#333;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr><td style="background:${VERDE};padding:24px 32px;">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">RaícesCare</p>
      <p style="margin:4px 0 0;color:#cfe3c0;font-size:12px;letter-spacing:1px;">CIENCIA, CUIDADO Y COMUNIDAD</p>
    </td></tr>
    <tr><td style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:${VERDE};">${titulo}</h1>
      ${cuerpo}
    </td></tr>
    <tr><td style="padding:20px 32px;background:#f4f5f3;font-size:12px;color:#777;">
      <p style="margin:0;">Asociación RaícesCare · Pucallpa, Ucayali, Perú</p>
      <p style="margin:6px 0 0;">Mensaje automático. No respondas a esta dirección.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function boton(url: string, etiqueta: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background:${HOJA};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:bold;font-size:14px;text-decoration:none;">${etiqueta}</a>
    </td></tr></table>
  <p style="margin:0;font-size:12px;color:#777;">Si el botón no funciona, copia esta dirección:</p>
  <p style="margin:4px 0 0;font-size:12px;color:#777;word-break:break-all;">${url}</p>`;
}

export function bienvenida(datos: { nombre: string; url: string; horas: number }) {
  const texto = `Hola ${datos.nombre}:

Gracias por crear tu cuenta en RaícesCare. Solo falta confirmar que este correo es tuyo:

${datos.url}

El enlace vence en ${datos.horas} horas. Con la cuenta confirmada podrás aportar y consultar el historial de tus aportes cuando quieras.

Si no fuiste tú quien se registró, ignora este mensaje: sin confirmar, la cuenta no se puede usar.`;

  return {
    asunto: "Confirma tu correo en RaícesCare",
    texto,
    html: envoltura(
      "Confirma tu correo",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hola <strong>${datos.nombre}</strong>:</p>
       <p style="margin:0;font-size:15px;line-height:1.6;">Gracias por crear tu cuenta. Solo falta confirmar que este correo es tuyo.</p>
       ${boton(datos.url, "Confirmar mi correo")}
       <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#555;">El enlace vence en ${datos.horas} horas. Con la cuenta confirmada podrás aportar y consultar tu historial cuando quieras.</p>
       <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#555;">Si no fuiste tú quien se registró, ignora este mensaje: sin confirmar, la cuenta no se puede usar.</p>`,
    ),
  };
}

export function recuperacionAportante(datos: {
  nombre: string;
  url: string;
  minutos: number;
}) {
  const texto = `Hola ${datos.nombre}:

Alguien pidió recuperar el acceso a tu cuenta de RaícesCare. Si fuiste tú, elige una contraseña nueva:

${datos.url}

El enlace vence en ${datos.minutos} minutos y sirve una sola vez.

Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando.`;

  return {
    asunto: "Recuperar el acceso a tu cuenta",
    texto,
    html: envoltura(
      "Recuperar tu contraseña",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hola <strong>${datos.nombre}</strong>:</p>
       <p style="margin:0;font-size:15px;line-height:1.6;">Alguien pidió recuperar el acceso a tu cuenta. Si fuiste tú, elige una contraseña nueva.</p>
       ${boton(datos.url, "Elegir contraseña nueva")}
       <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#555;">El enlace vence en ${datos.minutos} minutos y sirve una sola vez.</p>
       <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#555;">Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando.</p>`,
    ),
  };
}
