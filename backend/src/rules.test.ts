import { describe, expect, it } from 'vitest';
import { checkCapacity, checkCategory, checkDisciplines, checkEditable, checkRoster, checkWindow } from './rules.js';
import { allowTeam } from './services.js';
import { detectMime, app } from './app.js';
import request from 'supertest';
import { settingsSchema, userSchema } from './validation.js';
describe('Contraseñas de usuarios', () => {
  it('acepta seis caracteres y rechaza cinco al crear cuentas', () => {
    const user = { name: 'Usuario de prueba', email: 'prueba@test.invalid', dni: '00000001', phone: '999999999', role: 'ADMIN' };
    expect(() => userSchema.parse({ ...user, password: 'abc123' })).not.toThrow();
    expect(() => userSchema.parse({ ...user, password: 'abc12' })).toThrow();
  });
});
describe('Enlaces públicos de documentos', () => {
  const base = { opensAt: '2026-11-06T05:00:00.000Z', closesAt: '2026-11-20T04:59:00.000Z', correctionsEnabled: false };
  it('admite enlaces de Drive y permite limpiar los campos opcionales', () => {
    expect(settingsSchema.parse({ ...base, basesUrl: 'https://drive.google.com/file/d/ejemplo/view', formatsUrl: '' }).formatsUrl).toBeNull();
    expect(settingsSchema.parse(base).basesUrl).toBeUndefined();
  });
  it('rechaza esquemas ejecutables y enlaces malformados', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,test', 'no-es-un-enlace']) expect(() => settingsSchema.parse({ ...base, basesUrl: value })).toThrow();
  });
});
describe('Reglas del torneo', () => {
  it('impide una tercera disciplina y duplicar una existente', () => {
    expect(() => checkDisciplines(['FUTSAL', 'CHESS'], 'VOLLEYBALL')).toThrow('tercera');
    expect(() => checkDisciplines(['FUTSAL'], 'FUTSAL')).toThrow('ya está');
    expect(() => checkDisciplines(['FUTSAL'], 'CHESS')).not.toThrow();
  });
  it('respeta cupos y composición de ajedrez sin inventar mínimos', () => {
    expect(() => checkCapacity('FUTSAL', 12)).toThrow();
    expect(() => checkCapacity('CHESS', 10)).toThrow();
    expect(() => checkCapacity('VOLLEYBALL', 11)).not.toThrow();
    expect(() => checkRoster('FUTSAL', ['MALE'])).not.toThrow();
    expect(() => checkRoster('CHESS', [...Array(5).fill('FEMALE'), ...Array(5).fill('MALE')])).not.toThrow();
    expect(() => checkRoster('CHESS', Array(10).fill('MALE'))).toThrow();
  });
  it('valida sexo y acceso a la escuela y equipo asignados', () => {
    expect(() => checkCategory('FEMALE', 'MALE')).toThrow();
    expect(() => checkCategory('MIXED', 'MALE')).not.toThrow();
    expect(() => allowTeam({ role: 'DELEGATE', id: 1, schoolId: 1 }, { delegateId: 2, schoolId: 1 })).toThrow();
    expect(() => allowTeam({ role: 'DELEGATE', id: 1, schoolId: 1 }, { delegateId: 1, schoolId: 2 })).toThrow();
    expect(() => allowTeam({ role: 'COMMISSION', id: 3, schoolId: null }, { delegateId: 1, schoolId: 1 })).not.toThrow();
  });
  it('bloquea enviados y aprobados; permite subsanación habilitada', () => {
    expect(() => checkEditable('SUBMITTED')).toThrow(); expect(() => checkEditable('APPROVED')).toThrow();
    const t = { opensAt: new Date('2026-11-06T05:00:00Z'), closesAt: new Date('2026-11-20T04:59:00Z'), correctionsEnabled: true };
    expect(() => checkWindow(t, 'DRAFT', new Date('2026-11-20T05:00:00Z'))).toThrow();
    expect(() => checkWindow(t, 'OBSERVED', new Date('2026-11-20T05:00:00Z'))).not.toThrow();
  });
  it('detecta tipos por contenido, no por extensión', () => {
    expect(detectMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(detectMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectMime(Buffer.from([255, 216, 255, 224]))).toBe('image/jpeg');
  });
});
describe('Protecciones HTTP', () => {
  it('deniega equipos y descargas sin sesión', async () => {
    expect((await request(app).get('/api/v1/teams')).status).toBe(401);
    expect((await request(app).get('/api/v1/documents/1')).status).toBe(401);
    expect((await request(app).get('/api/v1/reports/approved/pdf')).status).toBe(401);
  });
  it('rechaza mutaciones sin cabecera y orígenes externos', async () => {
    expect((await request(app).post('/api/v1/sessions').send({})).status).toBe(403);
    expect((await request(app).post('/api/v1/sessions').set('X-Requested-With', 'undc-web').set('Origin', 'https://externo.example').send({})).status).toBe(403);
  });
});
