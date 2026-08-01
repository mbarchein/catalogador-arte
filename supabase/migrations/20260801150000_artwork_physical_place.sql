-- La obra apunta al árbol de lugares (ADR-006, RF-215).
--
-- Segunda mitad de la decisión. La migración anterior creó `physical_places`;
-- esta cuelga `artworks.physical_place_id`, traslada los textos que había y
-- cierra la comprobación que allí quedó pendiente por no existir todavía la
-- columna: un lugar con obras dentro tampoco se retira.
--
-- `physical_location` NO se retira aquí. El despliegue es en dos fases porque el
-- frontend viejo corre unos segundos contra el esquema nuevo (ver el comentario
-- de .github/workflows/desplegar.yml): la columna se va en una migración
-- posterior, cuando ya nadie la lea.

-- ── La columna ──────────────────────────────────────────────
--
-- Nula es una respuesta legítima y no un dato que falte: la captura con la pieza
-- delante no puede exigir decidir dónde está, igual que hoy admite la cadena
-- vacía. `restrict` es coherente con que no haya DELETE concedido a nadie sobre
-- los lugares (RF-901); si alguna vez se borrara uno a mano, esto avisa en vez
-- de dejar obras apuntando al vacío.

alter table public.artworks
  add column physical_place_id uuid references public.physical_places (id) on delete restrict;

comment on column public.artworks.physical_place_id is
  'Nodo del árbol de lugares donde está la obra (ADR-006). Nulo es legítimo: una obra puede no tener ubicación registrada.';

-- El filtro del listado pregunta «todo lo que hay en la habitación amarilla», y
-- lo resuelve subiendo por el árbol hasta las obras de cada nodo.
create index artworks_physical_place_idx on public.artworks (physical_place_id);

-- ── RF-802: mover la obra sí es haber tenido la pieza delante ─
--
-- `basic_updated_at` cambia de campo vigilado: lo que registra es cuándo se
-- examinó físicamente la obra, y eso lo dice ahora el nodo al que apunta, no el
-- texto. Renombrar o mover un LUGAR no toca ninguna fila de obras, así que deja
-- de mover la fecha por construcción, que es justo lo que dice el ADR: no es
-- haber tenido la pieza delante. Cambiar una obra de sitio sí.
--
-- `physical_location` sale de la tupla, con una consecuencia acotada: durante
-- los segundos que duran las dos fases, una ubicación escrita desde el frontend
-- viejo no moverá la fecha básica. Es un campo y son segundos; la alternativa
-- —vigilar los dos— obligaría a rehacer esta función otra vez al retirar la
-- columna, y esa es la clase de deuda que se olvida.
--
-- `set search_path = public` está aquí porque `create or replace` reemplaza la
-- definición ENTERA, y con ella la configuración que 20260801120000 puso con un
-- `alter function`: sin repetirlo, esta función se quedaría sin él y el aserto de
-- function_privileges.test.sql lo cazaría.
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
  if (new.artwork_type, new.technique, new.support, new.height_cm, new.width_cm,
      new.depth_cm, new.signed, new.signature_description, new.dated_on_artwork,
      new.conservation_status, new.physical_place_id)
     is distinct from
     (old.artwork_type, old.technique, old.support, old.height_cm, old.width_cm,
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

-- ── Un lugar con obras dentro no se retira ──────────────────
--
-- La otra mitad de la comprobación que 20260801140000 dejó a medias. Una obra en
-- la papelera no cuenta: está de baja lógica, y exigir vaciarla antes de retirar
-- una balda sería hacer que la papelera estorbe.
create or replace function public.tg_physical_place_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.physical_places
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía contiene otros lugares'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;

    if exists (select 1 from public.artworks
                where physical_place_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía tiene obras dentro'
        using hint = 'Mueve antes las obras a otro sitio.';
    end if;
  end if;
  return new;
end $$;

-- ── El traslado de los datos ────────────────────────────────
--
-- Los textos se parten por comas, que es lo que la convención anterior usaba de
-- separador, y cada nivel se busca o se crea bajo el nivel anterior. Sale un
-- árbol en minúsculas y sin tildes, porque es como está guardado el texto: los
-- nombres se curan después desde la interfaz, una vez por lugar y no una vez por
-- obra, que es la mitad del valor de la decisión.
--
-- Dos textos que solo se diferencien en mayúsculas o tildes caen en el mismo
-- nodo, porque el nodo se busca por `place_key`. Es la misma regla que impide
-- que existan dos hermanos homónimos.
--
-- `created_by` se queda nulo a propósito: dentro de una migración `auth.uid()`
-- no es nadie, y firmar estos ocho nodos con una persona sería inventar una
-- traza.

alter table public.artworks disable trigger artwork_audit_trail;

do $$
declare
  v_artwork record;
  v_level text;
  v_parent uuid;
  v_node uuid;
  v_places int := 0;
  v_artworks int := 0;
begin
  for v_artwork in
    select catalog_id, physical_location
      from public.artworks
     where btrim(coalesce(physical_location, '')) <> ''
       -- `zzzz` era un valor de prueba y no un sitio: la obra que lo lleva queda
       -- sin ubicación (ADR-006). Nombrar la excepción es más honesto que una
       -- heurística que mañana descarte un lugar de verdad.
       and public.place_key(physical_location) <> 'zzzz'
     order by catalog_id
  loop
    v_parent := null;
    v_node := null;

    foreach v_level in array string_to_array(v_artwork.physical_location, ',')
    loop
      v_level := btrim(v_level);
      continue when v_level = '';

      select id into v_node
        from public.physical_places
       where parent_id is not distinct from v_parent
         and public.place_key(name) = public.place_key(v_level);

      if v_node is null then
        insert into public.physical_places (parent_id, name)
        values (v_parent, v_level)
        returning id into v_node;
        v_places := v_places + 1;
      end if;

      v_parent := v_node;
    end loop;

    if v_node is not null then
      update public.artworks set physical_place_id = v_node
       where catalog_id = v_artwork.catalog_id;
      v_artworks := v_artworks + 1;
    end if;
  end loop;

  raise notice 'Lugares creados: %. Obras apuntando al árbol: %.', v_places, v_artworks;
end $$;

-- La auditoría vuelve antes de que nadie más pueda escribir: el traslado no es
-- que alguien haya editado las obras (RF-801) ni que las haya tenido delante
-- (RF-802), y con `auth.uid()` nulo el trigger habría borrado `updated_by` de
-- todas ellas.
alter table public.artworks enable trigger artwork_audit_trail;
