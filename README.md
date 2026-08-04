# RaícesCare — API institucional

Backend NestJS de la plataforma RaícesCare. **Fase 1** de la arquitectura de
CTA: registro y trazabilidad de interacciones.

## Stack

- NestJS 11 + TypeScript
- PostgreSQL (instancia en VPS, sin contenedores)
- Prisma como ORM
- Zod para validación de payloads

## Puesta en marcha local (sin Docker)

```bash
npm install
cp .env.example .env   # completar DATABASE_URL
npm run prisma:generate
npm run prisma:migrate  # crea la tabla cta_events
npm run start:dev
```

La API queda en `http://localhost:3001/api/v1`.

## Despliegue en el VPS

El VPS es **compartido**: antes de tocar nada, leer `/home/kaqui/GUIA_VPS.md`.
Reglas que aplican a este servicio:

- Docker para todo; el único nginx válido es el contenedor `nginx_proxy`.
- Nunca editar `~/nginx/conf.d/*.conf` a mano: se usa el CLI `kaqui-sites`.
- El puerto del host debe verificarse libre con `ss -ltn` (el mapa de puertos de
  la guía está desactualizado).
- Credenciales solo en `.env` del servidor.

```bash
# 1. Código y variables
cd ~/raicescare_backend
cp .env.example .env && $EDITOR .env      # DATABASE_URL, API_HOST_PORT, CORS_ORIGINS

# 2. Base de datos (una vez)
docker exec -it postgres_db psql -U admin -d main_db -c "CREATE DATABASE raicescare_db;"

# 3. Levantar
docker compose up -d --build
docker compose exec raicescare_api npx prisma migrate deploy

# 4. Verificar en el host
curl -I http://localhost:${API_HOST_PORT}/api/v1/health

# 5. Publicar el subdominio (requiere certificado de la zona raicescare.earth)
sudo kaqui-sites add raicescare-api api.raicescare.earth ${API_HOST_PORT} <modo-ssl>
```

Para redesplegar con imagen nueva **no** usar `docker compose restart` ni
reiniciar el daemon: seguir el workaround quirúrgico de la guía
(`build` → `docker update --restart=no` → `kill -9` del PID → `rm` → `up -d`).

## Endpoints de la fase 1

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/v1/health` | Estado del servicio y de la base de datos |
| `POST` | `/api/v1/events/cta` | Registra un clic en un CTA |

### `POST /api/v1/events/cta`

```json
{
  "ctaId": "hero_donate_entry",
  "ctaLabel": "Donar ahora",
  "ctaCode": "DONATE_ENTRY",
  "location": "hero",
  "destination": "/aportes?source=hero",
  "sourcePage": "/",
  "campaign": "general",
  "sessionId": "0193...-uuid",
  "anonymousUserId": "0193...-uuid",
  "interactionId": "0193...-uuid",
  "timestamp": "2026-08-04T10:15:00-05:00"
}
```

Responde siempre `202 Accepted`. Si la base no está disponible o el payload es
inválido, se registra en el log y se devuelve `eventId: null`: **la analítica
nunca debe bloquear la navegación del visitante.**

## Conexión con el frontend

El frontend envía los eventos con `navigator.sendBeacon` a
`${NEXT_PUBLIC_API_URL}/api/v1/events/cta`. Sin esa variable definida no se
intenta el envío, así que la web funciona con o sin backend levantado.

## Estado

Implementado en fase 1: catálogo de CTA (en el frontend), registro de eventos y
`interactionId`.

Pendiente de fases siguientes: expediente transversal
(`institutional_requests`), los cuatro formularios maestros, panel
administrativo, pasarela de pagos y repositorio documental. El detalle está en
`PENDIENTES.md`, en la raíz del proyecto.
