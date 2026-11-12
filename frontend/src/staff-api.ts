import type { Status } from './api';
export const staffCategories = [
  { id: 'FUTSAL_MALE', name: 'Futsal varones', capacity: 12 },
  { id: 'FUTSAL_FEMALE', name: 'Futsal damas', capacity: 8 },
  { id: 'VOLLEYBALL_MIXED', name: 'Vóleibol mixto', capacity: 12 },
];
export const categoryName = (id: string) => staffCategories.find(c => c.id === id)?.name || id;
export const employmentLabels: Record<string, string> = { DOCENTE: 'Docente', ADMINISTRATIVO: 'Administrativo', LOCADOR: 'Locador de servicios' };
export type StaffPerson = { firstName: string; lastName: string; documentType: 'DNI' | 'CE' | 'OTHER'; documentNumber: string; sex: 'FEMALE' | 'MALE'; phone: string; employment: 'DOCENTE' | 'ADMINISTRATIVO' | 'LOCADOR'; dependency: string };
export type StaffData = { name: string; dependency: string; workplace: string; category: string; mixedDependencies: boolean; delegate: { name: string; documentType: string; documentNumber: string; phone: string; email: string }; participants: StaffPerson[]; acceptedBases: boolean };
export type StaffTeam = StaffData & { id: number; status: Status; version: number; receivedAt: string; receiptCode: string; documents: { id: number; field: string; originalName: string }[]; reviews: { id: number; action: string; notes: string; actorName: string; createdAt: string; checks: Record<string, boolean> }[] };
export type StaffEvent = { id: number; name: string; opensAt: string; closesAt: string; basesUrl: string | null; formatsUrl: string | null; categories: { id: string; name: string; capacity: number; approved: number }[]; documents: { id: string; title: string; href: string }[] };
export const staffFields = (data: StaffData) => ['roster', ...(data.mixedDependencies ? ['authorization'] : []), ...data.participants.flatMap((_a, i) => [`fitness_${i}`, `responsibility_${i}`])];
export function documentLabel(field: string, participants: StaffPerson[]) {
  if (field === 'roster') return 'Ficha oficial firmada por el delegado';
  if (field === 'authorization') return 'Autorización de la Subcomisión para distintas dependencias';
  const [kind, index] = field.split('_'), person = participants[Number(index)];
  const labels: Record<string, string> = { fitness: 'Declaración de aptitud física firmada', responsibility: 'Declaración de responsabilidad firmada', identity: 'Documento de identidad para cotejo', employment: 'Sustento de vínculo vigente con la UNDC' };
  return `${labels[kind]} · ${person?.lastName || ''}, ${person?.firstName || ''}`;
}
export const staffCheckLabels: Record<string, string> = {
  roster: 'Ficha oficial firmada y nómina de máximo diez participantes', capacity: 'Cupo disponible y orden de recepción del expediente válido',
  identity: 'Identidades cotejadas; sin duplicados en la categoría', employment: 'Vínculo actual con la UNDC verificado manualmente en cada participante',
  fitness: 'Declaraciones individuales de aptitud física firmadas', responsibility: 'Declaraciones individuales de responsabilidad firmadas',
  delegate: 'Declaración del delegado, identidad y contacto', composition: 'Sexo de futsal o composición reglamentaria de vóleibol mixto',
  authorization: 'Autorización previa de distintas dependencias verificada, o no corresponde',
};
