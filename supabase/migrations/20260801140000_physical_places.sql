-- Los lugares físicos como árbol (ADR-006, RF-215).
--
-- Sustituye a la convención de notación sobre `artworks.physical_location`:
-- minúsculas, sin tildes y niveles separados por comas. Esa convención perdía el
-- dato —el nombre propio se guardaba deformado—, se rompía en cuanto un nivel
-- llevaba una coma (una dirección postal la lleva), y obligaba a tocar todas las
-- filas de una obra para renombrar un sitio.
--
-- Aquí el nombre se guarda tal cual se escribe y lo que se normaliza es la clave
-- de comparación. Renombrar y mover son operaciones de una fila.
--
-- Esta migración crea el árbol; la que sigue traslada los datos y cuelga
-- `artworks.physical_place_id`. Se parten en dos para que el esquema se pueda
-- revisar sin la conversión delante.

-- ── La clave de comparación ─────────────────────────────────
--
-- Minúsculas y sin tildes, salvo la ñ: es una letra del alfabeto y no un
-- acento, así que «muñeca» no se convierte en «muneca». Es la misma regla que
-- ya aplicaba el frontend en location.ts, ahora del lado de la base y como
-- única fuente.
--
-- IMMUTABLE porque tiene que servir de índice, y por eso usa `translate` en vez
-- de `unaccent`: la extensión existe, pero su función no es inmutable —depende
-- de un diccionario que se puede cambiar— y PostgreSQL no la admite en un
-- índice.
create function public.place_key(p_name text)
returns text language sql immutable strict
set search_path = public as $$
  select translate(
    lower(btrim(p_name)),
    'áàäâãéèëêíìïîóòöôõúùüûýÿÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÝ',
    'aaaaaeeeeiiiiooooouuuuyyAAAAAEEEEIIIIOOOOOUUUUY'
  )
$$;

comment on function public.place_key is
  'Clave de comparación de un nombre de lugar: minúsculas y sin tildes, conservando la ñ. Inmutable para poder indexarla.';

-- ── El árbol ────────────────────────────────────────────────

create table public.physical_places (
  -- Clave sustituta, no el nombre (ADR-006): es lo que hace que renombrar sea
  -- una operación de una fila y no una migración de datos.
  id uuid primary key default gen_random_uuid(),

  -- Nulo es una raíz. MUTABLE a propósito: la reorganización del estudio va a
  -- colgar de otro sitio lugares que hoy son raíz, y eso debe ser un update, no
  -- un rehacer. `restrict` porque un padre con hijos no se retira: se vacía
  -- primero.
  parent_id uuid references public.physical_places (id) on delete restrict,

  -- Tal cual se escribe, con sus mayúsculas y sus tildes.
  name text not null,

  -- RF-901: nada se borra de verdad.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  constraint physical_places_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.physical_places is
  'Árbol de lugares físicos (ADR-006). El nombre se guarda como se escribe; place_key(name) es la clave de comparación. parent_id es mutable: reorganizar el árbol es una operación normal.';

-- Dos hermanos no pueden llamarse igual, comparado sin tildes ni mayúsculas.
-- Son dos índices porque en SQL un nulo no es igual a otro nulo: sin el
-- parcial, dos raíces homónimas pasarían.
create unique index physical_places_raiz_unica
  on public.physical_places (public.place_key(name))
  where parent_id is null;

create unique index physical_places_hermanos_unicos
  on public.physical_places (parent_id, public.place_key(name))
  where parent_id is not null;

create index physical_places_parent_idx on public.physical_places (parent_id);

-- ── Sin ciclos ──────────────────────────────────────────────
-- Un edificio dentro de su propia balda deja el árbol irrecuperable: ninguna
-- consulta recursiva termina y el nodo desaparece de la jerarquía sin haberse
-- borrado. Es barato de comprobar y caro de descubrir.

create function public.tg_physical_place_no_cycle()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_ancestro uuid := new.parent_id;
  v_saltos int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un lugar no puede estar dentro de sí mismo';
  end if;

  while v_ancestro is not null loop
    if v_ancestro = new.id then
      raise exception 'Ese movimiento metería el lugar dentro de uno de sus descendientes';
    end if;
    -- Cinturón: si el árbol ya estuviera corrupto, esto para en vez de colgarse.
    v_saltos := v_saltos + 1;
    if v_saltos > 100 then
      raise exception 'La jerarquía de lugares tiene un ciclo';
    end if;
    select parent_id into v_ancestro from public.physical_places where id = v_ancestro;
  end loop;

  return new;
end $$;

create trigger physical_place_no_cycle
  before insert or update of parent_id on public.physical_places
  for each row execute function public.tg_physical_place_no_cycle();

-- ── Autoría y baja, selladas por la base ────────────────────
-- Como en obras e imágenes: no se confía en que el cliente mande quién.

create function public.tg_physical_place_authorship()
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

create trigger physical_place_authorship
  before insert or update on public.physical_places
  for each row execute function public.tg_physical_place_authorship();

-- Un lugar con contenido no se retira: primero se vacía. Vale para los hijos y
-- para las obras, y la comprobación de obras se añade en la migración que crea
-- la columna, porque hasta entonces no existe.
create function public.tg_physical_place_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.physical_places
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía contiene otros lugares'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;
  end if;
  return new;
end $$;

create trigger physical_place_deactivation
  before update of active on public.physical_places
  for each row execute function public.tg_physical_place_deactivation();

-- ── RLS y privilegios ───────────────────────────────────────
-- Una tabla sin RLS está abierta, no cerrada. Se revoca y se concede una a una,
-- porque la plataforma concede por omisión los privilegios de cada tabla nueva.

alter table public.physical_places enable row level security;

revoke all on public.physical_places from anon, authenticated;

-- Sin DELETE: ni privilegio ni política (RF-901). Retirar es un update de
-- `active`. Y sí UPDATE, al contrario que en series y tipos de obra: renombrar
-- y mover son el motivo de esta tabla (ADR-006), no una función futura.
grant select, insert, update on public.physical_places to authenticated;

-- Quien lee el catálogo necesita los lugares: etiquetan la ficha y alimentan el
-- filtro del listado, que el Lector también usa.
create policy physical_places_select on public.physical_places
  for select using (public.can_read());

create policy physical_places_insert on public.physical_places
  for insert with check (public.can_edit());

create policy physical_places_update on public.physical_places
  for update using (public.can_edit()) with check (public.can_edit());

-- ── Privilegios de las funciones ────────────────────────────
-- Explícito y no confiado a los privilegios por omisión: la migración
-- 20260801120000 añadió `alter default privileges ... revoke all on functions
-- from public` y, comprobado en esta plataforma, NO suprime la concesión
-- implícita — una función creada después sigue naciendo con EXECUTE para
-- PUBLIC. Aquella línea se queda porque no estorba, pero quien impide que esto
-- se repita es el aserto de function_privileges.test.sql, que es justo quien
-- cazó estas cuatro.
revoke all on function public.place_key(text) from public;
revoke all on function public.tg_physical_place_no_cycle() from public;
revoke all on function public.tg_physical_place_authorship() from public;
revoke all on function public.tg_physical_place_deactivation() from public;

-- place_key se usa dentro de los índices y del propio selector: la resuelve el
-- planificador, no la llama la API. Concedida a quien consulta para poder
-- comparar nombres desde el cliente sin duplicar la regla.
grant execute on function public.place_key(text) to authenticated;
