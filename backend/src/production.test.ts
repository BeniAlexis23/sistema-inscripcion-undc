import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const state = vi.hoisted(() => ({ query: vi.fn().mockResolvedValue([{ value: 1 }]) }));
vi.mock('./config.js', async () => {
  const path = await import('node:path');
  return { config: { production: true, origin: 'https://deportes.example.org', frontendDist: path.resolve('../tmp/production-test-site'), storage: path.resolve('../tmp/production-test-files'), sessionHours: 12 }, prisma: { $queryRaw: state.query } };
});
import { app } from './app.js';
const site = path.resolve('../tmp/production-test-site');
beforeAll(async () => { await mkdir(site, { recursive: true }); await writeFile(path.join(site, 'index.html'), '<html><body>UNDC producción</body></html>'); });
afterAll(async () => { await rm(site, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe('Despliegue de producción', () => {
  it('sirve React al abrir una ruta administrativa directamente', async () => {
    const response = await request(app).get('/admin/teams/1');
    expect(response.status).toBe(200); expect(response.text).toContain('UNDC producción');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(app.get('trust proxy')).toBe(1);
  });
  it('mantiene privadas las rutas API y no responde con HTML', async () => {
    const response = await request(app).get('/api/v1/teams');
    expect(response.status).toBe(401); expect(response.type).toBe('application/json');
  });
  it('informa indisponibilidad si MySQL deja de responder', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    state.query.mockRejectedValueOnce(new Error('offline'));
    expect((await request(app).get('/api/v1/health')).status).toBe(503);
  });
  it('deshabilita la creación pública del primer administrador en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await request(app).get('/api/v1/setup')).body).toEqual({ available: false });
    const response = await request(app).post('/api/v1/setup').set('X-Requested-With', 'undc-web').set('Origin', 'https://deportes.example.org').send({});
    expect(response.status).toBe(403);
    vi.unstubAllEnvs();
  });
});
