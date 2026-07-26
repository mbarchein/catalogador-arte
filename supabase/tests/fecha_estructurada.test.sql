-- Fecha estructurada (ADR-004): la columna generada, sus restricciones y la
-- búsqueda por época que motivó todo el cambio.
\set ON_ERROR_STOP on
begin;

-- ── La columna generada compone los ocho formatos ───────────
do $$
declare
  caso record;
  v_texto text;
begin
  for caso in
    select * from (values
      (1978, null::int, false, false, '1978'),
      (1978, null, false, true,  '1978 [?]'),
      (1975, 1978, false, false, '1975-1978'),
      (1975, 1978, false, true,  '1975-1978 [?]'),
      (1980, null, true,  false, 'c. 1980'),
      (1980, null, true,  true,  'c. 1980 [?]'),
      (1975, 1978, true,  false, 'c. 1975-1978'),
      (1975, 1978, true,  true,  'c. 1975-1978 [?]')
    ) as t(inicio, fin, aprox, dudosa, esperado)
  loop
    insert into public.obras (artista, titulo, anio_inicio, anio_fin, fecha_aproximada, fecha_sin_confirmar)
    values ('ROTILI', 'combo', caso.inicio, caso.fin, caso.aprox, caso.dudosa)
    returning fecha_ejecucion into v_texto;
    if v_texto <> caso.esperado then
      raise exception 'FAIL: esperaba «%», compuso «%»', caso.esperado, v_texto;
    end if;
  end loop;
  raise notice 'OK: la columna generada compone los ocho formatos';
end $$;

-- ── Sin año: texto vacío, aunque hubiera banderas (no puede haberlas) ──
do $$
declare v_texto text;
begin
  insert into public.obras (artista, titulo) values ('ROTILI', 'sin fechar')
  returning fecha_ejecucion into v_texto;
  if v_texto <> '' then
    raise exception 'FAIL: sin año debía componer vacío, compuso «%»', v_texto;
  end if;
  raise notice 'OK: obra sin fechar compone texto vacío';
end $$;

-- ── La nota manda sobre la composición ──────────────────────
-- «Finales de los setenta» dice algo que 1975-1979 no dice: si alguien lo
-- escribió, eso es lo que se publica. Los años siguen sirviendo para buscar.
do $$
declare v_texto text; v_anio smallint;
begin
  insert into public.obras (artista, titulo, anio_inicio, fecha_nota)
  values ('ROTILI', 'con nota', 1975, 'finales de los setenta')
  returning fecha_ejecucion, anio_inicio into v_texto, v_anio;
  if v_texto <> 'finales de los setenta' then
    raise exception 'FAIL: la nota debía mandar, compuso «%»', v_texto;
  end if;
  if v_anio <> 1975 then
    raise exception 'FAIL: el año de búsqueda debía conservarse';
  end if;
  raise notice 'OK: la nota manda en la ficha y el año sigue sirviendo para buscar';
end $$;

-- ── La columna generada no se puede escribir ────────────────
-- Es la garantía de que texto y estructura no divergen jamás: no hay camino.
do $$
begin
  insert into public.obras (artista, titulo, fecha_ejecucion)
  values ('ROTILI', 'escritura directa', '1999');
  raise exception 'FAIL: se pudo escribir la columna generada';
exception
  when generated_always then
    raise notice 'OK: fecha_ejecucion no se puede escribir directamente';
end $$;

-- ── Restricciones ───────────────────────────────────────────
do $$
begin
  insert into public.obras (artista, titulo, anio_inicio, anio_fin)
  values ('ROTILI', 'rango invertido', 1978, 1975);
  raise exception 'FAIL: se admitió un rango invertido';
exception
  when check_violation then
    raise notice 'OK: un rango invertido se rechaza';
end $$;

do $$
begin
  insert into public.obras (artista, titulo, anio_inicio, anio_fin)
  values ('ROTILI', 'rango degenerado', 1978, 1978);
  raise exception 'FAIL: se admitió un rango de un solo año';
exception
  when check_violation then
    raise notice 'OK: un rango que no avanza se rechaza (eso es un año exacto)';
end $$;

do $$
begin
  insert into public.obras (artista, titulo, fecha_aproximada)
  values ('ROTILI', 'bandera sin año', true);
  raise exception 'FAIL: se admitió «aproximada» sin ningún año';
exception
  when check_violation then
    raise notice 'OK: las banderas exigen un año del que hablar';
end $$;

do $$
begin
  insert into public.obras (artista, titulo, anio_inicio)
  values ('ROTILI', 'errata de milenio', 197);
  raise exception 'FAIL: se admitió el año 197';
exception
  when check_violation then
    raise notice 'OK: un año implausible se rechaza como errata';
end $$;

-- ── La búsqueda por época, que es el porqué de todo esto ────
-- Con fixtures propios, no con la semilla: los datos de la semilla los mueven
-- las pruebas de interfaz, y un test que depende de ellos falla por motivos
-- ajenos a lo que verifica.
do $$
declare v_ids text;
begin
  insert into public.obras (id_catalogacion, artista, titulo, anio_inicio, anio_fin) values
    ('AR-9801', 'ROTILI', 'época: dentro por rango', 1968, 1972),
    ('AR-9802', 'ROTILI', 'época: dentro exacto', 1975, null),
    ('AR-9803', 'ROTILI', 'época: fuera', 1981, null);

  select string_agg(id_catalogacion, ',' order by id_catalogacion) into v_ids
    from public.obras
   where activo
     and id_catalogacion in ('AR-9801', 'AR-9802', 'AR-9803')
     -- solapamiento con la década 1970-1979, no igualdad
     and anio_inicio <= 1979
     and coalesce(anio_fin, anio_inicio) >= 1970;

  if v_ids is distinct from 'AR-9801,AR-9802' then
    raise exception 'FAIL: la consulta de época devolvió «%»', v_ids;
  end if;
  raise notice 'OK: «obra de los setenta» ya es una consulta, no una esperanza';
end $$;

-- ── fecha_orden ha desaparecido de verdad ───────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'obras' and column_name = 'fecha_orden'
  ) then
    raise exception 'FAIL: fecha_orden sigue existiendo';
  end if;
  raise notice 'OK: fecha_orden eliminada; anio_inicio hace su trabajo';
end $$;

rollback;
