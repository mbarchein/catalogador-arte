-- Clave sustituta en los tipos de obra y en las series (ADR-007).
--
-- Primera de las dos entregas de la decisión. Las dos tablas tenían el nombre
-- por clave —`series` la pareja `(artist, name)`— y la obra guardaba ese texto
-- copiado, así que renombrar «Técnica mixta» obligaba a tocar todas las obras que
-- la usaban. Con clave propia, renombrar es una fila y lo ve el catálogo entero,
-- que es lo mismo que ADR-006 hizo con los lugares.
--
-- Aparece además la baja lógica donde no había (RF-901): un tipo o una serie se
-- retiran, no se borran, y no se puede retirar lo que todavía tiene obras dentro.
--
-- El fondo (`artist_fund`) NO entra aquí. Es un tipo enumerado y sus valores
-- sostienen el prefijo de `catalog_id`, que es la etiqueta pegada al cuadro: va
-- en la segunda entrega, para que esa parte se revise con la numeración por fondo
-- delante y no de refilón.
--
-- Las columnas de texto `artworks.artwork_type` y `artworks.series` NO se retiran
-- aquí: el frontend viejo corre unos segundos contra el esquema nuevo, así que se
-- van en un despliegue posterior, junto con sus triggers de vocabulario.

-- ── Tipos de obra ───────────────────────────────────────────

alter table public.artwork_types
  add column id uuid not null default gen_random_uuid(),
  -- RF-901: nada se borra de verdad. No existía porque no había forma de
  -- retirar un tipo; ahora que la clave no es el nombre, sí la hay.
  add column active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.profiles (id);

-- El nombre deja de ser la clave y pasa a ser un atributo único. Único de
-- verdad, no por costumbre: dos tipos con el mismo nombre son el mismo tipo, y
-- lo que se ha soltado es la identidad, no la unicidad.
alter table public.artwork_types drop constraint artwork_types_pkey;
alter table public.artwork_types add constraint artwork_types_pkey primary key (id);
alter table public.artwork_types add constraint artwork_types_name_key unique (name);

comment on table public.artwork_types is
  'Vocabulario controlado de tipos de obra (RF-213), con clave sustituta (ADR-007): el nombre es un atributo y renombrar es una fila. Lista abierta; nada se borra, se retira.';

-- ── Series ──────────────────────────────────────────────────

alter table public.series
  add column id uuid not null default gen_random_uuid(),
  add column active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.profiles (id);

-- La pareja (fondo, nombre) deja de ser la clave y sigue siendo única: cada
-- artista trabaja en sus propias series, y dos series del mismo fondo con el
-- mismo nombre son la misma serie. Lo que ya no es, es la identidad de la fila.
alter table public.series drop constraint series_pkey;
alter table public.series add constraint series_pkey primary key (id);
alter table public.series add constraint series_artist_name_key unique (artist, name);

comment on table public.series is
  'Vocabulario controlado de series, uno por fondo (ADR-007): clave sustituta, y la pareja (fondo, nombre) como única. Lista abierta; nada se borra, se retira.';

-- ── La obra apunta por identificador ────────────────────────
--
-- `restrict` en las dos, coherente con que no haya DELETE concedido a nadie:
-- si alguna vez se borrara una fila a mano, esto avisa en vez de dejar obras
-- apuntando al vacío.
--
-- Nulo es legítimo en las dos, y no significa lo mismo en cada una: una obra sin
-- serie no pertenece a ninguna, y una obra sin tipo todavía no lo tiene
-- registrado. Es lo que hoy dice la cadena vacía de las columnas de texto.

alter table public.artworks
  add column artwork_type_id uuid references public.artwork_types (id) on delete restrict,
  add column series_id uuid references public.series (id) on delete restrict;

comment on column public.artworks.artwork_type_id is
  'Tipo de obra, del vocabulario (ADR-007). Nulo es «sin registrar todavía».';
comment on column public.artworks.series_id is
  'Serie a la que pertenece la obra (ADR-007). Nulo es «no pertenece a ninguna», que es una respuesta y no un dato pendiente.';

create index artworks_artwork_type_idx on public.artworks (artwork_type_id);
create index artworks_series_idx on public.artworks (series_id);

