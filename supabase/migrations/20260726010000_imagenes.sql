-- ============================================================
-- "Images" table (schema v11, table 2) and its storage.
--
-- Implements RF-401 to RF-404, RF-409 to RF-412, RF-210 and INC-14/INC-15.
--
-- ADR-002 fixes three levels per shot. Here they are three paths in the same row, not
-- three rows: they are derivations of the same `id_imagen`, and separating them into different
-- rows would force regrouping them on every query and would allow a shot
-- to lose its thumbnail with nothing warning about it.
-- ============================================================

create type valor_tipo_toma as enum (
  'GENERAL', 'DETALLE_FIRMA', 'REVERSO', 'DETALLE_DANO', 'MARCO', 'OTRO'
);

create table public.imagenes (
  -- DP-02: the identifier is composed of the artwork's plus an ordinal, following
  -- the same criterion as ADR-003. A trigger assigns it.
  id_imagen text primary key,

  id_catalogacion text not null
    references public.obras (id_catalogacion) on update cascade,

  -- Paths inside the bucket. The three are stored because the application serves the
  -- derivative, the index uses the thumbnail and the master is only downloaded on
  -- demand (RF-411). The master may be missing if one day there is a migration to another
  -- provider and it is cleaned up from here; the derivative, no.
  ruta_miniatura text not null,
  ruta_derivada text not null,
  ruta_master text,

  tipo_toma valor_tipo_toma not null default 'GENERAL',
  fecha_fotografia date,
  autor_fotografia text not null default '',

  -- RF-402: at most one active image per artwork can be the index one.
  imagen_indice boolean not null default false,

  -- Sizes in bytes, so as to be able to watch the growth on disk (RNF-108) without
  -- having to walk the bucket.
  bytes_master integer,

  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles (id),

  -- Its own wastebasket: a badly taken image is withdrawn without touching the artwork (RF-904).
  activo boolean not null default true,
  fecha_baja timestamptz,
  dado_de_baja_por uuid references public.perfiles (id),

  constraint imagenes_id_formato check (id_imagen ~ '^(AR|RC)-[0-9]{4}_v[0-9]+$')
);

comment on table public.imagenes is
  'Documentación fotográfica técnica actual de cada obra. Tres niveles por toma (ADR-002).';

create index imagenes_por_obra_idx on public.imagenes (id_catalogacion, activo);

-- RF-402 / INC-15: a single index image per artwork, guaranteed by the base.
-- A partial unique index is better than a trigger: there is no race window and it does not
-- depend on nobody writing by another route.
create unique index imagenes_una_sola_indice_idx
  on public.imagenes (id_catalogacion)
  where imagen_indice and activo;

-- ── The image's identifier (DP-02) ──────────────────────────

create function public.tg_asignar_id_imagen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_siguiente integer;
begin
  if new.id_imagen is not null and new.id_imagen <> '' then
    return new;
  end if;

  -- Same criterion as ADR-003: it is serialised per artwork and the withdrawn
  -- images are counted too, so that a retired `_v3` is not used again and the
  -- references in notes or emails go on pointing at the same thing.
  perform pg_advisory_xact_lock(hashtext('id_imagen:' || new.id_catalogacion));

  select coalesce(max(substring(id_imagen from '_v([0-9]+)$')::integer), 0) + 1
    into v_siguiente
    from imagenes
   where id_catalogacion = new.id_catalogacion;

  new.id_imagen := new.id_catalogacion || '_v' || v_siguiente;
  return new;
end $$;

create trigger asignar_id_imagen
  before insert on public.imagenes
  for each row execute function public.tg_asignar_id_imagen();

create function public.tg_autoria_imagen()
returns trigger language plpgsql as $$
begin
  new.creado_por := auth.uid();
  return new;
end $$;

create trigger autoria_imagen
  before insert on public.imagenes
  for each row execute function public.tg_autoria_imagen();

create function public.tg_baja_imagen()
returns trigger language plpgsql as $$
begin
  if new.activo = false and old.activo = true then
    new.fecha_baja := now();
    new.dado_de_baja_por := auth.uid();
    -- A withdrawn image cannot go on representing the artwork in the index.
    -- Without this, the visual index would show a photo nobody sees in the record any more.
    new.imagen_indice := false;
  end if;
  return new;
end $$;

create trigger baja_imagen
  before update on public.imagenes
  for each row execute function public.tg_baja_imagen();

-- ── RF-210: `fotografiada` calculado ────────────────────────

alter table public.obras
  add column fotografiada boolean not null default false;

comment on column public.obras.fotografiada is
  'Calculado por trigger desde "imagenes". Solo cuentan las activas (INC-14).';

create function public.recalcular_fotografiada(p_id text)
returns void language sql security definer set search_path = public as $$
  update public.obras o
     set fotografiada = exists (
           select 1 from public.imagenes i
            where i.id_catalogacion = p_id and i.activo
         )
   where o.id_catalogacion = p_id
     -- It is not written if the value is already the correct one: this way the recalculation does not fire
     -- the traceability trigger and does not dirty the artwork's `fecha_actualizacion`
     -- every time somebody touches a photo.
     and o.fotografiada is distinct from exists (
           select 1 from public.imagenes i
            where i.id_catalogacion = p_id and i.activo
         );
$$;

create function public.tg_sincronizar_fotografiada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_fotografiada(old.id_catalogacion);
    return old;
  end if;
  perform public.recalcular_fotografiada(new.id_catalogacion);
  if tg_op = 'UPDATE' and new.id_catalogacion is distinct from old.id_catalogacion then
    perform public.recalcular_fotografiada(old.id_catalogacion);
  end if;
  return new;
end $$;

create trigger sincronizar_fotografiada
  after insert or update or delete on public.imagenes
  for each row execute function public.tg_sincronizar_fotografiada();

-- ── Políticas RLS ───────────────────────────────────────────

alter table public.imagenes enable row level security;

create policy imagenes_select on public.imagenes
  for select using (
    (activo and public.puede_leer())
    or public.puede_editar()
  );

create policy imagenes_insert on public.imagenes
  for insert with check (public.puede_editar());

create policy imagenes_update on public.imagenes
  for update using (public.puede_editar()) with check (public.puede_editar());

-- With no DELETE policy, the same as in obras: withdrawing an image is marking it
-- inactive. The bucket's file is kept, because a deleted master is not
-- recovered and the photograph may be the only proof that the artwork existed.

-- ── Almacenamiento ──────────────────────────────────────────

-- Private bucket: RF-110 and RNF-111 require that no file be readable by a public
-- URL. Access is granted with a short-lived signed URL.
insert into storage.buckets (id, name, public, file_size_limit)
values ('obras', 'obras', false, 62914560)
on conflict (id) do update set public = false;

-- The storage.objects policies are written like those of any table:
-- the bucket is private, so with no policy nothing is read and nothing is written.
create policy imagenes_leer_ficheros on storage.objects
  for select using (bucket_id = 'obras' and public.puede_leer());

create policy imagenes_subir_ficheros on storage.objects
  for insert with check (bucket_id = 'obras' and public.puede_editar());

create policy imagenes_actualizar_ficheros on storage.objects
  for update using (bucket_id = 'obras' and public.puede_editar());

-- ── Privileges ──────────────────────────────────────────────
-- RF-113: revoke and grant one by one. The platform would have granted this whole
-- new table to anon and authenticated through default privileges.

revoke all on public.imagenes from anon, authenticated;
grant select, insert, update on public.imagenes to authenticated;
grant execute on function public.recalcular_fotografiada(text) to authenticated;
