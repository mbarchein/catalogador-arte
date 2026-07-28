-- ============================================================
-- Rename the whole schema to English.
--
-- ⚠️  DEPLOYMENT WARNING — TWO-PHASE ROLLOUT REQUIRED.
-- The deploy pipeline applies migrations BEFORE publishing the frontend
-- (see the comment in .github/workflows/desplegar.yml): for a few seconds
-- the OLD frontend runs against the NEW schema. Renaming columns in use is
-- NOT an additive change, so during that window every read/write from the
-- old frontend will fail. Acceptable here only because the team is tiny and
-- the window is seconds long; for anything bigger, split into two deploys
-- (add new names, migrate readers, drop old names).
--
-- What this migration does NOT touch — data is data, not code:
--   * enum VALUES: renamed separately in 20260728110000 (except artist_fund,
--     whose values are surnames, and the AR/RC/TS label prefixes),
--   * catalog identifiers ('AR-0001'...) — they are physical labels,
--   * the storage bucket id 'obras' (a row in storage.buckets with objects
--     inside) and every already-uploaded file path.
-- ============================================================

-- ── Views first: dropped and recreated at the end ────────────
-- The view is recreated below with English column names; dropping it first
-- keeps the table/column renames free of dependents to reason about.
drop view public.imagen_representativa;

-- ── Types ────────────────────────────────────────────────────

alter type rol_usuario rename to user_role;
alter type fondo_artista rename to artist_fund;
alter type tri_estado rename to tri_state;
alter type valor_titulo_atribuido rename to attributed_title_value;
alter type valor_estado_conservacion rename to conservation_status_value;
alter type valor_estado_existencia rename to existence_status_value;
alter type valor_tipo_toma rename to shot_type_value;

-- ── Tables ───────────────────────────────────────────────────
-- public.perfiles becomes public.profiles, not public.users: `users` would be
-- one auth.users mirror away from ambiguity in every query, error message and
-- policy, and Supabase tooling already surfaces auth.users as "users".

alter table public.perfiles rename to profiles;
alter table public.obras rename to artworks;
alter table public.imagenes rename to images;

-- ── Columns: profiles ────────────────────────────────────────

alter table public.profiles rename column nombre to name;
alter table public.profiles rename column rol to role;
alter table public.profiles rename column creado_en to created_at;

-- ── Columns: artworks ────────────────────────────────────────

alter table public.artworks rename column id_catalogacion to catalog_id;
alter table public.artworks rename column artista to artist;
alter table public.artworks rename column titulo to title;
alter table public.artworks rename column titulo_atribuido to attributed_title;
alter table public.artworks rename column tipo_obra to artwork_type;
alter table public.artworks rename column fecha_ejecucion to execution_date;
alter table public.artworks rename column anio_inicio to start_year;
alter table public.artworks rename column anio_fin to end_year;
alter table public.artworks rename column fecha_aproximada to approximate_date;
alter table public.artworks rename column fecha_sin_confirmar to unconfirmed_date;
alter table public.artworks rename column fecha_nota to date_note;
alter table public.artworks rename column tecnica to technique;
alter table public.artworks rename column soporte to support;
alter table public.artworks rename column alto_cm to height_cm;
alter table public.artworks rename column ancho_cm to width_cm;
alter table public.artworks rename column profundidad_cm to depth_cm;
alter table public.artworks rename column firmada to signed;
alter table public.artworks rename column firma_descripcion to signature_description;
alter table public.artworks rename column fechada_en_obra to dated_on_artwork;
alter table public.artworks rename column estado_conservacion to conservation_status;
alter table public.artworks rename column ubicacion_fisica to physical_location;
alter table public.artworks rename column estado_existencia to existence_status;
alter table public.artworks rename column fotografiada to photographed;
alter table public.artworks rename column medidas_verificadas to measurements_verified;
alter table public.artworks rename column fase_inventario_completada to inventory_phase_completed;
alter table public.artworks rename column fase_documentacion_completada to documentation_phase_completed;
alter table public.artworks rename column ficha_catalografica_completa to catalog_record_complete;
alter table public.artworks rename column notas_proceso_inventario to inventory_process_notes;
alter table public.artworks rename column creado_en to created_at;
alter table public.artworks rename column creado_por to created_by;
alter table public.artworks rename column fecha_actualizacion to updated_at;
alter table public.artworks rename column fecha_actualizacion_basica to basic_updated_at;
alter table public.artworks rename column actualizado_por to updated_by;
alter table public.artworks rename column activo to active;
alter table public.artworks rename column fecha_baja to deactivated_at;
alter table public.artworks rename column dado_de_baja_por to deactivated_by;
alter table public.artworks rename column fecha_restauracion to restored_at;
alter table public.artworks rename column restaurado_por to restored_by;

