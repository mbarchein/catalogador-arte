-- ============================================================
-- Initial schema: basic artwork capture
--
-- Deliberately partial scope. It covers the Artworks table with the fields that are
-- filled in with the artwork in front (phase 1) plus traceability and wastebasket. Outside
-- this migration, for now: Images, Series, Exhibitions, Bibliography,
-- Owners/Institutions and Archive/Documentation.
--
-- Requirements it implements: RF-202 to RF-211, RF-109 to RF-112, RF-204,
-- RF-801 to RF-803, RF-901, RF-609.
-- ============================================================

-- ── Tipos ───────────────────────────────────────────────────

create type rol_usuario as enum ('SUPERUSUARIO', 'CATALOGADOR', 'LECTOR');

-- RF-202: the fund determines the identifier's prefix.
create type fondo_artista as enum ('ROTILI', 'RUIZ_CAMPINS');

-- RF-205: «Sin revisar» is not «No». It is the initial value of every selection
-- field, and it means «we have not looked at it yet».
create type tri_estado as enum ('SI', 'NO', 'SIN_REVISAR');

-- RF-209 and schema v11: four values, to cover the artwork with no title and with no
-- convenience name decided yet.
create type valor_titulo_atribuido as enum ('NO_APLICA', 'NO', 'SI', 'SIN_REVISAR');

create type valor_estado_conservacion as enum (
  'BUENO', 'REGULAR', 'REQUIERE_RESTAURACION', 'REQUIERE_RESTAURACION_URGENTE', 'SIN_REVISAR'
);

create type valor_estado_existencia as enum (
  'CONSERVADA', 'DESTRUIDA', 'PERDIDA', 'DESCONOCIDO', 'SIN_REVISAR'
);

-- ── Perfiles ────────────────────────────────────────────────

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nombre text not null default '',
  -- The default role is the least privileged one. A freshly created account cannot
  -- write until the superuser promotes it explicitly: if
  -- registration were ever opened by mistake, the damage would be nil.
  rol rol_usuario not null default 'LECTOR',
  creado_en timestamptz not null default now()
);

comment on table public.perfiles is
  'Espejo de auth.users con el rol de cada usuario. RF-109.';

-- Creates the profile when the account is registered in auth.users.
create function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger nuevo_usuario
  after insert on auth.users
  for each row execute function public.tg_nuevo_usuario();

-- ── Obras ───────────────────────────────────────────────────

