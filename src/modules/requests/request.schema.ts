import { z } from "zod";

/** Los cinco procesos que comparten expediente (sección 12). */
export const TIPOS_SOLICITUD = {
  contribution: "AP",
  participation_application: "PAR",
  alliance_proposal: "ALI",
  initiative_assessment: "INI",
  institutional_meeting: "B2B",
} as const;

export type TipoSolicitud = keyof typeof TIPOS_SOLICITUD;

/** Estados transversales (sección 16). */
export const ESTADOS_GENERALES = [
  "received",
  "automatic_validation",
  "under_review",
  "additional_information_requested",
  "eligible",
  "not_eligible",
  "in_process",
  "closed",
] as const;

export type EstadoGeneral = (typeof ESTADOS_GENERALES)[number];

/**
 * Transiciones permitidas (sección 26). Se validan en backend: un estado no
 * puede saltar a cualquier otro.
 */
export const TRANSICIONES: Record<EstadoGeneral, readonly EstadoGeneral[]> = {
  received: ["automatic_validation", "under_review", "closed"],
  // Una validación automática puede concluir sin revisión humana: es el caso
  // del aporte que la pasarela confirma, que no necesita que nadie lo apruebe.
  automatic_validation: [
    "under_review",
    "additional_information_requested",
    "not_eligible",
    "in_process",
    "closed",
  ],
  under_review: [
    "additional_information_requested",
    "eligible",
    "not_eligible",
    "in_process",
  ],
  additional_information_requested: ["under_review", "closed"],
  eligible: ["in_process", "closed"],
  not_eligible: ["closed"],
  in_process: ["closed"],
  closed: [],
};

export const crearSolicitudSchema = z.object({
  requestType: z.enum(
    Object.keys(TIPOS_SOLICITUD) as [TipoSolicitud, ...TipoSolicitud[]],
  ),
  interactionId: z.string().uuid().optional(),
  category: z.string().max(120).optional(),
  source: z.string().max(120).optional(),
  applicant: z
    .object({
      fullName: z.string().min(1).max(180),
      email: z.string().email().max(180).optional(),
      phone: z.string().max(40).optional(),
      country: z.string().max(100).optional(),
    })
    .optional(),
  organization: z
    .object({
      legalName: z.string().min(1).max(250),
      organizationType: z.string().max(80).optional(),
      registrationNumber: z.string().max(100).optional(),
      country: z.string().max(100).optional(),
      website: z.string().url().optional(),
    })
    .optional(),
  /// Respuestas específicas del formulario maestro correspondiente.
  formData: z.record(z.unknown()).optional(),
  consents: z
    .array(
      z.object({
        consentType: z.string().min(1).max(80),
        policyVersion: z.string().min(1).max(30),
        accepted: z.boolean(),
      }),
    )
    .min(1, "Se requiere al menos el consentimiento de tratamiento de datos")
    .refine(
      (lista) =>
        lista.some(
          (consentimiento) =>
            consentimiento.consentType === "privacy" && consentimiento.accepted,
        ),
      {
        message:
          "El consentimiento de tratamiento de datos personales es obligatorio",
      },
    ),
});

export const transicionSchema = z.object({
  newStatus: z.enum(ESTADOS_GENERALES),
  publicComment: z.string().optional(),
  internalComment: z.string().optional(),
  reasonCode: z.string().max(100).optional(),
  changedBy: z.string().uuid().optional(),
});

export type CrearSolicitudDto = z.infer<typeof crearSolicitudSchema>;
export type TransicionDto = z.infer<typeof transicionSchema>;
