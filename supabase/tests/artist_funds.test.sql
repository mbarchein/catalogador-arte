-- El fondo como tabla maestra (ADR-007, segunda entrega).
--
-- Lo que se fija aquí es lo que separa esta tabla de las demás maestras, que es
-- justo lo que se puede perder en una revisión distraída: que el código y el
-- prefijo NO se pueden cambiar —son lo que guardan las obras y lo que está
-- impreso en la etiqueta del cuadro—, que no se puede quedar sin ningún fondo
-- activo, que no hay forma de crear ni de borrar uno, y que retirar un fondo no
-- lo hace invisible.
\set ON_ERROR_STOP on
begin;

-- ── Los tres, con su prefijo ────────────────────────────────
do $$
declare v_rows int;
begin
  select count(*) into v_rows from public.artist_funds;
  if v_rows <> 3 then
    raise exception 'FAIL: se esperaban los tres fondos, hay %', v_rows;
  end if;

  -- El prefijo tiene que ser el que ya sostienen los identificadores guardados:
  -- si aquí dijera otra cosa, la tabla contradiría las etiquetas de las obras.
  if (select prefix from public.artist_funds where code = 'ROTILI') <> 'AR'
     or (select prefix from public.artist_funds where code = 'RUIZ_CAMPINS') <> 'RC'
     or (select prefix from public.artist_funds where code = 'TEST') <> 'TS' then
    raise exception 'FAIL: los prefijos no coinciden con los de catalog_id';
  end if;
  raise notice 'OK: los tres fondos, con el prefijo que ya usan sus obras';
end $$;

-- ── El prefijo de la tabla es el que genera la base ─────────
--
-- Los dos sitios donde vive la correspondencia fondo→prefijo son esta tabla y el
-- `case` de `next_catalog_id`. Mientras sean dos, esto es lo que los ata: si
-- alguien añade un fondo al enumerado y se olvida de la función, o al revés, el
-- identificador siguiente saldría con el prefijo equivocado y se imprimiría.
do $$
declare
  t_fund record;
  v_next text;
begin
  for t_fund in select code, prefix from public.artist_funds loop
    v_next := public.next_catalog_id(t_fund.code);
    if left(v_next, 2) <> t_fund.prefix then
      raise exception 'FAIL: el fondo % dice prefijo «%» y la base genera «%»',
        t_fund.code, t_fund.prefix, v_next;
    end if;
  end loop;
  raise notice 'OK: el prefijo de la tabla es el que genera next_catalog_id';
end $$;

-- ── Todos los valores del enumerado tienen su fila ──────────
--
-- Añadir un valor al enumerado sin darle fila aquí dejaría obras cuyo fondo no
-- tiene nombre en ninguna parte.
do $$
declare v_missing text[];
begin
  select coalesce(array_agg(v.value::text), '{}') into v_missing
    from unnest(enum_range(null::public.artist_fund)) as v(value)
   where not exists (select 1 from public.artist_funds f where f.code = v.value);
  if array_length(v_missing, 1) > 0 then
    raise exception 'FAIL: valores del enumerado sin fila en artist_funds: %',
      array_to_string(v_missing, ', ');
  end if;
  raise notice 'OK: cada valor del enumerado tiene su fondo';
end $$;

-- ── El código y el prefijo no se cambian ────────────────────
do $$
declare v_failed boolean;
begin
  begin
    update public.artist_funds set code = 'TEST' where code = 'ROTILI';
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: se ha podido cambiar el código de un fondo';
  end if;

  begin
    update public.artist_funds set prefix = 'ZZ' where code = 'ROTILI';
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: se ha podido cambiar el prefijo de un fondo';
  end if;
  raise notice 'OK: el código y el prefijo son inmutables';
end $$;

