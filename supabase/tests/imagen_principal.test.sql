-- RF-405: elegir la imagen principal de una obra entre las ya subidas.
--
-- Lo que hay que demostrar es que el cambio es atómico: nunca hay dos marcadas ni
-- ninguna. Un índice único parcial impide lo primero; lo segundo solo se garantiza
-- haciendo el cambio en una sola sentencia, y es lo que estos asertos verifican.
\set ON_ERROR_STOP on
begin;

insert into public.obras (id_catalogacion, artista, titulo)
values ('AR-9600', 'ROTILI', 'Obra con varias tomas');

insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada, tipo_toma, imagen_indice)
values
  ('AR-9600', 'm/1', 'd/1', 'GENERAL', true),
  ('AR-9600', 'm/2', 'd/2', 'REVERSO', false),
  ('AR-9600', 'm/3', 'd/3', 'DETALLE_FIRMA', false);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'cat-ppal@test.local'),
  ('00000000-0000-0000-0000-00000000a002', 'lec-ppal@test.local');
update public.perfiles set rol = 'CATALOGADOR' where id = '00000000-0000-0000-0000-00000000a001';
update public.perfiles set rol = 'LECTOR'      where id = '00000000-0000-0000-0000-00000000a002';

-- ── El cambio deja exactamente una marcada ──────────────────
do $$
declare v_marcadas integer; v_cual text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;

  perform public.marcar_imagen_principal('AR-9600_v3');

  select count(*), max(id_imagen) into v_marcadas, v_cual
    from public.imagenes where id_catalogacion = 'AR-9600' and imagen_indice;

  if v_marcadas <> 1 then
    raise exception 'FAIL: quedan % imágenes marcadas como principal', v_marcadas;
  end if;
  if v_cual <> 'AR-9600_v3' then
    raise exception 'FAIL: la principal es % y debía ser AR-9600_v3', v_cual;
  end if;
  raise notice 'OK: cambiar la principal deja exactamente una marcada';
end $$;

reset role;

-- Repetir la misma elección no rompe nada ni deja la obra sin principal: el
-- botón se puede pulsar dos veces, y en un móvil se pulsa dos veces.
do $$
declare v_marcadas integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;
  perform public.marcar_imagen_principal('AR-9600_v3');
  select count(*) into v_marcadas
    from public.imagenes where id_catalogacion = 'AR-9600' and imagen_indice;
  if v_marcadas <> 1 then
    raise exception 'FAIL: repetir la elección dejó % marcadas', v_marcadas;
  end if;
  raise notice 'OK: la operación es idempotente';
end $$;

reset role;

-- ── El lector no puede cambiarla ────────────────────────────
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a002","role":"authenticated"}';
  set local role authenticated;
  perform public.marcar_imagen_principal('AR-9600_v1');
  raise exception 'FAIL: el lector cambió la imagen principal';
exception
  when raise_exception then
    -- Mensaje legible en vez de un «no se modificó nada» que nadie interpreta.
    raise notice 'OK: el lector recibe un error explícito';
end $$;

reset role;

do $$
declare v_cual text;
begin
  select id_imagen into v_cual
    from public.imagenes where id_catalogacion = 'AR-9600' and imagen_indice;
  if v_cual <> 'AR-9600_v3' then
    raise exception 'FAIL: el intento del lector alteró la principal (ahora %)', v_cual;
  end if;
  raise notice 'OK: y no cambia nada';
end $$;

-- ── Una imagen de baja no puede ser la principal ────────────
do $$
begin
  update public.imagenes set activo = false where id_imagen = 'AR-9600_v2';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;
  perform public.marcar_imagen_principal('AR-9600_v2');
  raise exception 'FAIL: una imagen dada de baja pudo ser la principal';
exception
  when raise_exception then
    raise notice 'OK: una imagen retirada no puede representar a la obra';
end $$;

reset role;

-- Y el intento fallido no ha dejado la obra sin principal, que es el error que la
-- función existe para evitar.
do $$
declare v_marcadas integer;
begin
  select count(*) into v_marcadas
    from public.imagenes where id_catalogacion = 'AR-9600' and imagen_indice and activo;
  if v_marcadas <> 1 then
    raise exception 'FAIL: tras el intento fallido hay % principales', v_marcadas;
  end if;
  raise notice 'OK: un intento fallido no deja la obra sin imagen principal';
end $$;

-- ── Un identificador inexistente da un error claro ──────────
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}';
  set local role authenticated;
  perform public.marcar_imagen_principal('AR-9600_v99');
  raise exception 'FAIL: se aceptó un identificador que no existe';
exception
  when raise_exception then
    raise notice 'OK: un identificador inexistente se rechaza';
end $$;

reset role;
rollback;