-- ── Columns: images ──────────────────────────────────────────

alter table public.images rename column id_imagen to image_id;
alter table public.images rename column id_catalogacion to catalog_id;
alter table public.images rename column ruta_miniatura to thumbnail_path;
alter table public.images rename column ruta_derivada to derivative_path;
alter table public.images rename column ruta_master to master_path;
alter table public.images rename column tipo_toma to shot_type;
alter table public.images rename column fecha_fotografia to photo_date;
alter table public.images rename column autor_fotografia to photo_author;
alter table public.images rename column imagen_indice to index_image;
alter table public.images rename column bytes_master to master_bytes;
alter table public.images rename column creado_en to created_at;
alter table public.images rename column creado_por to created_by;
alter table public.images rename column activo to active;
alter table public.images rename column fecha_baja to deactivated_at;
alter table public.images rename column dado_de_baja_por to deactivated_by;

-- ── Constraints ──────────────────────────────────────────────

alter table public.profiles rename constraint perfiles_pkey to profiles_pkey;
alter table public.profiles rename constraint perfiles_email_key to profiles_email_key;
alter table public.profiles rename constraint perfiles_id_fkey to profiles_id_fkey;

alter table public.artworks rename constraint obras_pkey to artworks_pkey;
alter table public.artworks rename constraint obras_id_formato to artworks_id_format;
alter table public.artworks rename constraint obras_prefijo_coincide_con_artista to artworks_prefix_matches_artist;
alter table public.artworks rename constraint obras_medidas_positivas to artworks_positive_measurements;
alter table public.artworks rename constraint obras_anios_plausibles to artworks_plausible_years;
alter table public.artworks rename constraint obras_rango_coherente to artworks_coherent_range;
alter table public.artworks rename constraint obras_banderas_requieren_anio to artworks_flags_require_year;
alter table public.artworks rename constraint obras_creado_por_fkey to artworks_created_by_fkey;
alter table public.artworks rename constraint obras_actualizado_por_fkey to artworks_updated_by_fkey;
alter table public.artworks rename constraint obras_dado_de_baja_por_fkey to artworks_deactivated_by_fkey;
alter table public.artworks rename constraint obras_restaurado_por_fkey to artworks_restored_by_fkey;

alter table public.images rename constraint imagenes_pkey to images_pkey;
alter table public.images rename constraint imagenes_id_formato to images_id_format;
alter table public.images rename constraint imagenes_id_catalogacion_fkey to images_catalog_id_fkey;
alter table public.images rename constraint imagenes_creado_por_fkey to images_created_by_fkey;
alter table public.images rename constraint imagenes_dado_de_baja_por_fkey to images_deactivated_by_fkey;

-- ── Indexes ──────────────────────────────────────────────────

alter index public.obras_activas_idx rename to artworks_active_idx;
alter index public.obras_anio_idx rename to artworks_year_idx;
alter index public.imagenes_por_obra_idx rename to images_by_artwork_idx;
alter index public.imagenes_una_sola_indice_idx rename to images_single_index_idx;

-- ── Functions ────────────────────────────────────────────────
-- Renaming keeps grants and the triggers/policies that point at each function
-- (both reference it by oid). The bodies, however, are stored as text and still
-- mention the old table and column names, so every one is re-created with the
-- English body. Functions whose *parameter* name changes cannot be replaced
-- (CREATE OR REPLACE forbids it) and are dropped and re-created instead — the
-- parameter name is part of the PostgREST RPC contract, so it must change with
-- the client.

-- Authorization helpers. SECURITY DEFINER on purpose: a policy on profiles that
-- queried profiles without bypassing RLS would recurse forever.
alter function public.mi_rol() rename to my_role;
create or replace function public.my_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

alter function public.puede_editar() rename to can_edit;
create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('CATALOGADOR', 'SUPERUSUARIO') from public.profiles where id = auth.uid()),
    false
  );
$$;

