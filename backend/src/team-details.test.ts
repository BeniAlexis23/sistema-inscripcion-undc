import { expect, it } from 'vitest';
import { z } from 'zod';
import { teamSelectionShape } from './validation.js';
const schema = z.object(teamSelectionShape);
it('solo registra escuela y categoría e ignora los campos antiguos', () => {
  expect(schema.parse({ schoolId: 1, categoryId: 2, name: 'Equipo antiguo', cycle: 'VI', shift: 'Mañana', section: 'A' })).toEqual({ schoolId: 1, categoryId: 2 });
});
it('exige escuela y categoría válidas', () => {
  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ schoolId: 0, categoryId: 2 }).success).toBe(false);
  expect(schema.safeParse({ schoolId: 1, categoryId: -1 }).success).toBe(false);
});
