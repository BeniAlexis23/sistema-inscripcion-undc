import { prisma } from './config.js';
import { databaseError } from './database-error.js';
try {
  await prisma.$connect();
  const [schools, categories, tournament] = await Promise.all([prisma.school.count(), prisma.category.count(), prisma.tournament.findFirst()]);
  console.log(`Conexión MySQL correcta. Escuelas: ${schools}; categorías: ${categories}; torneo: ${tournament ? 'configurado' : 'sin configurar'}.`);
  if (schools !== 6 || categories !== 7 || !tournament) console.log('Complete los catálogos con pnpm db:seed.');
} catch (error) {
  console.error(databaseError(error)); process.exitCode = 1;
} finally { await prisma.$disconnect(); }
