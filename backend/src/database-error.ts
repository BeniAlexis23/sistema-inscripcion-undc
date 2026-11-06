export function databaseError(error: unknown): string {
  const code = (error as { errorCode?: string; code?: string })?.errorCode || (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    P1000: 'MySQL rechazó las credenciales. Revise DATABASE_URL en backend/.env.',
    P1001: 'No se puede conectar con MySQL. Inicie el servidor y compruebe el host y puerto de DATABASE_URL.',
    P1003: 'La base de datos no existe. Créela antes de ejecutar pnpm db:migrate.',
    P1010: 'El usuario MySQL no tiene permisos para esta base de datos.',
    P1012: 'Revise la configuración DATABASE_URL de backend/.env y ejecute pnpm db:generate.',
    P2021: 'Faltan tablas. Ejecute pnpm db:migrate y pnpm db:seed.',
    P2022: 'El esquema está desactualizado. Ejecute pnpm db:migrate.',
  };
  return messages[code || ''] || 'No se pudo iniciar la conexión. Ejecute pnpm db:check para revisar MySQL y las migraciones.';
}
