import { prisma } from './config.js';
import { databaseError } from './database-error.js';
import { Prisma } from '@prisma/client';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { teamDetailsShape } from './validation.js';
try {
  await prisma.$connect();
  const expected = Object.keys(teamDetailsShape);
  const generatedFields = new Set(Prisma.dmmf.datamodel.models.find(model => model.name === 'Team')?.fields.map(field => field.name));
  const missingClient = expected.filter(field => !generatedFields.has(field));
  if (missingClient.length) throw new Error('El cliente Prisma está desactualizado. Detenga el backend y ejecute pnpm db:sync.');
  const directories = await readdir(fileURLToPath(new URL('../prisma/migrations/', import.meta.url)), { withFileTypes: true });
  const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
  const applied = new Set(migrations.filter(m => m.finished_at && !m.rolled_back_at).map(m => m.migration_name));
  const pending = directories.filter(d => d.isDirectory() && !applied.has(d.name));
  if (pending.length) throw new Error(`Hay migraciones pendientes: ${pending.map(d => d.name).join(', ')}. Detenga el backend y ejecute pnpm db:sync.`);
  const columns = await prisma.$queryRaw<{ COLUMN_NAME: string }[]>`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Team'`;
  const fields = new Set(columns.map(c => c.COLUMN_NAME));
  if (expected.some(field => !fields.has(field))) throw new Error('La tabla de equipos no coincide con la actualización. Ejecute pnpm db:migrate y revise el esquema.');
  const [schools, categories, tournament] = await Promise.all([prisma.school.count(), prisma.category.count(), prisma.tournament.findFirst()]);
  console.log(`Conexión, migraciones y cliente Prisma correctos. Escuelas: ${schools}; categorías: ${categories}; torneo: ${tournament ? 'configurado' : 'sin configurar'}.`);
  if (schools !== 6 || categories !== 7 || !tournament) console.log('Complete los catálogos con pnpm db:seed.');
} catch (error) {
  const known = error instanceof Error && (error.message.startsWith('El cliente Prisma') || error.message.startsWith('Hay migraciones pendientes') || error.message.startsWith('La tabla de equipos'));
  console.error(known ? (error as Error).message : databaseError(error)); process.exitCode = 1;
} finally { await prisma.$disconnect(); }
