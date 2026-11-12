import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { staffCategories, type StaffInput } from './staff-rules.js';
import { pdfDate } from './pdf-date.js';

/** Fill a copy of the ORIGINAL official page; signatures stay blank. */
export async function makeStaffPdf(data: StaffInput, kind: 'roster' | 'fitness' | 'responsibility' | 'control', index = 0) {
  const generatedAt = new Date(), generated = pdfDate(generatedAt);
  const source = await PDFDocument.load(await readFile(path.join(config.publicDocuments, 'formatos-personal-undc-2026.pdf')));
  const doc = await PDFDocument.create();
  const [page] = await doc.copyPages(source, [{ roster: 0, fitness: 1, responsibility: 2, control: 3 }[kind]]);
  doc.addPage(page);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);
  const text = (value: string, x: number, top: number, width: number, size = 9) => {
    const safe = value.replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7e\xa0-\xff]/g, '-');
    while (size > 4 && font.widthOfTextAtSize(safe, size) > width) size -= 0.2;
    page.drawText(safe, { x, y: page.getHeight() - top - 8, size, font, color: rgb(0.03, 0.15, 0.3), maxWidth: width });
  };
  const category = staffCategories.find(c => c.id === data.category)!;
  const a = data.participants[index];
  const dateLine = (top: number) => {
    page.drawRectangle({ x: 54, y: page.getHeight() - top - 15, width: 505, height: 19, color: rgb(1, 1, 1) });
    text(`Lugar y fecha: Cañete, ${generated.long}`, 55, top, 500, 10);
  };
  if (kind === 'roster') {
    text('X', { FUTSAL_MALE: 209, FUTSAL_FEMALE: 297, VOLLEYBALL_MIXED: 381 }[data.category], 176, 8);
    text(data.name, 153, 195, 390); text(data.dependency, 280, 215, 265); text(data.workplace, 136, 235, 410);
    text(data.delegate.name, 168, 256, 375); text(data.delegate.documentNumber, 80, 277, 90);
    text(data.delegate.phone, 269, 277, 90); text(data.delegate.email, 402, 277, 147, 8);
    data.participants.forEach((p, i) => {
      const top = 368 + i * 30.35;
      text(`${p.lastName}, ${p.firstName}`, 81, top, 186, 8);
      text(`${p.documentType === 'DNI' ? '' : p.documentType + ' '}${p.documentNumber}`, 273, top, 82, 8);
      text(p.employment === 'ADMINISTRATIVO' ? 'Administrativo' : p.employment === 'DOCENTE' ? 'Docente' : 'Locador', 361, top, 92, 8);
    });
  } else if (kind === 'fitness') {
    dateLine(536);
    text(`${a.lastName}, ${a.firstName}`, 85, 191, 300);
    text(`${a.documentType === 'DNI' ? '' : a.documentType + ' '}${a.documentNumber}`, 56, 207, 105);
    text('X', { DOCENTE: 270, ADMINISTRATIVO: 328, LOCADOR: 466 }[a.employment], 209, 8);
    text(data.category.startsWith('FUTSAL') ? 'Futsal' : 'Vóleibol', 345, 247, 150);
    text(category.name, 56, 263, 102, 8);
    text(a.documentNumber, 317, 600, 170); text(`${a.lastName}, ${a.firstName}`, 168, 622, 376);
  } else if (kind === 'responsibility') {
    dateLine(548.3);
    text(`${a.lastName}, ${a.firstName}`, 86, 179, 390);
    text(`${a.documentType === 'DNI' ? '' : a.documentType + ' '}${a.documentNumber}`, 124, 196, 104);
    text(data.name, 351, 196, 195);
    text(a.documentNumber, 317, 612, 170); text(`${a.lastName}, ${a.firstName}`, 168, 634, 376);
  } else {
    text(data.name, 99, 196, 380); text(category.name, 167, 218, 300);
    text(data.delegate.name, 112, 240, 380); text(data.delegate.phone, 101, 261, 380);
    text(generated.short, 94, 588, 100);
    text(generated.time, 252, 588, 65);
  }
  text(`Generado: ${generated.dateTime}`, 55, 772, 500, 7);
  return Buffer.from(await doc.save());
}
