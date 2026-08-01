-- RF-215, RF-802, RF-901 (ADR-006): la obra colgada del árbol de lugares.
--
-- El árbol en sí lo cubre physical_places.test.sql. Aquí se comprueba lo que
-- aparece al unirlo con las obras: que renombrar un sitio lo vea el catálogo
-- entero sin tocar una sola obra —el requisito que ordena toda la decisión—, que
-- mover una obra sí cuente como haberla tenido delante, y que un lugar con obras
-- dentro no se pueda retirar.
\set ON_ERROR_STOP on
begin;

-- ── 1. El traslado no dejó la auditoría apagada ──────────────
-- La migración de datos desactiva el trigger de auditoría para no firmar las
-- obras con un `auth.uid()` nulo. Si alguna vez se olvidara de volver a
-- activarlo, el catálogo perdería la traza sin que nada fallara: eso es lo que
-- comprueba este aserto, y es la clase de fallo que solo se ve buscándolo.
do $$
declare v_estado "char";
begin
  select t.tgenabled into v_estado
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'artworks' and t.tgname = 'artwork_audit_trail';

  if v_estado is null then
    raise exception 'FAIL: no existe el trigger de auditoría de obras';
  end if;
  if v_estado <> 'O' then
    raise exception 'FAIL: el trigger de auditoría de obras está desactivado (%)', v_estado;
  end if;
  raise notice 'OK: la auditoría de obras quedó activada tras el traslado';
end $$;

-- ── 2. El traslado no dejó ubicaciones huérfanas ─────────────
-- Sobre una base recién migrada este aserto no dice nada, y es correcto que no lo
-- diga: sobre una base cargada con el volcado de producción es el único sitio
-- donde se ve si el reparto por comas hizo su trabajo. Va antes de los fixtures
-- porque los fixtures vacían el árbol. `zzzz` era un valor de prueba y se
-- descartó a propósito (ADR-006).
do $$
declare v_huerfanas int;
begin
  select count(*) into v_huerfanas
    from public.artworks
   where btrim(coalesce(physical_location, '')) <> ''
     and public.place_key(physical_location) <> 'zzzz'
     and physical_place_id is null;

  if v_huerfanas > 0 then
    raise exception 'FAIL: % obras con ubicación en texto se quedaron sin nodo', v_huerfanas;
  end if;
  raise notice 'OK: ninguna ubicación en texto se quedó sin su nodo del árbol';
end $$;

-- ── Fixtures ─────────────────────────────────────────────────
-- Un catalogador, y el árbol vacío haya lo que haya en la base. Lo segundo hace
-- falta porque estos tests corren tanto sobre una base recién migrada como sobre
-- una copia local del volcado de producción, donde el traslado ya creó lugares
-- con estos mismos nombres: sin esto el test fallaría por el índice de raíces
-- homónimas y no por lo que pretende comprobar. Todo vive dentro de la
-- transacción que se deshace al final.
--
-- Se vacía por hojas y en bucle porque `parent_id` es `on delete restrict`: un
-- solo `delete` que se llevara padre e hijo a la vez lo rechazaría la propia
-- restricción.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cat-obra-lugar@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000f1';

update public.artworks set physical_place_id = null;
do $$
begin
  loop
    delete from public.physical_places p
     where not exists (select 1 from public.physical_places c where c.parent_id = p.id);
    exit when not found;
  end loop;
end $$;

-- ── 3. Una obra puede no tener ubicación ─────────────────────
-- RF-215. Es la contrapartida de la cadena vacía de antes: catalogar con la
-- pieza delante no puede exigir decidir dónde está.
do $$
declare v_lugar uuid;
begin
  insert into public.artworks (artist, title, attributed_title)
  values ('ROTILI', 'sin sitio', 'UNCONFIRMED')
  returning physical_place_id into v_lugar;

  if v_lugar is not null then
    raise exception 'FAIL: una obra nueva ha nacido con ubicación (%)', v_lugar;
  end if;
  raise notice 'OK: una obra sin ubicación es legítima';
end $$;

-- ── 4. Renombrar el lugar no toca la obra ────────────────────
-- El motivo del ADR: el nombre nuevo lo ve todo el catálogo, la obra no se ha
-- tocado, y por tanto ni `updated_at` ni `basic_updated_at` se mueven (RF-802:
-- renombrar una balda no es haber tenido la pieza delante).
do $$
declare
  v_lugar uuid;
  v_obra text;
  v_actualizada timestamptz;
  v_basica timestamptz;
  v_nombre text;