alter function public.puede_leer() rename to can_read;
create or replace function public.can_read()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- Profile creation on signup. Reads both the new and the legacy metadata key:
-- accounts created before this rename carry 'nombre' in their user_metadata,
-- and metadata is data.
alter function public.tg_nuevo_usuario() rename to tg_new_user;
create or replace function public.tg_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'nombre', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Preview of the next free catalog id (DP-01). Parameter renamed → drop/create.
create function public.next_catalog_id(p_artist artist_fund)
returns text language sql stable security definer set search_path = public as $$
  select
    case p_artist
      when 'ROTILI' then 'AR'
      when 'RUIZ_CAMPINS' then 'RC'
      when 'TEST' then 'TS'
    end
    || '-'
    || lpad((
      coalesce(max(substring(catalog_id from 4)::integer), 0) + 1
    )::text, 4, '0')
  from public.artworks
  where catalog_id like
    (case p_artist
      when 'ROTILI' then 'AR'
      when 'RUIZ_CAMPINS' then 'RC'
      when 'TEST' then 'TS'
    end) || '-%';
$$;

comment on function public.next_catalog_id is
  'Previews the next free identifier of the fund. Does not reserve it.';

revoke all on function public.next_catalog_id(artist_fund) from public, anon;
grant execute on function public.next_catalog_id(artist_fund) to authenticated;

alter function public.tg_asignar_id_catalogacion() rename to tg_assign_catalog_id;
create or replace function public.tg_assign_catalog_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := case new.artist
    when 'ROTILI' then 'AR'
    when 'RUIZ_CAMPINS' then 'RC'
    when 'TEST' then 'TS'
  end;
begin
  -- Respect an explicitly provided identifier: it allows recovering the
  -- numbering of a previous inventory or fixing a bulk load.
  if new.catalog_id is not null and new.catalog_id <> '' then
    return new;
  end if;

  -- Serialize assignment per fund. Without this lock, two catalogers creating
  -- records at once would get the same number: exactly the duplicate the field
  -- schema anticipates. The lock is released when the transaction — the same
  -- one running the insert — ends.
  perform pg_advisory_xact_lock(hashtext('id_catalogacion:' || v_prefix));

  -- Deactivated records count too: a retired identifier is never recycled
  -- automatically (RF-908). Reusing it is a deliberate act that goes through
  -- restoring the record from the trash.
  new.catalog_id := public.next_catalog_id(new.artist);
  return new;
end $$;

drop function public.siguiente_id_catalogacion(artist_fund);

-- Primary key immutability (RF-204). The error messages stay in Spanish: they
-- surface in the interface, and Spanish is the users' language.
alter function public.tg_id_catalogacion_inmutable() rename to tg_catalog_id_immutable;
create or replace function public.tg_catalog_id_immutable()
returns trigger language plpgsql as $$
begin
  if new.catalog_id is distinct from old.catalog_id then
    raise exception
      'catalog_id no es editable (RF-204): % → %',
      old.catalog_id, new.catalog_id
      using hint = 'Es la etiqueta física pegada en la obra y el eje de las tablas relacionadas.';
  end if;
  -- The fund is immutable too: changing it would leave the prefix lying.
  if new.artist is distinct from old.artist then
    raise exception 'el fondo no es editable: determina el prefijo de %', old.catalog_id;
  end if;
  return new;
end $$;

-- Audit trail (RF-801 to RF-803).
alter function public.tg_trazabilidad_obra() rename to tg_artwork_audit_trail;
create or replace function public.tg_artwork_audit_trail()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  -- RF-802: basic_updated_at only moves when a phase-1 field changes, i.e. one
  -- that requires standing in front of the artwork. It records when the piece
  -- was last physically examined — a datum that would be lost if any fix to a
  -- bibliographic note refreshed it.
  if (new.artwork_type, new.technique, new.support, new.height_cm, new.width_cm,
      new.depth_cm, new.signed, new.signature_description, new.dated_on_artwork,
      new.conservation_status, new.physical_location)
     is distinct from
     (old.artwork_type, old.technique, old.support, old.height_cm, old.width_cm,
      old.depth_cm, old.signed, old.signature_description, old.dated_on_artwork,
      old.conservation_status, old.physical_location)
  then
    new.basic_updated_at := now();
  end if;

  -- Stamp who and when on every trash transition, without trusting the client
  -- to send it.
  if new.active = false and old.active = true then
    new.deactivated_at := now();
    new.deactivated_by := auth.uid();
  elsif new.active = true and old.active = false then
    new.restored_at := now();
    new.restored_by := auth.uid();
  end if;

  return new;
end $$;