-- ── El traslado de los datos ────────────────────────────────
--
-- Como en 20260801150000: la auditoría se apaga mientras se escribe, porque
-- dentro de una migración `auth.uid()` no es nadie y el trigger borraría el
-- «actualizado por» de todas las obras. Y esto tampoco es haber tenido la pieza
-- delante (RF-802).
--
-- El emparejamiento es por el texto recortado, que es lo que el trigger de
-- vocabulario ya exigía: si una obra tiene un tipo escrito, ese tipo está en el
-- vocabulario, o la fila no habría podido guardarse.

alter table public.artworks disable trigger artwork_audit_trail;

update public.artworks a
   set artwork_type_id = t.id
  from public.artwork_types t
 where btrim(a.artwork_type) <> ''
   and t.name = btrim(a.artwork_type);

-- La serie se empareja por fondo Y nombre: el mismo nombre en otro fondo es otra
-- serie, que es el motivo de que el fondo entrara en la clave.
update public.artworks a
   set series_id = s.id
  from public.series s
 where btrim(a.series) <> ''
   and s.artist = a.artist
   and s.name = btrim(a.series);

alter table public.artworks enable trigger artwork_audit_trail;

do $$
declare
  v_tipos int;
  v_series int;
  v_huerfanos int;
begin
  select count(*) into v_tipos from public.artworks where artwork_type_id is not null;
  select count(*) into v_series from public.artworks where series_id is not null;
  -- Si el trigger de vocabulario ha hecho su trabajo desde que existe, esto es
  -- cero. Si no lo es, hay que saberlo ahora y no cuando falte un dato en una
  -- ficha.
  select count(*) into v_huerfanos
    from public.artworks
   where (btrim(artwork_type) <> '' and artwork_type_id is null)
      or (btrim(series) <> '' and series_id is null);

  raise notice 'Obras con tipo: %. Con serie: %. Sin emparejar: %.', v_tipos, v_series, v_huerfanos;
  if v_huerfanos > 0 then
    raise exception 'Hay % obras cuyo tipo o serie en texto no está en su vocabulario', v_huerfanos;
  end if;
end $$;

-- ── La serie sigue siendo la del fondo de la obra ───────────
--
-- La clave ajena garantiza que la serie existe, no que sea del fondo de la obra:
-- «Paisajes de la sierra» es una serie de Rotili y ponérsela a una Ruiz Campins
-- es un dato falso. Esa regla la sostenía el trigger que comprueba el texto
-- contra el vocabulario del fondo, y aquí se repite para el identificador.
--
-- Un trigger y no una restricción `check` porque una `check` no puede consultar
-- otra tabla.
create function public.tg_artwork_series_matches_fund()
returns trigger language plpgsql
-- SECURITY DEFINER por lo mismo que el del vocabulario: es una regla de
-- integridad de las obras, no una consulta del cliente.
security definer set search_path = public as $$
declare v_artist public.artist_fund;
begin
  if new.series_id is null then
    return new;
  end if;

  select artist into v_artist from public.series where id = new.series_id;
  if v_artist is distinct from new.artist then
    raise exception 'Esa serie no es del fondo de la obra'
      using hint = 'Cada fondo tiene sus propias series: elige una del fondo de esta obra.';
  end if;
  return new;
end $$;

create trigger artwork_series_matches_fund
  before insert or update of series_id, artist on public.artworks
  for each row execute function public.tg_artwork_series_matches_fund();

