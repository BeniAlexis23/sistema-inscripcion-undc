import { z } from 'zod';
const text = (max: number) => z.string().trim().min(2, 'Ingrese al menos dos caracteres.').max(max, `Máximo ${max} caracteres.`);
const phone = z.string().regex(/^\+?[\d ]{7,20}$/, 'Ingrese un celular válido de 7 a 20 caracteres.');
const documentFields = { documentType: z.enum(['DNI', 'CE', 'OTHER']), documentNumber: z.string().trim().regex(/^[A-Za-z0-9-]{5,20}$/, 'Ingrese un documento válido de 5 a 20 caracteres.') };
const validDni = (p: {documentType: string; documentNumber: string}) => p.documentType !== 'DNI' || /^\d{8}$/.test(p.documentNumber);
export const staffFormSchema = z.object({
  name: text(100), dependency: text(200), workplace: text(150), category: z.enum(['FUTSAL_MALE', 'FUTSAL_FEMALE', 'VOLLEYBALL_MIXED']), mixedDependencies: z.boolean(),
  delegate: z.object({ name: text(150), ...documentFields, phone, email: z.email('Ingrese un correo válido.') }).refine(validDni, { path: ['documentNumber'], message: 'El DNI debe contener exactamente ocho dígitos.' }),
  participants: z.array(z.object({ firstName: text(100), lastName: text(150), ...documentFields, sex: z.enum(['FEMALE', 'MALE']), phone, employment: z.enum(['DOCENTE', 'ADMINISTRATIVO', 'LOCADOR']), dependency: text(200) }).refine(validDni, { path: ['documentNumber'], message: 'El DNI debe contener exactamente ocho dígitos.' })).min(1, 'Agregue al menos un participante.').max(10, 'Máximo diez participantes.'),
  acceptedBases: z.boolean().refine(v => v, 'Debe leer y aceptar las bases.'),
}).superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.participants.forEach((p, i) => { const key = `${p.documentType}:${p.documentNumber.toUpperCase()}`; if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['participants', i, 'documentNumber'], message: 'Esta persona ya está en la nómina de este equipo.' }); seen.add(key); });
});
export function staffIssueMessage(issue: z.core.$ZodIssue) {
  const labels: Record<string, string> = { name: 'Nombre', dependency: 'Dependencia', workplace: 'Sede', category: 'Categoría', documentType: 'Tipo de documento', documentNumber: 'Número de documento', firstName: 'Nombres', lastName: 'Apellidos', sex: 'Sexo', employment: 'Vínculo', phone: 'Celular', email: 'Correo', acceptedBases: 'Aceptación de bases' };
  const prefix = issue.path[0] === 'participants' ? `Participante ${Number(issue.path[1] || 0) + 1}` : issue.path[0] === 'delegate' ? 'Delegado' : 'Equipo';
  return `${prefix} · ${labels[String(issue.path.at(-1))] || 'Nómina'}: ${issue.message}`;
}
