import { beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const db = vi.hoisted(() => ({ team: { findMany: vi.fn() } }));
vi.mock('./config.js', () => ({ prisma: db, config: { storage: './storage' } }));
import { reportsRouter } from './reports.js';
const app = express();
app.use((req, _res, next) => { req.user = { role: req.get('Test-Role') || 'DELEGATE' } as Express.Request['user']; next(); });
app.use(reportsRouter);
app.use((error: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status || 422).json({ message: error.message }); });
beforeEach(() => { vi.clearAllMocks(); db.team.findMany.mockResolvedValue([]); });
it('deniega reportes a delegados', async () => {
  expect((await request(app).get('/approved')).status).toBe(403);
  expect((await request(app).get('/approved/pdf')).status).toBe(403);
  expect(db.team.findMany).not.toHaveBeenCalled();
});
it('filtra exclusivamente aprobados por equipo, deporte, categoría y escuela', async () => {
  expect((await request(app).get('/approved?teamId=2&discipline=FUTSAL&categoryId=3&schoolId=4').set('Test-Role', 'COMMISSION')).status).toBe(200);
  expect(db.team.findMany.mock.calls[0][0].where).toEqual({ status: 'APPROVED', id: 2, categoryId: 3, schoolId: 4, category: { discipline: 'FUTSAL' } });
});
it('rechaza filtros inválidos y no genera un PDF vacío', async () => {
  expect((await request(app).get('/approved?discipline=INVALID').set('Test-Role', 'ADMIN')).status).toBe(422);
  expect(db.team.findMany).not.toHaveBeenCalled();
  expect((await request(app).get('/approved/pdf').set('Test-Role', 'ADMIN')).status).toBe(404);
});
