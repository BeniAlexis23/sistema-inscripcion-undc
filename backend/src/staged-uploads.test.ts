import { afterAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const fixture = vi.hoisted(() => ({ storage: '' }));
vi.mock('./config.js', () => ({ config: fixture }));
import { stagedUploads, claimStagedUploads, CHUNK_BYTES } from './staged-uploads.js';
fixture.storage = path.resolve('../tmp', `staged-${randomUUID()}`);
const app = express();
app.use(express.json()); app.use('/uploads', stagedUploads);
app.post('/register', claimStagedUploads('pregrado'), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  const contents = await Promise.all(files.map(async f => ({ field: f.fieldname, size: (await readFile(f.path)).length })));
  res.json({ contents });
});
app.post('/staff', claimStagedUploads('personal'), (req, res) => res.json({ count: (req.files as Express.Multer.File[]).length }));
app.use((error: { status?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status || 422).json({ message: error.message }); });
afterAll(async () => { await rm(fixture.storage, { recursive: true, force: true }); });
const input = { scope: 'pregrado', field: 'roster', name: 'firmado.pdf', mime: 'application/pdf' };
async function begin(size: number, extras = {}) {
  const response = await request(app).post('/uploads').send({ ...input, size, ...extras });
  expect(response.status).toBe(201); return response.body as { id: string; token: string };
}
async function chunk(s: { id: string; token: string }, bytes: Buffer, index = 0) {
  return request(app).put(`/uploads/${s.id}/chunks/${index}`).set('X-Upload-Token', s.token).set('Content-Type', 'application/octet-stream').send(bytes);
}
async function complete(s: { id: string; token: string }) {
  return request(app).post(`/uploads/${s.id}/complete`).set('X-Upload-Token', s.token).send({});
}
describe('Carga privada por fragmentos', () => {
  it('reconstruye un archivo de varios fragmentos, tolera reintentos e impide reutilizarlo', async () => {
    const bytes = Buffer.alloc(CHUNK_BYTES + 100, 32); bytes.write('%PDF-1.7');
    const s = await begin(bytes.length);
    expect((await chunk(s, bytes.subarray(0, CHUNK_BYTES))).status).toBe(204);
    expect((await chunk(s, bytes.subarray(0, CHUNK_BYTES))).status).toBe(204);
    expect((await complete(s)).status).toBe(422);
    expect((await chunk(s, bytes.subarray(CHUNK_BYTES), 1)).status).toBe(204);
    const ready = await complete(s); expect(ready.status).toBe(200);
    expect((await complete(s)).status).toBe(200);
    const registered = await request(app).post('/register').send({ uploadTokens: [ready.body.uploadToken] });
    expect(registered.status).toBe(200);
    expect(registered.body.contents).toEqual([{ field: 'roster', size: bytes.length }]);
    expect((await request(app).post('/register').send({ uploadTokens: [ready.body.uploadToken] })).status).toBe(409);
    expect((await complete(s)).status).toBe(422);
  });
  it('rechaza tokens alterados, fragmentos truncados y firmas de archivo falsas', async () => {
    const s = await begin(20);
    expect((await chunk({ ...s, token: s.token.slice(0, -1) + (s.token.endsWith('a') ? 'b' : 'a') }, Buffer.alloc(20))).status).toBe(403);
    expect((await chunk(s, Buffer.alloc(19))).status).toBe(422);
    expect((await chunk(s, Buffer.alloc(20))).status).toBe(204);
    expect((await complete(s)).status).toBe(422);
  });
  it('mantiene separados los formularios y rechaza referencias duplicadas', async () => {
    const bytes = Buffer.from('%PDF-1.7'); const s = await begin(bytes.length);
    await chunk(s, bytes); const ready = await complete(s);
    expect((await request(app).post('/staff').send({ uploadTokens: [ready.body.uploadToken] })).status).toBe(403);
    expect((await request(app).post('/register').send({ uploadTokens: [ready.body.uploadToken, ready.body.uploadToken] })).status).toBe(422);
    expect((await request(app).post('/register').send({ uploadTokens: [ready.body.uploadToken] })).status).toBe(200);
  });
  it('limita tamaños, tipos y campos al iniciar una carga', async () => {
    expect((await request(app).post('/uploads').send({ ...input, size: 11 * 1024 * 1024 })).status).toBe(422);
    expect((await request(app).post('/uploads').send({ ...input, size: 10, field: '../../archivo' })).status).toBe(422);
    expect((await request(app).post('/uploads').send({ ...input, size: 10, mime: 'text/html' })).status).toBe(422);
  });
  it('rechaza referencias vencidas aunque el archivo siga en almacenamiento temporal', async () => {
    const bytes = Buffer.from('%PDF-1.7'); const s = await begin(bytes.length);
    await chunk(s, bytes); const ready = await complete(s);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1000);
      expect((await request(app).post('/register').send({ uploadTokens: [ready.body.uploadToken] })).status).toBe(410);
    } finally { vi.useRealTimers(); }
  });
});
