import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Pencil,
  Search,
  Settings2,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
  X,
  Trash2,
  Clock3,
  KeyRound,
} from "lucide-react";
import {
  api,
  date,
  download,
  statusLabels,
  type Catalog,
  type Page,
  type Status,
  type Team,
  type TeamSummary,
  type User,
  type Athlete,
} from "./api";
import { Button } from "./components/ui/button";
import { DownloadButton } from "./components/ui/download-button";
import { Input } from "./components/ui/input";
import { Card } from "./components/ui/card";
import { ReviewDocuments } from "./components/ReviewDocuments";
import Reports from "./Reports";
z.config(z.locales.es());

const checks: Record<string, string> = {
  roster: "Ficha oficial completa y firmada por el delegado",
  capacity: "Nómina dentro del máximo y composición permitidos",
  fitness: "Declaraciones de aptitud física firmadas",
  responsibility: "Declaraciones de responsabilidad firmadas",
  enrollment: "Matrícula 2026-II verificada manualmente",
  school: "Pertenencia a la escuela verificada manualmente",
  disciplines: "Máximo de dos disciplinas verificado",
  identity: "Identificación verificada cuando corresponde",
};
const actionLabels: Record<string, string> = {
  TEAM_CREATED: "Equipo creado",
  PUBLIC_REGISTRATION: "Inscripción recibida desde el formulario público",
  ATHLETE_ADDED: "Deportista agregado",
  ATHLETE_UPDATED: "Identidad corregida",
  ATHLETE_REMOVED: "Deportista retirado",
  DOCUMENT_UPLOADED: "Documento adjuntado",
  TEAM_SUBMITTED: "Expediente enviado a revisión",
  TEAM_OBSERVED: "Expediente observado",
  TEAM_APPROVED: "Expediente aprobado",
  TEAM_REOPENED: "Expediente reabierto",
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar la operación.";
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {message}
    </div>
  ) : null;
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="p-12 text-center">
      <ClipboardCheck className="mx-auto mb-4 size-9 text-muted-foreground/50" />
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
function Badge({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>{statusLabels[status]}</span>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      onClick={close}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Cerrar"
          >
            <X />
          </Button>
        </div>
        {children}
      </section>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Pager({
  page,
  total,
  setPage,
  pageSize = 10,
}: {
  page: number;
  total: number;
  setPage: (n: number) => void;
  pageSize?: number;
}) {
  return (
    <div className="flex items-center justify-between border-t px-5 py-4 text-xs text-muted-foreground">
      <span>
        {total} registro{total === 1 ? "" : "s"} · Página {page} de{" "}
        {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page * pageSize >= total}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

function AdminApp() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [catalogError, setCatalogError] = useState("");
  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await api<Catalog>("/catalogs"));
      setCatalogError("");
    } catch (e) {
      setCatalogError(errorText(e));
    }
  }, []);
  useEffect(() => {
    api<User>("/sessions/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
    const expire = () => setUser(null);
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  useEffect(() => {
    if (user) void loadCatalog();
  }, [user, loadCatalog]);
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Cargando sesión…
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  return (
    <Shell
      user={user}
      logout={async () => {
        await api("/sessions", { method: "DELETE" });
        setUser(null);
        setCatalog(null);
      }}
    >
      {catalogError && (
        <div className="mb-4">
          <ErrorMessage message={catalogError} />
          <Button variant="outline" className="mt-2" onClick={loadCatalog}>
            Reintentar
          </Button>
        </div>
      )}
      <Routes>
        <Route
          path="/admin"
          element={<Dashboard user={user} catalog={catalog} />}
        />
        <Route
          path="/admin/teams"
          element={<Teams user={user} catalog={catalog} />}
        />
        <Route
          path="/admin/teams/:id"
          element={<TeamDetail user={user} catalog={catalog} />}
        />
        <Route path="/admin/reviews" element={<Navigate to="/admin/teams" replace />} />
        {user.role !== "DELEGATE" && <Route path="/admin/reports" element={<Reports catalog={catalog}/>} />}
        {user.role === "ADMIN" && (
          <Route
            path="/admin/users"
            element={<UsersPage catalog={catalog} user={user} />}
          />
        )}
        {user.role !== "DELEGATE" && (
          <Route
            path="/admin/settings"
            element={<Settings catalog={catalog} reload={loadCatalog} />}
          />
        )}
        <Route
          path="/admin/account"
          element={<PasswordPage onChanged={() => setUser(null)} />}
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Shell>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [error, setError] = useState("");
  const [setupAvailable, setSetupAvailable] = useState(false);
  useEffect(() => { api<{ available: boolean }>("/setup").then(data => setSetupAvailable(data.available)).catch(() => {}); }, []);
  const schema = z.object({
    email: z.email("Ingrese un correo válido."),
    password: z.string().min(1, "Ingrese su contraseña."),
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#103f75] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-16 place-items-center rounded-full bg-white p-2">
            <img
              src="/escudo-undc.png"
              alt="Escudo UNDC"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="text-xl font-bold">
            UNDC <span className="font-light text-white/60">/ Deportes</span>
          </div>
        </div>
        <div className="relative z-10 max-w-lg">
          <p className="mb-5 text-xs font-bold tracking-[.25em] text-[#d5e8ff]">
            XVII ANIVERSARIO INSTITUCIONAL
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Nuestra identidad.
            <br />
            Un mismo equipo.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-white/65">
            Seis escuelas, siete categorías y una comunidad que se encuentra en
            el deporte.
          </p>
          <div className="mt-10 flex gap-8 border-t border-white/15 pt-7">
            <div>
              <strong className="text-3xl">06</strong>
              <p className="mt-1 text-xs text-white/60">
                Escuelas profesionales
              </p>
            </div>
            <div>
              <strong className="text-3xl">07</strong>
              <p className="mt-1 text-xs text-white/60">
                Categorías deportivas
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-white/50">
          20 y 21 de noviembre de 2026 · Campus San Luis, Cañete
        </p>
        <div className="absolute -right-40 top-1/4 size-[540px] rounded-full border-[65px] border-white/[.035]" />
      </div>
      <div className="flex items-center justify-center bg-white p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <span className="eyebrow">PANEL DE ADMINISTRACIÓN · 2026-II</span>
          <Link
            to="/"
            className="mb-5 flex items-center gap-2 text-xs text-primary"
          >
            <ArrowLeft className="size-3" />
            Volver al evento
          </Link>
          <h2 className="mt-3 text-3xl font-bold">Acceso administrativo</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Acceso reservado para la comisión organizadora y los responsables
            autorizados.
          </p>
          <form
            className="mt-8 space-y-5"
            onSubmit={handleSubmit(async (data) => {
              setError("");
              try {
                onLogin(
                  await api<User>("/sessions", {
                    method: "POST",
                    body: JSON.stringify(data),
                  }),
                );
              } catch (e) {
                setError(errorText(e));
              }
            })}
          >
            <ErrorMessage message={error} />
            <label>
              Correo electrónico
              <Input
                type="email"
                autoComplete="username"
                placeholder="nombre@undc.edu.pe"
                {...register("email")}
              />
              {errors.email && (
                <small className="text-red-700">{errors.email.message}</small>
              )}
            </label>
            <label>
              Contraseña
              <Input
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <small className="text-red-700">
                  {errors.password.message}
                </small>
              )}
            </label>
            <Button className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Ingresando…" : "Ingresar al sistema"}
              <ArrowRight />
            </Button>
          </form>
          <p className="mt-7 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
            ¿Necesitas una cuenta o recuperar tu acceso? Comunícate con la
            comisión organizadora.
          </p>
          {setupAvailable && <Link to="/admin/registro" className="mt-4 block text-sm font-semibold text-primary">Crear el primer administrador</Link>}
        </div>
      </div>
    </div>
  );
}
function Shell({
  user,
  logout,
  children,
}: {
  user: User;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const navigation = [
    { path: "/admin", label: "Resumen general", icon: LayoutDashboard },
    ...(user.role !== "DELEGATE" ? [{ path: "/admin/reports", label: "Reportes", icon: FileText }] : []),
    {
      path: "/admin/teams",
      label: user.role === "DELEGATE" ? "Mis equipos" : "Equipos inscritos",
      icon: Users,
    },
    ...(user.role === "ADMIN"
      ? [
          {
            path: "/admin/users",
            label: "Usuarios y accesos",
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(user.role !== "DELEGATE"
      ? [{ path: "/admin/settings", label: "Configuración", icon: Settings2 }]
      : []),
  ];
  return (
    <div className="min-h-screen">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[238px] flex-col bg-[#103f75] px-5 py-7 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Link to="/admin" className="flex items-center gap-3 px-2">
          <div className="grid size-9 place-items-center rounded-lg border border-white/25">
            <img
              src="/escudo-undc.png"
              alt="Escudo UNDC"
              className="h-full w-full object-contain rounded-md bg-white p-1"
            />
          </div>
          <div>
            <strong className="text-xl tracking-wide">UNDC</strong>
            <p className="text-[9px] uppercase tracking-[2px] text-white/50">
              Gestión deportiva
            </p>
          </div>
        </Link>
        <div className="mb-8 mt-8 rounded-lg border border-white/10 bg-white/[.035] p-3">
          <p className="text-[10px] uppercase tracking-widest text-[#d8c395]">
            XVII Aniversario
          </p>
          <p className="mt-1 text-xs text-white/70">Torneo de Pregrado 2026</p>
        </div>
        <p className="mb-3 px-3 text-[9px] font-bold tracking-[2px] text-white/35">
          ESPACIO DE TRABAJO
        </p>
        <nav className="space-y-1">
          {navigation.map((n) => (
            <NavLink
              end={n.path === "/admin"}
              key={n.path}
              to={n.path}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <n.icon className="size-[17px]" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-10">
          <div className="rounded-xl border border-white/10 p-4">
            <ShieldCheck className="mb-2 size-5 text-[#d5e8ff]" />
            <p className="text-xs font-medium">Juego limpio desde el inicio</p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/45">
              Cada estudiante representa a su escuela en un máximo de dos
              disciplinas.
            </p>
          </div>
          <NavLink to="/admin/account" className="nav-item mt-5">
            <KeyRound className="size-4" />
            Mi contraseña
          </NavLink>
          <button
            className="nav-item w-full"
            onClick={async () => {
              try {
                await logout();
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="lg:ml-[238px]">
        <header className="flex h-[78px] items-center justify-between border-b bg-white px-5 lg:px-9">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu />
            </Button>
            <span className="text-xs text-muted-foreground">
              Portal de inscripciones{" "}
              <span className="mx-2 text-border">/</span>
              <strong className="font-medium text-foreground">
                Semestre 2026-II
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border px-3 py-1 text-[10px] font-medium text-muted-foreground sm:block">
              {user.role === "ADMIN"
                ? "Administrador"
                : user.role === "COMMISSION"
                  ? "Comisión organizadora"
                  : "Delegado de escuela"}
            </span>
            <div className="grid size-9 place-items-center rounded-full bg-[#e8f1fc] text-xs font-bold text-primary">
              {user.name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </div>
            <span className="hidden max-w-36 truncate text-xs font-semibold xl:block">
              {user.name}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1550px] p-5 lg:p-9">
          <ErrorMessage message={error} />
          {children}
          <footer className="mt-12 flex flex-wrap justify-between gap-2 border-t pt-5 text-[10px] text-muted-foreground">
            <span>
              Universidad Nacional de Cañete · Subcomisión de Recreación y
              Deportes
            </span>
            <span>XVII Aniversario Institucional · 2026</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Dashboard({ user, catalog }: { user: User; catalog: Catalog | null }) {
  const [data, setData] = useState<Page<TeamSummary> | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Page<TeamSummary>>("/teams?pageSize=5")
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, []);
  const t = catalog?.tournament,
    now = new Date(),
    isOpen = t && now >= new Date(t.opensAt) && now <= new Date(t.closesAt);
  const count = (status: Status) =>
    data?.counts?.find((c) => c.status === status)?._count || 0;
  const stats = [
    {
      title: "Equipos registrados",
      value: data?.counts?.reduce((n, c) => n + c._count, 0) || 0,
      icon: Users,
      color: "bg-[#edf0f6] text-[#657d9e]",
      caption: "En todas las categorías",
    },
    {
      title: "En revisión",
      value: count("SUBMITTED"),
      icon: Clock3,
      color: "bg-blue-50 text-blue-600",
      caption: "Esperan validación documentaria",
    },
    {
      title: "Observados",
      value: count("OBSERVED"),
      icon: FileText,
      color: "bg-amber-50 text-amber-600",
      caption: "Requieren subsanación",
    },
    {
      title: "Aprobados",
      value: count("APPROVED"),
      icon: CheckCircle2,
      color: "bg-blue-50 text-blue-700",
      caption: "Expedientes conformes",
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="VISTA GENERAL"
        title={`Hola, ${user.name.split(" ")[0]}`}
        description="Todo lo que necesitas para gestionar las inscripciones del torneo."
        action={
          <Button asChild>
            <Link to="/admin/teams">
              <Plus />
              Gestionar equipos
            </Link>
          </Button>
        }
      />
      <ErrorMessage message={error} />
      <div className="relative mb-6 overflow-hidden rounded-xl bg-[#edf4fc] px-6 py-6 sm:px-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary">
              <span
                className={`size-1.5 rounded-full ${isOpen ? "bg-blue-600" : "bg-amber-600"}`}
              />
              {!t
                ? "Cargando convocatoria"
                : isOpen
                  ? "Inscripciones abiertas"
                  : "Fuera del periodo de inscripción"}
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              El aniversario se juega en equipo.
            </h2>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-[#526e91]">
              Registra a tus deportistas, completa sus documentos y envía el
              expediente para su revisión.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-primary/10 bg-white/50 px-4 py-3">
            <CalendarDays className="size-7 text-primary/60" />
            <div>
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Competencias
              </p>
              <p className="mt-1 text-sm font-semibold">20 y 21 de noviembre</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Campus San Luis · Cañete
              </p>
            </div>
          </div>
        </div>
        <Trophy className="absolute -bottom-8 right-48 size-40 rotate-12 text-primary/[.035]" />
      </div>
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.title} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {s.title}
              </span>
              <span
                className={`grid size-8 place-items-center rounded-lg ${s.color}`}
              >
                <s.icon className="size-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold">
              {data ? String(s.value).padStart(2, "0") : "—"}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {s.caption}
            </p>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5">
            <div>
              <h2 className="text-sm font-bold">Últimos expedientes</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Actividad reciente de tus equipos
              </p>
            </div>
            <Link
              to="/admin/teams"
              className="flex items-center gap-1 text-xs font-semibold text-primary"
            >
              Ver todos
              <ChevronRight className="size-4" />
            </Link>
          </div>
          {data ? (
            <TeamTable items={data.items} />
          ) : (
            <Empty
              title={
                error
                  ? "No se pudieron cargar los expedientes"
                  : "Cargando expedientes…"
              }
            />
          )}
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-primary" />
              <h2 className="text-sm font-bold">Tu ruta de inscripción</h2>
            </div>
            <div className="mt-5 space-y-5">
              {[
                ["01", "Crea tu equipo", "Selecciona la categoría deportiva."],
                [
                  "02",
                  "Completa la nómina",
                  "Registra a los estudiantes de tu escuela.",
                ],
                [
                  "03",
                  "Adjunta los documentos",
                  "Descarga, firma y sube los formatos.",
                ],
                [
                  "04",
                  "Envía a revisión",
                  "La comisión validará el expediente.",
                ],
              ].map(([n, title, desc]) => (
                <div className="flex gap-3" key={n}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold text-primary">
                    {n}
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{title}</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <div className="rounded-xl border border-[#e9dfca] bg-[#faf6ed] p-5">
            <p className="flex items-center gap-2 text-xs font-semibold text-[#8d743c]">
              <Bell className="size-4" />
              Ten en cuenta
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#8b7e60]">
              La matrícula y pertenencia a la escuela serán verificadas
              manualmente por la comisión. Adjuntar documentos no equivale a una
              aprobación.
            </p>
            {t && (
              <p className="mt-3 text-[10px] font-semibold text-[#8b7e60]">
                Cierre: {date(t.closesAt)} (Lima)
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
function TeamTable({ items }: { items: TeamSummary[] }) {
  if (!items.length)
    return (
      <Empty title="Aún no hay equipos registrados">
        Crea un equipo para comenzar su expediente de inscripción.
      </Empty>
    );
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Equipo / escuela</th>
            <th>Deportistas</th>
            <th>Estado</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td>
                <Link
                  to={`/admin/teams/${t.id}`}
                  className="flex items-center gap-3"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-[#f7f9fa] text-primary">
                    <Activity className="size-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{t.category.name}</p>
                    <p className="mt-1 max-w-56 text-[11px] text-muted-foreground">
                      {t.school.name}
                    </p>
                  </div>
                </Link>
              </td>
              <td>
                <span className="font-semibold">{t._count.participations}</span>
                <span className="text-muted-foreground">
                  {" "}
                  / {t.category.discipline === "CHESS" ? 10 : 12}
                </span>
              </td>
              <td>
                <Badge status={t.status} />
              </td>
              <td>
                <Button asChild variant="ghost" size="icon">
                  <Link
                    to={`/admin/teams/${t.id}`}
                    aria-label={`Abrir ${t.category.name}`}
                  >
                    <ChevronRight />
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Teams({
  user,
  catalog,
}: {
  user: User;
  catalog: Catalog | null;
}) {
  const [data, setData] = useState<Page<TeamSummary> | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [school, setSchool] = useState(""),
    [category, setCategory] = useState(""),
    [create, setCreate] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    setData(null);
    setError("");
    api<Page<TeamSummary>>(
      `/teams?page=${page}&pageSize=10${status ? `&status=${status}` : ""}${school ? `&schoolId=${school}` : ""}${category ? `&categoryId=${category}` : ""}`,
    )
      .then(setData)
      .catch((e) => setError(errorText(e)));
  }, [page, status, school, category]);
  return (
    <>
      <PageTitle
        eyebrow="INSCRIPCIONES"
        title={
          user.role === "DELEGATE"
              ? "Mis equipos"
              : "Equipos inscritos"
        }
        description={
          "Gestiona las nóminas y el estado de las inscripciones."
        }
        action={
            <Button
              onClick={() => setCreate(true)}
              disabled={!catalog?.tournament}
            >
              <Plus />
              Nuevo equipo
            </Button>
        }
      />
      <ErrorMessage message={error} />
      <Card className="overflow-hidden">
        <div className="grid gap-3 border-b p-5 sm:grid-cols-3">
          <label>
            <span className="sr-only">Estado</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(statusLabels).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Categoría</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas las categorías</option>
              {catalog?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Escuela</span>
            <select
              value={school}
              onChange={(e) => {
                setSchool(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas las escuelas</option>
              {catalog?.schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data ? (
          <>
            <TeamTable items={data.items} />
            <Pager page={page} total={data.total} setPage={setPage} />
          </>
        ) : (
          <Empty
            title={error ? "No se pudo cargar la lista" : "Cargando equipos…"}
          />
        )}
      </Card>
      {create && catalog && (
        <NewTeam
          user={user}
          catalog={catalog}
          close={() => setCreate(false)}
          created={(id) => navigate(`/admin/teams/${id}`)}
        />
      )}
    </>
  );
}
function NewTeam({
  user,
  catalog,
  close,
  created,
}: {
  user: User;
  catalog: Catalog;
  close: () => void;
  created: (id: number) => void;
}) {
  const [category, setCategory] = useState(""),
    [delegate, setDelegate] = useState(""),
    [delegates, setDelegates] = useState<User[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user.role !== "DELEGATE")
      api<Page<User>>("/users?role=DELEGATE&pageSize=100")
        .then((d) => setDelegates(d.items.filter((u) => u.active)))
        .catch((e) => setError(errorText(e)));
  }, [user]);
  return (
    <Modal title="Crear equipo" close={close}>
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const t = await api<{ id: number }>("/teams", {
              method: "POST",
              body: JSON.stringify({
                categoryId: Number(category),
                ...(delegate ? { delegateId: Number(delegate) } : {}),
              }),
            });
            created(t.id);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorMessage message={error} />
        <p className="text-sm text-muted-foreground">
          Se permite un equipo por escuela y categoría. Los deportistas deben
          pertenecer a la escuela del delegado.
        </p>
        <label>
          Categoría
          <select
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Seleccionar categoría</option>
            {catalog.categories.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {user.role !== "DELEGATE" ? (
          <label>
            Delegado responsable
            <select
              required
              value={delegate}
              onChange={(e) => setDelegate(e.target.value)}
            >
              <option value="">Seleccionar delegado</option>
              {delegates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ·{" "}
                  {catalog.schools.find((s) => s.id === d.schoolId)?.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-lg bg-muted p-4 text-sm">
            Escuela:{" "}
            <strong>
              {catalog.schools.find((s) => s.id === user.schoolId)?.name}
            </strong>
          </div>
        )}
        <Button disabled={busy}>
          {busy ? "Creando…" : "Crear expediente"}
        </Button>
      </form>
    </Modal>
  );
}
function TeamDetail({
  user,
  catalog,
}: {
  user: User;
  catalog: Catalog | null;
}) {
  const { id } = useParams();
  const [documentChecks, setDocumentChecks] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{
    id: number;
    athlete: Athlete;
  } | null>(null);
  const [team, setTeam] = useState<Team | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("roster"),
    [add, setAdd] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState<"submit" | "reopen" | null>(null),
    [remove, setRemove] = useState<number | null>(null);
  const reload = useCallback(async () => {
    const t = await api<Team>(`/teams/${id}`);
    setTeam(t);
  }, [id]);
  useEffect(() => {
    setTeam(null);
    reload().catch((e) => setError(errorText(e)));
  }, [reload]);
  useEffect(() => { setDocumentChecks(Object.fromEntries(Object.entries(team?.reviews[0]?.checks || {}).filter(([key]) => key.startsWith("document_")))); }, [team?.id, team?.version]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (!team)
    return (
      <>
        <ErrorMessage message={error} />
        <Empty
          title={
            error ? "No se pudo abrir el expediente" : "Cargando expediente…"
          }
        />
        <Button asChild variant="outline">
          <Link to="/admin/teams">Volver a equipos</Link>
        </Button>
      </>
    );
  const editable = ["DRAFT", "OBSERVED"].includes(team.status);
  const windowOpen =
    (new Date() >= new Date(team.tournament.opensAt) &&
      new Date() <= new Date(team.tournament.closesAt)) ||
    (team.status === "OBSERVED" && team.tournament.correctionsEnabled);
  const staff = user.role !== "DELEGATE";
  const canEdit = editable && (staff || windowOpen);
  const canManageRoster = staff ? team.status !== "APPROVED" : canEdit;
  const rosterActionHint = team.status === "APPROVED"
    ? "Reabre el expediente aprobado para modificar la nómina."
    : "El expediente debe estar editable y dentro del periodo habilitado.";
  const getPdf = (kind: string, participationId?: number) =>
    run(() =>
      download(
        `/teams/${id}/formats/${kind}${participationId ? `?participationId=${participationId}` : ""}`,
        `UNDC-${team.id}-${kind}${participationId ? `-${participationId}` : ""}.pdf`,
      ),
    );
  return (
    <>
      <Link
        to="/admin/teams"
        className="mb-5 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft className="size-3" />
        Volver a equipos
      </Link>
      <PageTitle
        eyebrow={`EXPEDIENTE #${String(team.id).padStart(4, "0")}`}
        title={team.category.name}
        description={team.school.name}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Badge status={team.status} />
            {canEdit && (
              <Button disabled={busy} onClick={() => setConfirm("submit")}>
                <ClipboardCheck />
                Enviar a revisión
              </Button>
            )}
            {team.status === "APPROVED" && user.role !== "DELEGATE" && (
              <Button variant="outline" onClick={() => setConfirm("reopen")}>
                Reabrir expediente
              </Button>
            )}
          </div>
        }
      />
      <ErrorMessage message={error} />
      {team.status === "OBSERVED" && (
        <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            El expediente requiere subsanación
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">
            {team.reviews[0]?.notes || "La nómina cambió. Adjunte los documentos actualizados y reenvíe el expediente."}
          </p>
        </div>
      )}
      {editable && !windowOpen && !staff && (
        <div className="my-4 rounded-lg border bg-amber-50 p-4 text-sm">
          El periodo de inscripción está cerrado. La comisión puede habilitar
          subsanaciones para expedientes observados.
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="eyebrow">Delegado responsable</p>
          <p className="mt-2 text-sm font-semibold">{team.delegate.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            DNI {team.delegate.dni} · {team.delegate.phone}
          </p>
          {team.delegate.email && (
            <a
              href={`mailto:${team.delegate.email}`}
              className="mt-2 block break-all text-xs text-primary underline"
            >
              {team.delegate.email}
            </a>
          )}
          {team.receiptCode && (
            <p className="mt-2 break-all text-[10px] text-muted-foreground">
              Constancia pública: {team.receiptCode}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="eyebrow">Nómina registrada</p>
          <p className="mt-2 text-sm font-semibold">
            {team.participations.length} de{" "}
            {team.category.discipline === "CHESS"
              ? "10 deportistas · 5 damas y 5 varones"
              : "12 deportistas como máximo"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {team.receiptCode
              ? "Cupos registrados al enviar la inscripción"
              : "Reservan cupo desde el borrador"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="eyebrow">Última actualización</p>
          <p className="mt-2 text-sm font-semibold">{date(team.updatedAt)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Versión {team.version} · Zona horaria de Lima
          </p>
        </Card>
      </div>
      <div className="mb-5 flex gap-2 overflow-x-auto border-b">
        {[
          ["roster", "Deportistas"],
          ["documents", "Documentos y formatos"],
          ...(user.role !== "DELEGATE" ? [["review", "Revisión"]] : []),
          ["history", "Seguimiento"],
        ].map(([v, n]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${tab === v ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {tab === "roster" && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5">
            <h2 className="text-sm font-bold">Relación de deportistas</h2>
            {canEdit && (
              <Button size="sm" onClick={() => setAdd(true)} disabled={busy}>
                <Plus />
                Agregar deportista
              </Button>
            )}
          </div>
          {team.participations.length ? (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Apellidos y nombres</th>
                    <th>DNI / código</th>
                    <th>Sexo</th>
                    <th>Celular</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {team.participations.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">
                        {p.athlete.lastName}, {p.athlete.firstName}
                      </td>
                      <td>
                        <p>{p.athlete.dni}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.athlete.studentCode}
                        </p>
                      </td>
                      <td>{p.athlete.sex === "FEMALE" ? "Dama" : "Varón"}</td>
                      <td>{p.athlete.phone}</td>
                      <td>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={busy || !canManageRoster}
                              title={!canManageRoster ? rosterActionHint : "Editar deportista"}
                              onClick={() => setEditing(p)}
                            >
                              <Pencil />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-primary/30 text-primary hover:bg-blue-50"
                              disabled={busy || !canManageRoster}
                              title={!canManageRoster ? rosterActionHint : "Eliminar deportista del equipo"}
                              onClick={() => setRemove(p.id)}
                            >
                              <Trash2 />
                              Eliminar
                            </Button>
                          </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="La nómina está por completar">
              Agrega a los estudiantes que representarán a tu escuela.
            </Empty>
          )}
          <div className="border-t bg-muted/40 px-5 py-4 text-xs leading-relaxed text-muted-foreground">
            La identidad se contrasta por DNI y código universitario. Si hay
            discrepancias, solicita su revisión a la comisión antes de
            continuar.
            {staff && team.status === "SUBMITTED" && <p className="mt-2 text-primary">Editar o eliminar un deportista devolverá el expediente a observado. Los documentos afectados deberán firmarse y adjuntarse nuevamente.</p>}
            {team.status === "APPROVED" && <p className="mt-2 text-primary">Reabre el expediente para habilitar la edición o eliminación de deportistas.</p>}
          </div>
        </Card>
      )}
      {tab === "documents" && user.role !== "DELEGATE" && <ReviewDocuments team={team} values={documentChecks} busy={busy} onChange={(key, value) => setDocumentChecks(v => ({ ...v, [key]: value }))}/> }
      {tab === "documents" && (user.role === "DELEGATE" || canEdit) && (
        <div className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
            Descarga los formatos, imprímelos y recoge las firmas físicas. Luego
            adjunta cada documento firmado en PDF, JPG o PNG (máximo 10 MB). Al
            cambiar la nómina, vuelve a generar y firmar la ficha del equipo.
          </div>
          <DocumentBox
            title="Ficha oficial del equipo"
            description="Firmada por el delegado, con la nómina completa."
            kind="ROSTER"
            team={team}
            canEdit={canEdit}
            busy={busy}
            run={run}
            pdf={() => getPdf("roster")}
          />
          {team.participations.map((p) => (
            <Card key={p.id} className="p-5">
              <h2 className="mb-4 text-sm font-bold">
                {p.athlete.lastName}, {p.athlete.firstName}{" "}
                <span className="font-normal text-muted-foreground">
                  · DNI {p.athlete.dni}
                </span>
              </h2>
              <div className="space-y-3">
                {[
                  [
                    "FITNESS",
                    "Declaración jurada de aptitud física",
                    "fitness",
                  ],
                  [
                    "RESPONSIBILITY",
                    "Declaración jurada de responsabilidad",
                    "responsibility",
                  ],
                ].map(([kind, title, pdf]) => (
                  <DocumentBox
                    key={kind}
                    compact
                    title={title}
                    kind={kind}
                    participationId={p.id}
                    team={team}
                    canEdit={canEdit}
                    busy={busy}
                    run={run}
                    pdf={() => getPdf(pdf, p.id)}
                  />
                ))}
              </div>
            </Card>
          ))}
          <DownloadButton disabled={busy} onClick={() => getPdf("control")}>
            <ArrowDownToLine />
            Descargar hoja de control documentario
          </DownloadButton>
        </div>
      )}
      {tab === "review" && <ReviewPanel team={team} busy={busy} run={run} documentChecks={documentChecks} />}
      {tab === "history" && (
        <Card className="p-6">
          <h2 className="mb-6 text-base font-bold">Historial del expediente</h2>
          {team.audits.map((a) => (
            <div
              key={a.id}
              className="relative ml-2 border-l pb-7 pl-6 last:pb-0"
            >
              <span className="absolute -left-1 top-1 size-2 rounded-full bg-primary" />
              <p className="text-sm font-semibold">
                {actionLabels[a.action] || a.action}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.actor?.name || "Inscripción pública"} · {date(a.createdAt)}
              </p>
              {typeof (a.details.notes || a.details.reason) === "string" && (
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {String(a.details.notes || a.details.reason)}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}
      {editing && (
        <AthleteForm
          initial={editing.athlete}
          close={() => setEditing(null)}
          save={async (data) => {
            await api(`/teams/${id}/athletes/${editing.id}`, {
              method: "PUT",
              body: JSON.stringify(data),
            });
            await reload();
            setEditing(null);
          }}
        />
      )}
      {add && (
        <AthleteForm
          close={() => setAdd(false)}
          save={async (data) => {
            await api(`/teams/${id}/athletes`, {
              method: "POST",
              body: JSON.stringify(data),
            });
            await reload();
            setAdd(false);
          }}
        />
      )}
      {confirm && (
        <Modal
          title={
            confirm === "submit"
              ? "Enviar expediente a revisión"
              : "Reabrir expediente aprobado"
          }
          close={() => !busy && setConfirm(null)}
        >
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              {confirm === "submit"
                ? "Se validará la nómina y la presencia de todos los documentos firmados. El expediente quedará bloqueado hasta que la comisión registre su revisión."
                : "El expediente volverá al estado observado. Registra el motivo; quedará visible en el seguimiento."}
            </p>
            {confirm === "reopen" && (
              <label>
                Motivo
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                />
              </label>
            )}
            <Button
              disabled={
                busy || (confirm === "reopen" && reason.trim().length < 5)
              }
              onClick={() =>
                run(async () => {
                  await api(
                    `/teams/${id}/${confirm === "submit" ? "submit" : "reopen"}`,
                    { method: "POST", body: JSON.stringify({ reason }) },
                  );
                  setConfirm(null);
                })
              }
            >
              {busy ? "Procesando…" : "Confirmar"}
            </Button>
            <ErrorMessage message={error} />
          </div>
        </Modal>
      )}
      {remove && (
        <Modal title="Eliminar deportista del equipo" close={() => !busy && setRemove(null)}>
          <ErrorMessage message={error} />
          <p className="mb-3 mt-3 text-sm font-semibold">
            {team.participations.find(p => p.id === remove)?.athlete.lastName}, {team.participations.find(p => p.id === remove)?.athlete.firstName}
          </p>
          <p className="mb-5 text-sm text-muted-foreground">
            Se liberará su cupo en esta disciplina y se retirarán sus documentos
            y su seguimiento de este equipo de forma definitiva. Si no tiene
            otras participaciones, también se eliminará su ficha personal. La
            ficha firmada de la nómina quedará invalidada y deberá adjuntarse nuevamente.
          </p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api(`/teams/${id}/athletes/${remove}`, {
                  method: "DELETE",
                });
                setRemove(null);
              })
            }
          >
            Confirmar eliminación
          </Button>
        </Modal>
      )}
    </>
  );
}
const athleteFormSchema = z.object({
  firstName: z.string().trim().min(2, "Ingrese los nombres."),
  lastName: z.string().trim().min(2, "Ingrese los apellidos."),
  dni: z.string().regex(/^\d{8}$/, "DNI de ocho dígitos."),
  studentCode: z.string().min(2, "Ingrese el código universitario."),
  phone: z.string().regex(/^\+?[\d ]{7,20}$/, "Celular no válido."),
  sex: z.enum(["FEMALE", "MALE"]),
});
function AthleteForm({
  close,
  save,
  initial,
}: {
  initial?: Athlete;
  close: () => void;
  save: (data: z.infer<typeof athleteFormSchema>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof athleteFormSchema>>({
    resolver: zodResolver(athleteFormSchema),
    defaultValues: initial || { sex: "FEMALE" },
  });
  return (
    <Modal
      title={
        initial ? "Corregir identidad del deportista" : "Agregar deportista"
      }
      close={close}
    >
      <form
        className="space-y-5"
        onSubmit={handleSubmit(async (data) => {
          setError("");
          try {
            await save(data);
          } catch (e) {
            setError(errorText(e));
          }
        })}
      >
        <ErrorMessage message={error} />
        <div className="form-grid">
          {(
            [
              ["firstName", "Nombres"],
              ["lastName", "Apellidos"],
              ["dni", "DNI"],
              ["studentCode", "Código universitario"],
              ["phone", "Celular"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <Input
                {...register(key)}
                maxLength={key === "dni" ? 8 : key === "phone" ? 20 : 150}
              />
              {errors[key] && (
                <small className="text-red-700">{errors[key]?.message}</small>
              )}
            </label>
          ))}
          <label>
            Sexo
            <select {...register("sex")}>
              <option value="FEMALE">Dama</option>
              <option value="MALE">Varón</option>
            </select>
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          El estudiante representa a la escuela del equipo. Corregir su
          identidad invalida las fichas y declaraciones de sus equipos: deberán
          volver a firmarse y adjuntarse. Los expedientes aprobados deben
          reabrirse primero; los que estén en revisión pasarán a observado al guardar.
        </p>
        <Button disabled={isSubmitting}>
          {isSubmitting
            ? "Validando…"
            : initial
              ? "Guardar corrección"
              : "Agregar a la nómina"}
        </Button>
      </form>
    </Modal>
  );
}
function DocumentBox({
  title,
  description,
  kind,
  participationId,
  team,
  canEdit,
  busy,
  run,
  pdf,
  compact,
}: {
  title: string;
  description?: string;
  kind: string;
  participationId?: number;
  team: Team;
  canEdit: boolean;
  busy: boolean;
  run: (f: () => Promise<unknown>) => Promise<void>;
  pdf: () => Promise<void>;
  compact?: boolean;
}) {
  const d = team.documents.find(
    (d) =>
      d.kind === kind && (d.participationId || undefined) === participationId,
  );
  const content = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        <p className={`mt-2 text-xs ${d ? "text-blue-700" : "text-amber-700"}`}>
          {d
            ? `Adjunto: ${d.originalName}`
            : "Pendiente de adjuntar documento firmado"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <DownloadButton disabled={busy} onClick={pdf}>
          <ArrowDownToLine />
          Formato
        </DownloadButton>
        {d && (
          <DownloadButton
            disabled={busy}
            onClick={() =>
              run(() => download(`/documents/${d.id}`, d.originalName))
            }
          >
            <ArrowDownToLine />
            Ver adjunto
          </DownloadButton>
        )}
        {canEdit && (
          <label
            className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-white ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            <Upload className="size-3.5" />
            {d ? "Reemplazar" : "Adjuntar"}
            <input
              aria-label={`Adjuntar ${title}`}
              className="sr-only"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = "";
                void run(async () => {
                  if (file.size > 10 * 1024 * 1024)
                    throw new Error("El archivo supera el máximo de 10 MB.");
                  const body = new FormData();
                  body.append("file", file);
                  body.append("kind", kind);
                  if (participationId)
                    body.append("participationId", String(participationId));
                  await api(`/teams/${team.id}/documents`, {
                    method: "POST",
                    body,
                  });
                });
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
  return compact ? (
    <div className="rounded-lg border bg-muted/20 p-4">{content}</div>
  ) : (
    <Card className="p-5">{content}</Card>
  );
}
function ReviewPanel({
  team,
  busy,
  run,
  documentChecks,
}: {
  team: Team;
  documentChecks: Record<string, boolean>;
  busy: boolean;
  run: (f: () => Promise<unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, boolean>>({}),
    [notes, setNotes] = useState(""),
    [decision, setDecision] = useState<"OBSERVED" | "APPROVED" | null>(null);
  useEffect(() => {
    setValues({});
    setNotes("");
  }, [team.id, team.version]);
  const latest = team.reviews[0];
  const allDocumentsValidated = team.documents.length > 0 && team.documents.every(d => documentChecks['document_' + d.id]);
  const reviewChecks = { ...values, ...documentChecks };
  for (const [kind, key] of [['ROSTER', 'roster'], ['FITNESS', 'fitness'], ['RESPONSIBILITY', 'responsibility']]) {
    const docs = team.documents.filter(d => d.kind === kind);
    reviewChecks[key] = docs.length > 0 && docs.every(d => documentChecks['document_' + d.id]);
  }
  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold">Lista de control documentario</h2>
      <p className="mb-6 mt-2 text-sm leading-relaxed text-muted-foreground">
        Valida cada adjunto con su check en Documentos y formatos. Los checks se guardan al registrar la decisión. Confirma matrícula y
        escuela por los medios institucionales disponibles. Cada casilla
        representa una verificación de la comisión.
      </p>
      {team.status === "SUBMITTED" ? (
        <>
          <div className="space-y-4">
            {Object.entries(checks).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={reviewChecks[key] || false}
                  disabled={busy || ["roster", "fitness", "responsibility"].includes(key)}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [key]: e.target.checked }))
                  }
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          <label className="mt-6">
            Observaciones / resultado
            <textarea
              rows={4}
              className="mt-2"
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              disabled={busy || !allDocumentsValidated || !Object.keys(checks).every((k) => reviewChecks[k])}
              onClick={() => setDecision("APPROVED")}
            >
              <Check />
              Aprobar expediente
            </Button>
            <Button
              variant="outline"
              disabled={busy || !notes.trim()}
              onClick={() => setDecision("OBSERVED")}
            >
              Observar para subsanación
            </Button>
          </div>
          {decision && (
            <Modal
              title={
                decision === "APPROVED"
                  ? "Confirmar aprobación"
                  : "Confirmar observaciones"
              }
              close={() => setDecision(null)}
            >
              <p className="mb-5 text-sm">
                {decision === "APPROVED"
                  ? "Confirmas que realizaste todos los controles documentarios, incluida la verificación manual de matrícula y escuela."
                  : "El delegado podrá corregir el expediente dentro del periodo habilitado."}
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api(`/teams/${team.id}/reviews`, {
                      method: "POST",
                      body: JSON.stringify({
                        version: team.version,
                        result: decision,
                        notes,
                        checks: { ...documentChecks, ...Object.fromEntries(
                          Object.keys(checks).map((k) => [k, !!reviewChecks[k]]),
                        ) },
                      }),
                    });
                    setDecision(null);
                  })
                }
              >
                Registrar decisión
              </Button>
            </Modal>
          )}
        </>
      ) : (
        <div className="rounded-lg bg-muted p-5">
          <Badge status={team.status} />
          {latest ? (
            <>
              <p className="mt-3 text-sm">
                Revisado por {latest.reviewer.name} · {date(latest.createdAt)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {latest.notes || "Sin observaciones adicionales."}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              El expediente debe enviarse antes de iniciar su revisión.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
function UsersPage({ catalog, user }: { catalog: Catalog | null; user: User }) {
  const [data, setData] = useState<Page<User> | null>(null),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [error, setError] = useState(""),
    [reset, setReset] = useState<User | null>(null),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async () =>
      setData(await api<Page<User>>(`/users?page=${page}&pageSize=10`)),
    [page],
  );
  useEffect(() => {
    load().catch((e) => setError(errorText(e)));
  }, [load]);
  const mutate = async (u: User, input: object) => {
    setBusy(true);
    setError("");
    try {
      await api(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      await load();
      setReset(null);
      setPassword("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRACIÓN"
        title="Usuarios y accesos"
        description="Crea las cuentas y asigna la escuela de cada delegado."
        action={
          <Button onClick={() => setCreate(true)}>
            <Plus />
            Nuevo usuario
          </Button>
        }
      />
      <ErrorMessage message={error} />
      <Card className="overflow-hidden">
        {data ? (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol / escuela</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <p className="font-semibold">{u.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {u.email}
                        </p>
                      </td>
                      <td>
                        <p>
                          {u.role === "ADMIN"
                            ? "Administrador"
                            : u.role === "COMMISSION"
                              ? "Comisión"
                              : "Delegado"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {
                            catalog?.schools.find((s) => s.id === u.schoolId)
                              ?.name
                          }
                        </p>
                      </td>
                      <td>{u.active ? "Activo" : "Inactivo"}</td>
                      <td>
                        {u.id !== user.id && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => setReset(u)}
                            >
                              Restablecer clave
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => mutate(u, { active: !u.active })}
                            >
                              {u.active ? "Desactivar" : "Activar"}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={data.total} setPage={setPage} />
          </>
        ) : (
          <Empty title="Cargando usuarios…" />
        )}
      </Card>
      {create && (
        <UserForm
          catalog={catalog}
          close={() => setCreate(false)}
          saved={async () => {
            setCreate(false);
            await load();
          }}
        />
      )}{" "}
      {reset && (
        <Modal
          title={`Restablecer acceso de ${reset.name}`}
          close={() => setReset(null)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(reset, { password });
            }}
          >
            <p className="text-sm text-muted-foreground">
              Se cerrarán sus sesiones activas. Comunica la nueva contraseña por
              un canal privado.
            </p>
            <label>
              Nueva contraseña
              <Input
                required
                type="password"
                minLength={6}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <ErrorMessage message={error} />
            <Button disabled={busy}>Restablecer contraseña</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
const userFormSchema = z
  .object({
    name: z.string().min(2),
    email: z.email(),
    dni: z.string().regex(/^\d{8}$/),
    phone: z.string().regex(/^\+?[\d ]{7,20}$/),
    password: z.string().min(6),
    role: z.enum(["ADMIN", "COMMISSION", "DELEGATE"]),
    schoolId: z.string(),
  })
  .refine((u) => u.role !== "DELEGATE" || !!u.schoolId, {
    message: "Seleccione la escuela.",
    path: ["schoolId"],
  });
function UserForm({
  catalog,
  close,
  saved,
}: {
  catalog: Catalog | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof userFormSchema>>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { role: "DELEGATE", schoolId: "" },
  });
  return (
    <Modal title="Crear usuario" close={close}>
      <form
        className="space-y-5"
        onSubmit={handleSubmit(async (data) => {
          setError("");
          try {
            await api("/users", {
              method: "POST",
              body: JSON.stringify({
                ...data,
                schoolId:
                  data.role === "DELEGATE" ? Number(data.schoolId) : null,
              }),
            });
            await saved();
          } catch (e) {
            setError(errorText(e));
          }
        })}
      >
        <ErrorMessage message={error} />
        <div className="form-grid">
          {(
            [
              ["name", "Nombre completo", "text"],
              ["email", "Correo electrónico", "email"],
              ["dni", "DNI", "text"],
              ["phone", "Celular", "tel"],
              ["password", "Contraseña inicial (6 caracteres)", "password"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key}>
              {label}
              <Input
                type={type}
                autoComplete={type === "password" ? "new-password" : "off"}
                {...register(key)}
              />
              {errors[key] && (
                <small className="text-red-700">{errors[key]?.message}</small>
              )}
            </label>
          ))}
          <label>
            Rol
            <select {...register("role")}>
              <option value="DELEGATE">Delegado</option>
              <option value="COMMISSION">Comisión</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          {watch("role") === "DELEGATE" && (
            <label>
              Escuela profesional
              <select {...register("schoolId")}>
                <option value="">Seleccionar escuela</option>
                {catalog?.schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {errors.schoolId && (
                <small className="text-red-700">
                  {errors.schoolId.message}
                </small>
              )}
            </label>
          )}
        </div>
        <Button disabled={isSubmitting}>
          {isSubmitting ? "Creando…" : "Crear cuenta"}
        </Button>
      </form>
    </Modal>
  );
}
function Settings({
  catalog,
  reload,
}: {
  catalog: Catalog | null;
  reload: () => Promise<void>;
}) {
  const [links, setLinks] = useState({
    basesUrl: "",
    formatsUrl: "",
    otherDocumentsUrl: "",
  });
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false),
    [opens, setOpens] = useState(""),
    [closes, setCloses] = useState(""),
    [corrections, setCorrections] = useState(false);
  useEffect(() => {
    if (catalog?.tournament) {
      const t = catalog.tournament;
      const local = (s: string) =>
        new Date(new Date(s).getTime() - 5 * 3600000)
          .toISOString()
          .slice(0, 16);
      setOpens(local(t.opensAt));
      setCloses(local(t.closesAt));
      setCorrections(t.correctionsEnabled);
      setLinks({
        basesUrl: t.basesUrl || "",
        formatsUrl: t.formatsUrl || "",
        otherDocumentsUrl: t.otherDocumentsUrl || "",
      });
    }
  }, [catalog]);
  const t = catalog?.tournament;
  return (
    <>
      <PageTitle
        eyebrow="COMISIÓN ORGANIZADORA"
        title="Configuración del torneo"
        description="Controla el periodo de inscripción y las subsanaciones."
      />
      <Card className="max-w-2xl p-6">
        {t ? (
          <form
            className="space-y-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setSuccess(false);
              try {
                await api(`/tournaments/${t.id}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    opensAt: new Date(`${opens}:00-05:00`).toISOString(),
                    closesAt: new Date(`${closes}:00-05:00`).toISOString(),
                    correctionsEnabled: corrections,
                    ...links,
                  }),
                });
                await reload();
                setSuccess(true);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="font-bold">{t.name}</h2>
            <p className="text-sm text-muted-foreground">
              Las fechas se ingresan en hora de Lima (UTC-5). Las fechas
              iniciales son propuestas operativas y deben ser confirmadas por la
              comisión.
            </p>
            <div className="form-grid">
              <label>
                Apertura
                <Input
                  type="datetime-local"
                  value={opens}
                  required
                  onChange={(e) => setOpens(e.target.value)}
                />
              </label>
              <label>
                Cierre
                <Input
                  type="datetime-local"
                  value={closes}
                  required
                  onChange={(e) => setCloses(e.target.value)}
                />
              </label>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-4">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={corrections}
                onChange={(e) => setCorrections(e.target.checked)}
              />
              <span>
                Habilitar subsanaciones fuera del periodo
                <p className="mt-2 text-xs font-normal leading-relaxed text-muted-foreground">
                  Permite editar y reenviar únicamente expedientes observados,
                  aunque el periodo haya cerrado.
                </p>
              </span>
            </label>
            <div className="border-t pt-6">
              <h3 className="text-sm font-semibold">
                Enlaces de documentos (Drive u otro sitio)
              </h3>
              <p className="mb-4 mt-2 text-xs leading-6 text-muted-foreground">
                Pega enlaces públicos de solo lectura. Si dejas bases o formatos
                vacíos, se usarán los PDF incluidos. Otros documentos se
                mostrará únicamente cuando tenga un enlace.
              </p>
              <div className="space-y-4">
                {(
                  [
                    ["basesUrl", "Enlace de las bases"],
                    ["formatsUrl", "Enlace de formatos y declaraciones"],
                    [
                      "otherDocumentsUrl",
                      "Enlace de otros documentos (opcional)",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} htmlFor={key}>
                    {label}
                    <Input
                      id={key}
                      type="url"
                      placeholder="https://drive.google.com/..."
                      maxLength={2048}
                      value={links[key]}
                      onChange={(e) =>
                        setLinks((v) => ({ ...v, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
            <ErrorMessage message={error} />
            {success && (
              <p role="status" className="text-sm text-blue-700">
                Configuración guardada.
              </p>
            )}
            <Button disabled={busy}>
              {busy ? "Guardando…" : "Guardar configuración"}
            </Button>
          </form>
        ) : (
          <Empty title="No hay un torneo configurado">
            Ejecute la carga inicial de catálogos.
          </Empty>
        )}
      </Card>
    </>
  );
}
function PasswordPage({ onChanged }: { onChanged: () => void }) {
  const [currentPassword, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        eyebrow="MI CUENTA"
        title="Cambiar contraseña"
        description="Al actualizarla se cerrarán todas tus sesiones. Deberás ingresar nuevamente."
      />
      <Card className="max-w-lg p-6">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (password !== confirmation) {
              setError("Las contraseñas no coinciden.");
              return;
            }
            setBusy(true);
            try {
              await api("/sessions/password", {
                method: "PUT",
                body: JSON.stringify({ currentPassword, password }),
              });
              onChanged();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <ErrorMessage message={error} />
          <label>
            Contraseña actual
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Nueva contraseña (mínimo 6 caracteres)
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Confirmar contraseña
            <Input
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <Button disabled={busy}>Actualizar contraseña</Button>
        </form>
      </Card>
    </>
  );
}

export default AdminApp;
