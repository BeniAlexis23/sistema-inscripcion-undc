import { expect, it } from 'vitest';
import { staffFormSchema, staffIssueMessage } from '../../frontend/src/staff-validation.js';
const valid = { name: 'Equipo', dependency: 'OTI', workplace: 'San Luis', category: 'FUTSAL_MALE', mixedDependencies: false, acceptedBases: true, delegate: { name: 'Delegado', documentType: 'DNI', documentNumber: '12345678', phone: '999999999', email: 'correo@example.org' }, participants: [{ firstName: 'Persona', lastName: 'Prueba', documentType: 'DNI', documentNumber: '12345679', phone: '999999999', sex: 'MALE', employment: 'DOCENTE', dependency: 'OTI' }] };
it('señala el DNI del delegado en el paso y campo correctos', () => {
  const r = staffFormSchema.safeParse({ ...valid, delegate: { ...valid.delegate, documentNumber: '1234567' } });
  expect(r.success).toBe(false); if (!r.success) { expect(r.error.issues[0].path).toEqual(['delegate', 'documentNumber']); expect(staffIssueMessage(r.error.issues[0])).toContain('Delegado · Número de documento'); }
});
it('identifica participante y campo que impiden continuar', () => {
  const r = staffFormSchema.safeParse({ ...valid, participants: [{ ...valid.participants[0], phone: 'abc' }] });
  expect(r.success).toBe(false); if (!r.success) expect(staffIssueMessage(r.error.issues[0])).toContain('Participante 1 · Celular');
});
it('rechaza un DNI repetido dentro de la nómina con error en el segundo campo', () => {
  const r = staffFormSchema.safeParse({ ...valid, participants: [valid.participants[0], valid.participants[0]] });
  expect(r.success).toBe(false); if (!r.success) expect(r.error.issues[0].path).toEqual(['participants', 1, 'documentNumber']);
});
