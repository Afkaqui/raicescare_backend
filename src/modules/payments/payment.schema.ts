import { z } from "zod";

/** Monedas habilitadas. El resto se rechaza antes de llegar a MercadoPago. */
export const MONEDAS = ["PEN", "USD"] as const;

/**
 * Topes de monto. El mínimo evita cobros que no cubren ni la comisión; el
 * máximo es una red de seguridad contra un error de tipeo o una manipulación
 * del formulario en el navegador.
 */
export const MONTO_MINIMO = 5;
export const MONTO_MAXIMO = 50_000;

/**
 * El tope de MercadoPago para tarjetas es de S/ 50 000 por pago. En dólares el
 * mismo número equivale a unas cuatro veces más y la pasarela lo rechazaría, así
 * que se fija un tope propio con margen frente al tipo de cambio.
 */
const MAXIMO_POR_MONEDA: Record<(typeof MONEDAS)[number], number> = {
  PEN: MONTO_MAXIMO,
  USD: 13_000,
};

function dentroDelTope(
  datos: { amount: number; currency: (typeof MONEDAS)[number] },
  contexto: z.RefinementCtx,
) {
  const maximo = MAXIMO_POR_MONEDA[datos.currency];
  if (datos.amount > maximo) {
    contexto.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["amount"],
      message: `El aporte máximo por operación en ${datos.currency} es ${maximo.toLocaleString("es-PE")}`,
    });
  }
}

const montoValido = z
  .number()
  .positive()
  .min(MONTO_MINIMO, `El aporte mínimo es ${MONTO_MINIMO}`)
  .max(MONTO_MAXIMO, `El aporte máximo por operación es ${MONTO_MAXIMO}`)
  // Dos decimales: MercadoPago rechaza montos con más precisión.
  .refine((valor) => Number.isInteger(Math.round(valor * 100)), {
    message: "El monto admite como máximo dos decimales",
  });

const codigoSeguimiento = z
  .string()
  .regex(/^RC-[A-Z]{2,3}-\d{4}-\d{6}$/, "Código de seguimiento inválido");

/** Aporte único vía Checkout Pro. */
export const checkoutSchema = z.object({
  trackingCode: codigoSeguimiento,
  amount: montoValido,
  currency: z.enum(MONEDAS).default("PEN"),
  email: z.string().email().max(180).optional(),
}).superRefine(dentroDelTope);

/** Aporte recurrente vía preapproval. */
export const suscripcionSchema = z.object({
  trackingCode: codigoSeguimiento,
  amount: montoValido,
  currency: z.enum(MONEDAS).default("PEN"),
  // MercadoPago solo admite estas dos unidades de recurrencia.
  frequency: z.number().int().min(1).max(12).default(1),
  frequencyType: z.enum(["months", "days"]).default("months"),
  // Obligatorio: sin correo no hay a quién cobrarle mes a mes.
  email: z.string().email().max(180),
}).superRefine(dentroDelTope);

export type CheckoutDto = z.infer<typeof checkoutSchema>;
export type SuscripcionDto = z.infer<typeof suscripcionSchema>;
