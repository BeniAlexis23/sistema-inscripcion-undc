import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import type { FullTeam } from './services.js';
import { assert } from './rules.js';
import { fitnessStatements, responsibilityStatements, checkLabels } from './pdf-content.js';

const banner = fileURLToPath(new URL('../assets/membrete-deportes-undc.jpg', import.meta.url));
const BLUE = '#143f5b', INK = '#111111', SHADE = '#e9f0f5', RULE = '#4472c4';
const LEFT = 56.7, WIDTH = 481.9, TOP = 200, BOTTOM = 790;
const titles: Record<string, string> = {
  roster: 'FICHA OFICIAL DE INSCRIPCIÓN', fitness: 'DECLARACIÓN JURADA DE APTITUD FÍSICA',
  responsibility: 'DECLARACIÓN JURADA DE RESPONSABILIDAD', control: 'HOJA DE CONTROL DOCUMENTARIO',
};

/** Recreates the official form layout using the unmodified banner extracted from the source PDF. */
export function makePdf(team: FullTeam, kind: string, participationId?: number, disciplines: string[] = []): PDFKit.PDFDocument {
  assert(titles[kind], 'Formato desconocido.', 404);
  const p = team.participations.find(p => p.id === participationId);
  if (kind === 'fitness' || kind === 'responsibility') assert(p, 'Deportista no encontrado.', 404);
  const doc = new PDFDocument({ size: 'A4', margins: { top: TOP, left: LEFT, right: LEFT, bottom: 52 }, bufferPages: true, info: { Title: titles[kind], Author: 'Universidad Nacional de Cañete - Subcomisión de Recreación y Deportes' } });
  const body = (size = 9.2) => { doc.font('Helvetica').fontSize(size).fillColor(INK); doc.x = LEFT; };
  const header = () => {
    doc.image(banner, 121.77, 0.55, { width: 351.7, height: 103.15 });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#606b77')
      .text('XVII ANIVERSARIO INSTITUCIONAL · TORNEO DEPORTIVO DE PREGRADO 2026', LEFT, 111.2, { width: WIDTH, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(14.3).fillColor(BLUE)
      .text(titles[kind], LEFT, 160, { width: WIDTH, align: 'center' });
    doc.moveTo(LEFT, 181.5).lineTo(LEFT + WIDTH, 181.5).lineWidth(0.55).strokeColor(RULE).stroke();
    body(); doc.y = TOP;
  };
  doc.on('pageAdded', header); header();
  const ensure = (height: number) => { if (doc.y + height > BOTTOM) doc.addPage(); };
  const paragraph = (text: string, size = 9.2, gap = 7, lineGap = 3) => {
    body(size); doc.text(text, LEFT, doc.y, { width: WIDTH, align: 'justify', lineGap }); doc.y += gap;
  };
  const section = (text: string) => {
    ensure(32); doc.font('Helvetica-Bold').fontSize(10).fillColor(BLUE).text(text, LEFT, doc.y, { width: WIDTH }); doc.y += 9; body();
  };
  const field = (label: string, value: string, labelWidth = 118) => {
    body(9); const valueWidth = WIDTH - labelWidth - 10;
    const h = Math.max(14.8, doc.heightOfString(value || ' ', { width: valueWidth, lineGap: 1 }) + 5,
      doc.font('Helvetica-Bold').heightOfString(label, { width: labelWidth - 10 }) + 5);
    ensure(h); const y = doc.y;
    doc.rect(LEFT, y, labelWidth, h).fill(SHADE);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(label, LEFT + 5, y + 2, { width: labelWidth - 10 });
    doc.font('Helvetica').fontSize(9).text(value || '_________________________________________________', LEFT + labelWidth + 6, y + 2, { width: valueWidth, lineGap: 1 });
    doc.x = LEFT; doc.y = y + h;
  };
  const choices = (items: { label: string; checked: boolean }[], x = LEFT, width = WIDTH, size = 9) => {
    let cursorX = x, y = doc.y;
    doc.font('Helvetica').fontSize(size);
    for (const item of items) {
      const textWidth = doc.widthOfString(item.label), itemWidth = textWidth + 19;
      if (cursorX + itemWidth > x + width && cursorX !== x) { y += 16; cursorX = x; }
      doc.lineWidth(0.5).strokeColor(INK).rect(cursorX, y + 1, 6.5, 6.5).stroke();
      if (item.checked) doc.moveTo(cursorX + 1.2, y + 4).lineTo(cursorX + 2.7, y + 6).lineTo(cursorX + 5.6, y + 1.5).lineWidth(0.9).stroke();
      doc.fillColor(INK).text(item.label, cursorX + 10, y, { width: textWidth + 2, lineBreak: false }); cursorX += itemWidth;
    }
    doc.x = LEFT; doc.y = y + 17;
  };
  const choiceField = (label: string, items: { label: string; checked: boolean }[]) => {
    ensure(16); const y = doc.y;
    doc.rect(LEFT, y, 118, 15).fill(SHADE); doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(label, LEFT + 5, y + 2, { width: 108 });
    doc.y = y + 2; choices(items, LEFT + 124, WIDTH - 124, 8.1); doc.y = Math.max(y + 15, doc.y - 4); doc.x = LEFT;
  };
  const signature = (a: NonNullable<typeof p>['athlete']) => {
    body(8);
    const nameHeight = doc.heightOfString(`Nombres: ${a.firstName}\nApellidos: ${a.lastName}\nDNI: ${a.dni}`, { width: 180, lineGap: 2 });
    const required = nameHeight + 35;
    ensure(required + 25);
    const y = Math.min(Math.max(doc.y + 25, doc.bufferedPageRange().count === 1 ? 650 : TOP + 25), BOTTOM - required);
    doc.moveTo(LEFT, y).lineTo(LEFT + 147, y).lineWidth(0.4).strokeColor('#606060').stroke();
    doc.font('Helvetica').fontSize(8).fillColor(INK).text('Firma del/de la estudiante', LEFT, y + 5, { width: 180 });
    doc.text(`Nombres: ${a.firstName}\nApellidos: ${a.lastName}\nDNI: ${a.dni}`, LEFT, y + 19, { width: 180, lineGap: 2 });
    const right = LEFT + WIDTH - 182;
    doc.moveTo(right, y + 4).lineTo(right + 182, y + 4).stroke();
    doc.fontSize(7.5).text('Huella dactilar (opcional)', right, y + 10, { width: 182, align: 'center' });
    doc.x = LEFT; doc.y = y + required;
  };
  const numbered = (statements: string[]) => {
    for (let i = 0; i < statements.length; i++) paragraph(`${i + 1}. ${statements[i]}`, 9, 7);
  };

  if (kind === 'roster') {
    paragraph('La presente ficha será presentada por el delegado, acompañada de las declaraciones juradas individuales firmadas por cada deportista inscrito.', 9.2, 5, 1);
    field('Escuela profesional', team.school.name);
    choiceField('Disciplina / categoría', [['FUTSAL', 'Futsal'], ['VOLLEYBALL', 'Vóleibol'], ['BASKETBALL', 'Básquetbol'], ['CHESS', 'Ajedrez por equipos']].map(([value, label]) => ({ label, checked: team.category.discipline === value })));
    choiceField('Categoría', [['FEMALE', 'Damas'], ['MALE', 'Varones'], ['MIXED', 'Mixto (ajedrez)']].map(([value, label]) => ({ label, checked: team.category.gender === value })));
    field('Delegado/a', team.delegate.name); field('Celular del delegado/a', team.delegate.phone);
    doc.y += 20; section('RELACIÓN DE DEPORTISTAS INSCRITOS');
    const widths = [22, 198, 78, 92, WIDTH - 390];
    const tableRow = (values: string[], heading = false): void => {
      doc.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.3);
      const h = Math.max(heading ? 26 : 25, ...values.map((v, i) => doc.heightOfString(v, { width: widths[i] - 8 }) + 6));
      if (doc.y + h > 735) { doc.addPage(); tableRow(['N°', 'Apellidos y Nombres', 'DNI', 'Código\nUniversitario', 'Firma de\nconformidad'], true); }
      const y = doc.y; let x = LEFT;
      values.forEach((v, i) => {
        if (heading) doc.rect(x, y, widths[i], h).fill(BLUE);
        doc.lineWidth(0.45).strokeColor(INK).rect(x, y, widths[i], h).stroke();
        doc.font(heading ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.3).fillColor(heading ? '#ffffff' : INK)
          .text(v, x + 4, y + 3, { width: widths[i] - 8, align: !heading && i === 1 ? 'left' : 'center' });
        x += widths[i];
      }); doc.x = LEFT; doc.y = y + h;
    };
    tableRow(['N°', 'Apellidos y Nombres', 'DNI', 'Código\nUniversitario', 'Firma de\nconformidad'], true);
    for (let i = 0; i < 12; i++) { const a = team.participations[i]?.athlete; tableRow([String(i + 1), a ? `${a.lastName}, ${a.firstName}` : '', a?.dni || '', a?.studentCode || '', '']); }
    doc.y += 3;
    paragraph('Para futsal, vóleibol y básquetbol: máximo 12 deportistas. Para ajedrez: 10 deportistas (5 damas y 5 varones); dejar sin usar los espacios 11 y 12.', 6.4, 7);
    paragraph('DECLARACIÓN DEL DELEGADO: Certifico que la nómina presentada pertenece a la escuela indicada y que cada estudiante ha sido informado de que puede participar en un máximo de dos (02) disciplinas deportivas durante el torneo.', 8.2, 7);
    ensure(45); doc.y += 23; body(8.3);
    doc.text(`Firma del/de la delegado/a: ____________________    DNI: ${team.delegate.dni}    Fecha: ____ / ____ / 2026`, LEFT, doc.y, { width: WIDTH });
  } else if (kind === 'fitness') {
    const a = p!.athlete;
    field('Apellidos y Nombres', `${a.lastName}, ${a.firstName}`); field('DNI', a.dni); field('Código Universitario', a.studentCode);
    field('Escuela profesional', team.school.name); field('Disciplina(s) deportiva', disciplines.join(' / ') || team.category.name); field('Celular de contacto', a.phone);
    doc.y += 22; section('DECLARACIÓN');
    paragraph('Yo, la persona identificada en el presente formato, en calidad de estudiante participante del Torneo Deportivo de Pregrado por el XVII Aniversario Institucional de la Universidad Nacional de Cañete, DECLARO BAJO JURAMENTO:');
    numbered(fitnessStatements);
    paragraph('Declaro que la información consignada es veraz y suscribo este documento de manera voluntaria.', 9, 10);
    paragraph('Lugar y fecha: San Luis - Cañete, ____ / ____ / 2026', 9, 10); signature(a);
  } else if (kind === 'responsibility') {
    const a = p!.athlete;
    field('Apellidos y Nombres', `${a.lastName}, ${a.firstName}`, 156); field('Código Universitario', a.studentCode, 156);
    field('Escuela profesional', team.school.name, 156); field('Disciplina que inscribe', disciplines[0] || team.category.name, 156); field('Otra disciplina inscrita (si aplica)', disciplines[1] || '', 156);
    doc.y += 22; section('DECLARACIÓN Y COMPROMISOS');
    paragraph('Yo, la persona identificada en este formato, DECLARO BAJO JURAMENTO Y ME COMPROMETO A:', 9, 7);
    numbered(responsibilityStatements);
    doc.y += 3; section('CONTROL DE PARTICIPACIÓN');
    paragraph('Marcar la situación que corresponde:', 9, 3);
    choices([{ label: 'Participaré en una (01) disciplina.', checked: disciplines.length === 1 }, { label: 'Participaré en dos (02) disciplinas.', checked: disciplines.length === 2 }], LEFT, WIDTH, 8.8);
    paragraph(`Disciplina 1: ${disciplines[0] || team.category.name}     Disciplina 2 (si aplica): ${disciplines[1] || '____________________________'}`, 9, 7);
    paragraph('Confirmo que los datos proporcionados son verdaderos y acepto los compromisos detallados.', 9, 9);
    paragraph('Lugar y fecha: San Luis - Cañete, ____ / ____ / 2026', 9, 7); signature(a);
  } else {
    paragraph('Se utiliza al recibir las inscripciones. No sustituye las declaraciones juradas firmadas por cada estudiante.', 9.2, 7);
    field('Escuela profesional', team.school.name); field('Disciplina / categoría', team.category.name); field('Delegado/a', team.delegate.name); field('Fecha de recepción', '____ / ____ / 2026');
    const review = team.reviews[0], values = (review?.checks || {}) as Record<string, boolean>;
    doc.y += 22; section('LISTA DE VERIFICACIÓN');
    const lines = [
      ['roster', checkLabels.roster], ['capacity', 'Relación de deportistas dentro del máximo permitido (12; ajedrez: 10).'],
      ['fitness', checkLabels.fitness], ['responsibility', checkLabels.responsibility],
      ['enrollmentSchool', 'Verificación de matrícula 2026-II y pertenencia a la escuela profesional.'],
      ['disciplines', 'Verificación de que nadie figure en más de dos (02) disciplinas deportivas.'], ['identity', checkLabels.identity],
    ];
    for (const [key, text] of lines) {
      body(9); const h = doc.heightOfString(text, { width: WIDTH - 15 }) + 16; ensure(h);
      const y = doc.y; choices([{ label: '', checked: key === 'enrollmentSchool' ? values.enrollment && values.school : values[key] }]);
      doc.font('Helvetica').fontSize(9).fillColor(INK).text(text, LEFT + 13, y, { width: WIDTH - 13, lineGap: 2 }); doc.x = LEFT; doc.y = y + h;
    }
    doc.y += 6; section('RESULTADO DE REVISIÓN');
    choices([{ label: 'Completo / conforme', checked: review?.result === 'APPROVED' }, { label: 'Observado (subsanar)', checked: review?.result === 'OBSERVED' }, { label: 'Pendiente de validación', checked: !review }], LEFT, WIDTH, 8.5);
    doc.y += 7; doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Observaciones:', LEFT, doc.y, { width: WIDTH }); doc.y += 7;
    if (review?.notes) paragraph(review.notes, 9, 8);
    else { for (let i = 0; i < 3; i++) { doc.moveTo(LEFT, doc.y + 8).lineTo(LEFT + WIDTH, doc.y + 8).lineWidth(0.3).strokeColor('#606060').stroke(); doc.y += 15; } }
    ensure(75); doc.y = Math.max(doc.y + 18, doc.bufferedPageRange().count === 1 ? 660 : TOP + 18); body(9);
    paragraph(`Responsable de recepción: ${review?.reviewer.name || '__________________________________'}    Firma: _______________________`, 8.5, 8);
    paragraph('Importante: Los formatos son modelos operativos para aplicar los requisitos de las bases. Su aprobación y eventual tratamiento de datos personales corresponden a la organización competente.', 7.3, 0);
  }
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(6).fillColor('#697780').text(`${team.id ? `Expediente ${team.id} · Versión ${team.version}` : 'Formato para firma · No constituye una inscripción'} | Página ${i + 1} de ${pages.count}`, LEFT, 818, { width: WIDTH, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
  return doc;
}