-- ── El nombre sí se corrige ─────────────────────────────────
do $$
declare v_name text;
begin
  update public.artist_funds set name = 'Alberto Rotili Pérez' where code = 'ROTILI'
  returning name into v_name;
  if v_name <> 'Alberto Rotili Pérez' then
    raise exception 'FAIL: no se ha podido renombrar el fondo';
  end if;
  update public.artist_funds set name = 'Alberto Rotili' where code = 'ROTILI';

  -- Y en blanco no: un fondo sin nombre no nombra nada.
  begin
    update public.artist_funds set name = '   ' where code = 'ROTILI';
    raise exception 'FAIL: se ha aceptado un nombre en blanco';
  exception when check_violation then
    null;
  end;
  raise notice 'OK: el nombre se corrige, y no se queda en blanco';
end $$;

-- ── Los dos interruptores son independientes ────────────────
do $$
declare v_active boolean; v_hidden boolean;
begin
  -- Apartar las obras SIN retirar el fondo: sigue ofreciéndose.
  update public.artist_funds set hide_artworks = true where code = 'TEST'
  returning active, hide_artworks into v_active, v_hidden;
  if not v_active or not v_hidden then
    raise exception 'FAIL: ocultar las obras ha tocado si el fondo se ofrece';
  end if;

  -- Y retirarlo sin apartar sus obras.
  update public.artist_funds set hide_artworks = false, active = false where code = 'TEST'
  returning active, hide_artworks into v_active, v_hidden;
  if v_active or v_hidden then
    raise exception 'FAIL: retirar el fondo ha apartado sus obras';
  end if;
  raise notice 'OK: retirar y apartar son dos cosas distintas';
end $$;

-- ── La baja la sella la base ────────────────────────────────
do $$
declare v_at timestamptz;
begin
  select deactivated_at into v_at from public.artist_funds where code = 'TEST';
  if v_at is null then
    raise exception 'FAIL: retirar un fondo no ha sellado la fecha de baja';
  end if;

  update public.artist_funds set active = true where code = 'TEST';
  select deactivated_at into v_at from public.artist_funds where code = 'TEST';
  if v_at is not null then
    raise exception 'FAIL: restaurar no ha limpiado la fecha de baja';
  end if;
  raise notice 'OK: la baja y la restauración las sella la base';
end $$;

-- ── No se puede dejar el catálogo sin fondos ────────────────
do $$
declare v_failed boolean;
begin
  update public.artist_funds set active = false where code in ('RUIZ_CAMPINS', 'TEST');
  begin
    update public.artist_funds set active = false where code = 'ROTILI';
    v_failed := false;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: se han podido retirar TODOS los fondos';
  end if;
  update public.artist_funds set active = true where code in ('RUIZ_CAMPINS', 'TEST');
  raise notice 'OK: siempre queda un fondo que ofrecer';
end $$;

-- ── Ni alta ni borrado: no hay privilegio ───────────────────
--
-- La plataforma concede todos los privilegios de una tabla nueva a los roles
-- anónimo y autenticado. El test de cierre por omisión avisa de la parte de RLS,
-- no de los `grant`, así que esto se comprueba aquí.
do $$
declare v_extra text[];
begin
  select coalesce(array_agg(privilege_type order by privilege_type), '{}') into v_extra
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'artist_funds'
     and grantee in ('anon', 'authenticated')
     and privilege_type not in ('SELECT', 'UPDATE');
  if array_length(v_extra, 1) > 0 then
    raise exception 'FAIL: artist_funds concede de más: %', array_to_string(v_extra, ', ');
  end if;
  raise notice 'OK: sobre los fondos solo se puede leer y corregir';
end $$;

-- ── Un fondo retirado SE SIGUE LEYENDO ──────────────────────
--
-- Es donde esta tabla se aparta de las demás maestras, y a propósito: el fondo lo
-- lleva toda obra, así que esconder la fila retirada dejaría sin nombre al fondo
-- de cada obra que abriera quien solo consulta.
do $$
declare v_using text;
begin
  select qual into v_using
    from pg_policies
   where schemaname = 'public' and tablename = 'artist_funds' and cmd = 'SELECT';
  if v_using is null then
    raise exception 'FAIL: los fondos no tienen política de lectura';
  end if;
  if v_using like '%active%' then
    raise exception 'FAIL: la lectura de los fondos depende de «active»: un fondo retirado dejaría sin nombre a sus obras';
  end if;
  raise notice 'OK: un fondo retirado se sigue leyendo';
end $$;

rollback;
