import { createHash, randomBytes } from 'node:crypto';
import type { RequestHandler, Request } from 'express';
import type { User, Role } from '@prisma/client';
import { config, prisma } from './config.js';
import { assert } from './rules.js';
declare global { namespace Express { interface Request { user?: User } } }
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'strict' as const, path: '/api/v1' };
export async function createSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionHours * 3600000);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies.undc_session;
    assert(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 'Inicie sesión para continuar.', 401);
    const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
    assert(session && session.expiresAt > new Date() && session.user.active, 'La sesión ha vencido. Inicie sesión nuevamente.', 401);
    req.user = session.user; next();
  } catch (error) { next(error); }
};
export const roles = (...allowed: Role[]): RequestHandler => (req, _res, next) => {
  try { assert(req.user && allowed.includes(req.user.role), 'No tiene permisos para esta acción.', 403); next(); } catch (e) { next(e); }
};
export const currentUser = (req: Request) => { assert(req.user, 'Sesión requerida.', 401); return req.user; };
export const publicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, dni: u.dni, phone: u.phone, role: u.role, schoolId: u.schoolId, active: u.active });
