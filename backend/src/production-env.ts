export function validateProductionEnvironment(env: NodeJS.ProcessEnv) {
  const origin = new URL(env.FRONTEND_ORIGIN || '');
  if (origin.protocol !== 'https:' || origin.origin !== env.FRONTEND_ORIGIN) throw new Error('FRONTEND_ORIGIN debe ser HTTPS, sin ruta ni barra final.');
  const database = new URL(env.DATABASE_URL || '');
  if (database.protocol !== 'mysql:' || !database.hostname || !database.username || !database.password || database.pathname.length < 2) throw new Error('DATABASE_URL debe incluir servidor, usuario, contraseña y base MySQL.');
  if (/REEMPLAZAR|PEGA_|SECRETO_HEXADECIMAL|CAMBIAR_PASSWORD/i.test(decodeURIComponent(database.password))) throw new Error('Sustituya la contraseña de ejemplo antes de desplegar.');
}
