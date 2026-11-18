import { Router, raw, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from './config.js';
import { assert } from './rules.js';
import { detectMime } from './uploads.js';

export const CHUNK_BYTES = 1024 * 1024;
const TTL = 2 * 60 * 60 * 1000;
const fields = /^(roster|authorization|fitness_\d{1,2}|responsibility_\d{1,2})$/;
const metadata = z.object({
  id: z.uuid(), scope: z.enum(['pregrado', 'personal']), field: z.string().regex(fields),
  name: z.string().min(1).max(255), mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  size: z.number().int().positive().max(10 * 1024 * 1024), expires: z.number().int(),
});
type Metadata = z.infer<typeof metadata>;
const root = () => path.join(config.storage, '.pending-uploads');
let keyPromise: Promise<Buffer> | undefined;
async function key() {
  if (!keyPromise) keyPromise = (async () => {
    await mkdir(root(), { recursive: true });
    const filename = path.join(root(), '.signing-key');
    // Exclusive creation and read retries prevent different workers using different keys.
    const candidate = randomBytes(32);
    try { await writeFile(filename, candidate, { flag: 'wx', mode: 0o600 }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    for (let attempt = 0; attempt < 5; attempt++) {
      const value = await readFile(filename);
      if (value.length === 32) return value;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('No se pudo inicializar la carga temporal.');
  })().catch(e => { keyPromise = undefined; throw e; });
  return keyPromise;
}
async function sign(value: Metadata) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', await key()).update(payload).digest('hex')}`;
}
async function verify(token: unknown, scope?: Metadata['scope']) {
  assert(typeof token === 'string' && token.length < 2048, 'Referencia de adjunto inválida.', 403);
  const [payload, signature, extra] = token.split('.');
  assert(!extra && /^[a-f0-9]{64}$/.test(signature || ''), 'Referencia de adjunto inválida.', 403);
  const expected = createHmac('sha256', await key()).update(payload).digest();
  assert(timingSafeEqual(expected, Buffer.from(signature, 'hex')), 'Referencia de adjunto inválida.', 403);
  let value: Metadata;
  try { value = metadata.parse(JSON.parse(Buffer.from(payload, 'base64url').toString())); }
  catch { assert(false, 'Referencia de adjunto inválida.', 403); }
  assert(value.expires > Date.now(), 'Los adjuntos temporales vencieron. Vuelva a enviar el formulario.', 410);
  assert(!scope || value.scope === scope, 'El adjunto no corresponde a este formulario.', 403);
  return value;
}

// Only expired UUID directories in the private staging area are removed; active documents are elsewhere.
let cleanupAt = 0;
async function cleanup() {
  if (Date.now() - cleanupAt < 10 * 60000) return;
  cleanupAt = Date.now();
  await mkdir(root(), { recursive: true });
  for (const entry of await readdir(root(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !z.uuid().safeParse(entry.name).success) continue;
    const dir = path.join(root(), entry.name);
    const info = await stat(dir).catch(() => null);
    if (info && Date.now() - info.mtimeMs > TTL + 60000) await rm(dir, { recursive: true, force: true });
  }
}

export const stagedUploads = Router();
stagedUploads.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
stagedUploads.post('/', rateLimit({ windowMs: 60 * 60000, limit: 1000, standardHeaders: true, legacyHeaders: false, message: { message: 'Demasiados adjuntos. Intente más tarde.' } }), async (req, res) => {
  const input = metadata.omit({ id: true, expires: true }).parse(req.body);
  if (input.scope === 'pregrado') assert(input.field !== 'authorization', 'Campo de adjunto inválido.');
  await cleanup();
  const value = { ...input, id: randomUUID(), expires: Date.now() + TTL };
  await mkdir(path.join(root(), value.id));
  res.status(201).json({ id: value.id, token: await sign(value), chunkBytes: CHUNK_BYTES });
});
const authorize: RequestHandler = async (req, res, next) => {
  try {
    const value = await verify(req.get('X-Upload-Token'));
    assert(value.id === req.params.id, 'Carga temporal inválida.', 403);
    res.locals.upload = value;
    next();
  } catch (e) { next(e); }
};
stagedUploads.put('/:id/chunks/:index', authorize, raw({ type: 'application/octet-stream', limit: CHUNK_BYTES }), async (req, res) => {
  const value = res.locals.upload as Metadata;
  const index = z.coerce.number().int().min(0).parse(req.params.index);
  const count = Math.ceil(value.size / CHUNK_BYTES);
  assert(index < count && Buffer.isBuffer(req.body), 'Fragmento inválido.');
  const expectedSize = Math.min(CHUNK_BYTES, value.size - index * CHUNK_BYTES);
  assert(req.body.length === expectedSize, 'El fragmento está incompleto. Vuelva a intentar.');
  const filename = path.join(root(), value.id, `${index}.part`);
  try { await writeFile(filename, req.body, { flag: 'wx' }); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    assert((await readFile(filename)).equals(req.body), 'El fragmento ya fue enviado con otro contenido.', 409);
  }
  res.sendStatus(204);
});
stagedUploads.post('/:id/complete', authorize, async (_req, res) => {
  const value = res.locals.upload as Metadata;
  const dir = path.join(root(), value.id), ready = path.join(dir, 'ready');
  if (!(await stat(ready).catch(() => null))) {
    // Each file is assembled independently, at most 10 MB in memory.
    const chunks: Buffer[] = [];
    for (let i = 0; i < Math.ceil(value.size / CHUNK_BYTES); i++) {
      const chunk = await readFile(path.join(dir, `${i}.part`)).catch(() => null);
      assert(chunk && chunk.length === Math.min(CHUNK_BYTES, value.size - i * CHUNK_BYTES), 'Faltan fragmentos del adjunto.');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    assert(bytes.length === value.size && detectMime(bytes) === value.mime, 'Solo se admiten PDF, JPG o PNG válidos.');
    const temp = path.join(dir, `assembling-${randomUUID()}`);
    await writeFile(temp, bytes, { flag: 'wx' });
    await rename(temp, ready);
  }
  res.json({ uploadToken: await sign(value) });
});

/** Adapt the small final JSON request to the existing transactional registration handlers. */
export function claimStagedUploads(scope: Metadata['scope']): RequestHandler {
  return async (req, _res, next) => {
    const claimed: Express.Multer.File[] = [];
    try {
      if (!req.is('application/json') || !req.body?.uploadTokens) return next();
      const tokens = z.array(z.string().max(2048)).max(scope === 'pregrado' ? 25 : 22).parse(req.body.uploadTokens);
      const values = await Promise.all(tokens.map(token => verify(token, scope)));
      assert(new Set(values.map(v => v.id)).size === values.length && new Set(values.map(v => v.field)).size === values.length, 'Hay adjuntos duplicados.');
      for (const value of values) {
        assert(await stat(path.join(root(), value.id, 'ready')).catch(() => null), 'El adjunto no está completo o ya fue utilizado. Vuelva a enviarlo.', 409);
        const consumed = path.join(root(), randomUUID());
        const target = path.join(config.storage, value.id);
        // Atomically consume the entire session, including chunks, to prevent reconstruction/replay.
        await rename(path.join(root(), value.id), consumed).catch(() => { assert(false, 'El adjunto temporal no está disponible o ya fue utilizado. Vuelva a enviarlo.', 409); });
        try { await rename(path.join(consumed, 'ready'), target); }
        finally { await rm(consumed, { recursive: true, force: true }); }
        claimed.push({ fieldname: value.field, originalname: value.name, mimetype: value.mime, size: value.size, filename: value.id, path: target, destination: config.storage, encoding: '7bit' } as Express.Multer.File);
      }
      req.files = claimed;
      next();
    } catch (e) {
      await Promise.all(claimed.map(f => rm(f.path, { force: true })));
      next(e);
    }
  };
}
