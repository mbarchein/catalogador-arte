-- RF-409, RF-410: las cuatro esquinas de la obra y la procedencia del encuadre.
--
-- Lo que se comprueba es lo que el `check` puede comprobar y el cliente no debe
-- volver a comprobar: que media perspectiva no existe, que una esquina no se va a
-- cualquier parte, que el cuadrilátero no se cruza consigo mismo —rectificar un
-- lazo da una imagen doblada, y eso solo se descubre al abrir la ficha— y que el
-- recorte y las esquinas conviven, que es lo que permite desplegar en una fase.
\set ON_ERROR_STOP on
begin;

-- Fixtures: un catalogador, una obra y una imagen suya.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'cat-perspectiva@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';

do $$
declare v_obra text;
begin
  insert into public.artworks (artist, title, attributed_title)
  values ('ROTILI', 'la de la perspectiva', 'UNCONFIRMED')
  returning catalog_id into v_obra;

  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
  values (v_obra, 'p/min.webp', 'p/der.webp', 'p/master.jpg', 'GENERAL');
end $$;

-- ── 1. Las ocho o ninguna ────────────────────────────────────
-- Media perspectiva no es «un poco corregida»: es un cuadrilátero que nadie puede
-- dibujar, y llegaría así al pipeline del catálogo impreso.
do $$
declare v_id text;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  begin
    update public.images set corner_nw_x = 0.1, corner_nw_y = 0.1 where image_id = v_id;
    raise exception 'FAIL: han entrado dos esquinas de las ocho';
  exception when check_violation then
    raise notice 'OK: media perspectiva se rechaza';
  end;

  -- Y las ocho juntas entran.
  update public.images set
    corner_nw_x = 0.10, corner_nw_y = 0.12,
    corner_ne_x = 0.88, corner_ne_y = 0.08,
    corner_se_x = 0.90, corner_se_y = 0.91,
    corner_sw_x = 0.12, corner_sw_y = 0.95
   where image_id = v_id;
  raise notice 'OK: las ocho esquinas juntas entran';
end $$;

-- ── 2. Una esquina puede salirse de la foto, pero no irse ────
-- En cinco fotografías del lote los lados de la obra no están dentro del
-- encuadre, y arrastrar la esquina fuera del borde es la única forma de
-- rectificarlas. Lo que no vale es irse a cualquier parte.
do $$
declare v_id text;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  update public.images set corner_nw_x = -0.2, corner_nw_y = -0.15 where image_id = v_id;
  raise notice 'OK: una esquina fuera del borde es legítima';

  begin
    update public.images set corner_nw_x = -3 where image_id = v_id;
    raise exception 'FAIL: una esquina se ha ido a -3';
  exception when check_violation then
    raise notice 'OK: una esquina no se va más allá del margen';
  end;

  update public.images set corner_nw_x = 0.10, corner_nw_y = 0.12 where image_id = v_id;
end $$;

-- ── 3. El cuadrilátero no se cruza consigo mismo ─────────────
-- Sale de arrastrar una esquina por encima de su vecina, y rectificarlo produce
-- una imagen doblada. El área con signo lo caza sin necesidad de trigonometría.
do $$
declare v_id text;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  begin
    -- Las dos esquinas de arriba cruzadas: NE a la izquierda de NW.
    update public.images set
      corner_nw_x = 0.9, corner_nw_y = 0.1,
      corner_ne_x = 0.1, corner_ne_y = 0.1
     where image_id = v_id;
    raise exception 'FAIL: ha entrado un cuadrilátero cruzado';
  exception when check_violation then
    raise notice 'OK: un cuadrilátero que se cruza se rechaza';
  end;

  begin
    -- El caso que la primera versión de la restricción ACEPTABA: cruza dos lados y
    -- conserva 0,332 de área con signo, porque un polígono autointersectado mantiene
    -- área positiva cuando gana su lóbulo mayor. El área nunca fue una prueba de que
    -- no se cruce; la convexidad sí (20260801180000).
    update public.images set
      corner_nw_x = 0.95, corner_nw_y = 0.16,
      corner_ne_x = 0.70, corner_ne_y = 0.15,
      corner_se_x = 0.85, corner_se_y = 0.90,
      corner_sw_x = 0.15, corner_sw_y = 0.90
     where image_id = v_id;
    raise exception 'FAIL: ha entrado un cruce que el área con signo no ve';
  exception when check_violation then
    raise notice 'OK: un cruce con área positiva también se rechaza';
  end;

  begin
    -- Y uno degenerado: las cuatro esquinas en el mismo punto.
    update public.images set
      corner_nw_x = 0.5, corner_nw_y = 0.5, corner_ne_x = 0.5, corner_ne_y = 0.5,
      corner_se_x = 0.5, corner_se_y = 0.5, corner_sw_x = 0.5, corner_sw_y = 0.5
     where image_id = v_id;
    raise exception 'FAIL: ha entrado un cuadrilátero de área cero';
  exception when check_violation then
    raise notice 'OK: un cuadrilátero degenerado se rechaza';
  end;
