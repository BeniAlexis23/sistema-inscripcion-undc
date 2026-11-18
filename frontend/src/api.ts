import { uploadRegistration, type UploadProgress } from './upload-registration';
export type Role = 'ADMIN' | 'COMMISSION' | 'DELEGATE';
export type Status = 'DRAFT' | 'SUBMITTED' | 'OBSERVED' | 'APPROVED';
export interface User { id: number; name: string; email: string; dni: string; phone: string; role: Role; schoolId: number | null; active: boolean }
export interface Catalog { schools: { id: number; name: string }[]; categories: { id: number; name: string; discipline: string; gender: string }[]; tournament: { id: number; name: string; semester: string; opensAt: string; closesAt: string; correctionsEnabled: boolean; basesUrl?: string | null; formatsUrl?: string | null; otherDocumentsUrl?: string | null } | null }
export interface Athlete { id: number; dni: string; studentCode: string; firstName: string; lastName: string; phone: string; sex: 'MALE' | 'FEMALE'; schoolId: number }
export interface TeamSummary { id: number; name?: string | null; cycle?: string | null; shift?: string | null; section?: string | null; school: { name: string }; category: { name: string; discipline: string; gender: string }; delegate: { name: string; dni?: string; phone?: string; email?: string }; receiptCode?: string | null; status: Status; version: number; updatedAt: string; _count: { participations: number; documents: number } }
export interface Team extends TeamSummary { tournament: NonNullable<Catalog['tournament']>; participations: { id: number; athlete: Athlete }[]; documents: { id: number; kind: string; participationId: number | null; originalName: string; size: number }[]; reviews: { id: number; result: Status; notes: string; checks: Record<string, boolean>; reviewer: { name: string }; createdAt: string }[]; audits: { id: number; action: string; actor: { name: string } | null; createdAt: string; details: Record<string, unknown> }[] }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; counts?: { status: Status; _count: number }[] }
export async function api<T = void>(path: string, options: RequestInit & { onUploadProgress?: (value: UploadProgress) => void } = {}): Promise<T> {
  const { onUploadProgress, ...request } = options;
  if (options.body instanceof FormData && ['/public/registrations', '/public/staff/registrations'].includes(path) && options.method?.toUpperCase() === 'POST') {
    return uploadRegistration<T>(path, options.body, api, onUploadProgress, options.signal);
  }
  const form = options.body instanceof FormData;
  let response: Response;
  try { response = await fetch(`/api/v1${path}`, { ...request, credentials: 'include', headers: { 'X-Requested-With': 'undc-web', ...(!form ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); }
  catch (e) { if (options.signal?.aborted) throw e; throw new Error('Se interrumpió la conexión durante el envío. Mantén esta página abierta y comprueba tu conexión. Si el fallo ocurrió al confirmar, consulta con la comisión antes de reenviar.'); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: [408, 499, 502, 504].includes(response.status) ? 'El servidor interrumpió la carga. Mantén esta página abierta y vuelve a intentarlo.' : `No se pudo completar la solicitud (HTTP ${response.status}).` }));
    if (response.status === 401 && path !== '/sessions' && path !== '/sessions/me') window.dispatchEvent(new Event('session-expired'));
    throw new Error(error.errors?.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join(' · ') || error.message);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export async function download(path: string, name: string, options: RequestInit = {}) {
  const response = await fetch(`/api/v1${path}`, { ...options, credentials: 'include', headers: { ...(options.body ? { 'Content-Type': 'application/json', 'X-Requested-With': 'undc-web' } : {}), ...options.headers } });
  if (!response.ok) { const error = await response.json(); throw new Error(error.message); }
  const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const date = (v: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
export const statusLabels: Record<Status, string> = { DRAFT: 'Borrador', SUBMITTED: 'En revisión', OBSERVED: 'Observado', APPROVED: 'Aprobado' };
