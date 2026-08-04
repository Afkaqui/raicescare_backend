import { z } from "zod";

/**
 * Payload de un clic en CTA. La arquitectura fija los campos mínimos; el
 * frontend añade interactionId y ctaCode para enlazar el expediente.
 */
export const ctaEventSchema = z.object({
  ctaId: z.string().min(1).max(100),
  ctaLabel: z.string().min(1).max(150),
  ctaCode: z.string().max(60).optional(),
  location: z.string().min(1).max(50),
  destination: z.string().min(1).max(255),
  sourcePage: z.string().max(255).optional(),
  campaign: z.string().max(100).optional(),
  sessionId: z.string().uuid().optional(),
  anonymousUserId: z.string().uuid().optional(),
  interactionId: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
});

export type CtaEventDto = z.infer<typeof ctaEventSchema>;
