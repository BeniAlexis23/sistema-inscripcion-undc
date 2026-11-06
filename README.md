# Inscripciones deportivas UNDC 2026

Aplicación cliente-servidor para el XVII Aniversario Institucional, con un formulario público precedido por la información del evento y un panel administrativo privado. React, TypeScript, Tailwind CSS y componentes shadcn/ui en `frontend/`; Express, TypeScript, Prisma y MySQL en `backend/`.

## Requisitos e instalación local (sin Docker)

- Node.js 22.12 o superior (verificado con Node 24).
- MySQL 8.0 o superior, ejecutándose localmente.
- pnpm 11.25.0 (versión fijada en `packageManager`).

El workspace se configura en `pnpm-workspace.yaml` y comparte `pnpm-lock.yaml`. Los comandos de la raíz ejecutan las tareas del frontend y backend mediante filtros. Para ejecutar una tarea directamente en un paquete, use `pnpm --filter @undc/backend <tarea>` o `pnpm --filter @undc/frontend <tarea>`.

Desde MySQL, cree una base y un usuario propios; sustituya la contraseña del ejemplo:

```sql
CREATE DATABASE undc_deportes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'undc'@'localhost' IDENTIFIED BY 'CONTRASENA_PRIVADA';
GRANT ALL PRIVILEGES ON undc_deportes.* TO 'undc'@'localhost';
```

Desde la raíz del proyecto, en PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
# Edite DATABASE_URL en backend/.env con sus credenciales locales.
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Si ya instaló la versión anterior, ejecute `pnpm db:generate` y `pnpm db:migrate` antes de reiniciar: la segunda migración incorpora las inscripciones públicas sin cuentas y conserva los registros existentes.

La carga inicial es idempotente y no sobrescribe fechas ya configuradas. Incluye las seis escuelas, siete categorías y el semestre 2026-II. Apertura propuesta: 6 de noviembre de 2026; cierre propuesto: 19 de noviembre de 2026, 23:59, hora de Lima. **Estas fechas no están fijadas por los PDF y la comisión debe confirmarlas en Configuración.**

### Crear el primer administrador

No hay cuentas ni contraseñas predeterminadas. La contraseña se proporciona por stdin para evitar argumentos visibles en la lista de procesos. En PowerShell:

```powershell
$adminSecret = Read-Host 'Contraseña inicial (mínimo 6 caracteres)' -AsSecureString
$adminCredential = [System.Management.Automation.PSCredential]::new('admin', $adminSecret)
$adminData = @{ email='admin@undc.edu.pe'; name='Administrador UNDC'; dni='12345678'; phone='999999999'; password=$adminCredential.GetNetworkCredential().Password }
$adminData | ConvertTo-Json -Compress | pnpm admin:create
Remove-Variable adminSecret,adminCredential,adminData
```

Los datos de identificación son ejemplos: reemplácelos por los del responsable. El comando crea la cuenta una sola vez; no modifica cuentas existentes.

```powershell
pnpm dev
```

Frontend: http://localhost:5173. API: http://localhost:4000/api/v1. Vite redirige `/api` hacia Express. Si cambia los puertos, actualice `FRONTEND_ORIGIN` y el proxy de Vite. No use `vite preview` como servidor público de producción.

### Comprobar la conexión MySQL

```powershell
pnpm db:check
```

Comprueba la conexión y los catálogos sin imprimir la contraseña. El backend carga siempre `backend/.env`, incluso cuando se ejecuta desde otra carpeta. Si aparece P1000, revise las credenciales de DATABASE_URL: la contraseña de ejemplo no es una cuenta real. P1001 indica que debe iniciar MySQL o revisar host/puerto; si faltan tablas, ejecute `pnpm db:migrate` y `pnpm db:seed`. Para iniciar únicamente la API use `pnpm --filter @undc/backend dev`.

## Uso

