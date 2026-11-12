import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';
import { config, prisma } from './config.js';
import { authenticate, cookieOptions, createSession, currentUser, hashToken, publicUser, roles } from './auth.js';
import { assert, CHECK_KEYS, checkEditable, checkWindow, HttpError } from './rules.js';
import { reviewSchema, settingsSchema, userSchema } from './validation.js';
import { addAthlete, editAthlete, removeAthlete, audit, changeStatus, getTeam, validateSubmission, withTeam } from './services.js';
import { makePdf } from './pdf.js';
import { publicRouter } from './public.js';
import { setupRouter } from './setup.js';
import { reportsRouter } from './reports.js';
import { staffPublic, staffAdmin } from './staff.js';
import { presentTeam } from './services.js';
import { detectMime } from './uploads.js';
export { detectMime } from './uploads.js';

export const app = express();
app.disable('x-powered-by');
// Production is reachable only through Dokploy's Traefik proxy (one hop).
if (config.production) app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.origin, credentials: true }));
app.use(express.json({ limit: '100kb' }), cookieParser());
// Mutations require a same-origin custom header. Browsers cannot forge this in a form POST.
app.use((req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.get('X-Requested-With') !== 'undc-web' || (req.get('Origin') && req.get('Origin') !== config.origin)) {
      return next(new HttpError(403, 'Origen de solicitud no permitido.'));
    }
  }
  next();
});
const api = express.Router();
app.use('/api/v1', api);
api.use('/public', publicRouter);
api.use('/public/staff', staffPublic);
api.use('/setup', setupRouter);
const idOf = (value: unknown) => z.coerce.number().int().positive().parse(value);
const paging = (query: Record<string, unknown>) => ({
  page: z.coerce.number().int().min(1).max(100000).default(1).parse(query.page),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).parse(query.pageSize),
});
api.get('/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.set('Cache-Control', 'no-store').json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});
api.post('/sessions', rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiados intentos. Vuelva a intentarlo en 15 minutos.' } }), async (req, res) => {
  const input = z.object({ email: z.email().transform(s => s.toLowerCase()), password: z.string().max(128) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // A fixed dummy hash avoids exposing whether the email exists through fast failure.
  const hash = user?.passwordHash || await dummyHash;
  const valid = await argon2.verify(hash, input.password);
  assert(user && valid && user.active, 'Correo o contraseña incorrectos.', 401);
  const { token, expiresAt } = await createSession(user.id);
  res.cookie('undc_session', token, { ...cookieOptions, expires: expiresAt }).json(publicUser(user));
});
const dummyHash = argon2.hash(randomUUID());
api.use(authenticate);
api.use('/staff', staffAdmin);
api.use('/reports', reportsRouter);
api.get('/sessions/me', (req, res) => { res.json(publicUser(currentUser(req))); });
api.delete('/sessions', async (req, res) => {
  await prisma.session.deleteMany({ where: { id: hashToken(req.cookies.undc_session) } });
  res.clearCookie('undc_session', cookieOptions).sendStatus(204);
});
api.put('/sessions/password', async (req, res) => {
  const data = z.object({ currentPassword: z.string().max(128), password: z.string().min(6).max(128) }).parse(req.body);
  const user = currentUser(req);
  assert(await argon2.verify(user.passwordHash, data.currentPassword), 'La contraseña actual es incorrecta.', 403);
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(data.password) } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await audit(tx, user, 'PASSWORD_CHANGED');
  });
  res.clearCookie('undc_session', cookieOptions).sendStatus(204);
});
api.get('/catalogs', async (_req, res) => {
  const [schools, categories, tournament] = await Promise.all([prisma.school.findMany({ orderBy: { name: 'asc' } }), prisma.category.findMany({ orderBy: { id: 'asc' } }), prisma.tournament.findFirst({ orderBy: { id: 'asc' } })]);
  res.json({ schools, categories, tournament });
});
api.put('/tournaments/:id', roles('ADMIN', 'COMMISSION'), async (req, res) => {
  const id = idOf(req.params.id), data = settingsSchema.parse(req.body), user = currentUser(req);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Tournament WHERE id = ${id} FOR UPDATE`;
    const tournament = await tx.tournament.update({ where: { id }, data: { ...data, opensAt: new Date(data.opensAt), closesAt: new Date(data.closesAt) } });
    await audit(tx, user, 'TOURNAMENT_UPDATED', undefined, data); return tournament;
  });
  res.json(result);
});
api.get('/users', roles('ADMIN', 'COMMISSION'), async (req, res) => {
  const { page, pageSize } = paging(req.query);
  const role = z.enum(['ADMIN', 'COMMISSION', 'DELEGATE']).optional().parse(req.query.role);
  const where = { ...(role ? { role } : {}) };
  const [rows, total] = await prisma.$transaction([prisma.user.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: 'desc' } }), prisma.user.count({ where })]);
  res.json({ items: rows.map(publicUser), total, page, pageSize });
});
api.post('/users', roles('ADMIN'), async (req, res) => {
  const { password, ...data } = userSchema.parse(req.body), actor = currentUser(req);
  const user = await prisma.$transaction(async tx => {
    const created = await tx.user.create({ data: { ...data, schoolId: data.role === 'DELEGATE' ? data.schoolId : null, passwordHash: await argon2.hash(password) } });
    await audit(tx, actor, 'USER_CREATED', undefined, { userId: created.id, role: created.role }); return created;
  });
  res.status(201).json(publicUser(user));
});
api.patch('/users/:id', roles('ADMIN'), async (req, res) => {
  const id = idOf(req.params.id), actor = currentUser(req);
  const input = z.object({ active: z.boolean().optional(), password: z.string().min(6).max(128).optional() }).refine(d => d.active !== undefined || !!d.password).parse(req.body);
  assert(id !== actor.id, 'Use el cambio de contraseña personal; no puede desactivar su propia cuenta.');
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id }, data: { active: input.active, ...(input.password ? { passwordHash: await argon2.hash(input.password) } : {}) } });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, actor, 'USER_UPDATED', undefined, { userId: id, active: input.active ?? null, passwordReset: !!input.password });
  });
  res.sendStatus(204);
});
api.get('/teams', async (req, res) => {
  const user = currentUser(req), { page, pageSize } = paging(req.query);
  const status = z.enum(['DRAFT', 'SUBMITTED', 'OBSERVED', 'APPROVED']).optional().parse(req.query.status);
  const schoolId = req.query.schoolId ? idOf(req.query.schoolId) : undefined;
  const categoryId = req.query.categoryId ? idOf(req.query.categoryId) : undefined;
  const where: Prisma.TeamWhereInput = { ...(user.role === 'DELEGATE' ? { delegateId: user.id, schoolId: user.schoolId! } : { schoolId }), status, categoryId };
  const [items, total] = await prisma.$transaction([
    prisma.team.findMany({ where, include: { school: true, category: true, delegate: { select: { name: true } }, _count: { select: { participations: true, documents: true } } }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' } }),
    prisma.team.count({ where }),
  ]);
  const counts = await prisma.team.groupBy({ by: ['status'], where: user.role === 'DELEGATE' ? { delegateId: user.id, schoolId: user.schoolId! } : {}, _count: true });
  res.json({ items: items.map(presentTeam), total, page, pageSize, counts });
});
api.post('/teams', async (req, res) => {
  const user = currentUser(req);
  const input = z.object({ categoryId: z.number().int().positive(), delegateId: z.number().int().positive().optional() }).parse(req.body);
  const delegate = user.role === 'DELEGATE' ? user : await prisma.user.findUnique({ where: { id: input.delegateId || 0 } });
  assert(delegate && delegate.active && delegate.role === 'DELEGATE' && delegate.schoolId, 'Seleccione un delegado activo con escuela asignada.');
  const tournament = await prisma.tournament.findFirst({ orderBy: { id: 'asc' } }); assert(tournament, 'Ejecute la carga inicial de catálogos.', 409);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Tournament WHERE id = ${tournament.id} FOR UPDATE`;
    const t = await tx.tournament.findUniqueOrThrow({ where: { id: tournament.id } }); checkWindow(t, 'DRAFT');
    const team = await tx.team.create({ data: { tournamentId: t.id, schoolId: delegate.schoolId!, delegateId: delegate.id, categoryId: input.categoryId } });
    await audit(tx, user, 'TEAM_CREATED', team.id); return team;
  });
  res.status(201).json(result);
});
api.get('/teams/:id', async (req, res) => { res.json(await getTeam(idOf(req.params.id), currentUser(req))); });
api.post('/teams/:id/athletes', async (req, res) => { res.status(201).json(await addAthlete(idOf(req.params.id), currentUser(req), req.body)); });
api.put('/teams/:id/athletes/:participationId', async (req, res) => {
  await editAthlete(idOf(req.params.id), idOf(req.params.participationId), currentUser(req), req.body); res.sendStatus(204);
});
api.delete('/teams/:id/athletes/:participationId', async (req, res) => {
  await removeAthlete(idOf(req.params.id), idOf(req.params.participationId), currentUser(req));
  res.sendStatus(204);
});
api.post('/teams/:id/submit', async (req, res) => {
  const id = idOf(req.params.id), user = currentUser(req);
  await withTeam(id, user, async (tx, team) => {
    await validateSubmission(tx, team); await changeStatus(tx, team, 'SUBMITTED'); await audit(tx, user, 'TEAM_SUBMITTED', id);
  }, true); res.sendStatus(204);
});
api.post('/teams/:id/reviews', roles('ADMIN', 'COMMISSION'), async (req, res) => {
  const id = idOf(req.params.id), user = currentUser(req), data = reviewSchema.parse(req.body);
  await withTeam(id, user, async (tx, team) => {
    assert(team.status === 'SUBMITTED', 'Solo se revisan expedientes enviados.', 409);
    assert(team.version === data.version, 'El expediente cambió. Actualice la página antes de revisar.', 409);
    if (data.result === 'APPROVED') {
      assert(CHECK_KEYS.every(key => data.checks[key]), 'Complete todos los controles obligatorios antes de aprobar.');
      await validateSubmission(tx, team);
    } else assert(data.notes.length > 0, 'Indique las observaciones que deben subsanarse.');
    await tx.review.create({ data: { teamId: id, reviewerId: user.id, result: data.result, checks: data.checks, notes: data.notes } });
    await changeStatus(tx, team, data.result); await audit(tx, user, `TEAM_${data.result}`, id, { notes: data.notes });
  }); res.sendStatus(204);
});
api.post('/teams/:id/reopen', roles('ADMIN', 'COMMISSION'), async (req, res) => {
  const id = idOf(req.params.id), user = currentUser(req), data = z.object({ reason: z.string().trim().min(5).max(4000) }).parse(req.body);
  await withTeam(id, user, async (tx, team) => {
    assert(team.status === 'APPROVED', 'Solo se reabren expedientes aprobados.', 409);
    await changeStatus(tx, team, 'OBSERVED');
    await tx.review.create({ data: { teamId: id, reviewerId: user.id, result: 'OBSERVED', checks: {}, notes: data.reason } });
    await audit(tx, user, 'TEAM_REOPENED', id, { reason: data.reason });
  }); res.sendStatus(204);
});
// Memory storage is bounded; validated files are written under random, private names.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3, parts: 4 } });
api.post('/teams/:id/documents', upload.single('file'), async (req, res) => {
  const id = idOf(req.params.id), user = currentUser(req);
  const kind = z.enum(['ROSTER', 'FITNESS', 'RESPONSIBILITY']).parse(req.body.kind);
  const participationId = req.body.participationId ? idOf(req.body.participationId) : null;
  assert(req.file && req.file.size > 0, 'Seleccione un archivo.');
  const mime = detectMime(req.file.buffer); assert(mime && mime === req.file.mimetype, 'Solo se admiten archivos PDF, JPG o PNG válidos.');
  const storageName = randomUUID();
  await mkdir(config.storage, { recursive: true });
  await writeFile(path.join(config.storage, storageName), req.file.buffer, { flag: 'wx' });
  try {
    const originalName = path.basename(req.file.originalname).replace(/[\x00-\x1f]/g, '').slice(0, 255);
    const result = await withTeam(id, user, async (tx, team) => {
      assert(kind === 'ROSTER' ? participationId === null : team.participations.some(p => p.id === participationId), 'El documento no corresponde a un deportista del equipo.');
      const old = await tx.document.findMany({ where: { teamId: id, kind, participationId } });
      await tx.document.deleteMany({ where: { id: { in: old.map(d => d.id) } } });
      const created = await tx.document.create({ data: { teamId: id, kind, participationId, originalName, storageName, mime, size: req.file!.size } });
      await tx.team.update({ where: { id }, data: { version: { increment: 1 } } });
      await audit(tx, user, 'DOCUMENT_UPLOADED', id, { documentId: created.id, kind, participationId }); return { created, old };
    }, true);
    await Promise.all(result.old.map(d => unlink(path.join(config.storage, d.storageName)).catch(() => {})));
    res.status(201).json({ id: result.created.id });
  } catch (e) { await unlink(path.join(config.storage, storageName)).catch(() => {}); throw e; }
});
api.get('/documents/:id', async (req, res) => {
  const d = await prisma.document.findUnique({ where: { id: idOf(req.params.id) } }); assert(d, 'Documento no encontrado.', 404);
  await getTeam(d.teamId, currentUser(req));
  const file = await readFile(path.join(config.storage, d.storageName)).catch(() => null); assert(file, 'El archivo no está disponible. Contacte a la comisión.', 404);
  res.set({ 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename="documento-${d.id}"; filename*=UTF-8''${encodeURIComponent(d.originalName)}`, 'Cache-Control': 'no-store' }).send(file);
});
api.get('/teams/:id/formats/:kind', async (req, res) => {
  const team = await getTeam(idOf(req.params.id), currentUser(req));
  const kind = z.enum(['roster', 'fitness', 'responsibility', 'control']).parse(req.params.kind);
  const participationId = req.query.participationId ? idOf(req.query.participationId) : undefined;
  const p = team.participations.find(p => p.id === participationId);
  const previous = p ? await prisma.participation.findMany({ where: { athleteId: p.athleteId, team: { tournamentId: team.tournamentId } }, include: { team: { include: { category: true } } }, orderBy: { id: 'asc' } }) : [];
  const names: Record<string, string> = { FUTSAL: 'Futsal', VOLLEYBALL: 'Vóleibol', BASKETBALL: 'Básquetbol', CHESS: 'Ajedrez' };
  const doc = makePdf(team, kind, participationId, previous.map(p => names[p.team.category.discipline]));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="undc-${team.id}-${kind}.pdf"`, 'Cache-Control': 'no-store' });
  doc.pipe(res); doc.end();
});
if (config.production) {
  app.use(express.static(config.frontendDist, { index: false, maxAge: '1h' }));
  app.get('/{*path}', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/') || path.extname(req.path)) return next();
    res.set('Cache-Control', 'no-store').sendFile(path.join(config.frontendDist, 'index.html'));
  });
}
app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada.')));
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  if (error instanceof ZodError) return res.status(422).json({ message: 'Revise los datos ingresados.', errors: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  if (error instanceof multer.MulterError) return res.status(422).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el máximo de 10 MB.' : 'La carga del archivo no es válida.' });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (['P2021', 'P2022'].includes(error.code)) {
      console.error('Esquema MySQL desactualizado. Detenga el backend y ejecute pnpm db:sync.');
      return res.status(503).json({ message: 'El sistema necesita una actualización antes de recibir inscripciones. Contacte a la comisión organizadora.' });
    }
    if (error.code === 'P2002') return res.status(409).json({ message: 'Ya existe un registro con esos datos (equipo, DNI, código o correo).' });
    if (['P2025', 'P2003'].includes(error.code)) return res.status(422).json({ message: 'El registro relacionado no existe o no es válido.' });
    if (error.code === 'P2034') return res.status(409).json({ message: 'Otra operación modificó los datos. Vuelva a intentarlo.' });
  }
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ message: 'El cuerpo JSON no es válido.' });
  console.error('Error interno:', error?.code || error?.name || 'Unknown');
  return res.status(500).json({ message: 'No se pudo completar la operación. Verifique la conexión con la base de datos.' });
};
app.use(errorHandler);