begin
  insert into public.physical_places (name) values ('castelar 4') returning id into v_lugar;

  insert into public.artworks (artist, title, attributed_title, physical_place_id)
  values ('ROTILI', 'con sitio', 'UNCONFIRMED', v_lugar)
  returning catalog_id, updated_at, basic_updated_at
      into v_obra, v_actualizada, v_basica;

  update public.physical_places set name = 'Castelar 4' where id = v_lugar;

  select p.name into v_nombre
    from public.artworks a join public.physical_places p on p.id = a.physical_place_id
   where a.catalog_id = v_obra;

  if v_nombre <> 'Castelar 4' then
    raise exception 'FAIL: la obra no ve el nombre nuevo del lugar (%)', v_nombre;
  end if;

  if exists (select 1 from public.artworks
              where catalog_id = v_obra
                and (updated_at is distinct from v_actualizada
                     or basic_updated_at is distinct from v_basica)) then
    raise exception 'FAIL: renombrar el lugar ha movido las fechas de la obra';
  end if;
  raise notice 'OK: renombrar es un update de una fila y el catálogo entero lo ve';
end $$;

-- ── 5. Mover la obra de sitio sí mueve la fecha básica ───────
-- RF-802: la ubicación es un campo de fase 1. Cambiarla es haber estado delante
-- de la obra, y esa fecha es el dato que dice cuándo se examinó por última vez.
do $$
declare
  v_origen uuid;
  v_destino uuid;
  v_obra text;
  v_antes timestamptz;
  v_despues timestamptz;
begin
  select id into v_origen from public.physical_places where name = 'Castelar 4';
  insert into public.physical_places (name) values ('Villafranca de los Barros')
  returning id into v_destino;

  insert into public.artworks (artist, title, attributed_title, physical_place_id)
  values ('ROTILI', 'la que se mueve', 'UNCONFIRMED', v_origen)
  returning catalog_id into v_obra;

  -- Una fecha básica anterior y reconocible, para que el aserto no dependa de la
  -- resolución del reloj dentro de una misma transacción.
  update public.artworks set basic_updated_at = '2020-01-01' where catalog_id = v_obra;
  select basic_updated_at into v_antes from public.artworks where catalog_id = v_obra;

  update public.artworks set physical_place_id = v_destino where catalog_id = v_obra;
  select basic_updated_at into v_despues from public.artworks where catalog_id = v_obra;

  if v_despues = v_antes then
    raise exception 'FAIL: cambiar la obra de sitio no ha movido basic_updated_at';
  end if;
  raise notice 'OK: cambiar una obra de sitio mueve la fecha básica (RF-802)';
end $$;

-- ── 6. Un campo de fase 2 sigue sin moverla ──────────────────
-- El aserto que protege el cambio de tupla del trigger: al meter
-- `physical_place_id` no se ha colado nada más ni se ha perdido la distinción
-- entre las dos fases.
do $$
declare
  v_obra text;
  v_antes timestamptz;
  v_despues timestamptz;
begin
  select catalog_id into v_obra from public.artworks where title = 'la que se mueve';

  update public.artworks set basic_updated_at = '2020-01-01' where catalog_id = v_obra;
  select basic_updated_at into v_antes from public.artworks where catalog_id = v_obra;

  update public.artworks set inventory_process_notes = 'anotación bibliográfica'
   where catalog_id = v_obra;
  select basic_updated_at into v_despues from public.artworks where catalog_id = v_obra;

  if v_despues is distinct from v_antes then
    raise exception 'FAIL: una nota de fase 2 ha movido la fecha básica';
  end if;
  raise notice 'OK: un campo de fase 2 no mueve la fecha básica';
end $$;

-- ── 7. Un lugar con obras dentro no se retira ────────────────
do $$
declare v_lugar uuid;
begin
  select id into v_lugar from public.physical_places where name = 'Villafranca de los Barros';
  begin
    update public.physical_places set active = false where id = v_lugar;
    raise exception 'FAIL: se ha retirado un lugar que tiene obras dentro';
  exception when raise_exception then
    raise notice 'OK: no se puede retirar un lugar con obras dentro';
  end;
end $$;

-- ── 8. Una obra en la papelera no estorba ────────────────────
-- La baja lógica no puede convertirse en un candado: una obra retirada no impide
-- retirar la balda donde estaba.
do $$
declare v_lugar uuid; v_obra text;
begin
  insert into public.physical_places (name) values ('balda que se vacía')
  returning id into v_lugar;
  insert into public.artworks (artist, title, attributed_title, physical_place_id)
  values ('ROTILI', 'la de la papelera', 'UNCONFIRMED', v_lugar)
  returning catalog_id into v_obra;

  update public.artworks set active = false where catalog_id = v_obra;
  update public.physical_places set active = false where id = v_lugar;

  if exists (select 1 from public.physical_places where id = v_lugar and active) then
    raise exception 'FAIL: el lugar no se ha retirado';
  end if;
  raise notice 'OK: una obra en la papelera no impide retirar su lugar';
end $$;

-- ── 9. No se puede apuntar a un lugar que no existe ──────────
do $$
begin
  begin
    insert into public.artworks (artist, title, attributed_title, physical_place_id)
    values ('ROTILI', 'apunta al vacío', 'UNCONFIRMED',
            '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: una obra apunta a un lugar inexistente';
  exception when foreign_key_violation then
    raise notice 'OK: la obra no puede apuntar a un lugar que no existe';
  end;
end $$;

rollback;