alter function public.tg_autoria_obra() rename to tg_artwork_authorship;
create or replace function public.tg_artwork_authorship()
returns trigger language plpgsql as $$
begin
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Role changes: superuser only (RF-108).
alter function public.tg_rol_solo_superusuario() rename to tg_role_superuser_only;
create or replace function public.tg_role_superuser_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    -- With no authenticated user the request does not come from an application
    -- session: it is direct administrative access (SQL editor, service_role
    -- key, development seed). That path already has full power by definition,
    -- so blocking it would add no security and would prevent administering the
    -- catalog — including promoting the first superuser, which by necessity
    -- happens outside the app.
    if auth.uid() is null or current_user = 'service_role' then
      return new;
    end if;

    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'SUPERUSUARIO'
    ) then
      raise exception 'Solo el superusuario puede cambiar el rol de un usuario (RF-108)';
    end if;
  end if;
  return new;
end $$;

-- Image identifier (DP-02).
alter function public.tg_asignar_id_imagen() rename to tg_assign_image_id;
create or replace function public.tg_assign_image_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_next integer;
begin
  if new.image_id is not null and new.image_id <> '' then
    return new;
  end if;

  -- Same criterion as ADR-003: serialize per artwork and count deactivated
  -- images too, so a retired `_v3` is never reused and references in notes or
  -- emails keep pointing at the same shot.
  perform pg_advisory_xact_lock(hashtext('id_imagen:' || new.catalog_id));

  select coalesce(max(substring(image_id from '_v([0-9]+)$')::integer), 0) + 1
    into v_next
    from images
   where catalog_id = new.catalog_id;

  new.image_id := new.catalog_id || '_v' || v_next;
  return new;
end $$;

alter function public.tg_autoria_imagen() rename to tg_image_authorship;
create or replace function public.tg_image_authorship()
returns trigger language plpgsql as $$
begin
  new.created_by := auth.uid();
  return new;
end $$;

alter function public.tg_baja_imagen() rename to tg_image_deactivation;
create or replace function public.tg_image_deactivation()
returns trigger language plpgsql as $$
begin
  if new.active = false and old.active = true then
    new.deactivated_at := now();
    new.deactivated_by := auth.uid();
    -- A retired image cannot keep representing the artwork in the index.
    -- Without this, the visual index would show a photo no longer visible in
    -- the record.
    new.index_image := false;
  end if;
  return new;
end $$;

-- RF-210: computed `photographed`.
alter function public.recalcular_fotografiada(text) rename to recalculate_photographed;
create or replace function public.recalculate_photographed(p_id text)
returns void language sql security definer set search_path = public as $$
  update public.artworks a
     set photographed = exists (
           select 1 from public.images i
            where i.catalog_id = p_id and i.active
         )
   where a.catalog_id = p_id
     -- Skip the write when the value is already correct: the recalculation must
     -- not fire the audit-trail trigger nor dirty the artwork's `updated_at`
     -- every time someone touches a photo.
     and a.photographed is distinct from exists (
           select 1 from public.images i
            where i.catalog_id = p_id and i.active
         );
$$;

alter function public.tg_sincronizar_fotografiada() rename to tg_sync_photographed;
create or replace function public.tg_sync_photographed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_photographed(old.catalog_id);
    return old;
  end if;
  perform public.recalculate_photographed(new.catalog_id);
  if tg_op = 'UPDATE' and new.catalog_id is distinct from old.catalog_id then
    perform public.recalculate_photographed(old.catalog_id);
  end if;
  return new;
end $$;

