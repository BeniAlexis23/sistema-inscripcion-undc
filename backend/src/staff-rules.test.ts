import { describe, expect, it } from 'vitest';
import { staffSchema, staffFields, validateStaffRoster, type StaffInput } from './staff-rules.js';
const person = (sex: 'MALE' | 'FEMALE', i: number) => ({ firstName: 'María', lastName: 'Pérez', documentType: 'DNI' as const, documentNumber: String(12345000 + i), sex, phone: '999999999', employment: 'DOCENTE' as const, dependency: 'Recursos Humanos' });
const input = (sexes: ('MALE' | 'FEMALE')[], category: StaffInput['category'] = 'VOLLEYBALL_MIXED') => staffSchema.parse({ name: 'Equipo personal', dependency: 'Recursos Humanos', workplace: 'San Luis', category, mixedDependencies: false, delegate: { name: 'Delegado responsable', documentType: 'DNI', documentNumber: '12345678', phone: '999999999', email: 'test@example.org' }, participants: sexes.map(person), acceptedBases: true });
describe('Bases de docentes y administrativos', () => {
  it.each([[3, 3], [4, 2], [5, 1], [5, 5]])('permite nómina con %i damas y %i varones', (f, m) => expect(() => validateStaffRoster(input([...Array(f).fill('FEMALE'), ...Array(m).fill('MALE')]))).not.toThrow());
  it.each([[2, 4], [6, 0], [3, 1]])('rechaza nómina con %i damas y %i varones', (f, m) => expect(() => validateStaffRoster(input([...Array(f).fill('FEMALE'), ...Array(m).fill('MALE')]))).toThrow());
  it('no aplica código universitario ni límite de dos disciplinas de estudiantes', () => {
    const data = input(['MALE'], 'FUTSAL_MALE'); expect(data.participants[0]).not.toHaveProperty('studentCode');
    expect(() => validateStaffRoster(data)).not.toThrow();
    expect(() => validateStaffRoster(input(['MALE'], 'FUTSAL_FEMALE'))).toThrow();
  });
  it('limita plantel a diez y solicita solo los documentos firmados', () => {
    expect(() => input(Array(11).fill('MALE'), 'FUTSAL_MALE')).toThrow();
    const data = input(['MALE'], 'FUTSAL_MALE');
    expect(staffFields(data)).toEqual(['roster', 'fitness_0', 'responsibility_0']);
    expect(staffFields({ ...data, mixedDependencies: true })).toContain('authorization');
    expect(staffSchema.safeParse({ ...data, participants: [{ ...data.participants[0], documentType: 'CE', documentNumber: 'CE123456' }] }).success).toBe(true);
    expect(staffSchema.safeParse({ ...data, participants: [data.participants[0], data.participants[0]] }).success).toBe(false);
  });
  it('exige declarar la agrupación de dependencias distintas', () => {
    const data = input(['MALE'], 'FUTSAL_MALE'); data.participants[0].dependency = 'Otra oficina';
    expect(staffSchema.safeParse(data).success).toBe(false);
    expect(staffSchema.safeParse({ ...data, mixedDependencies: true }).success).toBe(true);
  });
});
