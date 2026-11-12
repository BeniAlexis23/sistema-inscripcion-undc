import { PDFDocument } from 'pdf-lib';
import PDFKit from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { assert } from './rules.js';
import { pdfDate } from './pdf-date.js';

export interface ReportTeam {
  id: number;
  name?: string | null;
  cycle?: string | null;
  shift?: string | null;
  section?: string | null;
  school: { name: string };
  category: { name: string };
  documents: { id: number; kind: string; mime: string; size: number; storageName: string }[];
}
const banner = fileURLToPath(new URL('../assets/membrete-deportes-undc.jpg', import.meta.url));
async function cover(team: ReportTeam) {
  const doc = new PDFKit({ size: 'A4', margin: 57 });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  doc.image(banner, 121.77, 0.55, { width: 351.7, height: 103.15 });
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#143f5b').text('EXPEDIENTE APROBADO', 57, 160, { align: 'center' });
  doc.moveTo(57, 190).lineTo(538, 190).strokeColor('#4472c4').stroke();
  doc.fontSize(11).text(`Equipo #${team.id}`, 57, 215);
  doc.moveDown().text(team.school.name).moveDown().text(team.category.name);
  doc.moveDown().font('Helvetica').fontSize(9).text(`Fecha de generación: ${pdfDate().dateTime}`);
  doc.moveDown(2).fontSize(10).text('DOCUMENTOS FIRMADOS', { underline: true });
  const labels: Record<string, string> = { ROSTER: 'Ficha oficial del equipo', FITNESS: 'Declaración de aptitud física', RESPONSIBILITY: 'Declaración de responsabilidad' };
  for (const kind of ['ROSTER', 'FITNESS', 'RESPONSIBILITY']) {
    doc.moveDown().font('Helvetica').text(`${labels[kind]}: ${team.documents.filter(d => d.kind === kind).length}`);
  }
  doc.moveDown(2).fontSize(9).text('Se adjuntan los archivos firmados del expediente aprobado. Los PDF conservan sus páginas originales; las imágenes se presentan ajustadas a una página A4.', { lineGap: 4 });
  doc.end(); return result;
}

export async function mergeApprovedDocuments(teams: ReportTeam[], read: (name: string) => Promise<Buffer>) {
  assert(teams.length > 0, 'No hay equipos aprobados para los filtros seleccionados.', 404);
  assert(teams.every(t => t.documents.length > 0), 'Hay expedientes sin documentos. Revise los equipos antes de exportar.', 409);
  assert(teams.flatMap(t => t.documents).reduce((sum, d) => sum + d.size, 0) <= 100 * 1024 * 1024, 'La selección supera los 100 MB. Descargue por deporte, escuela o equipo.');
  const result = await PDFDocument.create();
  result.setTitle('Documentos firmados de equipos aprobados - UNDC');
  result.setAuthor('Universidad Nacional de Cañete');
  async function append(bytes: Uint8Array) {
    const source = await PDFDocument.load(bytes);
    const pages = await result.copyPages(source, source.getPageIndices());
    pages.forEach(page => result.addPage(page));
  }
  for (const team of teams) {
    await append(await cover(team));
    for (const d of team.documents) {
      const bytes = await read(d.storageName).catch(() => null);
      assert(bytes, `No está disponible el documento #${d.id} del equipo #${team.id}.`, 409);
      try {
        if (d.mime === 'application/pdf') await append(bytes);
        else {
          assert(d.mime === 'image/jpeg' || d.mime === 'image/png', 'Tipo de archivo no admitido.');
          const image = d.mime === 'image/png' ? await result.embedPng(bytes) : await result.embedJpg(bytes);
          const page = result.addPage([595.28, 841.89]);
          const scale = Math.min(481.88 / image.width, 728.49 / image.height);
          const width = image.width * scale, height = image.height * scale;
          page.drawImage(image, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
        }
      } catch {
        assert(false, `No se pudo incorporar el documento #${d.id} del equipo #${team.id}. Compruebe que sea legible y no tenga contraseña.`, 422);
      }
    }
  }
  return Buffer.from(await result.save());
}
