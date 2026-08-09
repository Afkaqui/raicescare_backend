import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// `promisify` se queda con la sobrecarga de tres argumentos y pierde la que
// acepta opciones; se reafirma el tipo para poder pasar el coste.
const scrypt = promisify(scryptCallback) as (
  contrasena: string | Buffer,
  sal: string | Buffer,
  largo: number,
  opciones: ScryptOptions,
) => Promise<Buffer>;

/**
 * Derivación de contraseñas con scrypt, que viene en Node y no exige compilar
 * nada — coherente con el resto del proyecto, donde se prefiere lo nativo a
 * sumar dependencias.
 *
 * Los parámetros siguen la recomendación de OWASP para scrypt. El coste está
 * pensado para que verificar tarde algunas décimas de segundo: imperceptible al
 * entrar, caro para quien pruebe millones de combinaciones.
 */
const N = 1 << 16; // 65536
const r = 8;
const p = 1;
const LARGO_CLAVE = 64;
const LARGO_SAL = 16;

/** El formato guarda sus propios parámetros: subirlos luego no invalida nada. */
export async function cifrarContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const derivada = (await scrypt(contrasena.normalize("NFKC"), sal, LARGO_CLAVE, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  }));

  return `scrypt$${N}$${r}$${p}$${sal.toString("base64")}$${derivada.toString("base64")}`;
}

export async function verificarContrasena(
  contrasena: string,
  guardada: string | null,
): Promise<boolean> {
  if (!guardada) return false;

  const partes = guardada.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const [, nTexto, rTexto, pTexto, salB64, claveB64] = partes;
  const nGuardado = Number(nTexto);
  const rGuardado = Number(rTexto);
  const pGuardado = Number(pTexto);

  if (!nGuardado || !rGuardado || !pGuardado) return false;

  const sal = Buffer.from(salB64, "base64");
  const esperada = Buffer.from(claveB64, "base64");

  const derivada = (await scrypt(
    contrasena.normalize("NFKC"),
    sal,
    esperada.length,
    { N: nGuardado, r: rGuardado, p: pGuardado, maxmem: 128 * nGuardado * rGuardado * 2 },
  ));

  if (derivada.length !== esperada.length) return false;
  return timingSafeEqual(derivada, esperada);
}

/**
 * Requisitos mínimos. Se exige longitud antes que composición: una frase larga
 * resiste más que ocho caracteres con un símbolo, y se recuerda mejor.
 */
export function problemaDeContrasena(contrasena: string): string | null {
  if (contrasena.length < 12) {
    return "La contraseña debe tener al menos 12 caracteres";
  }
  if (contrasena.length > 200) {
    return "La contraseña no puede superar los 200 caracteres";
  }
  if (/^\s|\s$/.test(contrasena)) {
    return "La contraseña no puede empezar ni terminar con espacios";
  }
  return null;
}
