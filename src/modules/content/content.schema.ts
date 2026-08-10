import { z } from "zod";

export const TIPOS_CONTENIDO = ["campaign", "initiative", "project"] as const;

/** Minúsculas, números y guiones: lo que puede ir en una URL sin escapar. */
const slug = z
  .string()
  .min(3)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "La dirección solo admite minúsculas, números y guiones",
  );

export const contenidoSchema = z.object({
  kind: z.enum(TIPOS_CONTENIDO),
  slug,
  title: z.string().min(3).max(200),
  summary: z.string().min(10).max(400),
  body: z.string().min(20).max(20000),
  programCode: z.string().max(80).optional(),
  location: z.string().max(160).optional(),
  startsOn: z.string().date().optional(),
  endsOn: z.string().date().optional(),
  goalAmount: z.number().positive().max(10_000_000).optional(),
  goalCurrency: z.enum(["PEN", "USD"]).optional(),
  coverMediaId: z.string().uuid().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
}).refine(
  (datos) => !datos.endsOn || !datos.startsOn || datos.endsOn >= datos.startsOn,
  { message: "La fecha de cierre no puede ser anterior a la de inicio", path: ["endsOn"] },
);

export type ContenidoDto = z.infer<typeof contenidoSchema>;
