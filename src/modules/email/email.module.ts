import { Global, Module } from "@nestjs/common";
import { ResendClient } from "./resend.client";

/** Global: el correo se manda desde varios módulos y no aporta acoplarlos. */
@Global()
@Module({
  providers: [ResendClient],
  exports: [ResendClient],
})
export class EmailModule {}
