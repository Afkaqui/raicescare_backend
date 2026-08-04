import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { json } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api/v1");

  // navigator.sendBeacon envía text/plain para evitar el preflight CORS.
  // Se parsea igual que JSON.
  app.use(json({ type: ["application/json", "text/plain"] }));

  // El frontend envía los eventos con sendBeacon; el origen se controla por env.
  const origenes = (config.get<string>("CORS_ORIGINS") ?? "")
    .split(",")
    .map((origen) => origen.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origenes.length > 0 ? origenes : true,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: false,
  });

  const puerto = Number(config.get<string>("PORT") ?? 3001);
  await app.listen(puerto);
  console.log(`API RaícesCare escuchando en el puerto ${puerto}`);
}

void bootstrap();
