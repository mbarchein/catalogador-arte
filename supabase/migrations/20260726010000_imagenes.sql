-- ============================================================
-- Tabla "Imágenes" (esquema v11, tabla 2) y su almacenamiento.
--
-- Implementa RF-401 a RF-404, RF-409 a RF-412, RF-210 e INC-14/INC-15.
--
-- ADR-002 fija tres niveles por toma. Aquí son tres rutas en la misma fila, no
-- tres filas: son derivaciones del mismo `id_imagen`, y separarlas en filas
-- distintas obligaría a reagruparlas en cada consulta y permitiría que una toma
-- perdiera su miniatura sin que nada avisara.
-- ============================================================

create type valor_tipo_toma as enum (
  'GENERAL', 'DETALLE_FIRMA', 'REVERSO', 'DETALLE_DANO', 'MARCO', 'OTRO'
);

create table public.imagenes (
  -- DP-02: el identificador se compone del de la obra más un ordinal, siguiendo
  -- el mismo criterio que ADR-003. Lo asigna un trigger.
  id_imagen text primary key,

  id_catalogacion text not null
    references public.obras (id_catalogacion) on update cascade,

  -- Rutas dentro del bucket. Se guardan las tres porque la aplicación sirve la
  -- derivada, el índice usa la miniatura y el máster solo se descarga bajo
  -- demanda (RF-411). El máster puede faltar si un día se migra a otro
  -- proveedor y se limpia de aquí; la derivada, no.
  ruta_miniatura text not null,
  ruta_derivada text not null,
  ruta_master text,

  tipo_toma valor_tipo_toma not null default 'GENERAL',
  fecha_fotografia date,
  autor_fotografia text not null default '',

  -- RF-402: como máximo una imagen activa por obra puede ser la del índice.
  imagen_indice boolean not null default false,

  -- Tamaños en bytes, para poder vigilar el crecimiento en disco (RNF-108) sin
  -- tener que recorrer el bucket.
  bytes_master integer,

  creado_en timestamptz not null default now(),
  creado_por uuid references public.perfiles (id),

  -- Papelera propia: una imagen mal tomada se retira sin tocar la obra (RF-904).
  activo boolean not null default true,
  fecha_baja timestamptz,
  dado_de_baja_por uuid references public.perfiles (id),

  constraint imagenes_id_formato check (id_imagen ~ '^(AR|RC)-[0-9]{4}_v[0-9]+$')
);

comment on table public.imagenes is
  'Documentación fotográfica técnica actual de cada obra. Tres niveles por toma (ADR-002).';

create index imagenes_por_obra_idx on public.imagenes (id_catalogacion, activo);

-- RF-402 / INC-15: una sola imagen de índice por obra, garantizado por la base.
-- Un índice único parcial es mejor que un trigger: no hay ventana de carrera y no
-- depende de que nadie escriba por otro camino.
create unique index imagenes_una_sola_indice_idx
  on public.imagenes (id_catalogacion)
  where imagen_indice and activo;

-- ── Identificador de la imagen (DP-02) ──────────────────────

create function public.tg_asignar_id_imagen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_siguiente integer;
begin
  if new.id_imagen is not null and new.id_imagen <> '' then
    return new;
  end if;

  -- Mismo criterio que ADR-003: se serializa por obra y se cuentan también las
  -- imágenes dadas de baja, para que un `_v3` retirado no vuelva a usarse y las
  -- referencias en notas o correos sigan señalando a lo mismo.
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
    -- Una imagen retirada no puede seguir representando a la obra en el índice.
    -- Sin esto, el índice visual mostraría una foto que ya nadie ve en la ficha.
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
     -- No se escribe si el valor ya es el correcto: así el recálculo no dispara
     -- el trigger de trazabilidad y no ensucia `fecha_actualizacion` de la obra
     -- cada vez que alguien toca una foto.
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

-- Sin política de DELETE, igual que en obras: retirar una imagen es marcarla
-- inactiva. El fichero del bucket se conserva, porque un máster borrado no se
-- recupera y la fotografía puede ser la única prueba de que la obra existió.

-- ── Almacenamiento ──────────────────────────────────────────

-- Bucket privado: RF-110 y RNF-111 exigen que ningún fichero sea legible por URL
-- pública. El acceso se concede con URL firmada de caducidad corta.
insert into storage.buckets (id, name, public, file_size_limit)
values ('obras', 'obras', false, 62914560)
on conflict (id) do update set public = false;

-- Las políticas de storage.objects se escriben igual que las de cualquier tabla:
-- el bucket es privado, así que sin política no se lee ni se escribe nada.
create policy imagenes_leer_ficheros on storage.objects
  for select using (bucket_id = 'obras' and public.puede_leer());

create policy imagenes_subir_ficheros on storage.objects
  for insert with check (bucket_id = 'obras' and public.puede_editar());

create policy imagenes_actualizar_ficheros on storage.objects
  for update using (bucket_id = 'obras' and public.puede_editar());

-- ── Permisos ────────────────────────────────────────────────
-- RF-113: revocar y conceder uno a uno. La plataforma habría concedido esta tabla
-- nueva entera a anon y authenticated por privilegios por omisión.

revoke all on public.imagenes from anon, authenticated;
grant select, insert, update on public.imagenes to authenticated;
grant execute on function public.recalcular_fotografiada(text) to authenticated;
