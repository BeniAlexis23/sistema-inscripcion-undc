import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeStaffReceipt } from './staff-receipt-pdf.js';
import type { StaffInput } from './staff-rules.js';
it('pagina el registro completo con diez integrantes y documentos de nombres extensos', async () => {
  const participant = { firstName: 'NOMBRES EXTENSOS '.repeat(6).slice(0, 100), lastName: 'APELLIDOS EXTENSOS '.repeat(9).slice(0, 150), documentType: 'DNI' as const, documentNumber: '00000001', phone: '999999999', sex: 'MALE' as const, employment: 'DOCENTE' as const, dependency: 'DEPENDENCIA DE TRABAJO '.repeat(9).slice(0, 200) };
  const data: StaffInput = { name: 'Personal UNDC', dependency: participant.dependency, workplace: 'San Luis', mixedDependencies: false, category: 'FUTSAL_MALE', acceptedBases: true, delegate: { name: 'Delegado de ejemplo', documentType: 'DNI', documentNumber: '00000002', phone: '999999999', email: 'delegado@example.org' }, participants: Array.from({ length: 10 }, () => participant) };
  const documents = data.participants.flatMap((_p, i) => ['fitness', 'responsibility'].map(kind => ({ field: `${kind}_${i}`, originalName: `${'documento firmado '.repeat(14)}.pdf`.slice(0, 255) })));
  const bytes = await makeStaffReceipt(data, { receiptCode: '00000000-0000-4000-8000-000000000001', receivedAt: new Date('2026-11-12T13:00:00Z'), status: 'SUBMITTED', version: 1, documents });
  const doc = await PDFDocument.load(bytes);
  expect(doc.getTitle()).toContain('Registro completo');
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  expect(doc.getPageCount()).toBeLessThanOrEqual(8);
});
