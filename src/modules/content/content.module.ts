import { Module } from "@nestjs/common";
import {
  ContentAdminController,
  ContentPublicoController,
} from "./content.controller";
import { ContentService } from "./content.service";

@Module({
  controllers: [ContentPublicoController, ContentAdminController],
  providers: [ContentService],
})
export class ContentModule {}
