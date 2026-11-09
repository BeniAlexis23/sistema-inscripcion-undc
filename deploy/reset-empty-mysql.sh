#!/bin/sh
# Destructive maintenance, NEVER executed by the application or during deployment.
set -eu
if [ "${1:-}" != '--confirm-delete-database' ]; then
  echo 'Uso: sh deploy/reset-empty-mysql.sh --confirm-delete-database NOMBRE_PROYECTO_DOKPLOY'
  echo 'Elimina exclusivamente la base MySQL del proyecto indicado. Conserva attachments.'
  exit 1
fi
project="${2:?Indique el nombre del proyecto Compose de Dokploy}"
case "$project" in ''|*[!a-zA-Z0-9_-]*) echo 'Nombre de proyecto inválido'; exit 1;; esac
container="${project}-mysql-1"
expected="${project}_mysql_data"
volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/mysql"}}{{.Name}}{{end}}{{end}}' "$container")"
if [ "$volume" != "$expected" ]; then
  echo "DETENIDO: volumen encontrado '$volume', esperado '$expected'. No se ha eliminado nada."
  exit 1
fi
if docker container inspect "${project}-web-1" >/dev/null 2>&1; then
  if [ "$(docker inspect --format '{{.State.Running}}' "${project}-web-1")" = 'true' ]; then docker stop "${project}-web-1"; fi
fi
docker stop "$container"
docker rm "$container"
docker volume rm "$volume"
echo 'Base eliminada. Guarde las variables definitivas y pulse Deploy en Dokploy.'
