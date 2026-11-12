import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { readdir, rm } from 'node:fs/promises';
const url = process.env.TEST_DATABASE_URL;
if (url) {
  if (!new URL(url).pathname.endsWith('_test')) throw Error('Solo base de pruebas.');
  process.env.DATABASE_URL = url; process.env.STORAGE_DIR = path.resolve('../tmp', `staff-tests-${randomUUID()}`);
}
const { app } = await import('../src/app.js');
const { prisma, config } = await import('../src/config.js');
const { createSession } = await import('../src/auth.js');
const { staffFields, staffChecks } = await import('../src/staff-rules.js');
import type { StaffInput } from '../src/staff-rules.js';
const H = { 'X-Requested-With': 'undc-web' };
describe.skipIf(!url)('Personal: expediente completo MySQL y privacidad', () => {
  let commission: string, delegate: string;
  let original: { opensAt: Date; closesAt: Date };
  const ids: number[] = [], users: number[] = [];
  const dni = () => String(randomInt(10000000, 99999999));
  const data = (): StaffInput => ({ name: `Personal ${randomUUID().slice(0, 8)}`, dependency: 'OTI', workplace: 'San Luis', category: 'FUTSAL_MALE', mixedDependencies: false, delegate: { name: 'Delegado de prueba', documentType: 'DNI', documentNumber: dni(), phone: '999999999', email: 'delegado@example.org' }, participants: [{ firstName: 'PRUEBA', lastName: 'PERSONAL', documentType: 'DNI', documentNumber: dni(), sex: 'MALE', phone: '999999999', employment: 'ADMINISTRATIVO', dependency: 'OTI' }], acceptedBases: true });
  beforeAll(async () => {
    original = await prisma.staffEvent.findUniqueOrThrow({ where: { id: 1 } });
    await prisma.staffEvent.update({ where: { id: 1 }, data: { opensAt: new Date('2020-01-01'), closesAt: new Date('2099-01-01') } });
    for (const role of ['COMMISSION', 'DELEGATE'] as const) {
      const user = await prisma.user.create({ data: { name: 'Revisor de prueba', email: `${randomUUID()}@example.org`, dni: dni(), phone: '999999999', role, passwordHash: 'unused' } }); users.push(user.id);
      const cookie = `undc_session=${(await createSession(user.id)).token}`;
      if (role === 'COMMISSION') commission = cookie; else delegate = cookie;
    }
  });
  async function send(input: StaffInput, credentials?: { receiptCode: string; editToken: string }, missing = false) {
    let req = request(app).post('/api/v1/public/staff/registrations').set(H).field('data', JSON.stringify(input));
    if (credentials) req = req.field('receiptCode', credentials.receiptCode).field('token', credentials.editToken);
    if (!missing) for (const field of staffFields(input)) req = req.attach(field, Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'firmado.pdf', contentType: 'application/pdf' });
    const r = await req;
    if ([200, 201].includes(r.status)) ids.push((await prisma.staffTeam.findUniqueOrThrow({ where: { receiptCode: r.body.receiptCode } })).id);
    return r;
  }
  const get = (id: number) => request(app).get(`/api/v1/staff/teams/${id}`).set('Cookie', commission);
  const review = async (id: number, result: string, notes = 'Verificación manual completada') => {
    const t = await prisma.staffTeam.findUniqueOrThrow({ where: { id }, include: { documents: true } });
    const checks = Object.fromEntries([...staffChecks, ...t.documents.map(d => `document_${d.id}`)].map(key => [key, true]));
    return request(app).post(`/api/v1/staff/teams/${id}/reviews`).set(H).set('Cookie', commission).send({ result, notes, version: t.version, checks });
  };
  it('publica únicamente las categorías y documentos de personal', async () => {
    const event = await request(app).get('/api/v1/public/staff/event'); expect(event.status).toBe(200); expect(event.body.categories.map((c: {capacity: number}) => c.capacity)).toEqual([12, 8, 12]);
    expect((await request(app).get('/api/v1/public/staff/documents/bases')).headers['content-type']).toContain('application/pdf');
    expect((await request(app).get('/api/v1/staff/teams')).status).toBe(401);
    expect((await request(app).get('/api/v1/staff/teams').set('Cookie', delegate)).status).toBe(403);
  });
  it('no reserva solicitudes incompletas; recibe, observa, subsana y aprueba en orden', async () => {
    const input = data();
    expect((await send(input, undefined, true)).status).toBe(422);
    expect(await prisma.staffTeam.count({ where: { name: input.name } })).toBe(0);
    const first = await send(input); expect(first.status).toBe(201);
    const team = await prisma.staffTeam.findUniqueOrThrow({ where: { receiptCode: first.body.receiptCode } });
    const receiptPath = `/api/v1/public/staff/receipts/${team.receiptCode}`;
    expect((await request(app).post(receiptPath).set(H).send({ token: '0'.repeat(64) })).status).toBe(403);
    const registrationPdf = await request(app).post(receiptPath).set(H).send({ token: first.body.editToken });
    expect(registrationPdf.status).toBe(200); expect(registrationPdf.headers['content-type']).toContain('application/pdf');
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(registrationPdf.body)).getPageCount()).toBeGreaterThanOrEqual(2);
    expect((await request(app).get(`/api/v1/staff/teams/${team.id}/formats/receipt`).set('Cookie', delegate)).status).toBe(403);
    expect((await request(app).get(`/api/v1/staff/teams/${team.id}/formats/receipt`).set('Cookie', commission)).status).toBe(200);
    expect((await get(team.id)).body).not.toHaveProperty('editTokenHash');
    const detail = await get(team.id); const doc = detail.body.documents[0]; expect(doc).not.toHaveProperty('storageName');
    expect((await request(app).get(`/api/v1/staff/documents/${doc.id}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/staff/documents/${doc.id}`).set('Cookie', delegate)).status).toBe(403);
    expect((await request(app).get(`/api/v1/staff/documents/${doc.id}`).set('Cookie', commission)).status).toBe(200);
    const denied = await request(app).post(`/api/v1/public/staff/manage/${team.receiptCode}`).set(H).send({ token: '0'.repeat(64) }); expect(denied.status).toBe(403);
    expect((await send(input, first.body)).status).toBe(409);
    const second = await send(data()); expect(second.status).toBe(201); const secondId = (await prisma.staffTeam.findUniqueOrThrow({ where: { receiptCode: second.body.receiptCode } })).id;
    expect((await review(secondId, 'APPROVED')).status).toBe(409);
    expect((await review(team.id, 'OBSERVED', 'Subsanar la firma física')).status).toBe(204);
    expect((await review(secondId, 'APPROVED')).status).toBe(204);
    expect((await send({ ...input, name: 'Datos corregidos sin nuevas firmas' }, first.body, true)).status).toBe(422);
    expect((await send(input, first.body)).status).toBe(200);
    expect((await review(team.id, 'APPROVED')).status).toBe(204);
    expect((await review(team.id, 'OBSERVED')).status).toBe(409);
    expect((await request(app).post(`/api/v1/staff/teams/${team.id}/reopen`).set(H).set('Cookie', commission).send({ reason: 'Comprobar documento de vínculo' })).status).toBe(204);
    expect((await get(team.id)).body.reviews[0].action).toBe('REOPENED');
    const pdf = await request(app).post('/api/v1/public/staff/formats/roster').set(H).send(input); expect(pdf.status).toBe(200); expect(pdf.headers['content-type']).toContain('application/pdf');
    await review(team.id, 'APPROVED');
  });
  it('serializa identidad simultánea en una categoría, permite otra y limpia archivos fallidos', async () => {
    const first = data(), second = { ...first, name: 'Otro equipo de prueba' };
    const before = await readdir(config.storage);
    const results = await Promise.all([send(first), send(second)]); expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await readdir(config.storage)).length - before.length).toBe(3);
    const cross: StaffInput = { ...first, category: 'VOLLEYBALL_MIXED', participants: [...first.participants, ...Array.from({ length: 5 }, (_, i) => ({ ...data().participants[0], sex: i < 3 ? 'FEMALE' as const : 'MALE' as const }))] };
    expect((await send(cross)).status).toBe(201);
  });
  it('serializa dos aprobaciones sobre el último cupo sin exceder el aforo', async () => {
    await prisma.staffTeam.updateMany({ where: { id: { in: ids }, category: 'FUTSAL_MALE', status: 'SUBMITTED' }, data: { status: 'OBSERVED' } });
    const approved = await prisma.staffTeam.count({ where: { eventId: 1, category: 'FUTSAL_MALE', status: 'APPROVED' } });
    for (let i = approved; i < 11; i++) {
      const t = await prisma.staffTeam.create({ data: { eventId: 1, category: 'FUTSAL_MALE', name: 'Cupo concurrente de prueba', dependency: 'OTI', workplace: 'San Luis', delegate: data().delegate, receiptCode: randomUUID(), editTokenHash: '0'.repeat(64), status: 'APPROVED' } }); ids.push(t.id);
    }
    const first = await send(data()), second = await send(data()); expect([first.status, second.status]).toEqual([201, 201]);
    const firstId = (await prisma.staffTeam.findUniqueOrThrow({ where: { receiptCode: first.body.receiptCode } })).id;
    const secondId = (await prisma.staffTeam.findUniqueOrThrow({ where: { receiptCode: second.body.receiptCode } })).id;
    const results = await Promise.all([review(firstId, 'APPROVED'), review(secondId, 'APPROVED')]);
    expect(results.map(r => r.status).sort()).toEqual([204, 409]);
    expect(await prisma.staffTeam.count({ where: { eventId: 1, category: 'FUTSAL_MALE', status: 'APPROVED' } })).toBe(12);
  });
  it('impide aprobar sin cotejar adjuntos y después de agotar cupos', async () => {
    const input: StaffInput = { ...data(), category: 'FUTSAL_FEMALE', participants: [{ ...data().participants[0], sex: 'FEMALE' }] };
    const r = await send(input); expect(r.status).toBe(201);
    const team = await prisma.staffTeam.findUniqueOrThrow({ where: { receiptCode: r.body.receiptCode } });
    const checks = Object.fromEntries(staffChecks.map(key => [key, true]));
    expect((await request(app).post(`/api/v1/staff/teams/${team.id}/reviews`).set(H).set('Cookie', commission).send({ version: team.version, result: 'APPROVED', checks, notes: '' })).status).toBe(422);
    for (let i = 0; i < 8; i++) { const t = await prisma.staffTeam.create({ data: { eventId: 1, category: 'FUTSAL_FEMALE', name: 'Cupo de prueba', dependency: 'OTI', workplace: 'San Luis', delegate: input.delegate, receiptCode: randomUUID(), editTokenHash: '0'.repeat(64), status: 'APPROVED' } }); ids.push(t.id); }
    expect((await review(team.id, 'APPROVED')).status).toBe(409);
    await prisma.staffEvent.update({ where: { id: 1 }, data: { closesAt: new Date('2020-01-02') } });
    expect((await send(data())).status).toBe(409);
  });
  afterAll(async () => {
    await prisma.staffTeam.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (original) await prisma.staffEvent.update({ where: { id: 1 }, data: { opensAt: original.opensAt, closesAt: original.closesAt } });
    await prisma.$disconnect(); await rm(config.storage, { recursive: true, force: true });
  });
});
