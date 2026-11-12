import { z } from 'zod';
import { assert, normalize } from './rules.js';
export const staffCategories = [
  { id: 'FUTSAL_MALE', name: 'Futsal varones', capacity: 12 },
  { id: 'FUTSAL_FEMALE', name: 'Futsal damas', capacity: 8 },
  { id: 'VOLLEYBALL_MIXED', name: 'Vóleibol mixto', capacity: 12 },
] as const;
const text = (max: number) => z.string().trim().min(2).max(max);
const identity = { documentType: z.enum(['DNI', 'CE', 'OTHER']), documentNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{5,20}$/) };
export const staffParticipantSchema = z.object({
  firstName: text(100).transform(normalize), lastName: text(150).transform(normalize), ...identity,
  sex: z.enum(['FEMALE', 'MALE']), phone: z.string().regex(/^\+?[\d ]{7,20}$/),
  employment: z.enum(['DOCENTE', 'ADMINISTRATIVO', 'LOCADOR']), dependency: text(200),
}).refine(a => a.documentType !== 'DNI' || /^\d{8}$/.test(a.documentNumber), { message: 'El DNI debe tener ocho dígitos.', path: ['documentNumber'] });
export const staffSchema = z.object({
  category: z.enum(['FUTSAL_MALE', 'FUTSAL_FEMALE', 'VOLLEYBALL_MIXED']),
  name: text(100), dependency: text(200), workplace: text(150), mixedDependencies: z.boolean(),
  delegate: z.object({ name: text(150), ...identity, phone: z.string().regex(/^\+?[\d ]{7,20}$/), email: z.email().max(191).transform(v => v.toLowerCase()) }).refine(a => a.documentType !== 'DNI' || /^\d{8}$/.test(a.documentNumber), { message: 'El DNI debe tener ocho dígitos.', path: ['documentNumber'] }),
  participants: z.array(staffParticipantSchema).min(1).max(10), acceptedBases: z.literal(true),
}).superRefine((data, ctx) => {
  if (new Set(data.participants.map(a => `${a.documentType}:${a.documentNumber}`)).size !== data.participants.length) ctx.addIssue({ code: 'custom', path: ['participants'], message: 'Hay participantes duplicados en la nómina.' });
  if (!data.mixedDependencies && data.participants.some(a => normalize(a.dependency) !== normalize(data.dependency))) ctx.addIssue({ code: 'custom', path: ['mixedDependencies'], message: 'Declare la agrupación de distintas dependencias y adjunte su autorización.' });
});
export type StaffInput = z.infer<typeof staffSchema>;
export function validateStaffRoster(data: StaffInput) {
  const sexes = data.participants.map(a => a.sex);
  assert(sexes.length <= 10, 'El plantel máximo es de diez participantes.');
  if (data.category === 'FUTSAL_MALE') assert(sexes.every(s => s === 'MALE'), 'Futsal varones admite únicamente varones.');
  if (data.category === 'FUTSAL_FEMALE') assert(sexes.every(s => s === 'FEMALE'), 'Futsal damas admite únicamente damas.');
  if (data.category === 'VOLLEYBALL_MIXED') {
    const women = sexes.filter(s => s === 'FEMALE').length, men = sexes.length - women;
    assert([[3, 3], [4, 2], [5, 1]].some(([f, m]) => women >= f && men >= m), 'La nómina debe permitir una alineación de 3 damas y 3 varones, 4 y 2, o 5 y 1. Máximo diez integrantes.');
  }
}
export function staffFields(data: StaffInput) {
  return ['roster', ...(data.mixedDependencies ? ['authorization'] : []), ...data.participants.flatMap((_a, i) => [`fitness_${i}`, `responsibility_${i}`])];
}
export const staffChecks = ['roster', 'capacity', 'identity', 'employment', 'fitness', 'responsibility', 'delegate', 'composition', 'authorization'] as const;
