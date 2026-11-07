import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PublicRegistration } from './Public';
const AdminApp = lazy(() => import('./App'));
const Setup = lazy(() => import('./Setup'));
export function App() {
  const location = useLocation();
  if (location.pathname === '/admin/registro') return <Suspense fallback={<p role="status">Cargando configuración…</p>}><Setup/></Suspense>;
  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
    return <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Cargando administración…</div>}><AdminApp/></Suspense>;
  }
  return <Routes><Route path="/" element={<PublicRegistration/>}/><Route path="/inscripcion" element={<Navigate to="/" replace/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
}
