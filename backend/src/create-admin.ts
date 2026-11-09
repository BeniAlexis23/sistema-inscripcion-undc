import argon2 from 'argon2';
import { prisma } from './config.js';
import { userSchema } from './validation.js';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
// Account data arrives as JSON via stdin; passwords never appear in process arguments.
try {
  let raw: unknown;
  if (process.stdin.isTTY) {
    let hidden = false;
    const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
    const reader = createInterface({ input: process.stdin, output, terminal: true });
    try {
      const name = await reader.question('Nombre completo: ');
      const email = await reader.question('Correo: ');
      const dni = await reader.question('DNI: ');
      const phone = await reader.question('Celular: ');
      process.stdout.write('Contraseña (no se muestra): ');
      hidden = true;
      const password = await reader.question('');
      hidden = false; process.stdout.write('\n');
      raw = { name, email, dni, phone, password };
    } finally { reader.close(); }
  } else {
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    raw = JSON.parse(input.replace(/^\uFEFF/, ''));
  }
  const data = userSchema.parse({ ...(raw as object), role: 'ADMIN' });
  const { password: secret, ...user } = data;
  await prisma.user.create({ data: { ...user, passwordHash: await argon2.hash(secret) } });
  console.log('Administrador creado.');
} catch (e) { console.error(e instanceof Error ? e.message : 'No se pudo crear el administrador.'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
