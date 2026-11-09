import 'dotenv/config';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomInt, randomUUID } from 'node:crypto';
import { access, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.TEST_DATABASE_URL;
if (url) {
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('La base de integración debe terminar en _test.');
  process.env.DATABASE_URL = url;
  process.env.STORAGE_DIR = path.resolve('..', 'tmp', `integration-${randomUUID()}`);
}
const { app } = await import('../src/app.js');
const { prisma, config } = await import('../src/config.js');
const { createSession } = await import('../src/auth.js');
const H = { 'X-Requested-With': 'undc-web' };
describe.skipIf(!url)('Flujo real MySQL, permisos y concurrencia', () => {
  let delegateCookie: string, otherCookie: string, commissionCookie: string;
  let schoolId: number, otherSchoolId: number, tournamentId: number;
  const teamIds: number[] = [], userIds: number[] = [], athleteIds: number[] = [];
  const tag = randomUUID().slice(0, 8), dni = () => String(randomInt(10000000, 99999999));
  const password = randomUUID();
  let categories: { id: number; discipline: string; gender: string }[];
  let mainTournament: { id: number; opensAt: Date; closesAt: Date };
  const makeAthlete = (sex = 'MALE') => ({ firstName: 'Prueba', lastName: 'Integración', dni: dni(), studentCode: randomUUID().slice(0, 20), phone: '999999999', sex });
  const post = (route: string, body: object, cookie = delegateCookie) => request(app).post(`/api/v1${route}`).set(H).set('Cookie', cookie).send(body);
  beforeAll(async () => {
    await prisma.$connect();
    const schools = await prisma.school.findMany(); schoolId = schools[0].id; otherSchoolId = schools[1].id;
    const tournament = await prisma.tournament.create({ data: { name: `Prueba ${tag}`, semester: '2026-II', opensAt: new Date('2020-01-01'), closesAt: new Date('2099-01-01') } }); tournamentId = tournament.id;
    categories = await prisma.category.findMany();
    mainTournament = await prisma.tournament.findFirstOrThrow({ orderBy: { id: 'asc' } });
    await prisma.tournament.update({ where: { id: mainTournament.id }, data: { opensAt: new Date('2020-01-01'), closesAt: new Date('2099-01-01') } });
    const hash = await argon2.hash(password);
    for (const [role, school] of [['DELEGATE', schoolId], ['DELEGATE', otherSchoolId], ['COMMISSION', null]] as const) {
      const u = await prisma.user.create({ data: { name: 'Usuario de prueba', email: `${randomUUID()}@test.invalid`, dni: dni(), phone: '999999999', passwordHash: hash, role, schoolId: school } });
      userIds.push(u.id); const session = await createSession(u.id);
      const cookie = `undc_session=${session.token}`;
      if (role === 'COMMISSION') commissionCookie = cookie; else if (school === schoolId) delegateCookie = cookie; else otherCookie = cookie;
    }
    await mkdir(config.storage, { recursive: true });
  }, 30000);
  async function makeTeam(discipline: string, gender = 'MALE', school = schoolId, delegate = userIds[0]) {
    const category = categories.find(c => c.discipline === discipline && c.gender === gender)!;
    const t = await prisma.team.create({ data: { tournamentId, schoolId: school, categoryId: category.id, delegateId: delegate } }); teamIds.push(t.id); return t;
  }
  async function add(teamId: number, a = makeAthlete(), cookie = delegateCookie) {
    const r = await post(`/teams/${teamId}/athletes`, a, cookie); if (r.status === 201) athleteIds.push(r.body.athleteId); return r;
  }
  async function attach(teamId: number, kind: string, participationId?: number) {
    let r = request(app).post(`/api/v1/teams/${teamId}/documents`).set(H).set('Cookie', delegateCookie).field('kind', kind);
    if (participationId) r = r.field('participationId', String(participationId));
    return r.attach('file', Buffer.from('%PDF-1.4\n% Test upload\n%%EOF'), { filename: 'firmado.pdf', contentType: 'application/pdf' });
  }
  it('envía, observa, subsana, aprueba y reabre con motivo; deniega acceso ajeno', async () => {
    const t = await makeTeam('FUTSAL');
    const a = await add(t.id); expect(a.status).toBe(201);
    expect((await request(app).get(`/api/v1/teams/${t.id}`).set('Cookie', otherCookie)).status).toBe(403);
    expect((await post(`/teams/${t.id}/submit`, {})).status).toBe(422);
    const roster = await attach(t.id, 'ROSTER'); expect(roster.status).toBe(201);
    expect((await request(app).get(`/api/v1/documents/${roster.body.id}`).set('Cookie', otherCookie)).status).toBe(403);
    expect((await attach(t.id, 'FITNESS', a.body.id)).status).toBe(201);
    expect((await attach(t.id, 'RESPONSIBILITY', a.body.id)).status).toBe(201);
    expect((await post(`/teams/${t.id}/submit`, {})).status).toBe(204);
    expect((await add(t.id)).status).toBe(409);
    let team = await prisma.team.findUniqueOrThrow({ where: { id: t.id } });
    const keys = ['roster', 'capacity', 'fitness', 'responsibility', 'enrollment', 'school', 'disciplines', 'identity'];
    const checks = Object.fromEntries(keys.map(k => [k, true]));
    expect((await post(`/teams/${t.id}/reviews`, { version: team.version - 1, result: 'APPROVED', notes: '', checks }, commissionCookie)).status).toBe(409);
    expect((await post(`/teams/${t.id}/reviews`, { version: team.version, result: 'APPROVED', notes: '', checks: { ...checks, enrollment: false } }, commissionCookie)).status).toBe(422);
    expect((await post(`/teams/${t.id}/reviews`, { version: team.version, result: 'OBSERVED', notes: 'Subsanar firma', checks }, commissionCookie)).status).toBe(204);
    expect((await attach(t.id, 'FITNESS', a.body.id)).status).toBe(201);
    expect((await post(`/teams/${t.id}/submit`, {})).status).toBe(204);
    team = await prisma.team.findUniqueOrThrow({ where: { id: t.id } });
    expect((await post(`/teams/${t.id}/reviews`, { version: team.version, result: 'APPROVED', notes: '', checks }, commissionCookie)).status).toBe(204);
    expect((await post(`/teams/${t.id}/reopen`, { reason: 'Revisar declaración' }, delegateCookie)).status).toBe(403);
    expect((await post(`/teams/${t.id}/reopen`, { reason: 'Revisar declaración' }, commissionCookie)).status).toBe(204);
    const pdf = await request(app).get(`/api/v1/teams/${t.id}/formats/responsibility?participationId=${a.body.id}`).set('Cookie', delegateCookie);
    expect(pdf.status).toBe(200); expect(pdf.headers['content-type']).toContain('application/pdf');
  });
  it('serializa dos altas simultáneas y rechaza una tercera disciplina', async () => {
    const first = await makeTeam('VOLLEYBALL'), second = await makeTeam('BASKETBALL'), third = await makeTeam('CHESS', 'MIXED');
    const a = makeAthlete(); expect((await add(first.id, a)).status).toBe(201);
    const results = await Promise.all([add(second.id, a), add(third.id, a)]);
    expect(results.map(r => r.status).sort()).toEqual([201, 422]);
    const athlete = await prisma.athlete.findUniqueOrThrow({ where: { dni: a.dni } });
    expect(await prisma.participation.count({ where: { athleteId: athlete.id, team: { tournamentId } } })).toBe(2);
  });
  it('rechaza duplicados, discrepancias, escuela distinta, sexo incorrecto y libera cupos', async () => {
    const t = await makeTeam('FUTSAL', 'FEMALE'), a = makeAthlete('FEMALE'); const p = await add(t.id, a); expect(p.status).toBe(201);
    expect((await add(t.id, a)).status).toBe(422);
    expect((await add(t.id, { ...a, firstName: 'Otro nombre' })).status).toBe(422);
    const other = await makeTeam('FUTSAL', 'FEMALE', otherSchoolId, userIds[1]);
    expect((await post(`/teams/${other.id}/athletes`, a, otherCookie)).status).toBe(422);
    expect((await add(t.id, makeAthlete('MALE'))).status).toBe(422);
    const correction = { ...a, firstName: 'Nombre corregido' };
    expect((await request(app).put(`/api/v1/teams/${t.id}/athletes/${p.body.id}`).set(H).set('Cookie', delegateCookie).send(correction)).status).toBe(204);
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: p.body.athleteId } })).firstName).toBe('NOMBRE CORREGIDO');
    expect((await request(app).delete(`/api/v1/teams/${t.id}/athletes/${p.body.id}`).set(H).set('Cookie', delegateCookie)).status).toBe(204);
    expect(await prisma.participation.count({ where: { athleteId: p.body.athleteId } })).toBe(0);
  });
  it('comisión edita y elimina en revisión, invalida firmas y bloquea expedientes aprobados', async () => {
    const t = await makeTeam('BASKETBALL', 'FEMALE'), a = makeAthlete('FEMALE');
    const participation = await add(t.id, a); expect(participation.status).toBe(201);
    const second = await makeTeam('VOLLEYBALL', 'FEMALE');
    const secondParticipation = await add(second.id, a); expect(secondParticipation.status).toBe(201);
    await attach(second.id, 'ROSTER'); await attach(second.id, 'FITNESS', secondParticipation.body.id); await attach(second.id, 'RESPONSIBILITY', secondParticipation.body.id);
    expect((await post(`/teams/${second.id}/submit`, {})).status).toBe(204);
    await attach(t.id, 'ROSTER'); await attach(t.id, 'FITNESS', participation.body.id); await attach(t.id, 'RESPONSIBILITY', participation.body.id);
    expect((await post(`/teams/${t.id}/submit`, {})).status).toBe(204);
    const edit = (cookie: string, input: object) => request(app).put(`/api/v1/teams/${t.id}/athletes/${participation.body.id}`).set(H).set('Cookie', cookie).send(input);
    expect((await edit(delegateCookie, { ...a, firstName: 'Corrección' })).status).toBe(409);
    expect((await edit(otherCookie, { ...a, firstName: 'Corrección' })).status).toBe(403);
    expect((await edit(commissionCookie, { ...a, firstName: 'Corrección comisión' })).status).toBe(204);
    let updated = await prisma.team.findUniqueOrThrow({ where: { id: t.id }, include: { documents: true, reviews: true } });
    expect(updated.status).toBe('OBSERVED'); expect(updated.documents).toHaveLength(0); expect(updated.reviews[0].result).toBe('OBSERVED');
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: participation.body.athleteId } })).firstName).toBe('CORRECCIÓN COMISIÓN');
    const related = await prisma.team.findUniqueOrThrow({ where: { id: second.id }, include: { documents: true } }); expect(related.status).toBe('OBSERVED'); expect(related.documents).toHaveLength(0);
    await prisma.team.update({ where: { id: second.id }, data: { status: 'APPROVED' } });
    expect((await edit(commissionCookie, { ...a, firstName: 'Cambio no permitido' })).status).toBe(409);
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: participation.body.athleteId } })).firstName).toBe('CORRECCIÓN COMISIÓN');
    await prisma.team.update({ where: { id: second.id }, data: { status: 'OBSERVED' } });
    await prisma.team.update({ where: { id: t.id }, data: { status: 'APPROVED' } });
    expect((await edit(commissionCookie, { ...a, firstName: 'No permitido' })).status).toBe(409);
    expect((await request(app).delete(`/api/v1/teams/${t.id}/athletes/${participation.body.id}`).set(H).set('Cookie', commissionCookie)).status).toBe(409);
    await prisma.team.update({ where: { id: t.id }, data: { status: 'SUBMITTED' } });
    expect((await request(app).delete(`/api/v1/teams/${t.id}/athletes/${participation.body.id}`).set(H).set('Cookie', commissionCookie)).status).toBe(204);
    expect(await prisma.participation.count({ where: { teamId: t.id } })).toBe(0);
    updated = await prisma.team.findUniqueOrThrow({ where: { id: t.id }, include: { documents: true, reviews: true } }); expect(updated.status).toBe('DRAFT');
    expect(await prisma.audit.count({ where: { teamId: t.id, action: 'ATHLETE_REMOVED' } })).toBe(0);
    expect(updated.reviews).toHaveLength(0);
    expect(await prisma.athlete.count({ where: { id: participation.body.athleteId } })).toBe(1);
    expect(await prisma.audit.count({ where: { teamId: second.id, action: 'ATHLETE_UPDATED' } })).toBe(1);
  });
  it('borra solo el seguimiento del deportista retirado y elimina su identidad al liberar su última participación', async () => {
    const t = await makeTeam('VOLLEYBALL', 'FEMALE', otherSchoolId, userIds[1]);
    const second = await makeTeam('BASKETBALL', 'FEMALE', otherSchoolId, userIds[1]);
    const a = makeAthlete('FEMALE');
    const target = await add(t.id, a, otherCookie), retained = await add(t.id, makeAthlete('FEMALE'), otherCookie);
    const shared = await add(second.id, a, otherCookie);
    expect([target.status, retained.status, shared.status]).toEqual([201, 201, 201]);
    const upload = async (participationId: number) => request(app).post(`/api/v1/teams/${t.id}/documents`).set(H).set('Cookie', otherCookie).field('kind', 'FITNESS').field('participationId', String(participationId)).attach('file', Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'firmado.pdf', contentType: 'application/pdf' });
    const deletedDoc = await upload(target.body.id), keptDoc = await upload(retained.body.id);
    expect([deletedDoc.status, keptDoc.status]).toEqual([201, 201]);
    const deletedFile = await prisma.document.findUniqueOrThrow({ where: { id: deletedDoc.body.id } });
    const keptFile = await prisma.document.findUniqueOrThrow({ where: { id: keptDoc.body.id } });
    const review = await prisma.review.create({ data: { teamId: t.id, reviewerId: userIds[2], result: 'OBSERVED', notes: 'Revisión general del equipo', checks: { [`document_${deletedDoc.body.id}`]: true, [`document_${keptDoc.body.id}`]: true, school: true } } });
    const remove = (teamId: number, id: number) => request(app).delete(`/api/v1/teams/${teamId}/athletes/${id}`).set(H).set('Cookie', commissionCookie);
    expect((await remove(t.id, target.body.id)).status).toBe(204);
    const history = await prisma.audit.findMany({ where: { teamId: t.id } });
    expect(history.some(row => JSON.stringify(row.details).includes(`"athleteId":${target.body.athleteId}`))).toBe(false);
    expect(history.some(row => row.action === 'ATHLETE_ADDED')).toBe(true);
    expect(await prisma.document.count({ where: { id: deletedDoc.body.id } })).toBe(0);
    expect(await prisma.document.count({ where: { id: keptDoc.body.id } })).toBe(1);
    await expect(access(path.join(config.storage, deletedFile.storageName))).rejects.toThrow();
    await expect(access(path.join(config.storage, keptFile.storageName))).resolves.toBeUndefined();
    expect((await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).checks).toEqual({ [`document_${keptDoc.body.id}`]: true, school: true });
    expect(await prisma.participation.count({ where: { id: retained.body.id } })).toBe(1);
    expect(await prisma.athlete.count({ where: { id: target.body.athleteId } })).toBe(1);
    expect(await prisma.audit.count({ where: { teamId: second.id, action: 'ATHLETE_ADDED' } })).toBe(1);
    expect((await remove(second.id, shared.body.id)).status).toBe(204);
    expect(await prisma.athlete.count({ where: { id: target.body.athleteId } })).toBe(0);
    expect(await prisma.audit.count({ where: { teamId: second.id } })).toBe(0);
  });
  const publicBody = (category: string, school = schoolId, athlete = makeAthlete()) => ({ schoolId: school, categoryId: categories.find(c => c.discipline === category && c.gender === 'MALE')!.id, delegate: { name: 'Delegado público de prueba', dni: dni(), phone: '999999999', email: 'delegado@test.invalid' }, athletes: [athlete], acceptedBases: true });
  async function sendPublic(data: ReturnType<typeof publicBody>, withFiles = true) {
    let r = request(app).post('/api/v1/public/registrations').set(H).field('data', JSON.stringify(data));
    if (withFiles) for (const name of ['roster', 'fitness_0', 'responsibility_0']) r = r.attach(name, Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'firmado.pdf', contentType: 'application/pdf' });
    const response = await r;
    if (response.status === 201) {
      const team = await prisma.team.findUniqueOrThrow({ where: { receiptCode: response.body.receiptCode } }); teamIds.push(team.id);
      athleteIds.push(...(await prisma.participation.findMany({ where: { teamId: team.id } })).map(p => p.athleteId));
    }
    return response;
  }
  it('publica catálogos y PDF sin login, pero mantiene privada la información de inscritos', async () => {
    const event = await request(app).get('/api/v1/public/event'); expect(event.status).toBe(200);
    expect(event.body.categories).toHaveLength(7); expect(event.body.documents).toHaveLength(2);
    const bases = await request(app).get('/api/v1/public/documents/bases'); expect(bases.status).toBe(200); expect(bases.headers['content-type']).toContain('application/pdf');
    expect((await request(app).get('/api/v1/teams')).status).toBe(401);
    expect((await request(app).get('/api/v1/public/documents/desconocido')).status).toBe(404);
  });
  it('permite a la comisión configurar enlaces de Drive que aparecen en el formulario público', async () => {
    const t = await prisma.tournament.findUniqueOrThrow({ where: { id: mainTournament.id } });
    const data = { opensAt: t.opensAt.toISOString(), closesAt: t.closesAt.toISOString(), correctionsEnabled: t.correctionsEnabled, basesUrl: 'https://drive.google.com/file/d/ejemplo-bases/view', formatsUrl: 'https://drive.google.com/file/d/ejemplo-formatos/view', otherDocumentsUrl: 'https://drive.google.com/drive/folders/ejemplo-documentos' };
    expect((await request(app).put(`/api/v1/tournaments/${t.id}`).set(H).send(data)).status).toBe(401);
    try {
      expect((await request(app).put(`/api/v1/tournaments/${t.id}`).set(H).set('Cookie', commissionCookie).send(data)).status).toBe(200);
      const event = await request(app).get('/api/v1/public/event');
      expect(event.body.documents.find((d: {id: string}) => d.id === 'bases').href).toBe(data.basesUrl);
      expect(event.body.documents).toHaveLength(3);
    } finally {
      await prisma.tournament.update({ where: { id: t.id }, data: { basesUrl: t.basesUrl, formatsUrl: t.formatsUrl, otherDocumentsUrl: t.otherDocumentsUrl } });
    }
  });
  it('recibe expediente público sin crear cuenta y permite revisión administrativa', async () => {
    const data = publicBody('FUTSAL');
    expect((await sendPublic(data, false)).status).toBe(422);
    const template = await request(app).post('/api/v1/public/formats/fitness?index=0').set(H).send(data); expect(template.status).toBe(200);
    const response = await sendPublic(data); expect(response.status).toBe(201); expect(response.body.receiptCode).toMatch(/^[a-f0-9-]{36}$/);
    const team = await prisma.team.findUniqueOrThrow({ where: { receiptCode: response.body.receiptCode }, include: { documents: true } });
    expect({ name: team.name, cycle: team.cycle, shift: team.shift, section: team.section }).toEqual({ name: null, cycle: null, shift: null, section: null });
    expect(team.delegateId).toBeNull(); expect(team.status).toBe('SUBMITTED'); expect(team.documents).toHaveLength(3);
    expect(await prisma.user.count({ where: { email: data.delegate.email } })).toBe(0);
    expect((await request(app).get(`/api/v1/documents/${team.documents[0].id}`)).status).toBe(401);
    const detail = await request(app).get(`/api/v1/teams/${team.id}`).set('Cookie', commissionCookie); expect(detail.status).toBe(200); expect(detail.body.delegate.name).toBe(data.delegate.name);
    const checks = Object.fromEntries(['roster', 'capacity', 'fitness', 'responsibility', 'enrollment', 'school', 'disciplines', 'identity'].map(k => [k, true]));
    expect((await post(`/teams/${team.id}/reviews`, { version: team.version, result: 'APPROVED', notes: '', checks }, commissionCookie)).status).toBe(204);
    expect((await sendPublic(data)).status).toBe(409);
    const duplicate = await sendPublic(data);
    expect(duplicate.body.message).toContain('Ya existe un equipo de esta escuela en esta categoría');
    await prisma.team.update({ where: { id: team.id }, data: { status: 'DRAFT' } });
    const participation = await prisma.participation.findFirstOrThrow({ where: { teamId: team.id } });
    expect((await request(app).delete(`/api/v1/teams/${team.id}/athletes/${participation.id}`).set(H).set('Cookie', commissionCookie)).status).toBe(204);
    // Real commission decisions cannot be overwritten by an anonymous submission.
    expect((await sendPublic(data)).status).toBe(409);
    await prisma.review.deleteMany({ where: { teamId: team.id } });
    const replacement = await sendPublic(data);
    expect(replacement.status).toBe(201);
    const replaced = await prisma.team.findUniqueOrThrow({ where: { receiptCode: replacement.body.receiptCode }, include: { participations: true, documents: true } });
    expect(replaced.id).toBe(team.id);
    expect(replaced.status).toBe('SUBMITTED');
    expect(replaced.participations).toHaveLength(1);
    expect(replaced.documents).toHaveLength(3);
    expect(await prisma.team.count({ where: { tournamentId: team.tournamentId, schoolId: team.schoolId, categoryId: team.categoryId } })).toBe(1);
    expect((await sendPublic(data)).status).toBe(409);
  });
  it('mantiene el límite de dos disciplinas ante envíos públicos simultáneos', async () => {
    const a = makeAthlete();
    expect((await sendPublic(publicBody('FUTSAL', otherSchoolId, a))).status).toBe(201);
    const responses = await Promise.all([sendPublic(publicBody('VOLLEYBALL', otherSchoolId, a)), sendPublic(publicBody('BASKETBALL', otherSchoolId, a))]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 422]);
    const athlete = await prisma.athlete.findUniqueOrThrow({ where: { dni: a.dni } });
    expect(await prisma.participation.count({ where: { athleteId: athlete.id, team: { tournamentId: mainTournament.id } } })).toBe(2);
  });
  afterAll(async () => {
    await prisma.review.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.audit.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { teamId: { in: teamIds } }] } });
    await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    await prisma.athlete.deleteMany({ where: { id: { in: athleteIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (tournamentId) await prisma.tournament.delete({ where: { id: tournamentId } });
    if (mainTournament) await prisma.tournament.update({ where: { id: mainTournament.id }, data: { opensAt: mainTournament.opensAt, closesAt: mainTournament.closesAt } });
    await prisma.$disconnect();
    await rm(config.storage, { recursive: true, force: true });
  });
});
