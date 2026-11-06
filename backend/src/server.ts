import { app } from './app.js';
import { config, prisma } from './config.js';
import { databaseError } from './database-error.js';
try {
  await prisma.$connect();
  const server = app.listen(config.port, () => console.log(`API UNDC: http://localhost:${config.port}/api/v1`));
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE' ? `El puerto ${config.port} ya está ocupado. Cierre la otra instancia o cambie PORT en backend/.env.` : 'No se pudo abrir el puerto de la API.');
    void prisma.$disconnect().then(() => process.exit(1));
  });
  const shutdown = () => { server.close(() => { void prisma.$disconnect().then(() => process.exit(0)); }); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(databaseError(error)); await prisma.$disconnect(); process.exitCode = 1;
}