1. `/` muestra una sola página: navbar institucional con escudo, información breve del torneo, enlaces a documentos y formulario de inscripción.
2. El delegado completa escuela, categoría, sus datos de contacto y la nómina **sin iniciar sesión ni crear una cuenta**. La ruta anterior `/inscripcion` redirige a este mismo formulario.
3. Descarga los formatos con los datos registrados, imprime y recoge las firmas físicas. Luego adjunta la ficha y ambas declaraciones por cada deportista (PDF/JPG/PNG, hasta 10 MB por archivo).
4. Revisa el resumen y envía. Se validan identidad, escuela, sexo, cupos y máximo de dos disciplinas en una transacción. La inscripción se guarda como enviada, con una constancia de recepción única.
5. La comisión accede mediante login en `/admin`, abre la bandeja de revisión y consulta los documentos privados. Verifica manualmente matrícula y requisitos; después aprueba u observa el expediente.
6. Si hay observaciones, la comisión contacta al delegado por el correo o celular consignados y registra las subsanaciones desde el panel. No se envían correos automáticos ni se publican los datos de participantes.

La constancia pública acredita recepción, no aprobación. Su código no permite descargar documentos ni consultar datos personales. Las inscripciones públicas no generan usuarios; los equipos previamente asociados a delegados conservan su funcionamiento interno.

El formulario conserva los datos durante la visita: mantenga abierta la página mientras prepara las firmas. La inscripción y los cupos se registran al enviar; no hay un borrador público persistente. Al retroceder desde documentos para modificar la nómina, se descartan los adjuntos seleccionados para exigir documentos actualizados.

Los documentos se generan con el contenido y diseño de los modelos suministrados: membrete original de la Subcomisión de Recreación y Deportes, títulos centrados, campos sombreados, tablas azules y espacios para firmas. El membrete se incluye en `backend/assets/membrete-deportes-undc.jpg` y debe acompañar al backend al desplegarlo. Los cuatro formatos habituales caben en A4; las nóminas con nombres extensos continúan en páginas con membrete y encabezados repetidos. No se solicitan diagnósticos ni huellas en el formulario web. La recepción no verifica automáticamente matrícula ni autenticidad de firmas.

En Administración → Configuración se pueden guardar los enlaces de bases, formatos y otros documentos, por ejemplo de Google Drive. Deben ser enlaces de lectura accesibles para los participantes. Si bases o formatos quedan vacíos se usarán los PDF incluidos; el enlace adicional solo aparece cuando está configurado. La tercera migración agrega estos campos sin reemplazar registros existentes.

Los PDF de consulta están en `backend/public-documents`. Las rutas públicas usan una lista cerrada de archivos; se pueden sustituir los PDF conservando los nombres o configurar `PUBLIC_DOCUMENTS_DIR`. Los adjuntos de participantes se guardan por separado en `STORAGE_DIR` y requieren autenticación administrativa.

## API REST

Todas las rutas están bajo `/api/v1`. Las rutas `/public` son accesibles sin sesión; el resto del panel requiere autenticación. Las mutaciones requieren `X-Requested-With: undc-web`; cookies de sesión HttpOnly y SameSite Strict, Secure en producción. No se almacenan tokens en localStorage.

| Método y ruta | Función |
| --- | --- |
| GET /public/event | Catálogos y enlaces del evento, sin datos de inscritos |
| GET /public/documents/:id | Bases y formatos oficiales (bases, formatos) |
| POST /public/formats/:kind | PDF con datos para firma; roster, fitness, responsibility, índice individual en index |
| POST /public/registrations | Inscripción pública multipart: data JSON, roster y fitness_N/responsibility_N por deportista (índice desde 0) |
| POST /sessions; GET /sessions/me; DELETE /sessions | Ingreso, sesión y salida |
| PUT /sessions/password | Cambio personal de contraseña; revoca sesiones |
| GET /catalogs | Escuelas, categorías y torneo |
| PUT /tournaments/:id | Fechas y subsanaciones (comisión/admin) |
| GET, POST /users; PATCH /users/:id | Consulta, alta, activación y restablecimiento (alta/cambios: admin) |
| GET, POST /teams; GET /teams/:id | Listado, creación y detalle |
| POST /teams/:id/athletes | Registrar deportista en nómina |
| PUT /teams/:id/athletes/:participationId | Corregir identidad; invalida formatos firmados afectados |
| DELETE /teams/:id/athletes/:participationId | Retirar deportista y liberar cupo |
| POST /teams/:id/documents; GET /documents/:id | Adjuntar y descargar documentos privados |
| GET /teams/:id/formats/:kind | PDF: roster, fitness, responsibility, control; los individuales usan participationId |
| POST /teams/:id/submit | Enviar expediente |
| POST /teams/:id/reviews | Observar o aprobar con controles y versión vigente |
| POST /teams/:id/reopen | Reabrir aprobado con motivo |

