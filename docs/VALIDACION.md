# Verificación de la primera versión

Fecha: 6 de noviembre de 2026. Entorno: Windows, Node.js 24 y MySQL 8.4.3.

- Compilación TypeScript de frontend y backend y compilación Vite completadas.
- 10 pruebas automatizadas aprobadas: reglas, permisos HTTP, flujo real de expediente, acceso privado a adjuntos, corrección de identidad y concurrencia de inscripciones.
- Migración inicial y catálogos aplicados sobre una instancia MySQL aislada en el puerto 3317; no se utilizaron bases existentes.
- Prueba de navegador con datos ficticios: crear equipo, registrar deportista, adjuntar tres documentos, enviar, observar, reenviar y aprobar.
- Navegación de panel, equipos, revisión, usuarios, configuración y contraseña sin errores de JavaScript. Capturas revisadas en escritorio (1440 px) y móvil (390 px); sin desbordamiento horizontal en el panel móvil.
- Los cuatro formatos PDF se generaron, renderizaron y revisaron visualmente; se incluyó una prueba de paginación con nombres extensos.
- Auditoría de dependencias al finalizar la instalación inicial: cero vulnerabilidades reportadas. El lockfile fija las dependencias verificadas; se deben reevaluar al actualizar.

La verificación emplea identidades y documentos ficticios: no demuestra matrícula institucional, autenticidad de firmas ni validez médica. Esas comprobaciones siguen siendo manuales conforme al diseño. Antes del uso operativo se debe configurar la base propia, crear el administrador y confirmar las fechas de inscripción.

## Migración a pnpm

- Gestor fijado en pnpm 11.25.0, workspace con frontend y backend y lockfile compartido.
- `pnpm install --frozen-lockfile`, `pnpm db:generate` y `pnpm build` completados correctamente.
- Migraciones, carga inicial y creación del administrador por stdin verificadas mediante los scripts de pnpm sobre la base aislada.
- `pnpm test`: 10 pruebas aprobadas con MySQL; `pnpm audit`: sin vulnerabilidades conocidas.
- Scripts y documentación actualizados; retirado el lockfile del gestor anterior.

## Portada e inscripción públicas

- `/` presenta el evento, fechas, sede, disciplinas y documentos oficiales; `/inscripcion` permite registrar el equipo sin cuenta ni sesión. `/admin` conserva el acceso mediante contraseña.
- Migración adicional aplicada en la base aislada: los equipos públicos guardan el contacto del delegado y un código de recepción sin generar usuarios.
- 13 pruebas aprobadas con MySQL: incluye documentos públicos, recepción sin sesión, adjuntos privados, revisión administrativa y límite de disciplinas ante envíos públicos simultáneos.
- Navegador: formulario de cuatro pasos, generación de PDF, adjuntos, confirmación explícita, constancia y aprobación administrativa comprobados con datos ficticios.
- Portada y formulario revisados a 1440 px y 390 px sin desbordamiento horizontal. Panel cargado de forma diferida para separar su código de la entrada pública.
- Las observaciones se gestionan por la comisión con los datos de contacto registrados; no se implementan envíos automáticos ni consultas públicas de información personal.

## Formulario único e identidad institucional

- Retirada la landing: la raíz contiene información breve, enlaces y el formulario por pasos; `/inscripcion` redirige a la raíz.
- Escudo original incorporado al navbar y al panel; paleta azul con degradado de referencia y primario `#14569b`.
- Configuración administrativa de enlaces de bases, formatos y documentación adicional; se reflejan también en el consentimiento y la descarga de modelos. Los campos vacíos conservan los PDF locales.
- Tercera migración verificada; 16 pruebas aprobadas con MySQL, incluyendo persistencia, permisos y validación de los enlaces.
- Navegador: inscripción completa sin sesión, escudo cargado, panel separado y guardado de enlaces comprobados. Configuración ficticia restaurada al finalizar.
- Vista azul revisada en instancia nueva, con capturas de escritorio y móvil y sin desbordamiento a 390 y 320 px. Un servidor Vite abierto antes del cambio conservó el CSS anterior; reiniciar desarrollo actualiza la paleta.
- Se detectó P1000 en la conexión habitual; quedó resuelto posteriormente mediante la configuración local descrita abajo.

## Conexión local y arranque del backend

- Causa comprobada: contraseña de ejemplo en `backend/.env` y ausencia de la base `undc_deportes`; MySQL 8.4.3 sí estaba activo en el puerto 3306.
- Creadas las bases principal y de pruebas y una cuenta exclusiva con contraseña aleatoria y permisos limitados a esas bases. Credenciales guardadas únicamente en el archivo local de entorno.
- Tres migraciones y catálogos aplicados en ambas bases. Conexión principal verificada con seis escuelas, siete categorías y torneo configurado.
- API en puerto 4000 comprobada mediante `/api/v1/health` y `/api/v1/public/event`.
- Compilación correcta y 16 pruebas aprobadas con la nueva configuración.
- Agregado `pnpm db:check`, carga estable del archivo de entorno y mensajes de inicio sin contraseñas para errores de autenticación, conexión, esquema o puerto ocupado.

## Formatos PDF institucionales

- Membrete extraído del PDF original de formatos, conservando escudo, identificación de la universidad, subcomisión y Servicio de Deportes.
- Cuatro formatos adaptados al diseño de referencia: ficha del equipo, aptitud física, responsabilidad y control documentario; campos sombreados, títulos centrados, tablas azules y espacios para firmas.
- Los cuatro ejemplos habituales se generaron en una página A4 cada uno y se revisaron visualmente tras renderizarlos. Ejemplos ficticios en `output/pdf/`.
- Probados nombres extensos: membrete y encabezados repetidos, conservación de los 12 códigos y la declaración del delegado, y ausencia de páginas vacías producidas por el pie.
- Compilación del backend y 21 pruebas aprobadas, incluidas cinco nuevas comprobaciones de membrete, salida PDF y paginación.
