# Despliegue UNDC en Dokploy

Configuración preparada para **Docker Compose**, un servidor y una réplica de `web`. No utilizar el modo Stack: este repositorio construye la imagen con `build`. Desarrollo local continúa funcionando con pnpm sin Docker.

## 1. Subir el código

Subir al repositorio Git los cambios, incluidos `Dockerfile`, `.dockerignore`, `.gitattributes`, `docker-compose.yml` y `deploy/`. No subir `.env`, bases de datos ni adjuntos. Dokploy debe tener acceso al repositorio y a la rama donde están estos archivos.

La imagen instala con pnpm 11.25.0 y lockfile, compila React y TypeScript, genera Prisma e incluye membretes y PDF públicos. Express sirve React y `/api/v1` bajo el mismo origen. No se usa Vite como servidor de producción.

## 2. Crear el servicio

En un proyecto de Dokploy crear un servicio **Docker Compose** (no Application ni Stack). Elegir proveedor Git/GitHub, repositorio y rama. Ruta del archivo Compose: `./docker-compose.yml`, contexto de construcción: raíz del repositorio.

El Compose usa la red externa `dokploy-network` del servidor Dokploy y una red privada para MySQL. No publica puertos del host. No es necesario instalar MySQL adicionalmente ni crear otro servicio de base de datos en el panel.

## 3. Variables

En **Environment** copiar `deploy/dokploy.env.example` y sustituir:

```dotenv
FRONTEND_ORIGIN=https://deportes.undc.edu.pe
MYSQL_PASSWORD=SECRETO_HEXADECIMAL_DE_64_CARACTERES
MYSQL_ROOT_PASSWORD=OTRO_SECRETO_HEXADECIMAL_DE_64_CARACTERES
```

Usar el dominio real, HTTPS, sin ruta ni barra final. Generar cada contraseña por separado en el servidor con `openssl rand -hex 32`. Son secretos diferentes. El hexadecimal evita problemas al formar la URL de conexión. El usuario de aplicación es `undc`, base `undc_deportes`, host interno `mysql`; el Compose arma `DATABASE_URL`. No usar `localhost` ni las credenciales del equipo de desarrollo. Las variables se referencian explícitamente porque el Environment de Dokploy no las inyecta automáticamente en los contenedores.

Las variables MySQL inicializan un volumen nuevo. Cambiarlas posteriormente en Environment no cambia la contraseña que ya existe en MySQL: realizar la rotación en la base y actualizar Environment coordinadamente.

## 4. Dominio y HTTPS

Crear un registro DNS A del subdominio hacia la IP pública del servidor (y AAAA solo si IPv6 funciona). En **Domains → Add Domain**:

| Campo | Valor |
| --- | --- |
| Host | Tu subdominio, sin `https://` |
| Service | `web` |
| Container port | `4000` |
| Path | `/` |
| HTTPS | Activado |
| Certificate | Let's Encrypt |

El dominio debe coincidir exactamente con `FRONTEND_ORIGIN`. No asignar dominio a `mysql`. Revisar **Preview Compose**: `web` debe conservar las redes privada y `dokploy-network`; MySQL solo la privada. Dokploy agrega las etiquetas Traefik del dominio. Desplegar nuevamente después de cambiar dominios. El acceso debe hacerse por Traefik; no publicar directamente el puerto de `web`, que confía en un salto de proxy para obtener la IP del cliente.

## 5. Desplegar y crear el administrador

Pulsar **Deploy**. MySQL inicializa su volumen; cuando está saludable, `web` ejecuta migraciones Prisma y el seed idempotente de escuelas, categorías y torneo antes de iniciar la API. Un fallo de migración impide iniciar la aplicación y debe revisarse en Logs. No ejecutar `prisma migrate dev`, `db push` ni `migrate reset` en producción.

Abrir la terminal del contenedor **web**, con sesión interactiva/TTY:

```sh
cd /app
pnpm admin:create
```

Ingresar nombre, correo, DNI, celular y contraseña. La contraseña no se muestra; no hay credenciales predeterminadas. Este comando también conserva la modalidad JSON por stdin para automatización local. El alta pública de administradores está deshabilitada en producción.

Entrar a `https://TU_DOMINIO/admin` y configurar fechas de inscripción, subsanaciones y enlaces de Drive antes de difundir el formulario. El seed solo propone fechas iniciales y no sobrescribe ajustes existentes.

## 6. Verificar antes de publicar