Listados: `page`, `pageSize` (máximo 100); equipos admiten `status`, `schoolId`, `categoryId`; usuarios admiten `role`. Respuesta: `{items,total,page,pageSize}`. Errores: `{message,errors?}`; estados 401, 403, 404, 409 y 422 según corresponda.

## Consistencia y almacenamiento

El envío público es atómico: guarda equipo, contacto del delegado, nómina, documentos y auditoría; si falla una validación, revierte la transacción y elimina los archivos temporales. Se limita la frecuencia de envíos públicos y se escriben los adjuntos en disco para evitar mantener el expediente completo en memoria.

La API bloquea la fila del torneo con `SELECT ... FOR UPDATE` dentro de cada transacción de nómina, revisión o configuración. Esto serializa altas incluso cuando el estudiante todavía no existe y evita la tercera disciplina por carreras. Las identidades tienen restricciones únicas por DNI y código. La aprobación comprueba nuevamente los requisitos y usa la versión del expediente para rechazar revisiones obsoletas.

Los archivos se almacenan fuera del contenido público, en `backend/storage`, bajo nombres aleatorios; se valida tamaño y firma de tipo de archivo. Las descargas comprueban el acceso al equipo. El proxy inverso nunca debe exponer esa carpeta. Los adjuntos reemplazados o retirados se eliminan después de confirmar la transacción. Si se interrumpe el proceso durante una carga puede quedar un archivo huérfano; debe compararse el almacenamiento contra Document antes de eliminarlo. No elimine archivos activos por antigüedad.

## Verificación

```powershell
pnpm build
pnpm test
```

Las pruebas unitarias/HTTP no requieren una base activa. Para las pruebas de integración reales con MySQL, consulte `backend/tests/README.md`; cubren transacciones concurrentes y el recorrido del expediente. Nunca utilice la base operativa para pruebas.

## Compilación y operación

```powershell
pnpm build
pnpm --filter @undc/backend start
```

Sirva `frontend/dist` con un servidor estático que resuelva rutas SPA a `index.html` y redirija `/api` a Express. Use HTTPS, `NODE_ENV=production` y `FRONTEND_ORIGIN` con el origen real. Express debe permanecer detrás del proxy o limitado a la red autorizada. No habilite confianza en cabeceras de proxy sin configurar el número real de saltos. La configuración actual de rate limiting usa la dirección de conexión directa.

Las sesiones duran 12 horas por defecto (`SESSION_HOURS`); cambiar contraseña, desactivar usuario o restablecer acceso revoca sus sesiones. La comisión ve datos personales: otorgue acceso solo a responsables autorizados. Establezca con la organización el plazo de conservación y los canales para incidencias antes de una publicación institucional.

### Respaldo y restauración

Detenga temporalmente las escrituras para obtener una copia consistente de base y archivos. Mantenga los respaldos fuera del directorio público y con acceso restringido. Desde las utilidades de MySQL, usando `--result-file` para evitar problemas de codificación de PowerShell:

```powershell
mysqldump --user=undc --password --single-transaction --result-file=undc-respaldo.sql undc_deportes
Compress-Archive -Path backend/storage -DestinationPath adjuntos-respaldo.zip
```

Para restaurar, detenga la API, restaure el SQL con el cliente MySQL (`SOURCE` dentro de su consola), reponga la carpeta `backend/storage`, revise DATABASE_URL y STORAGE_DIR, y reinicie la API. Base de datos y adjuntos deben proceder del mismo punto de respaldo. Nunca guarde contraseñas ni respaldos en Git.

## Fuera de esta versión

Fixtures, resultados, sanciones, reclamos, firma electrónica, autorregistro de cuentas e integración académica. Las correcciones de identidad requieren acceso a todos los equipos afectados y que estén editables; invalidan fichas y declaraciones para que se vuelvan a firmar. No se permite cambiar la escuela de una identidad existente. Las discrepancias deben revisarse con la comisión.
