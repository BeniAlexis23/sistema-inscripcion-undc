import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergeApprovedDocuments, type ReportTeam } from './report-pdf.js';

const team: ReportTeam = { id: 12, school: { name: 'Ingeniería de Sistemas' }, category: { name: 'Futsal Varones' }, documents: [
  { id: 1, kind: 'ROSTER', mime: 'application/pdf', size: 500, storageName: 'signed' },
  { id: 2, kind: 'FITNESS', mime: 'image/png', size: 100, storageName: 'image' },
] };
describe('PDF de documentos aprobados', () => {
  it('preserva todas las páginas originales e incorpora imágenes y portada', async () => {
    const original = await PDFDocument.create(); original.addPage(); original.addPage();
    const bytes = Buffer.from(await original.save());
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=', 'base64');
    const output = await mergeApprovedDocuments([team], async name => name === 'signed' ? bytes : image);
    const merged = await PDFDocument.load(output);
    expect(merged.getPageCount()).toBe(4);
    expect(merged.getTitle()).toContain('aprobados');
  });
  it('rechaza selecciones vacías y expedientes sin documentos', async () => {
    await expect(mergeApprovedDocuments([], async () => Buffer.alloc(0))).rejects.toThrow('No hay equipos');
    await expect(mergeApprovedDocuments([{ ...team, documents: [] }], async () => Buffer.alloc(0))).rejects.toThrow('sin documentos');
  });
  it('identifica archivos faltantes y PDF ilegibles sin entregar un reporte incompleto', async () => {
    await expect(mergeApprovedDocuments([team], async () => { throw new Error('ENOENT'); })).rejects.toThrow('documento #1');
    await expect(mergeApprovedDocuments([team], async () => Buffer.from('invalid'))).rejects.toThrow('no tenga contraseña');
  });
  it('limita el tamaño antes de leer archivos', async () => {
    await expect(mergeApprovedDocuments([{ ...team, documents: [{ ...team.documents[0], size: 101 * 1024 * 1024 }] }], async () => { throw new Error('No debe leer'); })).rejects.toThrow('100 MB');
  });
});
