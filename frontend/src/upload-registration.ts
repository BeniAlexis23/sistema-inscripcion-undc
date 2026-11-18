type Send = <T = void>(path: string, options?: RequestInit) => Promise<T>;
export type UploadProgress = { completed: number; total: number; percent: number };

export async function uploadRegistration<T>(path: string, form: FormData, send: Send, progress?: (value: UploadProgress) => void, signal?: AbortSignal | null): Promise<T> {
  const files = [...form.entries()].filter((entry): entry is [string, File] => entry[1] instanceof File);
  const totalBytes = files.reduce((sum, [, file]) => sum + file.size, 0);
  let completedBytes = 0;
  const uploadTokens: string[] = [];
  for (const [position, [field, file]] of files.entries()) {
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Cada adjunto debe contener datos y pesar como máximo 10 MB.');
    const session = await send<{ id: string; token: string; chunkBytes: number }>('/public/uploads', {
      method: 'POST', signal, body: JSON.stringify({ scope: path === '/public/staff/registrations' ? 'personal' : 'pregrado', field, name: file.name.slice(0, 255), mime: file.type, size: file.size }),
    });
    progress?.({ completed: position, total: files.length, percent: Math.round(completedBytes / totalBytes * 100) });
    for (let offset = 0, index = 0; offset < file.size; offset += session.chunkBytes, index++) {
      const chunk = file.slice(offset, offset + session.chunkBytes);
      // A lost acknowledgment can retry safely: the server checks an existing chunk's bytes.
      for (let attempt = 0; ; attempt++) {
        try {
          await send(`/public/uploads/${session.id}/chunks/${index}`, { method: 'PUT', signal, headers: { 'Content-Type': 'application/octet-stream', 'X-Upload-Token': session.token }, body: chunk });
          break;
        } catch (e) { if (attempt >= 1 || signal?.aborted) throw e; }
      }
      completedBytes += chunk.size;
      progress?.({ completed: position, total: files.length, percent: Math.round(completedBytes / totalBytes * 100) });
    }
    const ready = await send<{ uploadToken: string }>(`/public/uploads/${session.id}/complete`, { method: 'POST', signal, headers: { 'X-Upload-Token': session.token }, body: '{}' });
    uploadTokens.push(ready.uploadToken);
    progress?.({ completed: position + 1, total: files.length, percent: Math.round(completedBytes / totalBytes * 100) });
  }
  const data: Record<string, unknown> = { uploadTokens };
  for (const [key, value] of form.entries()) if (typeof value === 'string') data[key] = value;
  // The final submission is small, and still performs every business validation atomically.
  // Never retry it automatically: a lost response may already represent a committed registration.
  return send<T>(path, { method: 'POST', signal, body: JSON.stringify(data) });
}
