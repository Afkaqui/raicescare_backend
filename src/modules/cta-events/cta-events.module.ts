import { Module } from "@nestjs/common";
import { CtaEventsController } from "./cta-events.controller";
import { CtaEventsService } from "./cta-events.service";

@Module({
  controllers: [CtaEventsController],
  providers: [CtaEventsService],
})
export class CtaEventsModule {}
