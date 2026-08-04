#!/usr/bin/env bash
#
# Despliegue de la API: empuja a GitHub y redespliega en el VPS en un solo paso.
#
#   npm run deploy                 -> usa el último commit ya creado
#   npm run deploy -- "mensaje"    -> commitea todo lo pendiente con ese mensaje
#
# VPS COMPARTIDO (~36 contenedores de ~12 proyectos): este script solo toca el
# contenedor raicescare_api. Nunca reinicia el daemon de Docker.
# Reglas completas en /home/kaqui/GUIA_VPS.md.

set -euo pipefail

VPS_USER="${VPS_USER:-kaqui}"
VPS_HOST="${VPS_HOST:-161.132.54.226}"
APP_DIR="${APP_DIR:-~/raicescare_backend}"
CONTENEDOR="raicescare_api"
PUERTO="${API_HOST_PORT:-8221}"
RAMA="main"

azul()  { printf '\033[1;34m%s\033[0m\n' "$1"; }
verde() { printf '\033[1;32m%s\033[0m\n' "$1"; }
rojo()  { printf '\033[1;31m%s\033[0m\n' "$1"; }

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------- 1. commit
mensaje="${1:-}"
if [[ -n "$(git status --porcelain)" ]]; then
  if [[ -z "$mensaje" ]]; then
    rojo "Hay cambios sin commitear. Pasa un mensaje:"
    rojo "  npm run deploy -- \"lo que cambiaste\""
    git status --short
    exit 1
  fi
  azul "== 1. Commit =="
  git add -A
  git commit -q -m "$mensaje"
  echo "  $(git log --oneline -1)"
else
  azul "== 1. Commit =="
  echo "  sin cambios pendientes: $(git log --oneline -1)"
fi

# ------------------------------------------------------------------ 2. push
azul "== 2. Push a GitHub =="
git push -q origin "$RAMA"
echo "  $RAMA actualizada"

# --------------------------------------------------------------- 3. deploy
azul "== 3. Redespliegue en el VPS =="
ssh -o BatchMode=yes "${VPS_USER}@${VPS_HOST}" bash -s <<REMOTO
set -euo pipefail
cd ${APP_DIR}

echo "  -- traer código"
git fetch -q origin ${RAMA}
git reset -q --hard origin/${RAMA}
echo "     \$(git log --oneline -1)"

echo "  -- construir imagen"
docker compose build --quiet

# docker stop falla por AppArmor (Docker via snap) incluso con sudo: se mata el
# PID directo. Quitar restart=always ANTES del kill o el contenedor resucita
# con la imagen vieja.
echo "  -- recrear contenedor"
sudo docker update --restart=no ${CONTENEDOR} >/dev/null
POLICY=\$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' ${CONTENEDOR} 2>/dev/null || echo "")
if [ "\$POLICY" != "no" ] && [ -n "\$POLICY" ]; then
  echo "     ERROR: no se pudo quitar la política de reinicio (policy=\$POLICY); aborto"
  exit 1
fi
PID=\$(docker inspect --format '{{.State.Pid}}' ${CONTENEDOR} 2>/dev/null || echo "")
if [ -n "\$PID" ] && [ "\$PID" != "0" ]; then
  sudo kill -9 "\$PID" || true
  sleep 2
fi
sudo docker rm ${CONTENEDOR} >/dev/null || true
sudo docker compose up -d >/dev/null

echo "  -- migraciones"
sleep 5
docker compose exec -T ${CONTENEDOR} npx prisma migrate deploy 2>&1 | tail -3

echo "  -- verificar"
docker ps --filter name=${CONTENEDOR} --format "     contenedor: up {{.RunningFor}}"
curl -sf http://localhost:${PUERTO}/api/v1/health >/dev/null && echo "     health local OK"
REMOTO

# ------------------------------------------------------------ 4. verificar
azul "== 4. Verificación pública =="
respuesta=$(curl -sS --max-time 20 https://api.raicescare.earth/api/v1/health)
echo "  $respuesta"
echo "$respuesta" | grep -q '"status":"ok"' && verde "Despliegue completado" || {
  rojo "La API no responde OK"; exit 1;
}