create table public.obras (
  -- RF-202. Assigned by the asignar_id_catalogacion trigger if not given.
  id_catalogacion text primary key,

  -- RF-203: compulsory and with no «Sin revisar». On it depends the prefix.
  artista fondo_artista not null,

  -- Identification
  -- RF-209: empty means an artwork with no title. The interface shows «[Sin título]»
  -- in brackets, but that text is never stored as a datum.
  titulo text not null default '',
  titulo_atribuido valor_titulo_atribuido not null default 'SIN_REVISAR',
  tipo_obra text not null default '',
  -- RF-207: texto libre, admite «1978», «1975-1978», «c. 1980», «c. 1975-1978».
  fecha_ejecucion text not null default '',
  -- RF-207: auxiliary, not published. It exists only to make sorting and filtering possible.
  fecha_orden integer,
  tecnica text not null default '',
  soporte text not null default '',
  -- RF-208: numbers with no units, in separate fields.
  alto_cm numeric(8, 2),
  ancho_cm numeric(8, 2),
  profundidad_cm numeric(8, 2),
  firmada tri_estado not null default 'SIN_REVISAR',
  firma_descripcion text not null default '',
  fechada_en_obra tri_estado not null default 'SIN_REVISAR',

  -- Conservación y localización
  estado_conservacion valor_estado_conservacion not null default 'SIN_REVISAR',
  ubicacion_fisica text not null default '',
  estado_existencia valor_estado_existencia not null default 'SIN_REVISAR',

  -- State of the process
  -- RF-211: manual, not derived from the state of other fields.
  medidas_verificadas boolean not null default false,
  fase_inventario_completada boolean not null default false,
  fase_documentacion_completada boolean not null default false,
  ficha_catalografica_completa boolean not null default false,
  notas_proceso_inventario text not null default '',

  -- Trazabilidad (RF-801 a RF-803)
  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles (id),
  fecha_actualizacion timestamptz not null default now(),
  fecha_actualizacion_basica timestamptz,
  actualizado_por uuid references public.perfiles (id),

  -- Wastebasket (RF-901): logical deletion, the row is never deleted.
  activo boolean not null default true,
  fecha_baja timestamptz,
  dado_de_baja_por uuid references public.perfiles (id),
  fecha_restauracion timestamptz,
  restaurado_por uuid references public.perfiles (id),

  -- RF-202: the identifier's format.
  constraint obras_id_formato
    check (id_catalogacion ~ '^(AR|RC)-[0-9]{4}$'),

  -- The prefix and the fund cannot contradict each other. Without this, an AR-0001
  -- attributed to Ruiz Campins would be a valid row and a physical label
  -- lying about the artwork it is stuck to.
  constraint obras_prefijo_coincide_con_artista check (
    (artista = 'ROTILI' and id_catalogacion like 'AR-%')
    or (artista = 'RUIZ_CAMPINS' and id_catalogacion like 'RC-%')
  ),

  -- RF-208: a negative measurement is a typing error, not a datum.
  constraint obras_medidas_positivas check (
    coalesce(alto_cm, 1) > 0
    and coalesce(ancho_cm, 1) > 0
    and coalesce(profundidad_cm, 1) > 0
  )
);

comment on table public.obras is
  'Tabla principal del catálogo. Una fila por pieza catalogada. Esquema v11, tabla 1.';

-- RF-609: the indexes and the searches exclude the withdrawn records, so that
-- is the access that has to be made fast.
create index obras_activas_idx on public.obras (activo, artista, fecha_orden);
create index obras_orden_idx on public.obras (fecha_orden) where activo;

-- ── Identifier assignment (DP-01) ───────────────────────────

-- Query function: it lets the interface show «se guardará como AR-0248»
-- before saving. It does not reserve the number.
create function public.siguiente_id_catalogacion(p_artista fondo_artista)
returns text language sql stable security definer set search_path = public as $$
  select
    case p_artista when 'ROTILI' then 'AR' else 'RC' end
    || '-'
    || lpad((
      coalesce(max(substring(id_catalogacion from 4)::integer), 0) + 1
    )::text, 4, '0')
  from public.obras
  where id_catalogacion like
    (case p_artista when 'ROTILI' then 'AR' else 'RC' end) || '-%';
$$;

comment on function public.siguiente_id_catalogacion is
  'Previsualiza el siguiente identificador libre del fondo. No lo reserva.';

create function public.tg_asignar_id_catalogacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefijo text := case new.artista when 'ROTILI' then 'AR' else 'RC' end;
begin
  -- It respects an explicitly given identifier: it allows recovering the
  -- numbering of an earlier inventory or correcting a load.
  if new.id_catalogacion is not null and new.id_catalogacion <> '' then
    return new;
  end if;

  -- It serialises the assignment per fund. Without this lock, two cataloguers
  -- creating records at once would get the same number: exactly the
  -- duplicate the schema anticipates as foreseeable. The lock is released on
  -- closing the transaction, which is the same one that runs the insert.
  perform pg_advisory_xact_lock(hashtext('id_catalogacion:' || v_prefijo));

  -- It also counts the withdrawn records: a withdrawn identifier is never
  -- recycled automatically (RF-908). Reusing it is a deliberate act
  -- that goes through restoring the record from the wastebasket.
  new.id_catalogacion := public.siguiente_id_catalogacion(new.artista);
  return new;
end $$;

create trigger asignar_id_catalogacion
  before insert on public.obras
  for each row execute function public.tg_asignar_id_catalogacion();

