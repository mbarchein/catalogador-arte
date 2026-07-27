-- Structured date (ADR-004): the generated column, its constraints and the
-- search-by-decade query that motivated the whole change.
\set ON_ERROR_STOP on
begin;

-- ── The generated column composes the eight formats ──────────
do $$
declare
  t_case record;
  v_text text;
begin
  for t_case in
    select * from (values
      (1978, null::int, false, false, '1978'),
      (1978, null, false, true,  '1978 [?]'),
      (1975, 1978, false, false, '1975-1978'),
      (1975, 1978, false, true,  '1975-1978 [?]'),
      (1980, null, true,  false, 'c. 1980'),
      (1980, null, true,  true,  'c. 1980 [?]'),
      (1975, 1978, true,  false, 'c. 1975-1978'),
      (1975, 1978, true,  true,  'c. 1975-1978 [?]')
    ) as t(start_y, end_y, approx, doubtful, expected)
  loop
    insert into public.artworks (artist, title, start_year, end_year, approximate_date, unconfirmed_date)
    values ('ROTILI', 'combo', t_case.start_y, t_case.end_y, t_case.approx, t_case.doubtful)
    returning execution_date into v_text;
    if v_text <> t_case.expected then
      raise exception 'FAIL: expected «%», composed «%»', t_case.expected, v_text;
    end if;
  end loop;
  raise notice 'OK: the generated column composes the eight formats';
end $$;

-- ── No year: empty text, even with flags (there cannot be any) ─
do $$
declare v_text text;
begin
  insert into public.artworks (artist, title) values ('ROTILI', 'sin fechar')
  returning execution_date into v_text;
  if v_text <> '' then
    raise exception 'FAIL: without a year it had to compose empty, composed «%»', v_text;
  end if;
  raise notice 'OK: an undated artwork composes empty text';
end $$;

-- ── The note outranks the composition ────────────────────────
-- "Finales de los setenta" says something 1975-1979 does not: if someone wrote
-- it, that is what gets published. The years keep serving search.
do $$
declare v_text text; v_year smallint;
begin
  insert into public.artworks (artist, title, start_year, date_note)
  values ('ROTILI', 'con nota', 1975, 'finales de los setenta')
  returning execution_date, start_year into v_text, v_year;
  if v_text <> 'finales de los setenta' then
    raise exception 'FAIL: the note had to win, composed «%»', v_text;
  end if;
  if v_year <> 1975 then
    raise exception 'FAIL: the search year had to be kept';
  end if;
  raise notice 'OK: the note wins in the record and the year keeps serving search';
end $$;

-- ── The generated column cannot be written ───────────────────
-- It is the guarantee that text and structure never diverge: there is no path.
do $$
begin
  insert into public.artworks (artist, title, execution_date)
  values ('ROTILI', 'escritura directa', '1999');
  raise exception 'FAIL: the generated column could be written';
exception
  when generated_always then
    raise notice 'OK: execution_date cannot be written directly';
end $$;

-- ── Constraints ──────────────────────────────────────────────
do $$
begin
  insert into public.artworks (artist, title, start_year, end_year)
  values ('ROTILI', 'rango invertido', 1978, 1975);
  raise exception 'FAIL: an inverted range was accepted';
exception
  when check_violation then
    raise notice 'OK: an inverted range is rejected';
end $$;

do $$
begin
  insert into public.artworks (artist, title, start_year, end_year)
  values ('ROTILI', 'rango degenerado', 1978, 1978);
  raise exception 'FAIL: a single-year range was accepted';
exception
  when check_violation then
    raise notice 'OK: a range that does not advance is rejected (that is an exact year)';
end $$;

do $$
begin
  insert into public.artworks (artist, title, approximate_date)
  values ('ROTILI', 'bandera sin año', true);
  raise exception 'FAIL: «approximate» was accepted without any year';
exception
  when check_violation then
    raise notice 'OK: the flags require a year to speak about';
end $$;

do $$
begin
  insert into public.artworks (artist, title, start_year)
  values ('ROTILI', 'errata de milenio', 197);
  raise exception 'FAIL: the year 197 was accepted';
exception
  when check_violation then
    raise notice 'OK: an implausible year is rejected as a typo';
end $$;

-- ── The search by decade, which is the point of all this ─────
-- With its own fixtures, not with the seed: the seed data is moved around by
-- the interface tests, and a test depending on it fails for reasons unrelated
-- to what it verifies.
do $$
declare v_ids text;
begin
  insert into public.artworks (catalog_id, artist, title, start_year, end_year) values
    ('AR-9801', 'ROTILI', 'época: dentro por rango', 1968, 1972),
    ('AR-9802', 'ROTILI', 'época: dentro exacto', 1975, null),
    ('AR-9803', 'ROTILI', 'época: fuera', 1981, null);

  select string_agg(catalog_id, ',' order by catalog_id) into v_ids
    from public.artworks
   where active
     and catalog_id in ('AR-9801', 'AR-9802', 'AR-9803')
     -- overlap with the 1970-1979 decade, not equality
     and start_year <= 1979
     and coalesce(end_year, start_year) >= 1970;

  if v_ids is distinct from 'AR-9801,AR-9802' then
    raise exception 'FAIL: the decade query returned «%»', v_ids;
  end if;
  raise notice 'OK: "seventies artwork" is now a query, not a hope';
end $$;

-- ── fecha_orden is really gone ───────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'artworks' and column_name = 'fecha_orden'
  ) then
    raise exception 'FAIL: fecha_orden still exists';
  end if;
  raise notice 'OK: fecha_orden removed; start_year does its job';
end $$;

rollback;