- Abrir `https://TU_DOMINIO/api/v1/health`: debe devolver `{"status":"ok"}`. El healthcheck consulta realmente MySQL.
- Abrir formulario y una ruta administrativa directamente; recargar para comprobar el fallback de React.
- Iniciar sesión: cookie HttpOnly, Secure y SameSite Strict, servida por HTTPS.
- Descargar un formato y verificar logo/membrete.
- Registrar un expediente de validación autorizado con sus documentos; revisarlo en el panel y comprobar acceso privado a adjuntos.
- Redesplegar y comprobar que inscripciones, sesiones y archivos siguen disponibles.

Si hay 403 de origen, revisar `FRONTEND_ORIGIN`; si falla el acceso, revisar HTTPS y cookies. Si hay 502, revisar salud y Logs de `web`/`mysql` y puerto 4000. Los adjuntos individuales admiten 10 MB; una nómina completa puede cargar hasta 25 archivos y superar 100 MB en total. Si usas otro proxy/CDN delante de Dokploy, ajustar su límite y tiempo de carga al expediente completo, o usar DNS sin ese proxy para este subdominio.

## 7. Persistencia y respaldos

Los volúmenes `mysql_data` y `attachments` conservan datos y archivos privados entre despliegues. Sus nombres reales llevan el prefijo del proyecto Compose; encontrarlos en Dokploy/inspección del contenedor. No cambiar de proyecto ni borrar volúmenes para actualizar. No usar `docker compose down -v`.

Programar respaldo externo diario y previo a cada actualización. Para una copia coherente, detener únicamente `web` durante el respaldo, mantener MySQL funcionando y copiar **ambos**: dump lógico MySQL y volumen de adjuntos. En terminal de `mysql`:

```sh
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root --single-transaction --no-tablespaces --routines --triggers --events --databases undc_deportes > /tmp/undc_deportes.sql
```

Descargar ese archivo inmediatamente desde el explorador del contenedor a un destino privado externo y eliminar la copia temporal. Respaldar `attachments` con **Volume Backups** de Dokploy hacia un destino S3 privado y volver a iniciar `web`. Una copia del volumen MySQL en caliente no sustituye el dump lógico. Guardar también los secretos, la configuración y el commit de código en un almacén privado. Probar restauraciones periódicas.

Restauración: con `web` detenido y MySQL disponible, subir el dump al contenedor MySQL e importar:

```sh
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root < /tmp/undc_deportes.sql
```

Restaurar `attachments` de la misma copia/fecha con propietario UID/GID 1000:1000, iniciar `web` y verificar descargas. La restauración reemplaza datos; ensayarla primero en un entorno separado. La aplicación corre como usuario `node`, no como root.

## 8. Datos locales y actualizaciones

El primer despliegue crea una base nueva: no importa los datos de tu PC. Si deben migrarse, exportar MySQL local y copiar `backend/storage` de forma coordinada, con `web` detenido. Para una base existente con historial Prisma, restaurar el dump completo incluidas las tablas `_prisma_migrations`. Conservar nombres de archivos y restaurar permisos del volumen de adjuntos.

Para actualizar: respaldar, subir los cambios a Git, pulsar Deploy y revisar Logs/health. Las migraciones se aplican automáticamente y el seed no crea usuarios ni reinicia configuraciones. Revertir código no revierte migraciones: revisar compatibilidad antes de volver a una versión anterior.

## Validación realizada

El healthcheck de MySQL verifica disponibilidad del servidor. Antes de migrar, `web` verifica por separado las credenciales reales, el origen HTTPS, los PDF públicos, React compilado y permisos de escritura. Una contraseña incorrecta se informa en Logs de `web` y no se corrige automáticamente ni elimina datos.

Para una base de despliegue descartable cuyo reinicio haya sido autorizado: guardar primero las variables definitivas y ejecutar en el servidor, desde el repositorio, `sh deploy/reset-empty-mysql.sh --confirm-delete-database NOMBRE_PROYECTO_DOKPLOY`. El script exige que el volumen montado coincida exactamente con el `mysql_data` del proyecto, detiene `web` si está activo, elimina solo ese contenedor/volumen MySQL y conserva adjuntos. Después pulsar Deploy. No se ejecuta en cada despliegue ni desde la aplicación.

Compilación local y 45 pruebas correctas. Se comprobaron rutas SPA, protección de API, salud de MySQL y bloqueo del bootstrap público en producción. **En este equipo no hay Docker instalado: la construcción y arranque de la imagen y la configuración DNS/TLS deben verificarse en Dokploy; no se ha realizado un despliegue remoto.**

Referencias oficiales: [Docker Compose en Dokploy](https://docs.dokploy.com/docs/core/docker-compose), [dominios para Compose](https://docs.dokploy.com/docs/core/docker-compose/domains), [Volume Backups](https://docs.dokploy.com/docs/core/volume-backups).
