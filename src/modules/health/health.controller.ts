import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/v1/health */
  @Get()
  estado() {
    return {
      status: "ok",
      database: this.prisma.disponible ? "connected" : "unavailable",
      timestamp: new Date().toISOString(),
    };
  }
}
