import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma, config } from './config.js';
import { roles } from './auth.js';
import { mergeApprovedDocuments } from './report-pdf.js';

export const reportsRouter = Router();
reportsRouter.use(roles('ADMIN', 'COMMISSION'));
const filters = z.object({
  discipline: z.enum(['FUTSAL', 'VOLLEYBALL', 'BASKETBALL', 'CHESS']).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  schoolId: z.coerce.number().int().positive().optional(),
  teamId: z.coerce.number().int().positive().optional(),
});
function where(input: unknown): Prisma.TeamWhereInput {
  const q = filters.parse(input);
  return { status: 'APPROVED', id: q.teamId, schoolId: q.schoolId, categoryId: q.categoryId, category: q.discipline ? { discipline: q.discipline } : undefined };
}
reportsRouter.get('/approved', async (req, res) => {
  const items = await prisma.team.findMany({ where: where(req.query), select: {
    id: true, name: true, cycle: true, shift: true, section: true, school: { select: { name: true } }, category: { select: { name: true, discipline: true } },
    _count: { select: { documents: true, participations: true } },
  }, orderBy: { id: 'asc' } });
  res.set('Cache-Control', 'no-store').json({ items });
});
reportsRouter.get('/approved/pdf', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const teams = await prisma.team.findMany({ where: where(req.query), select: {
    id: true, name: true, cycle: true, shift: true, section: true, school: { select: { name: true } }, category: { select: { name: true } },
    documents: { select: { id: true, kind: true, mime: true, size: true, storageName: true }, orderBy: [{ kind: 'asc' }, { participationId: 'asc' }, { id: 'asc' }] },
  }, orderBy: [{ categoryId: 'asc' }, { schoolId: 'asc' }, { id: 'asc' }] });
  const pdf = await mergeApprovedDocuments(teams, name => readFile(path.join(config.storage, name)));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="documentos-aprobados-undc.pdf"', 'Cache-Control': 'no-store' }).send(pdf);
});
