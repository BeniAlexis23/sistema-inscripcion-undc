import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, ArrowDownToLine, ArrowLeft, ArrowRight, CheckCircle2, Plus, Trash2, ClipboardCheck, ExternalLink } from 'lucide-react';
import { api, date, statusLabels } from './api';
import { RosterPreview } from './components/RosterPreview';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
import { categoryName, documentLabel, employmentLabels, staffFields, type StaffEvent, type StaffPerson, type StaffTeam } from './staff-api';

const text = (max: number) => z.string().trim().min(2).max(max);
const docFields = { documentType: z.enum(['DNI', 'CE', 'OTHER']), documentNumber: z.string().trim().regex(/^[A-Za-z0-9-]{5,20}$/) };
const schema = z.object({ name: text(100), dependency: text(200), workplace: text(150), category: z.enum(['FUTSAL_MALE', 'FUTSAL_FEMALE', 'VOLLEYBALL_MIXED']), mixedDependencies: z.boolean(),
  delegate: z.object({ name: text(150), ...docFields, phone: z.string().regex(/^\+?[\d ]{7,20}$/), email: z.email() }),
  participants: z.array(z.object({ firstName: text(100), lastName: text(150), ...docFields, sex: z.enum(['FEMALE', 'MALE']), phone: z.string().regex(/^\+?[\d ]{7,20}$/), employment: z.enum(['DOCENTE', 'ADMINISTRATIVO', 'LOCADOR']), dependency: text(200) })).min(1).max(10),
  acceptedBases: z.boolean().refine(v => v, 'Debe leer y aceptar las bases.'),
}).superRefine((v, ctx) => {
  [...v.participants, v.delegate].forEach(p => { if (p.documentType === 'DNI' && !/^\d{8}$/.test(p.documentNumber)) ctx.addIssue({ code: 'custom', path: ['participants'], message: 'El DNI debe contener ocho dígitos.' }); });
  if (new Set(v.participants.map(p => `${p.documentType}:${p.documentNumber.toUpperCase()}`)).size !== v.participants.length) ctx.addIssue({ code: 'custom', path: ['participants'], message: 'Hay participantes duplicados.' });
});
type Data = z.infer<typeof schema>;
const empty = (): StaffPerson => ({ firstName: '', lastName: '', documentType: 'DNI', documentNumber: '', sex: 'MALE', phone: '', employment: 'ADMINISTRATIVO', dependency: '' });
const defaults: Data = { name: '', dependency: '', workplace: '', category: 'FUTSAL_MALE', mixedDependencies: false, delegate: { name: '', documentType: 'DNI', documentNumber: '', phone: '', email: '' }, participants: [empty()], acceptedBases: false };
const errorText = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la solicitud.';
export function StaffRegistration() {
  const [preview, setPreview] = useState<{ data: unknown; endpoint: string; title: string; filename: string; downloadLabel?: string } | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  const [event, setEvent] = useState<StaffEvent | null>(null), [step, setStep] = useState(0), [error, setError] = useState(''), [files, setFiles] = useState<Record<string, File>>({});
  const [managed, setManaged] = useState<StaffTeam | null>(null), [credentials, setCredentials] = useState<{ code: string; token: string } | null>(null), [dirty, setDirty] = useState(false);
  const [receipt, setReceipt] = useState<{ receiptCode: string; editToken?: string; receivedAt: string; message: string } | null>(null), [busy, setBusy] = useState(false);
  const { register, control, trigger, getValues, watch, reset, handleSubmit, formState: { errors } } = useForm<Data>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: 'participants' });
  const values = watch(), expected = staffFields(values);
  useEffect(() => { const sub = watch(() => { setDirty(true); setFiles({}); }); return () => sub.unsubscribe(); }, [watch]);
  useEffect(() => {
    api<StaffEvent>('/public/staff/event').then(setEvent).catch(e => setError(errorText(e)));
    const params = new URLSearchParams(window.location.hash.slice(1)), code = params.get('code'), token = params.get('token');
    if (code && token) {
      setCredentials({ code, token });
      api<StaffTeam>(`/public/staff/manage/${code}`, { method: 'POST', body: JSON.stringify({ token }) }).then(t => { setManaged(t); reset({ ...t, category: t.category as Data['category'], delegate: t.delegate as Data['delegate'], acceptedBases: true }); setDirty(false); }).catch(e => setError(errorText(e)));
    }
  }, [reset]);
  const open = !!event && new Date() >= new Date(event.opensAt) && new Date() <= new Date(event.closesAt);
  const canEdit = open && (!managed || managed.status === 'OBSERVED');
  const retained = (key: string) => !dirty && managed?.documents.some(d => d.field === key);
  async function next() {
    setError('');
    if (step === 0 && !await trigger(['name', 'dependency', 'workplace', 'category', 'mixedDependencies', 'delegate', 'acceptedBases'])) return;
    if (step === 1) {
      if (!await trigger('participants')) return;
      const data = getValues(), people = data.participants, women = people.filter(p => p.sex === 'FEMALE').length, men = people.length - women;
      if (data.category !== 'VOLLEYBALL_MIXED' && people.some(p => p.sex !== (data.category === 'FUTSAL_MALE' ? 'MALE' : 'FEMALE'))) return setError('El sexo de la nómina debe corresponder a la categoría de futsal.');
      if (data.category === 'VOLLEYBALL_MIXED' && ![[3, 3], [4, 2], [5, 1]].some(([f, m]) => women >= f && men >= m)) return setError('Vóleibol: registre una nómina que permita 3 damas/3 varones, 4/2 o 5/1.');
      if (!data.mixedDependencies && people.some(p => p.dependency.trim().toUpperCase() !== data.dependency.trim().toUpperCase())) return setError('Declare distintas dependencias en el primer paso y adjunte la autorización de la Subcomisión.');
    }
    if (step === 2 && expected.some(key => !files[key] && !retained(key))) return setError('Adjunte todos los documentos obligatorios.');
    setStep(s => s + 1);
  }
  async function format(kind: string, index = 0) {
    setError('');
    if (!await trigger()) return;
    const titles: Record<string, string> = { roster: 'Ficha oficial del equipo', fitness: 'Declaración de aptitud física', responsibility: 'Declaración de responsabilidad', control: 'Hoja de control documentario' };
    setPreview({ data: structuredClone(getValues()), endpoint: `/public/staff/formats/${kind}?index=${index}`, title: `Vista previa · ${titles[kind]}`, filename: `personal-${kind}-${index + 1}.pdf` });
  }
  function openReceipt(code: string, token: string) {
    setPreview({ data: { token }, endpoint: `/public/staff/receipts/${code}`, title: 'Registro completo de inscripción', filename: `registro-personal-${code}.pdf`, downloadLabel: 'Guardar registro completo (PDF)' });
  }
  const submit = handleSubmit(async data => {
    setError(''); setBusy(true); try {
      const body = new FormData(); body.append('data', JSON.stringify(data));
      Object.entries(files).forEach(([key, file]) => body.append(key, file));
      if (credentials) { body.append('receiptCode', credentials.code); body.append('token', credentials.token); }
      const result = await api<NonNullable<typeof receipt>>('/public/staff/registrations', { method: 'POST', body }); setReceipt(result);
      if (result.editToken) setCredentials({ code: result.receiptCode, token: result.editToken });
      const token = result.editToken || credentials?.token;
      if (token) openReceipt(result.receiptCode, token);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  });
  return <div className="min-h-screen bg-[#f0f5fa] text-foreground">
    {preview && <RosterPreview {...preview} onClose={closePreview} description={preview.downloadLabel ? 'Datos del registro recibido, nómina y documentos. La recepción no equivale a aprobación.' : 'Revisa el documento antes de descargarlo. Luego imprímelo y recoge las firmas físicas.'}/>}
    <header className="bg-gradient-to-r from-[#0b3c73] to-[#287bc1] text-white"><div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-5"><img src="/escudo-undc.png" className="h-16 w-16 rounded-full bg-white p-2" alt="Escudo UNDC"/><div><strong className="text-lg">UNIVERSIDAD NACIONAL DE CAÑETE</strong><p className="mt-1 text-xs text-blue-100">Torneo de personal docente y administrativo · XVII Aniversario</p></div></div></header>
    <nav className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap gap-5 px-5 py-4 text-sm"><Link to="/" className="text-primary">Pregrado</Link><Link to="/personal" className="font-semibold text-primary underline">Docentes y administrativos</Link></div></nav>
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
      <Card className="border-t-4 border-primary p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Inscripción sin cuenta</p><h1 className="mt-2 text-2xl font-semibold">Personal docente y administrativo 2026</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">Para docentes, administrativos y locadores con vínculo vigente y acreditable con la UNDC. Equipos representativos de dependencias institucionales; las agrupaciones de distintas dependencias requieren autorización previa.</p><p className="mt-3 text-sm"><strong>Competencias:</strong> 19 de noviembre desde las 18:00 y 20 de noviembre desde las 15:00, en las losas del Campus San Luis de Cañete.</p><p className="mt-2 text-sm"><strong>Cierre:</strong> {event ? date(event.closesAt) : '16 de noviembre de 2026, 18:00 (Lima)'}. Fixture: 17 de noviembre.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{event?.categories.map(c => <div key={c.id} className="rounded-lg border bg-[#f4f8fd] p-3 text-sm"><strong>{c.name}</strong><p className="mt-2 text-muted-foreground">{c.capacity} equipos · máximo 10 integrantes</p><p className="mt-1 text-xs">{c.approved} aprobados. Recepción sujeta a validación y orden de llegada.</p></div>)}</div><div className="mt-5 flex flex-wrap gap-3">{event?.documents.map(d => <Button asChild key={d.id}><a href={d.href} target="_blank" rel="noreferrer"><ArrowDownToLine/>{d.title}<ExternalLink/></a></Button>)}</div></Card>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {receipt ? <Card className="space-y-5 p-8"><CheckCircle2 className="size-10 text-primary"/><h2 className="text-xl font-semibold">Expediente recibido</h2><p>{receipt.message}</p><p className="break-all text-sm">Constancia: <strong>{receipt.receiptCode}</strong></p><p className="text-sm">{date(receipt.receivedAt)}</p>{credentials && <Button type="button" onClick={() => openReceipt(receipt.receiptCode, credentials.token)}><Eye/>Ver registro completo (PDF)</Button>}{credentials && <div className="rounded-lg border bg-blue-50 p-4"><p className="mb-3 text-sm font-semibold">Guarda este enlace privado para consultar el estado y subsanar. No lo compartas: permite acceder a tu expediente.</p><a className="break-all text-sm text-primary underline" href={`/personal#code=${credentials.code}&token=${credentials.token}`}>{window.location.origin}/personal#code={credentials.code}&token={credentials.token}</a><Button type="button" className="mt-4" onClick={() => { const link = `${window.location.origin}/personal#code=${credentials.code}&token=${credentials.token}`; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([link], { type: 'text/plain' })); a.download = 'acceso-privado-personal.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }}>Guardar acceso privado</Button></div>}</Card>
      : <>
        {managed && <Card className="p-5"><h2 className="font-semibold">Estado: {statusLabels[managed.status]}</h2><p className="mt-2 text-sm">{managed.reviews[0]?.notes || 'La comisión revisará el vínculo vigente, la identidad y la documentación. La recepción no equivale a aprobación.'}</p>{credentials && <Button type="button" className="mt-4" onClick={() => openReceipt(managed.receiptCode, credentials.token)}><Eye/>Ver registro completo (PDF)</Button>}</Card>}
        {!open && event && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">El plazo de inscripción está cerrado. Puedes consultar las bases y el estado de tu expediente.</p>}
        <ol className="grid grid-cols-4 gap-2 text-xs">{['Equipo y delegado', 'Participantes', 'Documentos', 'Confirmación'].map((label, i) => <li key={label} className={`border-t-2 pt-3 ${i === step ? 'border-primary font-semibold text-primary' : 'text-muted-foreground'}`}>{i + 1}. {label}</li>)}</ol>
        <form onSubmit={submit} className="space-y-6"><fieldset disabled={!canEdit || busy} className="space-y-6">
          {step === 0 && <Card className="p-6 sm:p-8"><h2 className="mb-6 text-xl font-semibold">Equipo y delegado responsable</h2><div className="form-grid">{([['name', 'Nombre del equipo', 100], ['dependency', 'Dependencia, unidad u oficina representada', 200], ['workplace', 'Sede de trabajo', 150]] as const).map(([key, label, max]) => <label key={key}>{label}<Input {...register(key)} maxLength={max}/>{errors[key] && <small className="text-red-700">{errors[key]?.message}</small>}</label>)}<label>Categoría<select {...register('category')}>{(event?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" {...register('mixedDependencies')}/><span>El equipo agrupa personal de distintas dependencias. Adjuntaremos autorización expresa de la Subcomisión.</span></label><div className="my-6 border-t"/><h3 className="mb-5 font-semibold">Datos del delegado</h3>
            <div className="form-grid">
              <label className="sm:col-span-2">Nombres y apellidos<Input {...register('delegate.name')} maxLength={150}/>{errors.delegate?.name && <small className="text-red-700">{errors.delegate.name.message}</small>}</label>
                <label className="block">Tipo de documento<select {...register('delegate.documentType')}><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="OTHER">Otro documento válido</option></select></label>
                <label className="block">Número de documento<Input {...register('delegate.documentNumber')} maxLength={20}/>{errors.delegate?.documentNumber && <small className="text-red-700">{errors.delegate.documentNumber.message}</small>}</label>
                <label className="block">Celular / WhatsApp<Input {...register('delegate.phone')} type="tel" maxLength={20}/>{errors.delegate?.phone && <small className="text-red-700">{errors.delegate.phone.message}</small>}</label>
                <label className="block">Correo de contacto<Input {...register('delegate.email')} type="email" maxLength={191}/>{errors.delegate?.email && <small className="text-red-700">{errors.delegate.email.message}</small>}</label>
            </div><label className="mt-6 flex items-start gap-3 rounded-lg border bg-blue-50 p-4 text-sm"><input type="checkbox" {...register('acceptedBases')}/><span>He leído las bases de personal y acepto sus requisitos y el tratamiento de estos datos para gestionar la inscripción.</span></label>{errors.acceptedBases && <small className="text-red-700">{errors.acceptedBases.message}</small>}</Card>}
          {step === 1 && <div className="space-y-4"><Card className="p-5"><h2 className="font-semibold">Nómina · {fields.length} de 10 integrantes como máximo</h2><p className="mt-2 text-sm text-muted-foreground">No se solicita código universitario. Una persona no puede integrar dos equipos de la misma categoría. Vóleibol exige una nómina que permita 3 damas/3 varones, 4/2 o 5/1.</p></Card>{fields.map((field, i) => <Card key={field.id} className="p-6"><div className="mb-5 flex items-center justify-between"><h3 className="font-semibold">Participante {i + 1}</h3><Button type="button" variant="outline" size="sm" onClick={() => remove(i)} disabled={fields.length === 1}><Trash2/>Retirar</Button></div><div className="form-grid">{([['lastName', 'Apellidos'], ['firstName', 'Nombres']] as const).map(([key, label]) => <label key={key}>{label}<Input {...register(`participants.${i}.${key}`)} maxLength={key === 'firstName' ? 100 : 150}/>{errors.participants?.[i]?.[key] && <small className="text-red-700">{errors.participants[i]?.[key]?.message}</small>}</label>)}<label>Tipo de documento<select {...register(`participants.${i}.documentType`)}><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="OTHER">Otro documento válido</option></select></label><label>Número de documento<Input {...register(`participants.${i}.documentNumber`)} maxLength={20}/>{errors.participants?.[i]?.documentNumber && <small className="text-red-700">{errors.participants[i]?.documentNumber?.message}</small>}</label>{([['phone', 'Celular'], ['dependency', 'Dependencia de trabajo']] as const).map(([key, label]) => <label key={key}>{label}<Input {...register(`participants.${i}.${key}`)} maxLength={key === 'phone' ? 20 : 200}/>{errors.participants?.[i]?.[key] && <small className="text-red-700">{errors.participants[i]?.[key]?.message}</small>}</label>)}<label>Sexo<select {...register(`participants.${i}.sex`)}><option value="FEMALE">Dama</option><option value="MALE">Varón</option></select></label><label>Vínculo con la UNDC<select {...register(`participants.${i}.employment`)}>{Object.entries(employmentLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></Card>)}{typeof errors.participants?.message === 'string' && <p className="text-sm text-red-700">{errors.participants.message}</p>}<Button type="button" onClick={() => append({ ...empty(), dependency: getValues('dependency'), sex: getValues('category') === 'FUTSAL_FEMALE' ? 'FEMALE' : 'MALE' })} disabled={fields.length >= 10}><Plus/>Agregar participante</Button></div>}
          {step === 2 && <div className="space-y-5"><Card className="space-y-4 p-6"><h2 className="text-xl font-semibold">Formatos y documentos firmados</h2><p className="text-sm leading-6 text-muted-foreground">Descarga, imprime y firma físicamente los modelos oficiales. La comisión verificará la identidad y el vínculo vigente desde el panel administrativo; no se solicitan estos archivos en el formulario. No adjuntes diagnósticos médicos. PDF, JPG o PNG: máximo 10 MB por archivo. Al cambiar datos de un expediente observado debes volver a firmar y adjuntar todos los documentos.</p><div className="flex flex-wrap gap-3"><Button type="button" onClick={() => format('roster')}><Eye/>Ficha con datos</Button><Button type="button" onClick={() => format('control')}><ClipboardCheck/>Hoja de control</Button></div>{values.participants.map((p, i) => <div key={i} className="flex flex-wrap items-center gap-3 border-t pt-4"><span className="text-sm font-semibold">{p.lastName}, {p.firstName}</span><Button type="button" size="sm" onClick={() => format('fitness', i)}><Eye/>Aptitud</Button><Button type="button" size="sm" onClick={() => format('responsibility', i)}><Eye/>Responsabilidad</Button></div>)}</Card>{expected.map(key => <Card className="p-5" key={key}><label className="text-sm font-semibold" htmlFor={`staff-file-${key}`}>{documentLabel(key, values.participants)}</label>{retained(key) && !files[key] && <p className="mt-2 text-xs text-primary">Documento recibido anteriormente; puedes reemplazarlo.</p>}<input id={`staff-file-${key}`} type="file" accept="application/pdf,image/jpeg,image/png" className="mt-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-white" onChange={e => { const f = e.target.files?.[0]; if (!f) { setFiles(v => { const next = { ...v }; delete next[key]; return next; }); return; } if (f.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) { setError('Solo PDF, JPG o PNG de hasta 10 MB.'); e.target.value = ''; return; } setError(''); setFiles(v => ({ ...v, [key]: f })); }}/></Card>)}</div>}
          {step === 3 && <Card className="space-y-5 p-6"><h2 className="text-xl font-semibold">Revisa antes de enviar</h2><dl className="grid gap-4 rounded-lg bg-blue-50 p-5 sm:grid-cols-2">{[['Equipo', values.name], ['Dependencia', values.dependency], ['Sede', values.workplace], ['Categoría', categoryName(values.category)], ['Delegado', values.delegate.name], ['Participantes', String(values.participants.length)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl><p className="text-sm leading-7">La comisión verificará manualmente identidad, vínculo vigente, firmas y autorización de agrupación cuando corresponda. El cupo depende del expediente completo y válido y su orden de recepción. Este envío no equivale a admisión.</p></Card>}
        </fieldset><div className="flex justify-between gap-3">{step > 0 ? <Button type="button" variant="outline" disabled={busy} onClick={() => { setError(''); setStep(s => s - 1); }}><ArrowLeft/>Anterior</Button> : <span/>}{step < 3 ? <Button key="next" type="button" disabled={!canEdit || busy} onClick={e => { e.preventDefault(); void next(); }}>Continuar<ArrowRight/></Button> : <Button key="submit" type="submit" disabled={!canEdit || busy}>{busy ? 'Enviando…' : managed ? 'Enviar subsanación' : 'Enviar inscripción'}</Button>}</div></form>
      </>}
    </main><footer className="border-t bg-white p-6 text-center text-xs text-muted-foreground">Universidad Nacional de Cañete · Subcomisión de Recreación y Deportes · Personal 2026</footer>
  </div>;
}
