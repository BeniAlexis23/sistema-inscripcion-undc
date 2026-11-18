import { describe, expect, it, vi } from 'vitest';
import { uploadRegistration } from '../../frontend/src/upload-registration.js';

describe('Envío del formulario por fragmentos', () => {
  it('envía fragmentos pequeños y confirma sin volver a adjuntar archivos', async () => {
    const form = new FormData(); form.append('data', '{"acceptedBases":true}'); form.append('roster', new File(['%PDF-123456789'], 'firmado.pdf', { type: 'application/pdf' }));
    const calls: { path: string; options?: RequestInit }[] = [];
    const send = vi.fn(async (path: string, options?: RequestInit) => {
      calls.push({ path, options });
      if (path === '/public/uploads') return { id: 'file', token: 'secret', chunkBytes: 4 };
      if (path.endsWith('/complete')) return { uploadToken: 'signed-reference' };
      if (path === '/public/registrations') return { receiptCode: 'receipt' };
    });
    const progress = vi.fn();
    const result = await uploadRegistration('/public/registrations', form, send as Parameters<typeof uploadRegistration>[2], progress);
    expect(result).toEqual({ receiptCode: 'receipt' });
    const pieces = calls.filter(c => c.path.includes('/chunks/'));
    expect(pieces.length).toBe(4);
    expect(pieces.every(c => (c.options?.body as Blob).size <= 4)).toBe(true);
    const last = calls[calls.length - 1];
    expect(JSON.parse(String(last.options?.body))).toEqual({ data: '{"acceptedBases":true}', uploadTokens: ['signed-reference'] });
    expect(progress).toHaveBeenLastCalledWith({ completed: 1, total: 1, percent: 100 });
  });
  it('no reintenta automáticamente la confirmación final si se pierde su respuesta', async () => {
    const form = new FormData(); form.append('data', '{}');
    const send = vi.fn(async () => { throw new Error('Network error'); });
    await expect(uploadRegistration('/public/staff/registrations', form, send)).rejects.toThrow('Network error');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
