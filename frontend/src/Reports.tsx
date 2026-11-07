import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, Eye, FileText, LoaderCircle } from 'lucide-react';
import { api, download, type Catalog } from './api';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { RosterPreview } from './components/RosterPreview';

type Item = { id: number; name?: string | null; cycle?: string | null; shift?: string | null; section?: string | null; school: { name: string }; category: { name: string; discipline: string }; _count: { documents: number; participations: number } };
const disciplines = [['FUTSAL', 'Futsal'], ['VOLLEYBALL', 'Vóleibol'], ['BASKETBALL', 'Básquetbol'], ['CHESS', 'Ajedrez']];
export default function Reports({ catalog }: { catalog: Catalog | null }) {
  const [preview, setPreview] = useState<{ endpoint: string; title: string; filename: string } | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const [discipline, setDiscipline] = useState(''), [school, setSchool] = useState(''), [category, setCategory] = useState('');
  const [items, setItems] = useState<Item[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const query = new URLSearchParams({ ...(discipline ? { discipline } : {}), ...(school ? { schoolId: school } : {}), ...(category ? { categoryId: category } : {}) }).toString();
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setItems([]);
    api<{ items: Item[] }>(`/reports/approved?${query}`).then(data => { if (active) setItems(data.items); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, attempt]);
  async function exportPdf(teamId?: number) {
    setBusy(true); setError('');
    try { await download(`/reports/approved/pdf?${query}${teamId ? `&teamId=${teamId}` : ''}`, teamId ? `equipo-${teamId}-documentos-aprobados.pdf` : `documentos-aprobados-${discipline.toLowerCase() || 'todos'}.pdf`); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar el reporte.'); }
    finally { setBusy(false); }
  }
  function previewPdf(item?: Item) {
    setPreview({ endpoint: `/reports/approved/pdf?${query}${item ? `&teamId=${item.id}` : ''}`, title: item ? `Vista previa · ${item.school.name} · ${item.category.name}` : 'Vista previa de la selección', filename: item ? `equipo-${item.id}-documentos-aprobados.pdf` : `documentos-aprobados-${discipline.toLowerCase() || 'todos'}.pdf` });
  }
  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow mb-2">Reportes</p><h1 className="text-2xl font-bold lg:text-3xl">Documentos aprobados</h1><p className="mt-2 text-sm text-muted-foreground">Descarga los documentos firmados por equipo o agrupados por deporte.</p></div>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy || loading || !items.length} onClick={() => previewPdf()}><Eye/>Vista previa de la selección</Button><Button disabled={busy || loading || !items.length} onClick={() => exportPdf()}>{busy ? <LoaderCircle className="animate-spin"/> : <ArrowDownToLine/>}{busy ? 'Preparando PDF…' : 'Descargar selección en PDF'}</Button></div>
    </div>
    {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" className="ml-3 underline" onClick={() => setAttempt(v => v + 1)}>Reintentar</button></div>}
    <Card className="overflow-hidden">
      <div className="grid gap-4 border-b p-5 sm:grid-cols-3">
        <label>Deporte<select value={discipline} disabled={busy} onChange={e => { setDiscipline(e.target.value); setCategory(''); }}><option value="">Todos los deportes</option>{disciplines.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Categoría<select value={category} disabled={busy} onChange={e => setCategory(e.target.value)}><option value="">Todas las categorías</option>{catalog?.categories.filter(c => !discipline || c.discipline === discipline).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Escuela profesional<select value={school} disabled={busy} onChange={e => setSchool(e.target.value)}><option value="">Todas las escuelas</option>{catalog?.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>
      {loading ? <p role="status" className="p-10 text-center text-sm">Cargando equipos aprobados…</p> : items.length ? <>
        <div className="overflow-x-auto"><table><thead><tr><th>Equipo / escuela</th><th>Categoría</th><th>Deportistas</th><th>Documentos</th><th>Vista previa y descarga</th></tr></thead><tbody>{items.map(item => <tr key={item.id}>
          <td><Link to={`/admin/teams/${item.id}`} className="font-semibold text-primary hover:underline">#{item.id} · {item.name || item.school.name}</Link>{item.name && <p className="mt-1 text-xs text-muted-foreground">{item.school.name}</p>}<p className="mt-1 text-xs text-muted-foreground">{[item.cycle && 'Ciclo ' + item.cycle, item.shift, item.section && 'Sección ' + item.section].filter(Boolean).join(' · ')}</p></td><td>{item.category.name}</td><td>{item._count.participations}</td><td>{item._count.documents}</td><td><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={busy} title="Vista previa" aria-label={`Vista previa del equipo ${item.id}`} onClick={() => previewPdf(item)}><Eye/></Button><Button variant="outline" size="sm" disabled={busy} onClick={() => exportPdf(item.id)}><FileText/>PDF del equipo</Button></div></td>
        </tr>)}</tbody></table></div>
        <p className="border-t p-5 text-xs text-muted-foreground">{items.length} equipos aprobados · {items.reduce((sum, t) => sum + t._count.documents, 0)} documentos firmados. El PDF agrupa los equipos por categoría e incluye una portada por equipo.</p>
      </> : <div className="p-10 text-center"><FileText className="mx-auto mb-3 size-8 text-muted-foreground"/><p className="text-sm font-semibold">No hay equipos aprobados para esta selección.</p><p className="mt-2 text-xs text-muted-foreground">Ajusta los filtros o revisa los expedientes en Equipos inscritos.</p></div>}
    </Card>
    <p className="mt-4 text-xs leading-6 text-muted-foreground">Se incluyen la ficha y las declaraciones firmadas. Los adjuntos PDF conservan sus páginas; los JPG y PNG se convierten en páginas PDF. Si la selección supera los 100 MB, descarga por deporte, escuela o equipo.</p>
    {preview && <RosterPreview endpoint={preview.endpoint} title={preview.title} filename={preview.filename} description="Revisa los documentos firmados aprobados antes de descargarlos." downloadLabel="Descargar PDF" onClose={closePreview}/>}
  </>;
}
