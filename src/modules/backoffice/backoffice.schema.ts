import { z } from "zod";
import { ESTADOS_GENERALES, TIPOS_SOLICITUD } from "../requests/request.schema";

export const consultaBandejaSchema = z.object({
  type: z.enum(Object.keys(TIPOS_SOLICITUD) as [string, ...string[]]).optional(),
  /** «abiertos» agrupa todo lo que aún no está resuelto. */
  status: z.enum([...ESTADOS_GENERALES, "abiertos"]).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export type ConsultaBandejaDto = z.infer<typeof consultaBandejaSchema>;
