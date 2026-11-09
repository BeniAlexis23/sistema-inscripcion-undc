import { describe, expect, it } from 'vitest';
import { validateProductionEnvironment } from './production-env.js';
const valid = { FRONTEND_ORIGIN: 'https://deportes.example.org', DATABASE_URL: 'mysql://undc:0123456789abcdef@mysql:3306/undc_deportes' };
describe('Variables de producción', () => {
  it('admite el origen y conexión del Compose', () => { expect(() => validateProductionEnvironment(valid)).not.toThrow(); });
  it.each(['http://deportes.example.org', 'https://deportes.example.org/', 'https://deportes.example.org/admin'])('rechaza origen incorrecto: %s', origin => { expect(() => validateProductionEnvironment({ ...valid, FRONTEND_ORIGIN: origin })).toThrow(); });
  it.each(['mysql://undc@mysql/base', 'mysql://undc:REEMPLAZAR@mysql/base', 'postgres://undc:abc@mysql/base'])('rechaza conexión incompleta o de ejemplo', url => { expect(() => validateProductionEnvironment({ ...valid, DATABASE_URL: url })).toThrow(); });
});
