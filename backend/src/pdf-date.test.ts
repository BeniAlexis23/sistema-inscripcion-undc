import { expect, it } from 'vitest';
import { pdfDate } from './pdf-date.js';
it('usa la fecha y hora de Lima aunque en UTC ya sea el día siguiente', () => {
  const date = pdfDate(new Date('2026-11-13T02:30:00Z'));
  expect(date.short).toBe('12/11/2026'); expect(date.long).toBe('12 de noviembre de 2026'); expect(date.time).toBe('21:30');
});
it('actualiza también el año de las fechas de emisión', () => {
  expect(pdfDate(new Date('2027-01-01T05:00:00Z')).short).toBe('01/01/2027');
});
