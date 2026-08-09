import { z } from "zod";

export const ROLES = ["admin", "superadmin"] as const;

export const crearUsuarioSchema = z.object({
  email: z.string().email().max(180),
  fullName: z.string().min(2).max(180),
  role: z.enum(ROLES).default("admin"),
});

export const estadoUsuarioSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
