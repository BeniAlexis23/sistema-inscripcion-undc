import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const db = vi.hoisted(() => ({ user: { count: vi.fn(), create: vi.fn() }, tournament: { findFirst: vi.fn() }, audit: { create: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() }));
vi.mock('./config.js', () => ({ prisma: db }));
vi.mock('argon2', () => ({ default: { hash: vi.fn().mockResolvedValue('hashed-secret') } }));
import { setupRouter } from './setup.js';

const app = express();
app.use(express.json(), setupRouter);
app.use((error: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status || 422).json({ message: error.message }); });
const input = { name: 'Responsable UNDC', email: 'admin@test.invalid', dni: '12345678', phone: '999999999', password: 'temporal-segura' };
beforeEach(() => {
  vi.clearAllMocks();
  db.user.count.mockReset().mockResolvedValue(0);
  db.tournament.findFirst.mockResolvedValue({ id: 1 });
  db.user.create.mockResolvedValue({ id: 1 });
  db.$transaction.mockImplementation(work => work(db));
});
describe('Configuración inicial', () => {
  it('informa disponibilidad sin cachear', async () => {
    const response = await request(app).get('/');
    expect(response.body).toEqual({ available: true });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('crea exclusivamente un administrador, con hash y auditoría', async () => {
    const response = await request(app).post('/').send({ ...input, role: 'DELEGATE', schoolId: 99 });
    expect(response.status).toBe(201);
    expect(db.user.create).toHaveBeenCalledWith({ data: { name: input.name, email: input.email, dni: input.dni, phone: input.phone, role: 'ADMIN', schoolId: null, passwordHash: 'hashed-secret' } });
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.audit.create).toHaveBeenCalledOnce();
  });
  it('bloquea registros cuando existe un administrador, aunque esté inactivo', async () => {
    db.user.count.mockResolvedValue(1);
    expect((await request(app).get('/')).body.available).toBe(false);
    expect((await request(app).post('/').send(input)).status).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it('revalida después del bloqueo para rechazar un envío concurrente', async () => {
    db.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    expect((await request(app).post('/').send(input)).status).toBe(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it('rechaza datos inválidos antes de crear usuarios', async () => {
    expect((await request(app).post('/').send({ ...input, dni: '1' })).status).toBe(422);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