-- ── RF-802: la fecha básica vigila el identificador ─────────
--
-- El tipo de obra es un campo de fase 1 —se toma con la obra delante— y sigue
-- siéndolo; lo que cambia es que lo dice el identificador. La serie no está en la
-- tupla y sigue sin estarlo: se decide leyendo un catálogo, no midiendo la pieza.
--
-- `artwork_type` sale de la tupla, con la misma consecuencia acotada que
-- `physical_location`: durante los segundos que duran las dos fases, un tipo
-- escrito por el frontend viejo no moverá la fecha básica.
--
-- `set search_path = public` se repite porque `create or replace` reemplaza la
-- definición entera y con ella la configuración (ver 20260801150000).
create or replace function public.tg_artwork_audit_trail()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  -- RF-802: basic_updated_at only moves when a phase-1 field changes, i.e. one
  -- that requires standing in front of the artwork. It records when the piece
  -- was last physically examined — a datum that would be lost if any fix to a
  -- bibliographic note refreshed it.
  if (new.artwork_type_id, new.technique, new.support, new.height_cm, new.width_cm,
      new.depth_cm, new.signed, new.signature_description, new.dated_on_artwork,
      new.conservation_status, new.physical_place_id)
     is distinct from
     (old.artwork_type_id, old.technique, old.support, old.height_cm, old.width_cm,
      old.depth_cm, old.signed, old.signature_description, old.dated_on_artwork,
      old.conservation_status, old.physical_place_id)
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

-- ── Autoría y baja, selladas por la base ────────────────────
-- Los dos triggers de autoría solo sellaban el alta, porque no había baja que
-- sellar. Ahora la hay, y con la misma forma que en los lugares.

create or replace function public.tg_artwork_type_authorship()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.active = false and old.active = true then
    new.deactivated_at := now();
    new.deactivated_by := auth.uid();
  elsif new.active = true and old.active = false then
    new.deactivated_at := null;
    new.deactivated_by := null;
  end if;
  return new;
end $$;

drop trigger artwork_type_authorship on public.artwork_types;
create trigger artwork_type_authorship
  before insert or update on public.artwork_types
  for each row execute function public.tg_artwork_type_authorship();

create or replace function public.tg_series_authorship()
returns trigger language plpgsql
set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif new.active = false and old.active = true then
    new.deactivated_at := now();
    new.deactivated_by := auth.uid();
  elsif new.active = true and old.active = false then
    new.deactivated_at := null;
    new.deactivated_by := null;
  end if;
  return new;
end $$;

drop trigger series_authorship on public.series;
create trigger series_authorship
  before insert or update on public.series
  for each row execute function public.tg_series_authorship();

-- ── Lo que tiene obras dentro no se retira ──────────────────
-- Misma regla que los lugares, y por el mismo motivo: retirar un tipo que
-- veintiuna obras usan no es retirarlo, es dejar el catálogo apuntando a algo
-- que la interfaz ya no ofrece. Una obra en la papelera no cuenta.

create function public.tg_artwork_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.artworks
                  where artwork_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de obra que todavía usan obras del catálogo'
      using hint = 'Cambia antes el tipo de esas obras.';
  end if;
  return new;
end $$;

create trigger artwork_type_deactivation
  before update of active on public.artwork_types
  for each row execute function public.tg_artwork_type_deactivation();

create function public.tg_series_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.artworks
                  where series_id = new.id and active) then
    raise exception 'No se puede retirar una serie que todavía tiene obras dentro'
      using hint = 'Saca antes las obras de la serie.';
  end if;
  return new;
end $$;

create trigger series_deactivation
  before update of active on public.series
  for each row execute function public.tg_series_deactivation();

-- ── Privilegios ────────────────────────────────────────────
-- Las dos tablas se concedieron con `select, insert` y sin UPDATE, porque
-- renombrar y retirar eran «una función futura del superusuario». Esa función es
-- ahora el motivo de la decisión, y quien la ejerce es el Catalogador, igual que
-- con los lugares: el estudio está en reordenación y esperar a un administrador
-- para corregir un nombre no es viable.
--
-- Sin DELETE, como siempre: ni privilegio ni política.

grant update on public.artwork_types to authenticated;
grant update on public.series to authenticated;

create policy artwork_types_update on public.artwork_types
  for update using (public.can_edit()) with check (public.can_edit());

create policy series_update on public.series
  for update using (public.can_edit()) with check (public.can_edit());

-- ── Privilegios de las funciones ───────────────────────────
-- Explícito, como en 20260801140000: una función nueva nace con EXECUTE para
-- PUBLIC en esta plataforma, y quien lo caza es function_privileges.test.sql.

revoke all on function public.tg_artwork_series_matches_fund() from public;
revoke all on function public.tg_artwork_type_deactivation() from public;
revoke all on function public.tg_series_deactivation() from public;
