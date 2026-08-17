# Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

# Sin esto el proceso corre como root: un fallo de ejecución remota tendría
# privilegios máximos dentro del contenedor. La imagen ya trae el usuario
# `node` con uid 1000, que coincide con el dueño del volumen de archivos en el
# host, así que las subidas siguen funcionando sin tocar permisos.
RUN chown -R node:node /app
USER node

EXPOSE 3001
CMD ["node", "dist/main.js"]
