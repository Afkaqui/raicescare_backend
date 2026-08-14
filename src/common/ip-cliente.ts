import type { Request } from "express";

/**
 * IP real de quien hace la petición.
 *
 * La cadena es visitante → Cloudflare → nginx_proxy → API, así que `req.ip`
 * devuelve siempre la puerta de enlace de Docker. Usarla directamente agrupa a
 * todo el mundo bajo una sola dirección: los límites por origen dejarían de
 * distinguir a nadie y el hash de IP de los consentimientos sería el mismo para
 * todos, sin valor probatorio.
 *
 * Se prefiere la cabecera de Cloudflare, que trae la IP original y no se
 * acumula; después el primer valor de `X-Forwarded-For`, que es el cliente
 * porque cada salto añade el suyo por la derecha.
 *
 * Advertencia: estas cabeceras son falsificables por quien alcance la API sin
 * pasar por el proxy. Mientras el puerto del contenedor siga publicado hacia
 * fuera, esto sirve para distinguir usuarios legítimos, no para contener a
 * alguien decidido.
 */
export function ipDelCliente(peticion: Request): string {
  const cloudflare = peticion.get("cf-connecting-ip");
  if (cloudflare) return normalizar(cloudflare);

  const reenviada = peticion.get("x-forwarded-for");
  if (reenviada) {
    const primera = reenviada.split(",")[0]?.trim();
    if (primera) return normalizar(primera);
  }

  const real = peticion.get("x-real-ip");
  if (real) return normalizar(real);

  return normalizar(peticion.ip ?? "desconocida");
}

/** IPv4 mapeada en IPv6: `::ffff:1.2.3.4` y `1.2.3.4` son la misma dirección. */
function normalizar(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}
