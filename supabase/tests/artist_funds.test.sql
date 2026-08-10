-- The fund as a master table (ADR-007, second delivery).
--
-- What is pinned down here is what separates this table from the other master tables, which is
-- precisely what can be lost in a distracted review: that the code and the
-- prefix CANNOT be changed —they are what the artworks store and what is
-- printed on the painting's label—, that it cannot be left with no active
-- fund, that there is no way of creating or deleting one, and that withdrawing a fund does not
-- make it invisible.
\set ON_ERROR_STOP on
begin;

-- ── The three, with their prefix ────────────────────────────
do $$
declare v_rows int;
begin
  select count(*) into v_rows from public.artist_funds;
  if v_rows <> 3 then
    raise exception 'FAIL: se esperaban los tres fondos, hay %', v_rows;
  end if;

  -- The prefix has to be the one the stored identifiers already hold up:
  -- if it said something else here, the table would contradict the artworks' labels.
  if (select prefix from public.artist_funds where code = 'ROTILI') <> 'AR'
     or (select prefix from public.artist_funds where code = 'RUIZ_CAMPINS') <> 'RC'
     or (select prefix from public.artist_funds where code = 'TEST') <> 'TS' then
    raise exception 'FAIL: los prefijos no coinciden con los de catalog_id';
  end if;
  raise notice 'OK: los tres fondos, con el prefijo que ya usan sus obras';
end $$;

-- ── The table's prefix is the one the base generates ────────
--
-- The two places where the fund→prefix correspondence lives are this table and
-- `next_catalog_id`'s `case`. While they are two, this is what ties them: if
-- somebody adds a fund to the enum and forgets the function, or the other way round, the
-- next identifier would come out with the wrong prefix and would get printed.
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

-- ── Every value of the enum has its row ─────────────────────
--
-- Adding a value to the enum without giving it a row here would leave artworks whose fund
-- has no name anywhere.
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

-- ── The code and the prefix are not changed ─────────────────
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

-- ── The name is corrected ───────────────────────────────────
do $$
declare v_name text;
begin
  update public.artist_funds set name = 'Alberto Rotili Pérez' where code = 'ROTILI'
  returning name into v_name;
  if v_name <> 'Alberto Rotili Pérez' then
    raise exception 'FAIL: no se ha podido renombrar el fondo';
  end if;
  update public.artist_funds set name = 'Alberto Rotili' where code = 'ROTILI';

  -- And blank it is not: a fund with no name names nothing.
  begin
    update public.artist_funds set name = '   ' where code = 'ROTILI';
    raise exception 'FAIL: se ha aceptado un nombre en blanco';
  exception when check_violation then
    null;
  end;
  raise notice 'OK: el nombre se corrige, y no se queda en blanco';
end $$;

-- ── The two switches are independent ────────────────────────
do $$
declare v_active boolean; v_hidden boolean;
begin
  -- Setting the artworks aside WITHOUT withdrawing the fund: it is still offered.
  update public.artist_funds set hide_artworks = true where code = 'TEST'
  returning active, hide_artworks into v_active, v_hidden;
  if not v_active or not v_hidden then
    raise exception 'FAIL: ocultar las obras ha tocado si el fondo se ofrece';
  end if;

  -- And withdrawing it without setting its artworks aside.
  update public.artist_funds set hide_artworks = false, active = false where code = 'TEST'
  returning active, hide_artworks into v_active, v_hidden;
  if v_active or v_hidden then
    raise exception 'FAIL: retirar el fondo ha apartado sus obras';
  end if;
  raise notice 'OK: retirar y apartar son dos cosas distintas';
end $$;

-- ── The withdrawal is stamped by the base ───────────────────
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

-- ── The catalogue cannot be left with no funds ──────────────
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

-- ── Neither creation nor deletion: there is no privilege ────
--
-- The platform grants every privilege of a new table to the anonymous
-- and authenticated roles. The closed-by-default test warns about the RLS part,
-- not about the `grant`s, so this is checked here.
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

-- ── A withdrawn fund IS STILL READ ──────────────────────────
--
-- It is where this table departs from the other master tables, and on purpose: every artwork
-- carries its fund, so hiding the withdrawn row would leave the fund of every artwork
-- opened by whoever only consults with no name.
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