-- ── Inmutabilidad de la clave primaria (RF-204) ─────────────

create function public.tg_id_catalogacion_inmutable()
returns trigger language plpgsql as $$
begin
  if new.id_catalogacion is distinct from old.id_catalogacion then
    raise exception
      'id_catalogacion no es editable (RF-204): % → %',
      old.id_catalogacion, new.id_catalogacion
      using hint = 'Es la etiqueta física pegada en la obra y el eje de las tablas relacionadas.';
  end if;
  -- El fondo tampoco: cambiarlo dejaría el prefijo mintiendo.
  if new.artista is distinct from old.artista then
    raise exception 'artista no es editable: determina el prefijo de %', old.id_catalogacion;
  end if;
  return new;
end $$;

create trigger id_catalogacion_inmutable
  before update on public.obras
  for each row execute function public.tg_id_catalogacion_inmutable();

-- ── Trazabilidad (RF-801 a RF-803) ──────────────────────────

create function public.tg_trazabilidad_obra()
returns trigger language plpgsql as $$
begin
  new.fecha_actualizacion := now();
  new.actualizado_por := auth.uid();

  -- RF-802: fecha_actualizacion_basica solo se mueve cuando cambia un campo de
  -- fase 1, es decir, de los que exigen tener la obra delante. Sirve para saber
  -- cuándo se tocó físicamente la pieza por última vez, dato que se perdería si
  -- cualquier corrección de una nota bibliográfica lo actualizara.
  if (new.tipo_obra, new.tecnica, new.soporte, new.alto_cm, new.ancho_cm,
      new.profundidad_cm, new.firmada, new.firma_descripcion, new.fechada_en_obra,
      new.estado_conservacion, new.ubicacion_fisica)
     is distinct from
     (old.tipo_obra, old.tecnica, old.soporte, old.alto_cm, old.ancho_cm,
      old.profundidad_cm, old.firmada, old.firma_descripcion, old.fechada_en_obra,
      old.estado_conservacion, old.ubicacion_fisica)
  then
    new.fecha_actualizacion_basica := now();
  end if;

  -- Sella quién y cuándo en cada transición de la papelera, sin fiarse de que
  -- el cliente lo mande.
  if new.activo = false and old.activo = true then
    new.fecha_baja := now();
    new.dado_de_baja_por := auth.uid();
  elsif new.activo = true and old.activo = false then
    new.fecha_restauracion := now();
    new.restaurado_por := auth.uid();
  end if;

  return new;
end $$;

create trigger trazabilidad_obra
  before update on public.obras
  for each row execute function public.tg_trazabilidad_obra();

create function public.tg_autoria_obra()
returns trigger language plpgsql as $$
begin
  new.creado_por := auth.uid();
  new.actualizado_por := auth.uid();
  return new;
end $$;

create trigger autoria_obra
  before insert on public.obras
  for each row execute function public.tg_autoria_obra();

-- ── Rol: solo lo cambia el superusuario (RF-108) ────────────

create function public.tg_rol_solo_superusuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol is distinct from old.rol then
    -- Si no hay usuario autenticado, la petición no viene de una sesión de la
    -- aplicación: es acceso administrativo directo (editor SQL del panel, clave
    -- service_role, semilla de desarrollo). Ese camino ya tiene poder total por
    -- definición, de modo que bloquearlo no añadiría ninguna seguridad y sí
    -- impediría administrar el catálogo — incluido promover al primer
    -- superusuario, que por fuerza tiene que hacerse desde fuera de la app.
    if auth.uid() is null or current_user = 'service_role' then
      return new;
    end if;

    if not exists (
      select 1 from public.perfiles
      where id = auth.uid() and rol = 'SUPERUSUARIO'
    ) then
      raise exception 'Solo el superusuario puede cambiar el rol de un usuario (RF-108)';
    end if;
  end if;
  return new;
end $$;

create trigger rol_solo_superusuario
  before update on public.perfiles
  for each row execute function public.tg_rol_solo_superusuario();

