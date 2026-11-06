import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config, prisma } from './config.js';
import { athleteSchema } from './validation.js';
import { assert, checkCategory, checkDisciplines, checkRoster, checkWindow, normalize } from './rules.js';
import { detectMime } from './uploads.js';
import { makePdf } from './pdf.js';
import type { FullTeam } from './services.js';

export const publicRegistrationSchema = z.object({
  schoolId: z.number().int().positive(), categoryId: z.number().int().positive(),
  delegate: z.object({ name: z.string().trim().min(2).max(150), dni: z.string().regex(/^\d{8}$/), phone: z.string().regex(/^\+?[\d ]{7,20}$/), email: z.email().max(191).transform(s => s.toLowerCase()) }),
  athletes: z.array(athleteSchema).min(1, 'Registre al menos un deportista.').max(12),
  acceptedBases: z.literal(true, { error: 'Debe confirmar que conoce y acepta las bases.' }),
}).superRefine((data, ctx) => {
  for (const field of ['dni', 'studentCode'] as const) if (new Set(data.athletes.map(a => a[field])).size !== data.athletes.length) {
    ctx.addIssue({ code: 'custom', path: ['athletes'], message: 'Hay deportistas duplicados en la nómina.' });
  }
});
export const publicRouter = Router();
const documents = [
  { id: 'bases', title: 'Bases deportivas', description: 'Requisitos de participación y reglamentos de las siete categorías.', href: '/api/v1/public/documents/bases' },
  { id: 'formatos', title: 'Formatos y declaraciones juradas', description: 'Ficha oficial, aptitud física, responsabilidad y control documentario.', href: '/api/v1/public/documents/formatos' },
];
publicRouter.get('/event', async (_req, res) => {
  const [schools, categories, tournament] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: 'asc' } }), prisma.category.findMany({ orderBy: { id: 'asc' } }), prisma.tournament.findFirst({ orderBy: { id: 'asc' } }),
  ]);
  const links = documents.map(d => ({ ...d, href: (d.id === 'bases' ? tournament?.basesUrl : tournament?.formatsUrl) || d.href }));
  if (tournament?.otherDocumentsUrl) links.push({ id: 'otros', title: 'Otros documentos', description: 'Documentación adicional del evento.', href: tournament.otherDocumentsUrl });
  res.json({ schools, categories, tournament, documents: links });
});
publicRouter.get('/documents/:id', (req, res, next) => {
  const files: Record<string, string> = { bases: 'bases-torneo-undc-2026.pdf', formatos: 'formatos-torneo-undc-2026.pdf' };
  const filename = files[String(req.params.id)]; assert(filename, 'Documento no encontrado.', 404);
  res.sendFile(path.join(config.publicDocuments, filename), error => { if (error) next(error); });
});
const publicLimit = rateLimit({ windowMs: 60 * 60000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { message: 'Se alcanzó el límite de solicitudes. Intente nuevamente más tarde.' } });
const formatLimit = rateLimit({ windowMs: 15 * 60000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { message: 'Espere unos minutos antes de generar más formatos.' } });
publicRouter.post('/formats/:kind', formatLimit, async (req, res) => {
  const data = publicRegistrationSchema.parse(req.body);
  const kind = z.enum(['roster', 'fitness', 'responsibility']).parse(req.params.kind);
  const index = z.coerce.number().int().min(0).default(0).parse(req.query.index);
  const [school, category, tournament] = await Promise.all([
    prisma.school.findUnique({ where: { id: data.schoolId } }), prisma.category.findUnique({ where: { id: data.categoryId } }), prisma.tournament.findFirst({ orderBy: { id: 'asc' } }),
  ]);
  assert(school && category && tournament, 'Seleccione una escuela y una categoría válidas.');
  if (kind !== 'roster') assert(index < data.athletes.length, 'Deportista no encontrado.');
  const team = {
    id: 0, version: 1, school, category, tournament, delegate: { ...data.delegate, id: null },
    participations: data.athletes.map((a, i) => ({ id: i + 1, athleteId: i + 1, teamId: 0, athlete: { ...a, id: i + 1, schoolId: school.id } })),
    reviews: [], documents: [], audits: [],
  } as unknown as FullTeam;
  const doc = makePdf(team, kind, index + 1);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="UNDC-${kind}${kind !== 'roster' ? `-${index + 1}` : ''}.pdf"`, 'Cache-Control': 'no-store' });
  doc.pipe(res); doc.end();
});
const upload = multer({
  storage: multer.diskStorage({ destination: (_req, _file, callback) => callback(null, config.storage), filename: (_req, _file, callback) => callback(null, randomUUID()) }),
  limits: { fileSize: 10 * 1024 * 1024, files: 25, fields: 1, fieldSize: 100 * 1024, parts: 26 },
});
publicRouter.post('/registrations', publicLimit, async (_req, _res, next) => { await mkdir(config.storage, { recursive: true }); next(); }, upload.any(), async (req, res) => {
  const files = (req.files || []) as Express.Multer.File[];
  let committed = false;
  try {
    let raw: unknown;
    try { raw = JSON.parse(req.body.data || ''); } catch { assert(false, 'Los datos de inscripción no son válidos.'); }
    const data = publicRegistrationSchema.parse(raw);
    const expected = ['roster', ...data.athletes.flatMap((_a, i) => [`fitness_${i}`, `responsibility_${i}`])];
    assert(files.length === expected.length && expected.every(key => files.filter(f => f.fieldname === key).length === 1), 'Adjunte la ficha firmada y ambas declaraciones de cada deportista.');
    for (const f of files) {
      const mime = detectMime(await readFile(f.path));
      assert(f.size > 0 && mime && mime === f.mimetype, 'Solo se admiten PDF, JPG o PNG válidos, de hasta 10 MB por archivo.');
    }
    const receiptCode = randomUUID();
    const initial = await prisma.tournament.findFirst({ orderBy: { id: 'asc' } }); assert(initial, 'El evento aún no está configurado.', 409);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Tournament WHERE id = ${initial.id} FOR UPDATE`;
      const tournament = await tx.tournament.findUniqueOrThrow({ where: { id: initial.id } }); checkWindow(tournament, 'DRAFT');
      const school = await tx.school.findUnique({ where: { id: data.schoolId } });
      const category = await tx.category.findUnique({ where: { id: data.categoryId } });
      assert(school && category, 'Seleccione una escuela y categoría válidas.');
      checkRoster(category.discipline, data.athletes.map(a => a.sex));
      const team = await tx.team.create({ data: {
        tournamentId: tournament.id, schoolId: school.id, categoryId: category.id, status: 'SUBMITTED', receiptCode,
        delegateName: data.delegate.name, delegateDni: data.delegate.dni, delegatePhone: data.delegate.phone, delegateEmail: data.delegate.email,
      } });
      const ids: number[] = [];
      for (const a of data.athletes) {
        checkCategory(category.gender, a.sex);
        const matches = await tx.athlete.findMany({ where: { OR: [{ dni: a.dni }, { studentCode: a.studentCode }] } });
        let athlete = matches[0];
        if (athlete) {
          assert(matches.length === 1 && athlete.dni === a.dni && athlete.studentCode === a.studentCode, 'Hay un DNI o código universitario que no coincide con la identidad registrada. Contacte a la comisión.');
          assert(athlete.schoolId === school.id, 'Un estudiante figura en otra escuela profesional. Contacte a la comisión.');
          assert(normalize(athlete.firstName) === normalize(a.firstName) && normalize(athlete.lastName) === normalize(a.lastName) && athlete.sex === a.sex && athlete.phone === a.phone, 'Los datos de un estudiante difieren de una inscripción anterior. Contacte a la comisión.');
          const previous = await tx.participation.findMany({ where: { athleteId: athlete.id, team: { tournamentId: tournament.id } }, include: { team: { include: { category: true } } } });
          checkDisciplines(previous.map(p => p.team.category.discipline), category.discipline);
        } else athlete = await tx.athlete.create({ data: { ...a, firstName: normalize(a.firstName), lastName: normalize(a.lastName), schoolId: school.id } });
        const p = await tx.participation.create({ data: { teamId: team.id, athleteId: athlete.id } }); ids.push(p.id);
      }
      for (const file of files) {
        const [type, index] = file.fieldname.split('_');
        await tx.document.create({ data: {
          teamId: team.id, participationId: type === 'roster' ? null : ids[Number(index)],
          kind: type === 'roster' ? 'ROSTER' : type === 'fitness' ? 'FITNESS' : 'RESPONSIBILITY',
          originalName: path.basename(file.originalname).replace(/[\x00-\x1f]/g, '').slice(0, 255), storageName: file.filename, mime: file.mimetype, size: file.size,
        } });
      }
      await tx.audit.create({ data: { teamId: team.id, action: 'PUBLIC_REGISTRATION', details: { receiptCode, acceptedBases: true, source: 'public-form' } } });
      return { receiptCode, category: category.name, school: school.name, receivedAt: team.createdAt };
    }, { maxWait: 10000, timeout: 30000 });
    committed = true;
    res.status(201).json(result);
  } finally {
    if (!committed) await Promise.all(files.map(f => unlink(f.path).catch(() => {})));
  }
});
