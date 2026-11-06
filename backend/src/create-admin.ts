import argon2 from 'argon2';
import { prisma } from './config.js';
import { userSchema } from './validation.js';
// Account data arrives as JSON via stdin; passwords never appear in process arguments.
try {
  if (process.stdin.isTTY) throw new Error('Proporcione los datos JSON mediante stdin. Consulte README.md.');
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const data = userSchema.parse({ ...JSON.parse(input.replace(/^\uFEFF/, '')), role: 'ADMIN' });
  const { password: secret, ...user } = data;
  await prisma.user.create({ data: { ...user, passwordHash: await argon2.hash(secret) } });
  console.log('Administrador creado.');
} catch (e) { console.error(e instanceof Error ? e.message : 'No se pudo crear el administrador.'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
