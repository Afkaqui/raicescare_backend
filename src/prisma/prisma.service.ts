import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private conectado = false;

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.conectado = true;
    } catch (error) {
      // La API debe levantar aunque la base aún no esté disponible: los
      // eventos de CTA no pueden tumbar el servicio.
      this.conectado = false;
      this.logger.error(
        `No se pudo conectar a PostgreSQL: ${(error as Error).message}`,
      );
    }
  }

  get disponible(): boolean {
    return this.conectado;
  }
}
