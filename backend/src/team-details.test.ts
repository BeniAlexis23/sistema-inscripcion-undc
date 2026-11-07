import { expect, it } from 'vitest';
import { z } from 'zod';
import { teamDetailsShape } from './validation.js';
const schema = z.object(teamDetailsShape);
it('valida y limpia los datos del equipo', () => {
  expect(schema.parse({ name: ' Halcones ', cycle: ' VI ', shift: 'Mañana', section: ' A ' })).toEqual({ name: 'Halcones', cycle: 'VI', shift: 'Mañana', section: 'A' });
});
it('exige todos los campos y un turno válido', () => {
  expect(schema.safeParse({}).success).toBe(false);
  expect(schema.safeParse({ name: 'Equipo', cycle: 'VI', shift: 'Otro', section: 'A' }).success).toBe(false);
  expect(schema.safeParse({ name: 'Equipo', cycle: ' ', shift: 'Tarde', section: 'A' }).success).toBe(false);
  expect(schema.safeParse({ name: 'Equipo', cycle: 'XI', shift: 'Tarde', section: 'A' }).success).toBe(false);
  expect(schema.safeParse({ name: 'Equipo', cycle: 'X', shift: 'Tarde', section: 'C' }).success).toBe(false);
  expect(schema.safeParse({ name: 'Equipo', cycle: 'X', shift: 'Tarde', section: 'B' }).success).toBe(true);
});
