-- RF-202 y DP-01: asignación automática del identificador de catalogación.
--
-- Es el dato más delicado del esquema: clave primaria, etiqueta física pegada a
-- la obra real y eje de todas las tablas relacionadas. Un duplicado o un salto
-- silencioso aquí se propaga al mundo físico.
\set ON_ERROR_STOP on
begin;

-- ── Secuencial e independiente por fondo ────────────────────
do $$
declare
  v_uno text;
  v_dos text;
  v_rc  text;
begin
  insert into public.obras (artista, titulo) values ('ROTILI', 'Primera')
    returning id_catalogacion into v_uno;
  insert into public.obras (artista, titulo) values ('ROTILI', 'Segunda')
    returning id_catalogacion into v_dos;
  insert into public.obras (artista, titulo) values ('RUIZ_CAMPINS', 'De Ruiz Campins')
    returning id_catalogacion into v_rc;

  -- La semilla deja AR-0001, AR-0002 y RC-0001, así que estas continúan la serie.
  if v_uno !~ '^AR-[0-9]{4}$' then
    raise exception 'FAIL: formato inesperado: %', v_uno;
  end if;
  if substring(v_dos from 4)::integer <> substring(v_uno from 4)::integer + 1 then
    raise exception 'FAIL: la serie no es consecutiva: % → %', v_uno, v_dos;
  end if;
  if v_rc !~ '^RC-[0-9]{4}$' then
    raise exception 'FAIL: el fondo Ruiz Campins debe usar prefijo RC: %', v_rc;
  end if;

  raise notice 'OK: numeración secuencial e independiente por fondo (%, %, %)', v_uno, v_dos, v_rc;
end $$;

-- ── Un identificador retirado no se recicla (RF-908) ────────
-- La baja lógica conserva la fila, así que el contador sigue contándola. Que el
-- número quede retirado es la garantía de que una etiqueta física antigua nunca
-- señale a una obra distinta.
do $$
declare
  v_dado_de_baja text;
  v_siguiente    text;
begin
  insert into public.obras (artista, titulo) values ('ROTILI', 'Se dará de baja')
    returning id_catalogacion into v_dado_de_baja;

  update public.obras set activo = false where id_catalogacion = v_dado_de_baja;

  insert into public.obras (artista, titulo) values ('ROTILI', 'Alta posterior')
    returning id_catalogacion into v_siguiente;

  if v_siguiente = v_dado_de_baja then
    raise exception 'FAIL: se reutilizó el identificador retirado %', v_dado_de_baja;
  end if;
  raise notice 'OK: % queda retirado, la siguiente alta es %', v_dado_de_baja, v_siguiente;
end $$;

-- ── Se respeta un identificador indicado a mano ─────────────
do $$
declare v_id text;
begin
  insert into public.obras (id_catalogacion, artista, titulo)
  values ('AR-8500', 'ROTILI', 'Numeración heredada de un inventario anterior')
    returning id_catalogacion into v_id;
  if v_id <> 'AR-8500' then
    raise exception 'FAIL: se ignoró el identificador explícito, se guardó %', v_id;
  end if;
  raise notice 'OK: se respeta el identificador indicado explícitamente';
end $$;

-- ── El prefijo no puede contradecir al fondo ────────────────
do $$
begin
  insert into public.obras (id_catalogacion, artista, titulo)
  values ('AR-8600', 'RUIZ_CAMPINS', 'Prefijo incoherente');
  raise exception 'FAIL: se admitió un prefijo AR para el fondo Ruiz Campins';
exception
  when check_violation then
    raise notice 'OK: el prefijo debe coincidir con el fondo';
end $$;

-- ── Formato inválido rechazado (RF-202) ─────────────────────
do $$
begin
  insert into public.obras (id_catalogacion, artista, titulo)
  values ('AR-1', 'ROTILI', 'Formato corto');
  raise exception 'FAIL: se admitió AR-1, que no cumple el formato de cuatro dígitos';
exception
  when check_violation then
    raise notice 'OK: el formato del identificador se valida';
end $$;

-- ── La previsualización coincide con lo que se asignaría ────
do $$
declare
  v_previsto text;
  v_real     text;
begin
  v_previsto := public.siguiente_id_catalogacion('RUIZ_CAMPINS');
  insert into public.obras (artista, titulo) values ('RUIZ_CAMPINS', 'Comprobación')
    returning id_catalogacion into v_real;
  if v_previsto <> v_real then
    raise exception 'FAIL: la previsualización dijo % y se asignó %', v_previsto, v_real;
  end if;
  raise notice 'OK: la previsualización de la interfaz coincide con lo asignado (%)', v_real;
end $$;

-- ── El fondo TEST usa su propia serie TS- (RF-202) ──────────
-- La semilla no trae obras de prueba, así que la serie empieza en TS-0001, y
-- ensayar en él no debe mover los contadores de los fondos reales.
do $$
declare
  v_test text;
begin
  insert into public.obras (artista, titulo) values ('TEST', 'Ficha de ensayo')
    returning id_catalogacion into v_test;
  if v_test <> 'TS-0001' then
    raise exception 'FAIL: la serie de pruebas debía empezar en TS-0001: %', v_test;
  end if;
  if public.siguiente_id_catalogacion('ROTILI') !~ '^AR-' then
    raise exception 'FAIL: la serie AR se contaminó con la de pruebas';
  end if;
  raise notice 'OK: el fondo TEST numera aparte (%)', v_test;
end $$;

-- ── El prefijo TS y el fondo TEST tampoco pueden contradecirse ──
do $$
begin
  insert into public.obras (id_catalogacion, artista, titulo)
  values ('AR-9998', 'TEST', 'Etiqueta mentirosa');
  raise exception 'FAIL: se admitió una obra TEST con prefijo AR';
exception
  when check_violation then
    raise notice 'OK: una obra TEST no puede llevar etiqueta AR';
end $$;

rollback;
