import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, LoaderCircle, X } from 'lucide-react';
import { Button } from './ui/button';

export function RosterPreview({ data, onClose, endpoint = '/public/formats/roster', title = 'Vista previa de la ficha del equipo', description = 'Revisa los datos, descarga la ficha e imprímela para recoger la firma del delegado.', filename = 'UNDC-ficha-equipo.pdf', downloadLabel = 'Descargar para firmar' }: { data?: unknown; onClose: () => void; endpoint?: string; title?: string; description?: string; filename?: string; downloadLabel?: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], iframe');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    async function load() {
      try {
        const response = await fetch(`/api/v1${endpoint}`, {
          method: data === undefined ? 'GET' : 'POST', credentials: 'include', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'undc-web' },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.message || 'No se pudo generar el PDF. Cierra esta ventana e intenta nuevamente.');
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo cargar el PDF.');
      }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [data, endpoint]);
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" onClick={onClose}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="roster-preview-title" aria-describedby="roster-preview-description" className="flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4 border-b p-4 sm:px-6">
        <div><h2 id="roster-preview-title" className="text-lg font-semibold">{title}</h2><p id="roster-preview-description" className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
        <Button ref={close} type="button" variant="ghost" size="icon" aria-label="Cerrar vista previa" onClick={onClose}><X/></Button>
      </div>
      <div className="min-h-0 flex-1 bg-slate-100">
        {error ? <p role="alert" className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>
          : url ? <iframe src={url} title={title} className="h-full w-full border-0"/>
          : <p role="status" className="flex h-full items-center justify-center gap-3 text-sm"><LoaderCircle className="size-5 animate-spin"/>Generando vista previa…</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:px-6">
        <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
        {url ? <Button asChild><a href={url} download={filename}><ArrowDownToLine/>{downloadLabel}</a></Button> : <Button type="button" disabled><ArrowDownToLine/>{downloadLabel}</Button>}
      </div>
    </section>
  </div>, document.body);
}
