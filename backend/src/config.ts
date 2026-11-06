import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
const backendRoot = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });
export const prisma = new PrismaClient();
export const config = {
  port: Number(process.env.PORT || 4000),
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  production: process.env.NODE_ENV === 'production',
  storage: path.resolve(backendRoot, process.env.STORAGE_DIR || './storage'),
  publicDocuments: path.resolve(backendRoot, process.env.PUBLIC_DOCUMENTS_DIR || './public-documents'),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
};
