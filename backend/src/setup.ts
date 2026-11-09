import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import { prisma } from './config.js';
import { userSchema } from './validation.js';
import { assert } from './rules.js';

export const setupRouter = Router();
setupRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
setupRouter.get('/', async (_req, res) => {
  if (process.env.NODE_ENV === 'production') return res.json({ available: false });
  res.json({ available: await prisma.user.count({ where: { role: 'ADMIN' } }) === 0 });
});
setupRouter.post('/', rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  assert(process.env.NODE_ENV !== 'production', 'Cree el administrador mediante el comando local admin:create.', 403);
  assert(await prisma.user.count({ where: { role: 'ADMIN' } }) === 0, 'La configuración inicial ya se completó.', 409);
  // Never accept a role or school supplied by the caller.
  const { password, ...data } = userSchema.parse({ ...req.body, role: 'ADMIN', schoolId: null });
  const passwordHash = await argon2.hash(password);
  const tournament = await prisma.tournament.findFirst({ orderBy: { id: 'asc' } });
  assert(tournament, 'Primero cargue los catálogos del sistema con pnpm db:seed.', 409);
  await prisma.$transaction(async tx => {
    // Serialize bootstrap requests so only one of two simultaneous submissions wins.
    await tx.$queryRaw`SELECT id FROM Tournament WHERE id = ${tournament.id} FOR UPDATE`;
    assert(await tx.user.count({ where: { role: 'ADMIN' } }) === 0, 'La configuración inicial ya se completó.', 409);
    const user = await tx.user.create({ data: { ...data, passwordHash } });
    await tx.audit.create({ data: { actorId: user.id, action: 'ADMIN_BOOTSTRAPPED', details: {} } });
  });
  res.status(201).json({ message: 'Administrador creado. Ya puede iniciar sesión.' });
});
