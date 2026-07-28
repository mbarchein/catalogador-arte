-- RF-202 and DP-01: automatic assignment of the catalog identifier.
--
-- It is the most delicate datum in the schema: primary key, physical label
-- glued to the real artwork and axis of every related table. A duplicate or a
-- silent skip here propagates to the physical world.
\set ON_ERROR_STOP on
begin;

-- ── Sequential and independent per fund ──────────────────────
do $$
declare
  v_one text;
  v_two text;
  v_rc  text;
begin
  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Primera', 'UNCONFIRMED')
    returning catalog_id into v_one;
  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Segunda', 'UNCONFIRMED')
    returning catalog_id into v_two;
  insert into public.artworks (artist, title, attributed_title) values ('RUIZ_CAMPINS', 'De Ruiz Campins', 'UNCONFIRMED')
    returning catalog_id into v_rc;

  -- The seed leaves AR-0001, AR-0002 and RC-0001, so these continue the series.
  if v_one !~ '^AR-[0-9]{4}$' then
    raise exception 'FAIL: unexpected format: %', v_one;
  end if;
  if substring(v_two from 4)::integer <> substring(v_one from 4)::integer + 1 then
    raise exception 'FAIL: the series is not consecutive: % → %', v_one, v_two;
  end if;
  if v_rc !~ '^RC-[0-9]{4}$' then
    raise exception 'FAIL: the Ruiz Campins fund must use the RC prefix: %', v_rc;
  end if;

  raise notice 'OK: sequential numbering, independent per fund (%, %, %)', v_one, v_two, v_rc;
end $$;

-- ── A retired identifier is not recycled (RF-908) ────────────
-- Logical deletion keeps the row, so the counter still counts it. Keeping the
-- number retired guarantees that an old physical label never points at a
-- different artwork.
do $$
declare
  v_deactivated text;
  v_next        text;
begin
  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Se dará de baja', 'UNCONFIRMED')
    returning catalog_id into v_deactivated;

  update public.artworks set active = false where catalog_id = v_deactivated;

  insert into public.artworks (artist, title, attributed_title) values ('ROTILI', 'Alta posterior', 'UNCONFIRMED')
    returning catalog_id into v_next;

  if v_next = v_deactivated then
    raise exception 'FAIL: the retired identifier % was reused', v_deactivated;
  end if;
  raise notice 'OK: % stays retired, the next record is %', v_deactivated, v_next;
end $$;

-- ── An explicitly provided identifier is respected ───────────
do $$
declare v_id text;
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-8500', 'ROTILI', 'Numeración heredada de un inventario anterior', 'UNCONFIRMED')
    returning catalog_id into v_id;
  if v_id <> 'AR-8500' then
    raise exception 'FAIL: the explicit identifier was ignored, % was stored', v_id;
  end if;
  raise notice 'OK: an explicitly provided identifier is respected';
end $$;

-- ── The prefix cannot contradict the fund ────────────────────
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-8600', 'RUIZ_CAMPINS', 'Prefijo incoherente', 'UNCONFIRMED');
  raise exception 'FAIL: an AR prefix was accepted for the Ruiz Campins fund';
exception
  when check_violation then
    raise notice 'OK: the prefix must match the fund';
end $$;

-- ── Invalid format rejected (RF-202) ─────────────────────────
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-1', 'ROTILI', 'Formato corto', 'UNCONFIRMED');
  raise exception 'FAIL: AR-1 was accepted, which does not meet the four-digit format';
exception
  when check_violation then
    raise notice 'OK: the identifier format is validated';
end $$;

-- ── The preview matches what would be assigned ───────────────
do $$
declare
  v_previewed text;
  v_actual    text;
begin
  v_previewed := public.next_catalog_id('RUIZ_CAMPINS');
  insert into public.artworks (artist, title, attributed_title) values ('RUIZ_CAMPINS', 'Comprobación', 'UNCONFIRMED')
    returning catalog_id into v_actual;
  if v_previewed <> v_actual then
    raise exception 'FAIL: the preview said % and % was assigned', v_previewed, v_actual;
  end if;
  raise notice 'OK: the interface preview matches what gets assigned (%)', v_actual;
end $$;

-- ── The TEST fund uses its own TS- series (RF-202) ───────────
-- The seed brings no test artworks, so the series starts at TS-0001, and
-- rehearsing on it must not move the counters of the real funds.
do $$
declare
  v_test text;
begin
  insert into public.artworks (artist, title, attributed_title) values ('TEST', 'Ficha de ensayo', 'UNCONFIRMED')
    returning catalog_id into v_test;
  if v_test <> 'TS-0001' then
    raise exception 'FAIL: the test series had to start at TS-0001: %', v_test;
  end if;
  if public.next_catalog_id('ROTILI') !~ '^AR-' then
    raise exception 'FAIL: the AR series got contaminated by the test one';
  end if;
  raise notice 'OK: the TEST fund numbers separately (%)', v_test;
end $$;

-- ── The TS prefix and the TEST fund cannot contradict either ──
do $$
begin
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9998', 'TEST', 'Etiqueta mentirosa', 'UNCONFIRMED');
  raise exception 'FAIL: a TEST artwork with an AR prefix was accepted';
exception
  when check_violation then
    raise notice 'OK: a TEST artwork cannot carry an AR label';
end $$;

rollback;
