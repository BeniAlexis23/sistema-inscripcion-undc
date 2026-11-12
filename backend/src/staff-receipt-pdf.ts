import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { pdfDate } from './pdf-date.js';
import { staffCategories, type StaffInput } from './staff-rules.js';

type Receipt = { receiptCode: string; receivedAt: Date; status: string; version: number; documents: { field: string; originalName: string }[] };
const banner = fileURLToPath(new URL('../assets/membrete-deportes-undc.jpg', import.meta.url));
const statuses: Record<string, string> = { SUBMITTED: 'En revisión', OBSERVED: 'Observado', APPROVED: 'Aprobado', DRAFT: 'Borrador' };
const employment: Record<string, string> = { DOCENTE: 'Docente', ADMINISTRATIVO: 'Administrativo', LOCADOR: 'Locador' };
/** Uses only the persisted registration, never client-supplied receipt data. */
export async function makeStaffReceipt(data: StaffInput, receipt: Receipt) {
  const generated = pdfDate();
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 205, bottom: 60, left: 57, right: 57 }, info: { Title: 'Registro completo de inscripción - Personal UNDC', Author: 'Universidad Nacional de Cañete' } });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const header = () => {
    doc.image(banner, 121.77, 0.55, { width: 351.7, height: 103.15 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#143f5b').text('PERSONAL DOCENTE Y ADMINISTRATIVO - UNDC 2026', 57, 120, { width: 481, align: 'center' });
    doc.fontSize(15).text('REGISTRO COMPLETO DE INSCRIPCIÓN', 57, 159, { width: 481, align: 'center' });
    doc.moveTo(57, 185).lineTo(538, 185).strokeColor('#4472c4').stroke(); doc.y = 205;
  };
  doc.on('pageAdded', header); header();
  const ensure = (height: number) => { if (doc.y + height > 770) doc.addPage(); };
  const section = (title: string) => { ensure(45); doc.moveDown(0.5).font('Helvetica-Bold').fontSize(11).fillColor('#143f5b').text(title, 57, doc.y, { width: 481 }); doc.moveDown(0.7); };
  const row = (label: string, value: string) => {
    const line = `${label}: ${value}`;
    doc.font('Helvetica').fontSize(9.5); const height = doc.heightOfString(line, { width: 481, lineGap: 3 }); ensure(height + 8);
    doc.font('Helvetica').fontSize(9.5).fillColor('#172b40').text(line, 57, doc.y, { width: 481, lineGap: 3 }); doc.moveDown(0.4);
  };
  section('CONSTANCIA DE RECEPCIÓN');
  row('Código de registro', receipt.receiptCode);
  row('Recepción del expediente completo', pdfDate(receipt.receivedAt).dateTime);
  row('Fecha de generación', generated.dateTime);
  row('Estado al generar', `${statuses[receipt.status] || receipt.status} - Versión ${receipt.version}`);
  section('EQUIPO Y DELEGADO');
  row('Equipo', data.name); row('Categoría', staffCategories.find(c => c.id === data.category)!.name);
  row('Dependencia representada', data.dependency); row('Sede de trabajo', data.workplace);
  row('Agrupación de distintas dependencias', data.mixedDependencies ? 'Sí; autorización sujeta a validación de la comisión' : 'No');
  row('Delegado', data.delegate.name); row('Documento', `${data.delegate.documentType} ${data.delegate.documentNumber}`);
  row('Celular / WhatsApp', data.delegate.phone); row('Correo', data.delegate.email);
  row('Documentos recibidos', `${receipt.documents.length} archivos`);
  section('ALCANCE');
  row('Recepción', 'Este registro acredita el envío. La admisión y el cupo requieren validación de la comisión. Las firmas constan en los archivos originales adjuntos.');
  row('Lugar y fecha', `Cañete, ${generated.long}`);
  doc.addPage(); section(`NÓMINA REGISTRADA - ${data.participants.length} PARTICIPANTES`);
  data.participants.forEach((p, i) => {
    doc.font('Helvetica').fontSize(9.5);
    const lines = [`${i + 1}. ${p.lastName}, ${p.firstName}`, `${p.documentType} ${p.documentNumber} | ${p.sex === 'FEMALE' ? 'Dama' : 'Varón'} | Celular: ${p.phone}`, `${employment[p.employment]} | Dependencia: ${p.dependency}`];
    const height = lines.reduce((sum, text) => sum + doc.heightOfString(text, { width: 481, lineGap: 2 }) + 3, 0);
    ensure(height + 12);
    for (const [j, line] of lines.entries()) doc.font(j === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor('#172b40').text(line, 57, doc.y, { width: 481, lineGap: 2 }).moveDown(0.25);
    doc.moveDown(0.4);
  });
  section('DOCUMENTOS DEL EXPEDIENTE');
  const labels: Record<string, string> = { roster: 'Ficha oficial del equipo firmada', authorization: 'Autorización de agrupación', fitness: 'Aptitud física', responsibility: 'Responsabilidad', identity: 'Identificación', employment: 'Sustento de vínculo' };
  for (const document of receipt.documents) {
    const [kind, position] = document.field.split('_');
    const p = position === undefined ? undefined : data.participants[Number(position)];
    row(p ? `${labels[kind] || kind} - ${p.lastName}, ${p.firstName}` : labels[kind] || kind, document.originalName);
  }
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#64748b').text(`Generado: ${generated.dateTime} | Registro ${receipt.receiptCode} | ${i + 1}/${pages.count}`, 57, 812, { width: 481, align: 'center', lineBreak: false });
  }
  doc.end(); return completed;
}
