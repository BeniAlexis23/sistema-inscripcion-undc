# Verificación de la primera versión

## Módulo de personal — 12/11/2026

- Registro completo en PDF: vista previa automática tras enviar, descarga explícita y recuperación posterior. Acceso público solo mediante clave privada; acceso administrativo restringido a comisión/administración. Pruebas de paginación con diez integrantes y nombres extensos. Total actualizado: 70 pruebas aprobadas y compilación correcta.

- 67 pruebas aprobadas y compilación completa correcta. Se mantienen las pruebas de pregrado.
- Migración aditiva aplicada en las bases locales principal y de pruebas; no se alteran tablas ni registros de pregrado.
- Validaciones de máximo diez integrantes, sexo en futsal, combinaciones de vóleibol, DNI/CE, agrupación de dependencias y documentos requeridos.
- Integración MySQL: recepción completa, ausencia de reserva para incompletos, acceso privado, rechazo a delegados de pregrado, token privado, observación/subsanación, reapertura auditada y cierre de plazo.
- Identidad simultánea en una categoría y aprobaciones concurrentes sobre el último cupo verificadas; no se excede el aforo.
- Navegador con API aislada y base exclusiva de pruebas: móvil/escritorio, generación de ficha, carga de cinco adjuntos, recepción, revisión, enlace privado, subsanación y aprobación. Registros ficticios eliminados al finalizar.
- Cuatro formatos generados sobre las páginas originales y renderizados para inspección visual; membrete, contenido y espacios de firma conservados.
- Despliegue remoto pendiente de subir cambios y redesplegar en Dokploy. No requiere reiniciar volúmenes ni modificar secretos.

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

## Actualización entre equipos - 9 de noviembre de 2026

- Causa del bloqueo: migración `202611060004_team_details` pendiente y cliente Prisma local anterior al modelo con nombre, ciclo, turno y sección. La conexión MySQL funcionaba, pero la compilación y el guardado usaban esquemas distintos.
- Migración aditiva aplicada en la base principal y la base de pruebas; cliente regenerado tras detener brevemente el backend para liberar el motor DLL de Windows. Backend principal reiniciado en el puerto 4000.
- `pnpm db:check` ahora revisa migraciones, cliente generado y columnas del equipo, además de conexión y catálogos. Nuevo comando `pnpm db:sync` y procedimiento de actualización documentado en README.
- 38 pruebas aprobadas y compilación completa correcta. La prueba de integración comprueba explícitamente la persistencia de los cuatro datos nuevos.
- Navegador contra API aislada en el puerto 4011: vista previa de ficha, envío con tres documentos, registro en MySQL, descarga de constancia y consulta desde Equipos inscritos. Los registros ficticios se eliminan al terminar; no se insertaron en la base principal.
- Revisado el bloqueo de configuración inicial: la búsqueda previa del torneo se movió fuera de la transacción para que la comprobación de administradores ocurra después de adquirir el bloqueo y no use una instantánea anterior.

## Acciones de deportistas en Equipos inscritos

- Botones con iconos y texto Editar/Eliminar visibles en la columna Acciones. Administradores y comisión pueden operar sobre expedientes en revisión; los aprobados muestran las acciones deshabilitadas hasta reabrirlos.
- Las correcciones en revisión cambian el expediente a observado, invalidan documentos afectados y registran revisión y auditoría dentro de la transacción. Las identidades compartidas se comprueban en todos sus equipos y no se permite alterar un aprobado por una vía indirecta.
- Confirmación obligatoria antes de retirar un deportista; se eliminan su participación, documentos y seguimiento asociado en ese equipo. Se conservan otras participaciones, las revisiones generales y el historial de los demás. Al retirar su última participación se elimina también su identidad.
- 41 pruebas aprobadas y compilación completa correcta, con cobertura de permisos, plazos, edición, eliminación y protección de aprobados. Se verifica el borrado físico de adjuntos y la conservación de los archivos de otros deportistas.
- Reenvío público de un equipo vacío: reutiliza el borrador público sin duplicar escuela/categoría, genera nueva constancia y registra nómina y adjuntos. Se comprueba que una inscripción activa o con revisiones no pueda sobrescribirse y que el conflicto indique la escuela/categoría.
- Navegador contra API aislada: editar un deportista, confirmar la eliminación de otro, comprobar estado observado/auditoría y habilitación de adjuntos para subsanar. Solo se utilizaron registros ficticios en la base de pruebas.
