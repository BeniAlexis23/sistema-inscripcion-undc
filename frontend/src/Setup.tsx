import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from './api';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card } from './components/ui/card';

const schema = z.object({
  name: z.string().trim().min(2).max(150), email: z.email().max(191),
  dni: z.string().regex(/^\d{8}$/, 'Ingrese un DNI de ocho dígitos.'),
  phone: z.string().regex(/^\+?[\d ]{7,20}$/, 'Ingrese un celular válido.'),
  password: z.string().min(6, 'Use al menos seis caracteres.').max(128),
  confirmation: z.string(),
}).refine(data => data.password === data.confirmation, { path: ['confirmation'], message: 'Las contraseñas no coinciden.' });
type Data = z.infer<typeof schema>;

export default function Setup() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<Data>({ resolver: zodResolver(schema) });
  const check = () => {
    setError('');
    api<{ available: boolean }>('/setup').then(data => setAvailable(data.available)).catch(() => setError('No se pudo comprobar la configuración. Intente nuevamente.'));
  };
  useEffect(check, []);
  const fields = [
    ['name', 'Nombres y apellidos', 'text', 'name'],
    ['email', 'Correo electrónico', 'email', 'username'],
    ['dni', 'DNI', 'text', 'off'],
    ['phone', 'Celular', 'tel', 'tel'],
    ['password', 'Contraseña', 'password', 'new-password'],
    ['confirmation', 'Confirmar contraseña', 'password', 'new-password'],
  ] as const;
  return <main className="grid min-h-screen place-items-center bg-[#f1f5fa] px-5 py-10">
    <Card className="w-full max-w-xl p-6 sm:p-9">
      <img src="/escudo-undc.png" alt="Escudo UNDC" className="mb-6 h-16 w-16 object-contain"/>
      <p className="eyebrow mb-3">UNDC · Configuración inicial</p>
      <h1 className="text-2xl font-semibold">{created ? 'Administrador creado' : 'Crear el primer administrador'}</h1>
      {error && <div role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {created ? <div role="status" className="mt-5 space-y-5"><p className="text-sm">Tu cuenta está lista. Ingresa con el correo y la contraseña que registraste.</p><Button asChild><Link to="/admin">Ir al acceso administrativo</Link></Button></div>
      : available === false ? <p className="mt-5 text-sm leading-6">La configuración inicial ya se completó. Para solicitar otra cuenta, comunícate con el administrador.</p>
      : available === null ? <div className="mt-5">{error ? <Button variant="outline" onClick={check}>Reintentar</Button> : <p role="status" className="text-sm">Comprobando disponibilidad…</p>}</div>
      : <><p className="mt-3 text-sm leading-6 text-muted-foreground">Registra al responsable del sistema. Este formulario se deshabilita al crear la primera cuenta administrativa.</p>
        <form className="mt-7 space-y-5" onSubmit={handleSubmit(async ({ confirmation: _confirmation, ...data }) => {
          setError('');
          try { await api('/setup', { method: 'POST', body: JSON.stringify(data) }); reset(); setCreated(true); }
          catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta.'); checkAvailability(); }
        })}>
          <div className="form-grid">{fields.map(([key, label, type, autoComplete]) => <label key={key} htmlFor={`setup-${key}`}>{label}
            <Input id={`setup-${key}`} type={type} autoComplete={autoComplete} maxLength={key === 'dni' ? 8 : key === 'phone' ? 20 : key === 'email' ? 191 : key === 'name' ? 150 : 128} inputMode={key === 'dni' ? 'numeric' : undefined} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} {...register(key)}/>
            {errors[key] && <small id={`error-${key}`} className="text-red-700">{errors[key]?.message}</small>}
          </label>)}</div>
          <p className="text-xs text-muted-foreground">La contraseña debe tener al menos seis caracteres.</p>
          <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Creando cuenta…' : 'Crear administrador'}</Button>
        </form></>}
      <Link to="/admin" className="mt-6 block text-sm text-primary">Volver al acceso administrativo</Link>
    </Card>
  </main>;

  function checkAvailability() { api<{ available: boolean }>('/setup').then(data => setAvailable(data.available)).catch(() => {}); }
}