-- ── Ayudantes de autorización ───────────────────────────────
--
-- SECURITY DEFINER a propósito: una política sobre perfiles que consultara
-- perfiles sin saltarse RLS entraría en recursión infinita.

create function public.mi_rol()
returns rol_usuario language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create function public.puede_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rol in ('CATALOGADOR', 'SUPERUSUARIO') from public.perfiles where id = auth.uid()),
    false
  );
$$;

create function public.puede_leer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid());
$$;

-- ── Políticas RLS ───────────────────────────────────────────
--
-- RF-111: no hay backend. Estas políticas son el único perímetro de seguridad
-- y la clave anónima viaja en el cliente. Una tabla sin política para una
-- operación está cerrada para esa operación, pero una tabla sin RLS activado
-- está completamente abierta: de ahí el test de cierre por omisión, que falla
-- si alguien crea una tabla y olvida esta parte.

alter table public.perfiles enable row level security;
alter table public.obras enable row level security;

-- La tabla de control de migraciones del stack local (_migraciones) no se
-- asegura aquí: solo existe en local, la crea docker/migrate.sh y es allí
-- donde se le activa RLS. En producción el control lo lleva la CLI de
-- Supabase en su propio esquema y esta tabla no existe.

-- perfiles: cualquier miembro del equipo ve la lista, porque la ficha muestra
-- «actualizado por» con nombre. Solo el propio usuario edita su perfil, y el
-- trigger de arriba impide que se toque el rol.
create policy perfiles_select on public.perfiles
  for select using (public.puede_leer());

create policy perfiles_update_propio on public.perfiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- obras: el Lector ve solo las activas; quien puede editar ve también la
-- papelera (RF-906).
create policy obras_select on public.obras
  for select using (
    (activo and public.puede_leer())
    or public.puede_editar()
  );

create policy obras_insert on public.obras
  for insert with check (public.puede_editar());

create policy obras_update on public.obras
  for update using (public.puede_editar()) with check (public.puede_editar());

-- Sin política de DELETE, a propósito y para todos los roles: RF-901 dice que
-- la eliminación nunca es un borrado real. Dar de baja es un UPDATE de `activo`.
-- Al no existir la política, ni un error de la interfaz ni una llamada directa
-- a la API pueden borrar una fila del catálogo.

-- ── Permisos de tabla ───────────────────────────────────────
-- RLS filtra filas, pero PostgREST necesita además el GRANT. Sin esto, las
-- políticas no llegan a evaluarse.

-- Partimos de cero y concedemos solo lo necesario. Esto NO es redundante, y
-- descubrirlo costó dos tests en rojo: la imagen de Supabase aplica
-- ALTER DEFAULT PRIVILEGES concediendo *todos* los privilegios de toda tabla
-- nueva a anon, authenticated y service_role. Es decir, por omisión el rol
-- anónimo puede leer cualquier tabla que se cree, y el autenticado puede además
-- borrarla fila a fila. Lo único que lo impide son las políticas RLS.
--
-- Revocando primero, una política mal escrita deja de bastar por sí sola para
-- exponer o destruir el catálogo: hacen falta dos errores en vez de uno. En un
-- proyecto cuyo perímetro entero son las políticas, esa segunda barrera es
-- justamente lo que compensa no tener servidor.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon;

-- Y para las tablas que aún no existen, de modo que la próxima migración no
-- reabra el agujero por omisión: quien cree una tabla tendrá que conceder los
-- privilegios a mano, que es cuando se piensa en cuáles hacen falta.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Ahora sí, lo mínimo que la aplicación necesita. Nótese la ausencia de DELETE:
-- nada se borra de verdad (RF-901), y sin el privilegio no hay forma de intentarlo.
grant usage on schema public to authenticated;
grant select, insert, update on public.obras to authenticated;
grant select, update on public.perfiles to authenticated;
grant execute on function public.siguiente_id_catalogacion(fondo_artista) to authenticated;
grant execute on function public.mi_rol() to authenticated;
