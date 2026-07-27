-- Tabla "Imágenes": identificador, unicidad de la imagen de índice, campo
-- calculado `fotografiada` y políticas.
-- RF-401 a RF-404, RF-210, RF-402, INC-14, INC-15.
\set ON_ERROR_STOP on
begin;

insert into public.obras (id_catalogacion, artista, titulo)
values ('AR-9500', 'ROTILI', 'Obra con fotos');

-- ── Identificador correlativo por obra (DP-02) ──────────────
do $$
declare v1 text; v2 text; v_otra text;
begin
  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  values ('AR-9500', 'm/1', 'd/1') returning id_imagen into v1;
  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  values ('AR-9500', 'm/2', 'd/2') returning id_imagen into v2;

  if v1 <> 'AR-9500_v1' or v2 <> 'AR-9500_v2' then
    raise exception 'FAIL: identificadores inesperados: %, %', v1, v2;
  end if;

  -- La numeración es por obra, no global: la primera foto de otra obra es _v1.
  insert into public.obras (id_catalogacion, artista, titulo)
  values ('AR-9501', 'ROTILI', 'Otra obra');
  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  values ('AR-9501', 'm/x', 'd/x') returning id_imagen into v_otra;
  if v_otra <> 'AR-9501_v1' then
    raise exception 'FAIL: la numeración no es independiente por obra: %', v_otra;
  end if;

  raise notice 'OK: identificadores correlativos e independientes por obra';
end $$;

-- Un ordinal retirado no se recicla: las referencias en notas o correos siguen
-- señalando a la misma toma.
do $$
declare v_nuevo text;
begin
  update public.imagenes set activo = false where id_imagen = 'AR-9500_v2';
  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  values ('AR-9500', 'm/3', 'd/3') returning id_imagen into v_nuevo;
  if v_nuevo = 'AR-9500_v2' then
    raise exception 'FAIL: se reutilizó el ordinal de una imagen retirada';
  end if;
  raise notice 'OK: el ordinal retirado no se recicla (nueva: %)', v_nuevo;
end $$;

-- ── RF-402 / INC-15: una sola imagen de índice por obra ─────
do $$
begin
  update public.imagenes set imagen_indice = true where id_imagen = 'AR-9500_v1';
  update public.imagenes set imagen_indice = true where id_imagen = 'AR-9500_v3';
  raise exception 'FAIL: dos imágenes activas de la misma obra quedaron marcadas como índice';
exception
  when unique_violation then
    raise notice 'OK: la base impide dos imágenes de índice en la misma obra';
end $$;

-- Pero dos obras distintas pueden tener cada una la suya: el índice es parcial y
-- por obra, no global.
do $$
begin
  update public.imagenes set imagen_indice = true where id_imagen = 'AR-9501_v1';
  raise notice 'OK: cada obra tiene su propia imagen de índice';
end $$;

-- Dar de baja la imagen de índice la desmarca: si no, el índice visual mostraría
-- una foto que ya no aparece en la ficha.
do $$
begin
  update public.imagenes set activo = false where id_imagen = 'AR-9500_v1';
  if (select imagen_indice from public.imagenes where id_imagen = 'AR-9500_v1') then
    raise exception 'FAIL: una imagen dada de baja sigue marcada como índice';
  end if;
  raise notice 'OK: dar de baja la imagen de índice la desmarca';
end $$;

-- ── RF-210 e INC-14: `fotografiada` solo cuenta las activas ─
do $$
declare v_foto boolean;
begin
  insert into public.obras (id_catalogacion, artista, titulo)
  values ('AR-9502', 'ROTILI', 'Para comprobar fotografiada');

  select fotografiada into v_foto from public.obras where id_catalogacion = 'AR-9502';
  if v_foto then
    raise exception 'FAIL: una obra sin imágenes aparece como fotografiada';
  end if;

  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  values ('AR-9502', 'm/a', 'd/a');
  select fotografiada into v_foto from public.obras where id_catalogacion = 'AR-9502';
  if not v_foto then
    raise exception 'FAIL: con una imagen activa debería estar fotografiada';
  end if;

  -- INC-14: el hueco que el esquema no contemplaba. Si la única imagen se retira,
  -- la obra deja de estar fotografiada; en caso contrario aparecería como
  -- fotografiada sin que se le vea ninguna foto.
  update public.imagenes set activo = false where id_catalogacion = 'AR-9502';
  select fotografiada into v_foto from public.obras where id_catalogacion = 'AR-9502';
  if v_foto then
    raise exception 'FAIL: la obra sigue fotografiada con su única imagen de baja';
  end if;

  -- Y al restaurarla, vuelve.
  update public.imagenes set activo = true where id_catalogacion = 'AR-9502';
  select fotografiada into v_foto from public.obras where id_catalogacion = 'AR-9502';
  if not v_foto then
    raise exception 'FAIL: restaurar la imagen no devolvió el estado fotografiada';
  end if;

  raise notice 'OK: fotografiada solo cuenta las imágenes activas (INC-14)';
