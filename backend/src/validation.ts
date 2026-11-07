import { z } from 'zod';
z.config(z.locales.es());
export const teamDetailsShape = {
  name: z.string().trim().min(2, 'Ingrese el nombre del equipo.').max(100),
  cycle: z.string().trim().pipe(z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'], { error: 'Seleccione un ciclo de I a X.' })),
  shift: z.enum(['Mañana', 'Tarde', 'Noche']),
  section: z.string().trim().pipe(z.enum(['A', 'B'], { error: 'Seleccione la sección A o B.' })),
};
const name = z.string().trim().min(2).max(100);
const dni = z.string().regex(/^\d{8}$/, 'El DNI debe contener ocho dígitos.');
const phone = z.string().regex(/^\+?[\d ]{7,20}$/, 'Ingrese un celular válido.');
export const athleteSchema = z.object({
  firstName: name, lastName: z.string().trim().min(2).max(150), dni,
  studentCode: z.string().trim().min(2).max(30).regex(/^[a-zA-Z0-9-]+$/),
  sex: z.enum(['FEMALE', 'MALE']), phone,
});
export const userSchema = z.object({
  name: z.string().trim().min(2).max(150), email: z.email().max(191).transform(s => s.toLowerCase()), dni, phone,
  password: z.string().min(6).max(128), role: z.enum(['ADMIN', 'COMMISSION', 'DELEGATE']), schoolId: z.number().int().positive().nullable().optional(),
}).refine(u => u.role !== 'DELEGATE' || !!u.schoolId, { message: 'El delegado requiere una escuela.', path: ['schoolId'] });
export const reviewSchema = z.object({
  version: z.number().int().positive(), result: z.enum(['OBSERVED', 'APPROVED']), notes: z.string().trim().max(4000),
  checks: z.object({ roster: z.boolean(), capacity: z.boolean(), fitness: z.boolean(), responsibility: z.boolean(), enrollment: z.boolean(), school: z.boolean(), disciplines: z.boolean(), identity: z.boolean() }).catchall(z.boolean()),
});
const documentUrl = z.union([z.literal(''), z.url().max(2048).refine(value => ['https:', 'http:'].includes(new URL(value).protocol), 'Ingrese un enlace HTTP o HTTPS válido.')]).nullable().optional().transform(value => value === '' ? null : value);
export const settingsSchema = z.object({ opensAt: z.iso.datetime(), closesAt: z.iso.datetime(), correctionsEnabled: z.boolean(), basesUrl: documentUrl, formatsUrl: documentUrl, otherDocumentsUrl: documentUrl })
  .refine(t => new Date(t.opensAt) < new Date(t.closesAt), { message: 'El cierre debe ser posterior a la apertura.' });
