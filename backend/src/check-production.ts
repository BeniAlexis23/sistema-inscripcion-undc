import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config, prisma } from './config.js';
import { validateProductionEnvironment } from './production-env.js';

try {
  validateProductionEnvironment(process.env);
  await access(path.join(config.frontendDist, 'index.html'));
  await access(path.join(config.publicDocuments, 'bases-torneo-undc-2026.pdf'));
  await access(path.join(config.publicDocuments, 'formatos-torneo-undc-2026.pdf'));
  await access(path.join(config.publicDocuments, 'bases-personal-undc-2026.pdf'));
  await access(path.join(config.publicDocuments, 'formatos-personal-undc-2026.pdf'));
  await mkdir(config.storage, { recursive: true });
  const probe = path.join(config.storage, `.startup-${randomUUID()}`);
  await writeFile(probe, 'ok', { flag: 'wx' });
  await unlink(probe);
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  console.log('Producción: origen HTTPS, frontend, documentos, almacenamiento y acceso MySQL verificados.');
} catch (error) {
  const code = (error as { errorCode?: string; code?: string }).errorCode || (error as { code?: string }).code;
  if (code === 'P1000') console.error('MySQL rechaza las credenciales. El volumen conserva las contraseñas del primer arranque; cambiar Environment no las actualiza. Recupere las credenciales o reinicialice únicamente mysql_data si autorizó perder esa base.');
  else if (code === 'P1001') console.error('No se puede conectar con MySQL. Revise el servicio mysql, puerto 3306 y red privada.');
  else if (code === 'P1003' || code === 'P1010') console.error('La base MySQL no existe o el usuario no tiene permisos. Revise la inicialización del volumen.');
  else if (code === 'EACCES') console.error('El contenedor no puede leer los recursos o escribir en los adjuntos. Revise permisos: usuario node, UID/GID 1000.');
  else if (code === 'ENOENT') console.error('Falta el frontend compilado o un PDF público en la imagen. Reconstruya desde el Dockerfile del repositorio.');
  else if (error instanceof Error && /^(FRONTEND_ORIGIN|DATABASE_URL|Sustituya la contraseña)/.test(error.message)) console.error(error.message);
  else console.error(code ? `Validación de producción falló (${code}).` : 'Revise FRONTEND_ORIGIN y DATABASE_URL y los recursos de la imagen. Falló la validación de producción.');
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
