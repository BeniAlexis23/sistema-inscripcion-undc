import { describe, expect, it } from 'vitest';
import { makePdf } from './pdf.js';
import type { FullTeam } from './services.js';
const team = {
  id: 0, version: 1, school: { name: 'Ingeniería de Sistemas' },
  category: { name: 'Futsal Varones', discipline: 'FUTSAL', gender: 'MALE' },
  delegate: { name: 'DELEGADO DE EJEMPLO', dni: '00000000', phone: '999999999' },
  participations: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, athlete: { firstName: 'ESTUDIANTE DE EJEMPLO', lastName: `PÉREZ DE LA CRUZ ${i + 1}`, dni: String(i + 1).padStart(8, '0'), studentCode: `2026-PRUEBA-${String(i + 1).padStart(3, '0')}`, phone: '999999999', sex: 'MALE' } })),
  reviews: [], documents: [], audits: [],
} as unknown as FullTeam;
async function finish(doc: PDFKit.PDFDocument) {
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.end(); return completed;
}
describe('Formatos con membrete oficial', () => {
  it('mantiene la ficha habitual en una página al incluir los datos del equipo', async () => {
    const doc = makePdf({ ...team, name: 'Los Halcones', cycle: 'VI', shift: 'Mañana', section: 'A' }, 'roster');
    expect(doc.bufferedPageRange().count).toBe(1);
    await finish(doc);
  });
  it('genera la constancia en una página A4 con membrete institucional', async () => {
    const receipt = { ...team, receiptCode: 'b41a0b73-c9b2-4380-87cb-b4279dd403bb', createdAt: new Date('2026-11-07T02:00:00Z') };
    const doc = makePdf(receipt, 'receipt');
    expect(doc.bufferedPageRange().count).toBe(1);
    const data = await finish(doc);
    expect(data.subarray(0, 5).toString()).toBe('%PDF-');
    expect(data.toString('latin1')).toContain('/Subtype /Image');
  });
  it.each(['roster', 'fitness', 'responsibility', 'control'])('%s conserva una página con datos normales e incorpora el membrete', async kind => {
    const doc = makePdf(team, kind, 1, ['Futsal', 'Vóleibol']);
    expect(doc.bufferedPageRange().count).toBe(1);
    const data = await finish(doc);
    expect(data.subarray(0, 5).toString()).toBe('%PDF-');
    expect(data.toString('latin1')).toContain('/Subtype /Image');
    expect(data.length).toBeGreaterThan(40000);
  });
  it('pagina una nómina con nombres extensos sin añadir páginas vacías por el pie', async () => {
    const long = structuredClone(team);
    for (const p of long.participations) { p.athlete.firstName = 'NOMBRES EXTENSOS '.repeat(6).slice(0, 100); p.athlete.lastName = 'APELLIDOS EXTENSOS '.repeat(9).slice(0, 150); }
    const doc = makePdf(long, 'roster');
    expect(doc.bufferedPageRange().count).toBeGreaterThan(1);
    expect(doc.bufferedPageRange().count).toBeLessThanOrEqual(3);
    await finish(doc);
  });
});