-- RF-405: choose the main image among those already uploaded. Parameter renamed
-- → drop/create. No SECURITY DEFINER: RLS policies stay in force, so a reader
-- cannot write here; the explicit check exists only to return a readable error
-- (in Spanish — users see it) instead of a silent "nothing changed".
create function public.set_main_image(p_image_id text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_artwork text;
  v_active boolean;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para cambiar la imagen principal';
  end if;

  select catalog_id, active into v_artwork, v_active
    from public.images
   where image_id = p_image_id;

  if v_artwork is null then
    raise exception 'No existe la imagen %', p_image_id;
  end if;

  -- A deactivated image cannot represent the artwork: the visual index would
  -- show a photo that does not appear in the record.
  if not v_active then
    raise exception 'La imagen % está dada de baja y no puede ser la principal', p_image_id;
  end if;

  -- One single UPDATE: marks the chosen one and unmarks the rest at once. The
  -- unique index is checked at end of statement, not row by row, so there is
  -- no invalid intermediate state.
  update public.images
     set index_image = (image_id = p_image_id)
   where catalog_id = v_artwork
     and active
     and index_image is distinct from (image_id = p_image_id);

  return p_image_id;
end $$;

comment on function public.set_main_image is
  'Marks an image as representative of its artwork and unmarks the rest, in a single statement (RF-405).';

revoke all on function public.set_main_image(text) from public, anon;
grant execute on function public.set_main_image(text) to authenticated;

drop function public.marcar_imagen_principal(text);

-- ── Triggers ─────────────────────────────────────────────────

-- The `nuevo_usuario` trigger on auth.users keeps its Spanish name as legacy:
-- renaming a trigger requires OWNING the table, and in Supabase cloud
-- auth.users belongs to supabase_auth_admin while migrations run as postgres
-- (locally they run as a superuser, which is why this passed in dev). The
-- function it fires, public.tg_new_user(), IS renamed above — the trigger
-- follows it by oid.
alter trigger asignar_id_catalogacion on public.artworks rename to assign_catalog_id;
alter trigger id_catalogacion_inmutable on public.artworks rename to catalog_id_immutable;
alter trigger trazabilidad_obra on public.artworks rename to artwork_audit_trail;
alter trigger autoria_obra on public.artworks rename to artwork_authorship;
alter trigger rol_solo_superusuario on public.profiles rename to role_superuser_only;
alter trigger asignar_id_imagen on public.images rename to assign_image_id;
alter trigger autoria_imagen on public.images rename to image_authorship;
alter trigger baja_imagen on public.images rename to image_deactivation;
alter trigger sincronizar_fotografiada on public.images rename to sync_photographed;

-- ── RLS policies ─────────────────────────────────────────────
-- Renaming is enough: the USING/WITH CHECK expressions reference columns and
-- functions by oid, so they already point at the renamed objects.

alter policy perfiles_select on public.profiles rename to profiles_select;
alter policy perfiles_update_propio on public.profiles rename to profiles_update_own;
alter policy obras_select on public.artworks rename to artworks_select;
alter policy obras_insert on public.artworks rename to artworks_insert;
alter policy obras_update on public.artworks rename to artworks_update;
alter policy imagenes_select on public.images rename to images_select;
alter policy imagenes_insert on public.images rename to images_insert;
alter policy imagenes_update on public.images rename to images_update;

-- Storage policies keep their Spanish names as legacy, same reason as the
-- auth.users trigger: ALTER POLICY requires owning the table and in Supabase
-- cloud storage.objects belongs to supabase_storage_admin. Their USING/WITH
-- CHECK expressions reference can_edit()/can_read() by oid, so they keep
-- working with the renamed functions. The bucket id also stays 'obras': it is
-- a row in storage.buckets with objects inside — data, not code.

-- ── View: which image represents each artwork ────────────────
-- Recreated (not renamed) so its output columns are English too. Same rationale
-- as the original migration: the fallback rule of RF-403 lives in one place.

create view public.representative_image
with (
  -- CRITICAL. Without security_invoker the view runs with its owner's
  -- privileges and bypasses the RLS policies of "images": anyone with a session
  -- would see the paths of retired images. Exactly the hole this project
  -- cannot afford, because the policies are the only perimeter.
  security_invoker = true
) as
select distinct on (i.catalog_id)
  i.catalog_id,
  i.image_id,
  i.thumbnail_path,
  i.derivative_path,
  i.shot_type,
  -- Whether a person chose it or the rule did matters in the interface: if it
  -- was the rule, uploading another photo may change it on its own, and that
  -- deserves a warning.
  i.index_image as manually_chosen
from public.images i
where i.active
order by
  i.catalog_id,
  -- 1. The manually marked one always wins (RF-402).
  i.index_image desc,
  -- 2. A general shot represents the artwork; a signature detail or a back
  --    side does not.
  (i.shot_type = 'GENERAL') desc,
  -- 3. The most recent one, by photo date.
  i.photo_date desc nulls last,
  -- 4. On ties, the one uploaded last.
  i.image_id desc;

comment on view public.representative_image is
  'One row per artwork: the image that represents it, per the fallback rule of RF-403.';

grant select on public.representative_image to authenticated;

-- ── Comments ─────────────────────────────────────────────────

comment on table public.profiles is
  'Mirror of auth.users with each user''s role. RF-109.';
comment on table public.artworks is
  'Main catalog table. One row per cataloged piece. Field schema v11, table 1.';
comment on table public.images is
  'Current technical photographic documentation of each artwork. Three levels per shot (ADR-002).';
comment on column public.artworks.photographed is
  'Computed by trigger from "images". Only active ones count (INC-14).';
comment on column public.artworks.date_note is
  'Free-text rendering of the date when the structure falls short ("finales de los setenta"). When not empty it is what gets published; the structured years keep feeding search.';
comment on column public.artworks.execution_date is
  'Generated: composed from the structured fields (or from date_note when present). Never written directly.';
