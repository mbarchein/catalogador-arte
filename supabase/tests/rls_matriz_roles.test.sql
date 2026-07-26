-- RF-103, RF-105, RF-106, RF-109: qué puede hacer cada rol sobre obras.
--
-- Se comprueba autenticándose de verdad como un usuario de cada rol y ejecutando
-- consultas reales. Comprobar que la política existe no verifica nada: lo que
-- importa es qué devuelve la base cuando la petición llega de quien llega.
\set ON_ERROR_STOP on
begin;

-- Fixtures: un usuario por rol. El trigger de auth.users crea el perfil.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cat@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'lec@test.local');

update public.perfiles set rol = 'CATALOGADOR' where id = '00000000-0000-0000-0000-0000000000c1';
update public.perfiles set rol = 'LECTOR'      where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.obras (id_catalogacion, artista, titulo)
values ('AR-9001', 'ROTILI', 'Obra activa de prueba');

insert into public.obras (id_catalogacion, artista, titulo, activo)
values ('AR-9002', 'ROTILI', 'Obra de baja de prueba', false);

-- ── Catalogador ─────────────────────────────────────────────

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;

  -- RF-906: quien puede editar ve también la papelera.
  select count(*) into v_n from public.obras where id_catalogacion in ('AR-9001', 'AR-9002');
  if v_n <> 2 then
    raise exception 'FAIL: el catalogador debería ver la obra activa y la de baja, ve %', v_n;
  end if;

  -- RF-103: puede crear.
  insert into public.obras (artista, titulo) values ('ROTILI', 'Alta del catalogador');

  -- RF-103: puede editar lo que creó otro.
  update public.obras set titulo = 'Editada por el catalogador' where id_catalogacion = 'AR-9001';

  raise notice 'OK: el catalogador lee papelera incluida, crea y edita';
end $$;

reset role;

-- ── Lector ──────────────────────────────────────────────────

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;

  -- RF-105: lee las obras activas.
  select count(*) into v_n from public.obras where id_catalogacion = 'AR-9001';
  if v_n <> 1 then
    raise exception 'FAIL: el lector debería ver la obra activa';
  end if;

  -- RF-609: no ve las dadas de baja.
  select count(*) into v_n from public.obras where id_catalogacion = 'AR-9002';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve una ficha dada de baja';
  end if;

  raise notice 'OK: el lector lee las activas y no ve la papelera';
end $$;

reset role;

-- RF-106: el lector no escribe. Se comprueba atacando la base directamente, no
-- mirando si la interfaz esconde el botón: un botón oculto no es una protección.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  insert into public.obras (artista, titulo) values ('ROTILI', 'Alta indebida del lector');
  raise exception 'FAIL: el lector pudo dar de alta una obra';
exception
  when insufficient_privilege then
    raise notice 'OK: el lector no puede dar de alta';
end $$;

reset role;

do $$
declare v_afectadas integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  set local role authenticated;
  update public.obras set titulo = 'Edición indebida' where id_catalogacion = 'AR-9001';
  get diagnostics v_afectadas = row_count;
  -- Un UPDATE que la política de USING no deja ver no falla: no afecta a ninguna
  -- fila. Ese silencio es el comportamiento correcto, y hay que afirmarlo.
  if v_afectadas <> 0 then
    raise exception 'FAIL: el lector modificó % fila(s)', v_afectadas;
  end if;
  raise notice 'OK: el update del lector no afecta a ninguna fila';
end $$;

reset role;

-- RF-901: nadie borra, ni siquiera quien puede editar.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
  set local role authenticated;
  delete from public.obras where id_catalogacion = 'AR-9001';
  raise exception 'FAIL: se pudo borrar una obra de verdad';
exception
  when insufficient_privilege then
    raise notice 'OK: el borrado real está negado incluso al catalogador';
end $$;

reset role;
rollback;
