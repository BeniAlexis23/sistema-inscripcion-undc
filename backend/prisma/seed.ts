import 'dotenv/config';
import { PrismaClient, Discipline, Gender } from '@prisma/client';
const prisma = new PrismaClient();
try {
  for (const name of ['Agronomía', 'Administración', 'Administración de Turismo y Hotelería', 'Contabilidad', 'Derecho y Ciencias Políticas', 'Ingeniería de Sistemas']) {
    await prisma.school.upsert({ where: { name }, create: { name }, update: {} });
  }
  const entries: [string, Discipline, Gender][] = [
    ['Futsal Varones', 'FUTSAL', 'MALE'], ['Futsal Damas', 'FUTSAL', 'FEMALE'],
    ['Vóleibol Varones', 'VOLLEYBALL', 'MALE'], ['Vóleibol Damas', 'VOLLEYBALL', 'FEMALE'],
    ['Ajedrez por equipos', 'CHESS', 'MIXED'], ['Básquetbol Varones', 'BASKETBALL', 'MALE'], ['Básquetbol Damas', 'BASKETBALL', 'FEMALE'],
  ];
  for (const [name, discipline, gender] of entries) await prisma.category.upsert({ where: { discipline_gender: { discipline, gender } }, create: { name, discipline, gender }, update: {} });
  await prisma.tournament.upsert({ where: { id: 1 }, create: { id: 1, name: 'XVII Aniversario Institucional UNDC 2026', semester: '2026-II', opensAt: new Date('2026-11-06T00:00:00-05:00'), closesAt: new Date('2026-11-19T23:59:00-05:00') }, update: {} });
  console.log('Catálogos cargados. Fechas iniciales propuestas: revisar con la comisión.');
} finally { await prisma.$disconnect(); }
