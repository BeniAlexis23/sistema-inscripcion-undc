import type { Discipline, Gender, Sex, TeamStatus } from '@prisma/client';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function assert(condition: unknown, message: string, status = 422): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export const CHECK_KEYS = ['roster', 'capacity', 'fitness', 'responsibility', 'enrollment', 'school', 'disciplines', 'identity'] as const;
export function checkCategory(gender: Gender, sex: Sex) {
  assert(gender === 'MIXED' || gender === sex, 'El sexo del deportista no corresponde a la categoría.');
}
export function checkCapacity(discipline: Discipline, count: number) {
  assert(count < (discipline === 'CHESS' ? 10 : 12), 'El equipo alcanzó el máximo de deportistas.');
}
export function checkDisciplines(existing: Discipline[], next: Discipline) {
  assert(!existing.includes(next), 'El estudiante ya está inscrito en esta disciplina.');
  assert(new Set([...existing, next]).size <= 2, 'El estudiante no puede participar en una tercera disciplina.');
}
export function checkRoster(discipline: Discipline, sexes: Sex[]) {
  if (discipline === 'CHESS') {
    assert(sexes.length === 10 && sexes.filter(s => s === 'FEMALE').length === 5 && sexes.filter(s => s === 'MALE').length === 5,
      'Ajedrez requiere exactamente 10 deportistas: cinco damas y cinco varones.');
  } else assert(sexes.length <= 12, 'La nómina excede los 12 deportistas.');
}
export function checkWindow(t: { opensAt: Date; closesAt: Date; correctionsEnabled: boolean }, status: TeamStatus, now = new Date()) {
  assert((now >= t.opensAt && now <= t.closesAt) || (status === 'OBSERVED' && t.correctionsEnabled), 'El periodo de inscripción está cerrado.', 409);
}
export function checkEditable(status: TeamStatus) {
  assert(status === 'DRAFT' || status === 'OBSERVED', 'El expediente está bloqueado para edición.', 409);
}
export const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-PE');