end $$;

-- ── 4. El recorte y las esquinas conviven ────────────────────
-- Es lo que permite desplegar en una fase: las filas que ya tienen recorte lo
-- conservan, el frontend viejo sigue leyéndolas, y las columnas nuevas nacen
-- nulas. La precedencia —si hay esquinas, mandan— la aplica el cliente, porque
-- es una decisión de renderizado y no una regla de integridad.
do $$
declare v_id text; v_x numeric; v_nw numeric;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  update public.images set
    crop_x = 0.1, crop_y = 0.1, crop_width = 0.8, crop_height = 0.8,
    corner_nw_x = 0.10, corner_nw_y = 0.12,
    corner_ne_x = 0.88, corner_ne_y = 0.08,
    corner_se_x = 0.90, corner_se_y = 0.91,
    corner_sw_x = 0.12, corner_sw_y = 0.95
   where image_id = v_id;

  select crop_x, corner_nw_x into v_x, v_nw from public.images where image_id = v_id;
  if v_x is null or v_nw is null then
    raise exception 'FAIL: el recorte y las esquinas no conviven';
  end if;
  raise notice 'OK: el recorte y las esquinas conviven en la misma fila';
end $$;

-- ── 5. La procedencia del encuadre ───────────────────────────
-- Las filas anteriores a la columna se quedan en nulo, que es «no se sabe». Poner
-- 'MANUAL' por omisión sería inventar el dato, y es justo el dato que hizo falta
-- inferir para medir el detector.
do $$
declare v_id text; v_fuente public.crop_source; v_viejas int;
begin
  select image_id into v_id from public.images where master_path = 'p/master.jpg';

  select crop_source into v_fuente from public.images where image_id = v_id;
  if v_fuente is not null then
    raise exception 'FAIL: la procedencia no nace desconocida (%)', v_fuente;
  end if;

  update public.images set crop_source = 'SUGGESTED_ADJUSTED' where image_id = v_id;
  select crop_source into v_fuente from public.images where image_id = v_id;
  if v_fuente <> 'SUGGESTED_ADJUSTED' then
    raise exception 'FAIL: la procedencia no se ha guardado';
  end if;

  begin
    update public.images set crop_source = 'INVENTADO' where image_id = v_id;
    raise exception 'FAIL: ha entrado una procedencia que no existe';
  exception when invalid_text_representation then
    raise notice 'OK: la procedencia es un enumerado cerrado';
  end;

  -- Y sobre una base cargada con el volcado: ninguna fila anterior se ha
  -- rellenado sola. Sobre una base recién migrada esto no dice nada, y es
  -- correcto que no lo diga.
  select count(*) into v_viejas
    from public.images
   where crop_width is not null and crop_source is not null and image_id <> v_id;
  if v_viejas > 0 then
    raise exception 'FAIL: % filas antiguas tienen una procedencia inventada', v_viejas;
  end if;
  raise notice 'OK: la procedencia queda desconocida en lo que ya existía';
end $$;

rollback;
