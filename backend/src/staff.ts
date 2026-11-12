import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config, prisma } from './config.js';
import { currentUser, hashToken, roles } from './auth.js';
import { assert, normalize } from './rules.js';
import { detectMime } from './uploads.js';
import { staffSchema, staffCategories, staffFields, staffChecks, validateStaffRoster, type StaffInput } from './staff-rules.js';
import { makeStaffPdf } from './staff-pdf.js';
import { makeStaffReceipt } from './staff-receipt-pdf.js';

export const staffPublic = Router(), staffAdmin = Router();
staffAdmin.use(roles('ADMIN', 'COMMISSION'), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
staffPublic.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const limiter = rateLimit({ windowMs: 60 * 60000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiados envíos. Intente más tarde.' } });
const formatLimiter = rateLimit({ windowMs: 15 * 60000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { message: 'Espere antes de generar más formatos.' } });
const manageLimiter = rateLimit({ windowMs: 15 * 60000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiadas consultas privadas. Intente más tarde.' } });
const include = { participants: { orderBy: { position: 'asc' as const } }, documents: true, reviews: { orderBy: { id: 'desc' as const } } };
const idOf = (v: unknown) => z.coerce.number().int().positive().parse(v);
const checkDate = (event: { opensAt: Date; closesAt: Date }) => assert(new Date() >= event.opensAt && new Date() <= event.closesAt, 'El plazo de personal docente y administrativo está cerrado.', 409);
const inputFrom = (team: { category: string; name: string; dependency: string; workplace: string; mixedDependencies: boolean; delegate: unknown; participants: unknown }) => staffSchema.parse({ ...team, acceptedBases: true });
const safeTeam = <T extends { editTokenHash: string; documents: { storageName: string }[] }>(team: T) => {
  const { editTokenHash: _secret, ...rest } = team;
  return { ...rest, documents: team.documents.map(({ storageName: _storage, ...d }) => d) };
};
async function authorizeEdit(code: string, token: unknown) {
  assert(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 'Código privado inválido.', 403);
  const team = await prisma.staffTeam.findUnique({ where: { receiptCode: z.uuid().parse(code) }, include });
  assert(team && timingSafeEqual(Buffer.from(team.editTokenHash), Buffer.from(hashToken(token))), 'Código privado inválido.', 403);
  return team;
}
staffPublic.get('/event', async (_req, res) => {
  const event = await prisma.staffEvent.findUnique({ where: { id: 1 } }); assert(event, 'El torneo de personal aún no está configurado.', 503);
  const approved = await prisma.staffTeam.groupBy({ by: ['category'], where: { eventId: event.id, status: 'APPROVED' }, _count: true });
  res.json({ ...event, categories: staffCategories.map(c => ({ ...c, approved: approved.find(a => a.category === c.id)?._count || 0 })), documents: [
    { id: 'bases', title: 'Bases del torneo de personal', href: event.basesUrl || '/api/v1/public/staff/documents/bases' },
    { id: 'formatos', title: 'Formatos oficiales de personal', href: event.formatsUrl || '/api/v1/public/staff/documents/formatos' },
  ] });
});
staffPublic.get('/documents/:kind', (req, res, next) => {
  const kind = z.enum(['bases', 'formatos']).parse(req.params.kind);
  res.sendFile(path.join(config.publicDocuments, `${kind === 'bases' ? 'bases' : 'formatos'}-personal-undc-2026.pdf`), e => { if (e) next(e); });
});
staffPublic.post('/formats/:kind', formatLimiter, async (req, res) => {
  const data = staffSchema.parse(req.body), kind = z.enum(['roster', 'fitness', 'responsibility', 'control']).parse(req.params.kind);
  const index = z.coerce.number().int().min(0).default(0).parse(req.query.index);
  assert(index < data.participants.length, 'Participante no encontrado.');
  res.type('pdf').attachment(`UNDC-personal-${kind}.pdf`).send(await makeStaffPdf(data, kind, index));
});
staffPublic.post('/manage/:code', manageLimiter, async (req, res) => res.json(safeTeam(await authorizeEdit(String(req.params.code), req.body.token))));
staffPublic.post('/receipts/:code', formatLimiter, async (req, res) => {
  const team = await authorizeEdit(String(req.params.code), req.body.token);
  res.type('pdf').attachment(`registro-personal-${team.receiptCode}.pdf`).send(await makeStaffReceipt(inputFrom(team), team));
});
const upload = multer({ storage: multer.diskStorage({ destination: (_r, _f, cb) => cb(null, config.storage), filename: (_r, _f, cb) => cb(null, randomUUID()) }), limits: { fileSize: 10 * 1024 * 1024, files: 22, fields: 3, parts: 25, fieldSize: 100 * 1024 } });
staffPublic.post('/registrations', limiter, async (_req, _res, next) => { await mkdir(config.storage, { recursive: true }); next(); }, upload.any(), async (req, res) => {
  const files = (req.files || []) as Express.Multer.File[]; let committed = false;
  try {
    let raw: unknown; try { raw = JSON.parse(req.body.data || ''); } catch { assert(false, 'Datos de inscripción inválidos.'); }
    const data = staffSchema.parse(raw); validateStaffRoster(data);
    const previous = req.body.receiptCode ? await authorizeEdit(req.body.receiptCode, req.body.token) : null;
    const expected = staffFields(data);
    assert(files.every(f => expected.includes(f.fieldname)) && new Set(files.map(f => f.fieldname)).size === files.length, 'Adjuntos inesperados o duplicados.');
    for (const file of files) assert(detectMime(await readFile(file.path)) === file.mimetype && file.size > 0, 'Solo PDF, JPG o PNG válidos, máximo 10 MB por archivo.');
    const token = randomBytes(32).toString('hex');
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM StaffEvent WHERE id = 1 FOR UPDATE`;
      const event = await tx.staffEvent.findUnique({ where: { id: 1 } }); assert(event, 'Torneo sin configurar.', 503); checkDate(event);
      const fresh = previous ? await tx.staffTeam.findUniqueOrThrow({ where: { id: previous.id }, include }) : null;
      if (fresh) assert(fresh.status === 'OBSERVED', 'Solo se pueden subsanar expedientes observados.', 409);
      const changed = fresh && JSON.stringify(inputFrom(fresh)) !== JSON.stringify(data);
      const retained = fresh && !changed ? fresh.documents : [];
      assert(expected.every(key => files.some(f => f.fieldname === key) || retained.some(d => d.field === key)), 'Adjunte la ficha firmada y ambas declaraciones de cada participante; autorización si corresponde. La identidad y el vínculo se verifican manualmente por la comisión. Si cambia los datos, vuelva a firmar y adjuntar el expediente completo.');
      const teamData = { category: data.category, name: data.name, dependency: data.dependency, workplace: data.workplace, mixedDependencies: data.mixedDependencies, delegate: data.delegate, status: 'SUBMITTED' as const };
      const obsolete = fresh ? fresh.documents.filter(d => changed || files.some(f => f.fieldname === d.field)) : [];
      if (fresh) {
        await tx.staffDocument.deleteMany({ where: { id: { in: obsolete.map(d => d.id) } } });
        await tx.staffParticipant.deleteMany({ where: { teamId: fresh.id } });
      }
      const team = fresh ? await tx.staffTeam.update({ where: { id: fresh.id }, data: { ...teamData, receivedAt: new Date(), version: { increment: 1 } } }) : await tx.staffTeam.create({ data: { ...teamData, eventId: event.id, receiptCode: randomUUID(), editTokenHash: hashToken(token) } });
      for (const [position, p] of data.participants.entries()) {
        const existing = await tx.staffParticipant.findMany({ where: { eventId: event.id, documentType: p.documentType, documentNumber: p.documentNumber } });
        assert(!existing.some(a => a.category === data.category), 'Una persona ya integra otro equipo de esta categoría.', 409);
        assert(existing.every(a => a.firstName === p.firstName && a.lastName === p.lastName && a.sex === p.sex), 'Los datos de identidad no coinciden con otra inscripción. Contacte a la comisión.');
        await tx.staffParticipant.create({ data: { ...p, teamId: team.id, eventId: event.id, category: data.category, position } });
      }
      for (const file of files) await tx.staffDocument.create({ data: { teamId: team.id, field: file.fieldname, storageName: file.filename, originalName: path.basename(file.originalname).replace(/[\x00-\x1f]/g, '').slice(0, 255), mime: file.mimetype, size: file.size } });
      if (fresh) await tx.staffReview.create({ data: { teamId: team.id, actorId: 0, actorName: 'Delegado', action: 'SUBMITTED', notes: 'Expediente subsanado. Nueva recepción completa para evaluación.', checks: {} } });
      return { team, obsolete };
    }, { maxWait: 10000, timeout: 30000 });
    committed = true;
    await Promise.all(result.obsolete.map(d => unlink(path.join(config.storage, d.storageName)).catch(() => {})));
    res.status(previous ? 200 : 201).json({ receiptCode: result.team.receiptCode, editToken: previous ? undefined : token, receivedAt: result.team.receivedAt, message: 'Recepción completa registrada. La admisión y el cupo requieren validación de la comisión.' });
  } finally { if (!committed) await Promise.all(files.map(f => unlink(f.path).catch(() => {}))); }
});
staffAdmin.get('/event', async (_req, res) => res.json(await prisma.staffEvent.findUniqueOrThrow({ where: { id: 1 } })));
staffAdmin.put('/event', async (req, res) => {
  const user = currentUser(req);
  const input = z.object({ opensAt: z.iso.datetime(), closesAt: z.iso.datetime(), basesUrl: z.union([z.url().refine(v => v.startsWith('https://')), z.literal('')]), formatsUrl: z.union([z.url().refine(v => v.startsWith('https://')), z.literal('')]) }).parse(req.body);
  assert(new Date(input.opensAt) < new Date(input.closesAt), 'La apertura debe ser anterior al cierre.');
  const result = await prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM StaffEvent WHERE id = 1 FOR UPDATE`; const event = await tx.staffEvent.update({ where: { id: 1 }, data: { opensAt: new Date(input.opensAt), closesAt: new Date(input.closesAt), basesUrl: input.basesUrl || null, formatsUrl: input.formatsUrl || null } }); await tx.audit.create({ data: { actorId: user.id, action: 'STAFF_EVENT_UPDATED', details: input } }); return event; });
  res.json(result);
});
staffAdmin.get('/teams', async (req, res) => {
  const page = z.coerce.number().int().min(1).default(1).parse(req.query.page), pageSize = 20;
  const status = req.query.status ? z.enum(['SUBMITTED', 'OBSERVED', 'APPROVED', 'DRAFT']).parse(req.query.status) : undefined;
  const category = req.query.category ? z.enum(['FUTSAL_MALE', 'FUTSAL_FEMALE', 'VOLLEYBALL_MIXED']).parse(req.query.category) : undefined;
  const where = { eventId: 1, status, category };
  const [items, total] = await Promise.all([prisma.staffTeam.findMany({ where, select: { id: true, name: true, dependency: true, category: true, status: true, receivedAt: true, version: true, _count: { select: { participants: true } } }, orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }), prisma.staffTeam.count({ where })]);
  res.json({ items, total, page, pageSize });
});
staffAdmin.get('/teams/:id', async (req, res) => res.json(safeTeam(await prisma.staffTeam.findUniqueOrThrow({ where: { id: idOf(req.params.id) }, include }))));
staffAdmin.get('/documents/:id', async (req, res) => {
  const doc = await prisma.staffDocument.findUniqueOrThrow({ where: { id: idOf(req.params.id) } });
  res.set('Content-Type', doc.mime).attachment(`documento-personal-${doc.id}${path.extname(doc.originalName)}`).send(await readFile(path.join(config.storage, doc.storageName)));
});
staffAdmin.get('/teams/:id/formats/:kind', async (req, res) => {
  const team = await prisma.staffTeam.findUniqueOrThrow({ where: { id: idOf(req.params.id) }, include });
  const kind = z.enum(['roster', 'control', 'fitness', 'responsibility', 'receipt']).parse(req.params.kind), index = z.coerce.number().int().min(0).default(0).parse(req.query.index);
  if (kind === 'receipt') { res.type('pdf').attachment(`registro-personal-${team.receiptCode}.pdf`).send(await makeStaffReceipt(inputFrom(team), team)); return; }
  assert(index < team.participants.length, 'Participante no encontrado.');
  res.type('pdf').attachment(`personal-${kind}.pdf`).send(await makeStaffPdf(inputFrom(team), kind, index));
});
staffAdmin.post('/teams/:id/reviews', async (req, res) => {
  const user = currentUser(req), id = idOf(req.params.id);
  const input = z.object({ version: z.number().int(), result: z.enum(['APPROVED', 'OBSERVED']), notes: z.string().trim().max(5000), checks: z.record(z.string(), z.boolean()) }).parse(req.body);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM StaffEvent WHERE id = 1 FOR UPDATE`;
    const team = await tx.staffTeam.findUniqueOrThrow({ where: { id }, include });
    assert(team.version === input.version && team.status !== 'APPROVED', 'El expediente cambió o está aprobado. Recargue o reabra con motivo.', 409);
    if (input.result === 'APPROVED') {
      const data = inputFrom(team); validateStaffRoster(data);
      assert(staffChecks.every(key => input.checks[key]), 'Complete todos los controles obligatorios.');
      assert(team.documents.every(d => input.checks[`document_${d.id}`]), 'Coteje y marque todos los documentos adjuntos.');
      assert(staffFields(data).every(field => team.documents.some(d => d.field === field)), 'El expediente no tiene todos los documentos.');
      const capacity = staffCategories.find(c => c.id === team.category)!.capacity;
      assert(await tx.staffTeam.count({ where: { eventId: 1, category: team.category, status: 'APPROVED' } }) < capacity, 'Cupos aprobados agotados en esta categoría.', 409);
      const earlier = await tx.staffTeam.count({ where: { eventId: 1, category: team.category, status: 'SUBMITTED', OR: [{ receivedAt: { lt: team.receivedAt } }, { receivedAt: team.receivedAt, id: { lt: team.id } }] } });
      assert(!earlier, 'Revise primero los expedientes completos recibidos anteriormente en esta categoría. Observe los inválidos antes de continuar.', 409);
    } else assert(input.notes.length >= 5, 'Indique qué se debe subsanar.');
    await tx.staffTeam.update({ where: { id }, data: { status: input.result, version: { increment: 1 } } });
    await tx.staffReview.create({ data: { teamId: id, actorId: user.id, actorName: user.name, action: input.result, notes: input.notes, checks: input.checks } });
  });
  res.sendStatus(204);
});
staffAdmin.post('/teams/:id/reopen', async (req, res) => {
  const user = currentUser(req), id = idOf(req.params.id), { reason } = z.object({ reason: z.string().trim().min(5).max(5000) }).parse(req.body);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM StaffEvent WHERE id = 1 FOR UPDATE`;
    const team = await tx.staffTeam.findUniqueOrThrow({ where: { id } }); assert(team.status === 'APPROVED', 'Solo se reabren expedientes aprobados.', 409);
    await tx.staffTeam.update({ where: { id }, data: { status: 'OBSERVED', version: { increment: 1 } } });
    await tx.staffReview.create({ data: { teamId: id, actorId: user.id, actorName: user.name, action: 'REOPENED', notes: reason, checks: {} } });
  }); res.sendStatus(204);
});
