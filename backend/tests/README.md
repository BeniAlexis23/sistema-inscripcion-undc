# Pruebas MySQL

Use una base exclusiva cuyo nombre termine en `_test`. Cree la base, configure `TEST_DATABASE_URL` en `backend/.env` y aplique las migraciones y seed usando esa URL como DATABASE_URL. Nunca apunte a la base operativa.

```powershell
# Desde la raíz. Utilice las credenciales de su servidor de pruebas.
$env:TEST_DATABASE_URL = 'mysql://usuario:CONTRASENA@localhost:3306/undc_deportes_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
pnpm db:migrate
pnpm db:seed
pnpm test
```

Las pruebas de integración se omiten cuando TEST_DATABASE_URL no está definida. Eliminan sus equipos y usuarios de prueba al terminar y requieren catálogos previamente cargados. El comando completo se debe ejecutar con acceso a conexiones de red locales.