end $$;

-- Recalcular no debe ensuciar la traza de la obra: si `fecha_actualizacion` se
-- moviera cada vez que alguien toca una foto, dejaría de significar «cuándo se
-- editó la ficha».
do $$
declare v_antes timestamptz; v_despues timestamptz;
begin
  select fecha_actualizacion into v_antes from public.obras where id_catalogacion = 'AR-9502';
  perform pg_sleep(0.01);
  -- Segunda imagen: `fotografiada` ya era true, así que no debe haber escritura.
  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  values ('AR-9502', 'm/b', 'd/b');
  select fecha_actualizacion into v_despues from public.obras where id_catalogacion = 'AR-9502';
  if v_despues is distinct from v_antes then
    raise exception 'FAIL: añadir una foto movió fecha_actualizacion de la obra';
  end if;
  raise notice 'OK: el recálculo no toca la ficha si el valor no cambia';
end $$;

-- ── Políticas ───────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'cat-img@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'lec-img@test.local');
update public.perfiles set rol = 'CATALOGADOR' where id = '00000000-0000-0000-0000-0000000000f1';
update public.perfiles set rol = 'LECTOR'      where id = '00000000-0000-0000-0000-0000000000f2';

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
  set local role authenticated;
  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  values ('AR-9500', 'm/z', 'd/z');
  raise exception 'FAIL: el lector pudo subir una imagen';
exception
  when insufficient_privilege then
    raise notice 'OK: el lector no puede añadir imágenes';
end $$;

reset role;

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
  set local role authenticated;
  -- Las imágenes de baja no se le muestran, igual que las obras (RF-609).
  select count(*) into v_n from public.imagenes where id_imagen = 'AR-9500_v1';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve una imagen dada de baja';
  end if;
  raise notice 'OK: el lector no ve las imágenes retiradas';
end $$;

reset role;

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
  set local role authenticated;
  delete from public.imagenes where id_imagen = 'AR-9500_v3';
  raise exception 'FAIL: se pudo borrar de verdad una imagen';
exception
  when insufficient_privilege then
    raise notice 'OK: el borrado real de imágenes está negado: el máster no se recupera';
end $$;

reset role;

-- ── El bucket no es público ─────────────────────────────────
do $$
begin
  if (select public from storage.buckets where id = 'obras') then
    raise exception 'FAIL: el bucket «obras» es público y RF-110 exige URL firmada';
  end if;
  raise notice 'OK: el bucket es privado';
end $$;

-- ── Las fichas del fondo TEST también llevan fotos (RF-202, RF-401) ─────────
-- Incidencia real (28/07/2026): la migración del fondo TS- actualizó el formato
-- de obras pero no el de id_imagen, y en producción ninguna foto de una ficha
-- TS- podía registrarse. Este bloque la reproduce.
do $$
declare v_ts text;
begin
  insert into public.obras (artista, titulo) values ('TEST', 'Ensayo con fotos');
  insert into public.imagenes (id_catalogacion, ruta_miniatura, ruta_derivada)
  select id_catalogacion, 'm/ts', 'd/ts' from public.obras where artista = 'TEST'
  returning id_imagen into v_ts;
  if v_ts !~ '^TS-[0-9]{4}_v1$' then
    raise exception 'FAIL: identificador inesperado para la imagen del fondo TEST: %', v_ts;
  end if;
  raise notice 'OK: una ficha TS- admite imágenes (%)', v_ts;
end $$;

rollback;
