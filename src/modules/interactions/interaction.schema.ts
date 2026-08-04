import { z } from "zod";

/** Estados del ciclo de vida de una interacción (sección 8 de la arquitectura). */
export const ESTADOS_INTERACCION = [
  "clicked",
  "form_viewed",
  "form_started",
  "submitted",
  "converted",
  "abandoned",
  "closed",
] as const;

const contexto = z
  .object({
    programCode: z.string().max(80).optional(),
    campaignId: z.string().uuid().optional(),
    initiativeId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
  })
  .optional();

/** POST /api/v1/interactions — registro del clic. */
export const registrarInteraccionSchema = z.object({
  interactionId: z.string().uuid(),
  ctaCode: z.string().min(1).max(80),
  visibleLabel: z.string().min(1).max(180),
  sourcePage: z.string().min(1),
  sourceSection: z.string().min(1).max(120),
  destination: z.string().min(1),
  processType: z.string().min(1).max(60),
  analyticsCategory: z.string().min(1).max(40),
  sessionId: z.string().uuid().optional(),
  anonymousUserId: z.string().uuid().optional(),
  context: contexto,
});

/** PATCH /api/v1/interactions/{interactionId} — avance progresivo. */
export const actualizarInteraccionSchema = z.object({
  status: z.enum(ESTADOS_INTERACCION).optional(),
  categoryOfInterest: z.string().max(120).optional(),
  userType: z.string().max(60).optional(),
  personId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  context: contexto,
});

/** POST /api/v1/interactions/{interactionId}/events */
export const eventoInteraccionSchema = z.object({
  eventName: z.string().min(1).max(120),
  eventCategory: z.string().min(1).max(60),
  payload: z.record(z.unknown()).optional(),
});

/** POST /api/v1/interactions/{interactionId}/link-request */
export const vincularSolicitudSchema = z.object({
  requestType: z.string().min(1).max(80),
  requestId: z.string().uuid(),
});

/**
 * Formato heredado de POST /api/v1/events/cta. El frontend en producción lo
 * usa; se mantiene y se traduce al modelo transversal.
 */
export const eventoCtaLegacySchema = z.object({
  ctaId: z.string().min(1).max(100),
  ctaLabel: z.string().min(1).max(180),
  ctaCode: z.string().max(80).optional(),
  location: z.string().min(1).max(120),
  destination: z.string().min(1),
  sourcePage: z.string().optional(),
  campaign: z.string().max(100).optional(),
  sessionId: z.string().uuid().optional(),
  anonymousUserId: z.string().uuid().optional(),
  interactionId: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
});

export type RegistrarInteraccionDto = z.infer<typeof registrarInteraccionSchema>;
export type ActualizarInteraccionDto = z.infer<
  typeof actualizarInteraccionSchema
>;
export type EventoInteraccionDto = z.infer<typeof eventoInteraccionSchema>;
export type VincularSolicitudDto = z.infer<typeof vincularSolicitudSchema>;
export type EventoCtaLegacyDto = z.infer<typeof eventoCtaLegacySchema>;
