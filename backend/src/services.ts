import { Prisma, type User, type TeamStatus } from '@prisma/client';
import { prisma } from './config.js';
import { assert, checkCapacity, checkCategory, checkDisciplines, checkEditable, checkRoster, checkWindow, normalize } from './rules.js';
import { athleteSchema } from './validation.js';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export const teamInclude = {
  school: true, category: true, tournament: true,
  delegate: { select: { id: true, name: true, dni: true, phone: true, email: true } },
  participations: { include: { athlete: true }, orderBy: { id: 'asc' as const } },
  documents: { select: { id: true, kind: true, participationId: true, originalName: true, size: true, createdAt: true } },
  reviews: { include: { reviewer: { select: { name: true } } }, orderBy: { id: 'desc' as const } },
  audits: { include: { actor: { select: { name: true } } }, orderBy: { id: 'desc' as const } },
} satisfies Prisma.TeamInclude;
type StoredTeam = Prisma.TeamGetPayload<{ include: typeof teamInclude }>;
export type FullTeam = Omit<StoredTeam, 'delegate'> & { delegate: { id: number | null; name: string; dni: string; phone: string; email: string } };
export function presentTeam<T extends { delegate: { name: string } | null; delegateName: string | null; delegateDni: string | null; delegatePhone: string | null; delegateEmail: string | null }>(team: T) {
  return { ...team, delegate: team.delegate || { id: null, name: team.delegateName || 'Delegado público', dni: team.delegateDni || '', phone: team.delegatePhone || '', email: team.delegateEmail || '' } };
}
export function allowTeam(user: Pick<User, 'role' | 'id' | 'schoolId'>, team: { delegateId: number | null; schoolId: number }) {
  assert(user.role !== 'DELEGATE' || (team.delegateId === user.id && team.schoolId === user.schoolId), 'No tiene acceso a este equipo.', 403);
}
export async function getTeam(id: number, user: User) {
  const team = await prisma.team.findUnique({ where: { id }, include: teamInclude });
  assert(team, 'Equipo no encontrado.', 404); allowTeam(user, team); return presentTeam(team) as FullTeam;
}
export async function audit(tx: Prisma.TransactionClient, user: User, action: string, teamId?: number, details: Prisma.InputJsonValue = {}) {
  await tx.audit.create({ data: { actorId: user.id, action, teamId, details } });
}
// One locked tournament row serializes all roster changes and settings changes.
// This also protects an identity that does not yet exist from concurrent creation.
export function assertRosterEditable(user: Pick<User, 'role'>, team: { status: TeamStatus; tournament: { opensAt: Date; closesAt: Date; correctionsEnabled: boolean } }) {
  if (user.role === 'DELEGATE') { checkEditable(team.status); checkWindow(team.tournament, team.status); }
  else assert(team.status !== 'APPROVED', 'Reabra el expediente aprobado antes de modificar su nómina.', 409);
}
async function observeRosterChange(tx: Prisma.TransactionClient, teamId: number, status: TeamStatus, user: User, athleteId: number) {
  if (status !== 'SUBMITTED') return;
  const notes = 'La comisión modificó la nómina durante la revisión. Se deben adjuntar los documentos afectados nuevamente y reenviar el expediente.';
  await tx.team.update({ where: { id: teamId }, data: { status: 'OBSERVED' } });
  const review = await tx.review.create({ data: { teamId, reviewerId: user.id, result: 'OBSERVED', checks: {}, notes } });
  await audit(tx, user, 'TEAM_OBSERVED', teamId, { notes, reason: 'ROSTER_CHANGED', athleteId, reviewId: review.id });
}
export async function withTeam<T>(id: number, user: User, work: (tx: Prisma.TransactionClient, team: FullTeam) => Promise<T>, editable: boolean | 'roster' = false) {
  const initial = await getTeam(id, user);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Tournament WHERE id = ${initial.tournamentId} FOR UPDATE`;
    const team = presentTeam(await tx.team.findUniqueOrThrow({ where: { id }, include: teamInclude })) as FullTeam;
    allowTeam(user, team);
    if (editable === 'roster') assertRosterEditable(user, team);
    else if (editable) { checkEditable(team.status); if (user.role === 'DELEGATE') checkWindow(team.tournament, team.status); }
    return work(tx, team);
  }, { maxWait: 10000, timeout: 20000 });
}
export async function addAthlete(id: number, user: User, input: unknown) {
  const data = athleteSchema.parse(input);
  const result = await withTeam(id, user, async (tx, team) => {
    checkCapacity(team.category.discipline, team.participations.length);
    checkCategory(team.category.gender, data.sex);
    const matches = await tx.athlete.findMany({ where: { OR: [{ dni: data.dni }, { studentCode: data.studentCode }] } });
    let athlete = matches[0];
    if (athlete) {
      assert(matches.length === 1 && athlete.dni === data.dni && athlete.studentCode === data.studentCode, 'El DNI o código universitario pertenece a otra identidad.');
      assert(athlete.schoolId === team.schoolId, 'El estudiante pertenece a otra escuela profesional.');
      assert(normalize(athlete.firstName) === normalize(data.firstName) && normalize(athlete.lastName) === normalize(data.lastName) && athlete.sex === data.sex && athlete.phone === data.phone,
        'Los datos no coinciden con la identidad registrada. La comisión debe revisar la discrepancia.');
      const previous = await tx.participation.findMany({ where: { athleteId: athlete.id, team: { tournamentId: team.tournamentId } }, include: { team: { include: { category: true } } } });
      checkDisciplines(previous.map(p => p.team.category.discipline), team.category.discipline);
    } else athlete = await tx.athlete.create({ data: { ...data, firstName: normalize(data.firstName), lastName: normalize(data.lastName), schoolId: team.schoolId } });
    const participation = await tx.participation.create({ data: { teamId: id, athleteId: athlete.id } });
    const old = await tx.document.findMany({ where: { teamId: id, kind: 'ROSTER' } });
    await tx.document.deleteMany({ where: { teamId: id, kind: 'ROSTER' } });
    await tx.team.update({ where: { id }, data: { version: { increment: 1 } } });
    await audit(tx, user, 'ATHLETE_ADDED', id, { athleteId: athlete.id });
    return { participation, old };
  }, true);
  await Promise.all(result.old.map(d => unlink(path.join(config.storage, d.storageName)).catch(() => {})));
  return result.participation;
}
export async function editAthlete(id: number, participationId: number, user: User, input: unknown) {
  const data = athleteSchema.parse(input);
  const obsolete = await withTeam(id, user, async (tx, team) => {
    const p = team.participations.find(p => p.id === participationId); assert(p, 'Deportista no encontrado.', 404);
    const related = await tx.participation.findMany({ where: { athleteId: p.athleteId }, include: { team: { include: { tournament: true, category: true } } } });
    for (const row of related) {
      allowTeam(user, row.team);
      assertRosterEditable(user, row.team); checkCategory(row.team.category.gender, data.sex);
    }
    await tx.athlete.update({ where: { id: p.athleteId }, data: { ...data, firstName: normalize(data.firstName), lastName: normalize(data.lastName) } });
    const teamIds = related.map(r => r.teamId), participationIds = related.map(r => r.id);
    const docs = await tx.document.findMany({ where: { OR: [{ participationId: { in: participationIds } }, { teamId: { in: teamIds }, kind: 'ROSTER' }] } });
    await tx.document.deleteMany({ where: { id: { in: docs.map(d => d.id) } } });
    await tx.team.updateMany({ where: { id: { in: teamIds } }, data: { version: { increment: 1 } } });
    for (const row of related) {
      await audit(tx, user, 'ATHLETE_UPDATED', row.teamId, { athleteId: p.athleteId });
      await observeRosterChange(tx, row.teamId, row.team.status, user, p.athleteId);
    }
    return docs;
  }, 'roster');
  await Promise.all(obsolete.map(d => unlink(path.join(config.storage, d.storageName)).catch(() => {})));
}
export async function removeAthlete(id: number, participationId: number, user: User) {
  const obsolete = await withTeam(id, user, async (tx, team) => {
    const p = team.participations.find(p => p.id === participationId); assert(p, 'Deportista no encontrado.', 404);
    const docs = await tx.document.findMany({ where: { OR: [{ participationId }, { teamId: id, kind: 'ROSTER' }] } });
    const documentIds = new Set(docs.map(d => d.id));
    const detailsOf = (value: Prisma.JsonValue) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const linkedAudits = team.audits.filter(a => {
      const details = detailsOf(a.details);
      return details.athleteId === p.athleteId || details.participationId === participationId || (typeof details.documentId === 'number' && documentIds.has(details.documentId));
    });
    // Include replaced/invalidated documents whose upload history still identifies this participation.
    for (const a of linkedAudits) { const details = detailsOf(a.details); if (typeof details.documentId === 'number') documentIds.add(details.documentId); }
    const reviewIds = linkedAudits.flatMap(a => {
      const details = detailsOf(a.details);
      return details.reason === 'ROSTER_CHANGED' && typeof details.reviewId === 'number' ? [details.reviewId] : [];
    });
    await tx.audit.deleteMany({ where: { teamId: id, id: { in: linkedAudits.map(a => a.id) } } });
    await tx.review.deleteMany({ where: { teamId: id, id: { in: reviewIds } } });
    for (const review of team.reviews.filter(r => !reviewIds.includes(r.id))) {
      const checks = detailsOf(review.checks);
      const retained = Object.fromEntries(Object.entries(checks).filter(([key]) => !key.startsWith('document_') || !documentIds.has(Number(key.slice('document_'.length)))));
      if (Object.keys(retained).length !== Object.keys(checks).length) await tx.review.update({ where: { id: review.id }, data: { checks: retained as Prisma.InputJsonObject } });
    }
    await tx.document.deleteMany({ where: { id: { in: docs.map(d => d.id) } } });
    await tx.participation.delete({ where: { id: participationId } });
    if (!await tx.participation.count({ where: { athleteId: p.athleteId } })) await tx.athlete.delete({ where: { id: p.athleteId } });
    const status = team.participations.length === 1 ? 'DRAFT' : team.status === 'SUBMITTED' ? 'OBSERVED' : team.status;
    await tx.team.update({ where: { id }, data: { version: { increment: 1 }, status } });
    // Deletion deliberately does not create a new athlete audit or an automatic review.
    return docs;
  }, 'roster');
  await Promise.all(obsolete.map(d => unlink(path.join(config.storage, d.storageName)).catch(() => {})));
}
export function checkDocuments(team: FullTeam) {
  assert(team.documents.some(d => d.kind === 'ROSTER'), 'Adjunte la ficha del delegado firmada.');
  for (const p of team.participations) for (const kind of ['FITNESS', 'RESPONSIBILITY']) {
    assert(team.documents.some(d => d.participationId === p.id && d.kind === kind), `Falta la declaración ${kind === 'FITNESS' ? 'de aptitud física' : 'de responsabilidad'} de ${p.athlete.firstName} ${p.athlete.lastName}.`);
  }
}
export async function validateSubmission(tx: Prisma.TransactionClient, team: FullTeam) {
  assert(team.participations.length > 0, 'Agregue deportistas antes de enviar el expediente.');
  checkRoster(team.category.discipline, team.participations.map(p => p.athlete.sex));
  for (const p of team.participations) {
    checkCategory(team.category.gender, p.athlete.sex);
    assert(p.athlete.schoolId === team.schoolId, 'Hay deportistas de otra escuela.');
    const rows = await tx.participation.findMany({ where: { athleteId: p.athleteId, team: { tournamentId: team.tournamentId } }, include: { team: { include: { category: true } } } });
    assert(rows.length <= 2 && new Set(rows.map(r => r.team.category.discipline)).size === rows.length, 'Se excede el límite o se repite una disciplina.');
  }
  checkDocuments(team);
}
export async function changeStatus(tx: Prisma.TransactionClient, team: FullTeam, status: TeamStatus) {
  await tx.team.update({ where: { id: team.id }, data: { status, version: { increment: 1 } } });
}
