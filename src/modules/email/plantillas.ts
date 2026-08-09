/**
 * Plantillas del correo transaccional. HTML en tablas y con estilos en línea:
 * los clientes de correo no soportan hojas de estilo modernas de forma fiable.
 * Cada mensaje lleva su versión en texto plano, que es lo que ven los lectores
 * accesibles y los filtros de correo.
 */

const VERDE = "#2d5016";
const HOJA = "#458823";

function envoltura(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f4f5f3;font-family:Helvetica,Arial,sans-serif;color:#333;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:${VERDE};padding:24px 32px;">
        <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">RaícesCare</p>
        <p style="margin:4px 0 0;color:#cfe3c0;font-size:12px;letter-spacing:1px;">CIENCIA, CUIDADO Y COMUNIDAD</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:${VERDE};">${titulo}</h1>
        ${cuerpo}
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;background:#f4f5f3;font-size:12px;color:#777;">
        <p style="margin:0;">Asociación RaícesCare · Pucallpa, Ucayali, Perú</p>
        <p style="margin:6px 0 0;">Este es un mensaje automático de la plataforma interna. No respondas a esta dirección.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function boton(url: string, etiqueta: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background:${HOJA};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:bold;font-size:14px;text-decoration:none;">${etiqueta}</a>
    </td></tr>
  </table>
  <p style="margin:0;font-size:12px;color:#777;">Si el botón no funciona, copia esta dirección en tu navegador:</p>
  <p style="margin:4px 0 0;font-size:12px;color:#777;word-break:break-all;">${url}</p>`;
}

export function invitacion(datos: {
  nombre: string;
  url: string;
  horasValidez: number;
}) {
  const texto = `Hola ${datos.nombre}:

Se creó tu cuenta en la plataforma interna de RaícesCare. Para empezar a usarla necesitas elegir una contraseña:

${datos.url}

El enlace vence en ${datos.horasValidez} horas y sirve una sola vez. Si vence, pídele al superadministrador que te reenvíe la invitación.

Si no esperabas este mensaje, ignóralo: sin definir la contraseña, la cuenta no se puede usar.`;

  return {
    asunto: "Tu cuenta en la plataforma de RaícesCare",
    texto,
    html: envoltura(
      "Elige tu contraseña",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hola <strong>${datos.nombre}</strong>:</p>
       <p style="margin:0;font-size:15px;line-height:1.6;">Se creó tu cuenta en la plataforma interna de RaícesCare. Para empezar a usarla necesitas elegir una contraseña.</p>
       ${boton(datos.url, "Elegir mi contraseña")}
       <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#555;">El enlace vence en ${datos.horasValidez} horas y sirve una sola vez. Si vence, pídele al superadministrador que te reenvíe la invitación.</p>
       <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#555;">Si no esperabas este mensaje, ignóralo: sin definir la contraseña, la cuenta no se puede usar.</p>`,
    ),
  };
}

export function recuperacion(datos: {
  nombre: string;
  url: string;
  minutosValidez: number;
}) {
  const texto = `Hola ${datos.nombre}:

Alguien pidió recuperar el acceso a tu cuenta de la plataforma interna de RaícesCare. Si fuiste tú, elige una contraseña nueva aquí:

${datos.url}

El enlace vence en ${datos.minutosValidez} minutos y sirve una sola vez.

Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando y nadie ha entrado a tu cuenta. Conviene avisarle al superadministrador.`;

  return {
    asunto: "Recuperar el acceso a tu cuenta",
    texto,
    html: envoltura(
      "Recuperar tu contraseña",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hola <strong>${datos.nombre}</strong>:</p>
       <p style="margin:0;font-size:15px;line-height:1.6;">Alguien pidió recuperar el acceso a tu cuenta. Si fuiste tú, elige una contraseña nueva.</p>
       ${boton(datos.url, "Elegir una contraseña nueva")}
       <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#555;">El enlace vence en ${datos.minutosValidez} minutos y sirve una sola vez.</p>
       <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#555;">Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando y nadie ha entrado a tu cuenta. Conviene avisarle al superadministrador.</p>`,
    ),
  };
}

/** Aviso al titular cuando su contraseña cambió: delata un acceso indebido. */
export function contrasenaCambiada(datos: { nombre: string; cuando: Date }) {
  const cuando = datos.cuando.toLocaleString("es-PE", { timeZone: "America/Lima" });
  const texto = `Hola ${datos.nombre}:

La contraseña de tu cuenta en la plataforma de RaícesCare se cambió el ${cuando}.

Si no fuiste tú, avísale al superadministrador de inmediato: alguien más tiene acceso a tu cuenta.`;

  return {
    asunto: "Tu contraseña fue cambiada",
    texto,
    html: envoltura(
      "Tu contraseña fue cambiada",
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hola <strong>${datos.nombre}</strong>:</p>
       <p style="margin:0;font-size:15px;line-height:1.6;">La contraseña de tu cuenta se cambió el <strong>${cuando}</strong>.</p>
       <p style="margin:16px 0 0;font-size:15px;line-height:1.6;">Si no fuiste tú, avísale al superadministrador de inmediato: alguien más tiene acceso a tu cuenta.</p>`,
    ),
  };
}
