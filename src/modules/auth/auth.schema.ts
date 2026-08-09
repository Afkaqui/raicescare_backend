import { z } from "zod";

export const entrarSchema = z.object({
  email: z.string().email().max(180),
  password: z.string().min(1).max(200),
});

export const pedirRecuperacionSchema = z.object({
  email: z.string().email().max(180),
});

export const definirContrasenaSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(200),
});

export type EntrarDto = z.infer<typeof entrarSchema>;
