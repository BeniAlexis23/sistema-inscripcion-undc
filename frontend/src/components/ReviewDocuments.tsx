import { useEffect, useRef, useState } from 'react';
import { Eye, LoaderCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Team } from '../api';
import { Card } from './ui/card';
import { Button } from './ui/button';

export function ReviewDocuments({ team, values, onChange, busy }: { team: Team; values: Record<string, boolean>; onChange: (key: string, value: boolean) => void; busy: boolean }) {
  const [preview, setPreview] = useState<{ id: number; title: string } | null>(null);
  const rows = [{ key: 'ROSTER', title: 'Ficha oficial del equipo', participationId: null }, ...team.participations.flatMap(p => [
    { key: 'FITNESS', title: `Aptitud física · ${p.athlete.lastName}, ${p.athlete.firstName}`, participationId: p.id },
    { key: 'RESPONSIBILITY', title: `Responsabilidad · ${p.athlete.lastName}, ${p.athlete.firstName}`, participationId: p.id },
  ])];
  return <><Card className="divide-y overflow-hidden">{rows.map(row => {
    const doc = team.documents.find(d => d.kind === row.key && d.participationId === row.participationId);
    const key = `document_${doc?.id}`;
    return <div key={`${row.key}-${row.participationId}`} className="flex items-center justify-between gap-4 p-4 sm:px-5">
      <label className="flex min-w-0 items-center gap-3 font-normal">
        <input type="checkbox" className="size-4 shrink-0 accent-primary" aria-label={`Validar ${row.title}`} checked={!!doc && !!values[key]} disabled={!doc || busy || team.status !== 'SUBMITTED'} onChange={e => onChange(key, e.target.checked)}/>
        <span className="text-sm">{row.title}{!doc && <span className="mt-1 block text-xs text-amber-700">Sin documento adjunto</span>}</span>
      </label>
      <Button type="button" variant="ghost" size="icon" className="shrink-0" disabled={!doc} aria-label={`Vista previa de ${row.title}`} title="Vista previa" onClick={() => doc && setPreview({ id: doc.id, title: row.title })}><Eye/></Button>
    </div>;
  })}</Card>{preview && <DocumentPreview id={preview.id} title={preview.title} onClose={() => setPreview(null)}/>}</>;
}

function DocumentPreview({ id, title, onClose }: { id: number; title: string; onClose: () => void }) {
  const [file, setFile] = useState<{ url: string; image: boolean } | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAction.current();
      if (e.key === 'Tab') {
        const elements = dialog.current?.querySelectorAll<HTMLElement>('button, iframe');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let url = '';
    void (async () => {
      try {
        const response = await fetch(`/api/v1/documents/${id}`, { credentials: 'include', signal: controller.signal });
        if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.message || 'No se pudo abrir el documento.'); }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob); setFile({ url, image: blob.type.startsWith('image/') });
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo abrir el documento.'); }
    })();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" onClick={onClose}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="document-preview-title" className="flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-4 border-b p-4"><h2 id="document-preview-title" className="text-sm font-semibold">{title}</h2><Button ref={close} type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Cerrar vista previa" onClick={onClose}><X/></Button></div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100">{error ? <p role="alert" className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p> : !file ? <p role="status" className="flex h-full items-center justify-center gap-2 text-sm"><LoaderCircle className="size-5 animate-spin"/>Cargando documento…</p> : file.image ? <img src={file.url} alt={title} className="mx-auto h-auto max-w-full"/> : <iframe src={file.url} title={title} className="h-full w-full border-0"/>}</div>
    </section>
  </div>, document.body);
}
