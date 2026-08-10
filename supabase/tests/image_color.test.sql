-- RF-414, RF-416, RF-417, RF-418: a photograph's colour adjustment, the date
-- the file carries, the original's size and the provenance.
--
-- What is checked is what the `check` can check and the client must not
-- check again on its own: that no control goes in outside its scale
-- —a scale badly converted in the client would write an adjustment nobody
-- could reopen afterwards—, that the curve cannot be inverted or collapsed, that half
-- a point and half a size do not exist, and that a file date with no statement of whether it is
-- exact does not go in, because in that column the doubt is precisely the datum.
--
-- And two things that are not about values but about the deployment and about the
-- project's criterion: that a row written **with none of the new
-- columns** is still valid —it is what the old frontend does during the
-- seconds in which both versions are in the air, and it is what allows
-- deploying in one phase— and that null is not «reviewed and left alone», which is what
-- REVIEWED_UNCHANGED exists for.
--
-- Besides, every rejection is checked **by the name of the constraint that
-- rejects it**. It is the reason the migration wrote one constraint per
-- parameter instead of one big `check`: the only thing Postgres says on rejecting is
-- that name, and if every range shared a constraint, a rejected adjustment
-- would not say which control went off scale.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9601', 'ROTILI', 'Obra fotografiada con luz de bombilla', 'UNCONFIRMED');

-- ── 1. A row with none of the new columns is still valid ─────
-- It is the single-phase deployment's guarantee, and it is checked by writing
-- exactly what the frontend that does not know these columns writes.
do $$
declare v_row public.images;
begin
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path)
  values ('AR-9601', 'c/min.webp', 'c/der.webp', 'c/master.jpg')
  returning * into v_row;

  if num_nonnulls(
       v_row.color_temperature, v_row.color_tint, v_row.color_exposure,
       v_row.color_black, v_row.color_white, v_row.color_gamma, v_row.color_shoulder,
       v_row.color_neutral_x, v_row.color_neutral_y,
       v_row.color_clipped_low, v_row.color_clipped_high,
       v_row.color_reference, v_row.color_light,
       v_row.file_photo_date, v_row.file_photo_date_exact,
       v_row.original_width, v_row.original_height) <> 0 then
    raise exception 'FAIL: una foto nueva nace con algún parámetro de color puesto';
  end if;

  -- Null is identity, not unknown: both switches are born off
  -- because off is their identity value, not because their value is unknown.
  if v_row.color_gray then
    raise exception 'FAIL: una foto nueva nace en blanco y negro';
  end if;
  if v_row.color_inherited then
    raise exception 'FAIL: una foto nueva nace con el color heredado';
  end if;

  -- And the one colour column where null is NOT identity: «sin revisar» is not
  -- «no». A default value here would be inventing the datum this column
  -- exists in order not to invent.
  if v_row.color_source is not null then
    raise exception 'FAIL: la procedencia del ajuste nace inventada (%)', v_row.color_source;
  end if;

  -- RF-417: the provenance does have a default, and it is «our own», which is what 35
  -- of the 39 are. With null, the rule «colour is only offered on our own»
  -- would arrive off for all of them.
  if v_row.provenance <> 'OWN' then
    raise exception 'FAIL: la procedencia por omisión no es propia (%)', v_row.provenance;
  end if;

  raise notice 'OK: una fila sin columnas nuevas es válida, nace neutra y nace propia';
end $$;

-- ── 2. Each control, off scale above and below ────────────────
-- The ranges are the specification's and the same as the interface's controls'.
-- WHICH constraint rejects each value is also checked: it is what
-- makes the base's message useful when a client writes in another scale.
--
-- Every colour column is null at the start, and stays so: an
-- `update` the constraint rejects leaves nothing written. It matters because this way
-- each value in the list violates a single constraint and the name that is checked
-- is not ambiguous.
do $$
declare
  r record;
  v_constraint text;
begin
  for r in
    select * from (values
      ('color_temperature', '-61',   'images_color_temperature_range'),
      ('color_temperature', '61',    'images_color_temperature_range'),
      ('color_tint',        '-41',   'images_color_tint_range'),
      ('color_tint',        '41',    'images_color_tint_range'),
      ('color_exposure',    '-2.01', 'images_color_exposure_range'),
      ('color_exposure',    '2.01',  'images_color_exposure_range'),
      ('color_black',       '-1',    'images_color_black_range'),
      ('color_black',       '65',    'images_color_black_range'),
      ('color_white',       '191',   'images_color_white_range'),
      ('color_white',       '256',   'images_color_white_range'),
      ('color_gamma',       '0.59',  'images_color_gamma_range'),
      ('color_gamma',       '1.61',  'images_color_gamma_range'),
      ('color_shoulder',    '-1',    'images_color_shoulder_range'),
      ('color_shoulder',    '101',   'images_color_shoulder_range')
    ) as t(columna, valor, restriccion)
  loop
    begin
      execute format(
        'update public.images set %I = %s where image_id = %L',
        r.columna, r.valor, 'AR-9601_v1'
      );
      raise exception 'FAIL: se admitió % = %', r.columna, r.valor;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> r.restriccion then
        raise exception 'FAIL: % = % lo rechazó % y no %',
          r.columna, r.valor, v_constraint, r.restriccion;
      end if;
    end;
  end loop;
  raise notice 'OK: los siete mandos rechazan su fuera de escala, y cada uno se nombra';
end $$;

-- And each scale's caps go in, both extremes, because a range that
-- rejects its own cap leaves a control that does not reach the end of its travel.
do $$
begin
  update public.images set
    color_temperature = -60, color_tint = -40, color_exposure = -2.00,
    color_black = 64, color_white = 192, color_gamma = 0.60, color_shoulder = 0
   where image_id = 'AR-9601_v1';

  update public.images set
    color_temperature = 60, color_tint = 40, color_exposure = 2.00,
    color_black = 0, color_white = 255, color_gamma = 1.60, color_shoulder = 100
   where image_id = 'AR-9601_v1';

  raise notice 'OK: los topes de las siete escalas se admiten';
end $$;

-- ── 3. The curve is neither inverted nor collapsed ────────────
-- Between the black point and the white point at least 128 of the 256 codes remain.
do $$
declare v_constraint text;
begin
  -- The tightest pair the two ranges allow falls exactly on the limit,
  -- and it has to go in: a constraint that rejects its own edge leaves a legitimate
  -- adjustment unable to be stored.
  update public.images set color_black = 64, color_white = 192
   where image_id = 'AR-9601_v1';

  -- With nulls in between the rule still holds, and it holds because null is identity:
  -- only the black touched is «black 64, white 255», and only the white touched is
  -- «black 0, white 192». Both are applicable adjustments and both go in.
  update public.images set color_black = 64, color_white = null where image_id = 'AR-9601_v1';
  update public.images set color_black = null, color_white = 192 where image_id = 'AR-9601_v1';
  update public.images set color_black = null, color_white = null where image_id = 'AR-9601_v1';

  -- That the constraint really exists and is not just a phrase: today there is no
  -- pair violating it without first violating one of the two ranges —with black capped at
  -- 64 and white capped at 192 the difference never falls below 128—, so to see it
  -- bite one of the two ranges has to be widened, which is exactly the future
  -- the migration wrote it for even though it was redundant. It is widened here
  -- inside, in a transaction that ends in `rollback`.
  alter table public.images drop constraint images_color_black_range;
  begin
    update public.images set color_black = 100, color_white = 200
     where image_id = 'AR-9601_v1';
    raise exception 'FAIL: ha entrado una curva con 100 códigos de recorrido';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_color_range_usable' then
      raise exception 'FAIL: el recorrido corto lo rechazó % y no images_color_range_usable',
        v_constraint;
    end if;
  end;
  alter table public.images
    add constraint images_color_black_range check (color_black between 0 and 64);

  raise notice 'OK: el recorrido de la curva se respeta, con nulos y sin ellos';
end $$;

-- ── 4. The eyedropper's grey is a place, not two numbers ─────
do $$
declare r record; v_constraint text;
begin
  for r in
    select * from (values
      -- Half a coordinate is not half a point: it is no point, and whoever read it
      -- would have to guess the other half.
      ('color_neutral_x = 0.5, color_neutral_y = null', 'images_color_neutral_pair'),
      ('color_neutral_x = null, color_neutral_y = 0.5', 'images_color_neutral_pair'),
      -- Outside the frame there are no pixels to read a grey from. These two values
      -- would be legitimate in a corner —the artwork goes outside the shot in five
      -- photographs of the batch and one has to be able to drag the corner outside the
      -- edge—, and here they are not: they are different cases and the base distinguishes them.
      ('color_neutral_x = -0.2, color_neutral_y = 0.5', 'images_color_neutral_inside_image'),
      ('color_neutral_x = 0.5, color_neutral_y = 1.2',  'images_color_neutral_inside_image')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9601_v1'
      );
      raise exception 'FAIL: se admitió «%»', r.asignacion;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> r.restriccion then
        raise exception 'FAIL: «%» lo rechazó % y no %',
          r.asignacion, v_constraint, r.restriccion;
      end if;
    end;
  end loop;

  -- Both together go in, including the frame's two corners, and both
  -- null too: not having touched any grey is the normal case.
  update public.images set color_neutral_x = 0.41250, color_neutral_y = 0.68000
   where image_id = 'AR-9601_v1';
  update public.images set color_neutral_x = 0, color_neutral_y = 0
   where image_id = 'AR-9601_v1';
  update public.images set color_neutral_x = 1, color_neutral_y = 1
   where image_id = 'AR-9601_v1';
  update public.images set color_neutral_x = null, color_neutral_y = null
   where image_id = 'AR-9601_v1';

  raise notice 'OK: el punto del cuentagotas va en pareja y dentro de la fotografía';
end $$;

-- ── 5. The original's size: both sides or neither ────────────
-- A width with no height is not a size, and a zero would be a photograph with no pixels,
-- a datum that can only come from a badly done sum.
do $$
declare r record; v_constraint text;
begin
  for r in
    select * from (values
      ('original_width = 4000, original_height = null', 'images_original_size_pair'),
      ('original_width = null, original_height = 2252', 'images_original_size_pair'),
      ('original_width = 0, original_height = 2252',    'images_original_size_positive'),
      ('original_width = 4000, original_height = -1',   'images_original_size_positive')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9601_v1'
      );
      raise exception 'FAIL: se admitió «%»', r.asignacion;
    exception when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> r.restriccion then
        raise exception 'FAIL: «%» lo rechazó % y no %',
          r.asignacion, v_constraint, r.restriccion;
      end if;
    end;
  end loop;

  update public.images set original_width = 4000, original_height = 2252
   where image_id = 'AR-9601_v1';
  update public.images set original_width = null, original_height = null
   where image_id = 'AR-9601_v1';

  raise notice 'OK: el tamaño del original son los dos lados, positivos, o ninguno';
end $$;

-- ── 6. The file's date, and whether it is exact (RF-416) ─────
-- Of the 44 masters, 21 carry DateTimeOriginal and the 14 critical ones from 2022 only
-- carry the IFD0's DateTime, which by specification is the file's modification date
-- and therefore only approximates the shooting date. Storing «2022-10-09, and
-- who knows» in a single column is what the application cannot afford.
do $$
declare v_constraint text; v_ficha date; v_fichero date; v_exacta boolean;
begin
  begin
    update public.images set file_photo_date = '2022-10-09' where image_id = 'AR-9601_v1';
    raise exception 'FAIL: ha entrado una fecha del fichero sin decir si es exacta';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_file_photo_date_precision' then
      raise exception 'FAIL: la fecha sin precisión la rechazó % y no images_file_photo_date_precision',
        v_constraint;
    end if;
  end;

  -- Both degrees of confidence go in, and they are distinguished.
  update public.images
     set file_photo_date = '2022-10-09', file_photo_date_exact = true
   where image_id = 'AR-9601_v1';
  update public.images
     set file_photo_date = '2022-10-09', file_photo_date_exact = false
   where image_id = 'AR-9601_v1';

  -- And the file's date does NOT override the record's: they are two different facts, one
  -- what the file says and the other what whoever catalogues declares, and today the 39
  -- active rows differ. That they can coexist with different values in the same
  -- row is the decision, and this is where it is verified.
  update public.images set photo_date = '2026-08-03' where image_id = 'AR-9601_v1';
  select photo_date, file_photo_date, file_photo_date_exact
    into v_ficha, v_fichero, v_exacta
    from public.images where image_id = 'AR-9601_v1';
  if v_ficha <> '2026-08-03' or v_fichero <> '2022-10-09' or v_exacta then
    raise exception 'FAIL: las dos fechas no conviven (ficha %, fichero %, exacta %)',
      v_ficha, v_fichero, v_exacta;
  end if;

  -- The precision with no date is admitted, and on purpose: the constraint forbids the
  -- date orphaned from its confidence, which is the one that misleads, and not the other way round. A
  -- lone `file_photo_date_exact` is a useless datum but not a lie, and
  -- forbidding it would force ordering two writes that come from the same place.
  update public.images
     set file_photo_date = null, file_photo_date_exact = true
   where image_id = 'AR-9601_v1';
  update public.images
     set file_photo_date = null, file_photo_date_exact = null
   where image_id = 'AR-9601_v1';

  raise notice 'OK: la fecha del fichero declara su confianza y no pisa la de la ficha';
end $$;

-- ── 7. The four enums are closed ─────────────────────────────
-- An enum and not a text: what goes in here are the states the project
-- decided, and not the variants each version of the client invents. A
-- 'TARGET' or a 'CARTA' coming in through free text would make useless the column that
-- exists precisely to be able to believe —or not— a photograph's grey.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('color_source',    'REVIEWED_UNCHANGED',   'CASI_MANUAL'),
      ('color_reference', 'TARGET_PRINT',         'CARTA'),
      ('color_light',     'MIXED_WINDOW_CEILING', 'BOMBILLA'),
      ('provenance',      'OTHER_CATALOG',        'AJENA')
    ) as t(columna, valido, inventado)
  loop
    execute format(
      'update public.images set %I = %L where image_id = %L',
      r.columna, r.valido, 'AR-9601_v1'
    );

    begin
      execute format(
        'update public.images set %I = %L where image_id = %L',
        r.columna, r.inventado, 'AR-9601_v1'
      );
      raise exception 'FAIL: ha entrado un % que no existe (%)', r.columna, r.inventado;
    exception when invalid_text_representation then
      null; -- lo esperado
    end;
  end loop;
  raise notice 'OK: los cuatro enumerados rechazan el texto libre';
end $$;

-- And each enum's complete values go in, one by one: a value that is
-- declared and cannot be written is worse than not declaring it.
do $$
declare v_valor text;
begin
  foreach v_valor in array enum_range(null::public.color_source)::text[] loop
    execute format('update public.images set color_source = %L where image_id = %L',
                   v_valor, 'AR-9601_v1');
  end loop;
  foreach v_valor in array enum_range(null::public.color_reference)::text[] loop
    execute format('update public.images set color_reference = %L where image_id = %L',
                   v_valor, 'AR-9601_v1');
  end loop;
  foreach v_valor in array enum_range(null::public.light_preset)::text[] loop
    execute format('update public.images set color_light = %L where image_id = %L',
                   v_valor, 'AR-9601_v1');
  end loop;
  foreach v_valor in array enum_range(null::public.photo_provenance)::text[] loop
    execute format('update public.images set provenance = %L where image_id = %L',
                   v_valor, 'AR-9601_v1');
  end loop;
  raise notice 'OK: todos los valores declarados de los cuatro enumerados se admiten';
end $$;

-- «Sin revisar» is not «no»: having looked at the colour with the artwork in front and having
-- left it alone is work done, and it cannot read the same as not having looked at it.
do $$
declare v_source public.color_source;
begin
  update public.images
     set color_source = 'REVIEWED_UNCHANGED',
         color_temperature = null, color_tint = null, color_exposure = null
   where image_id = 'AR-9601_v1';

  select color_source into v_source from public.images where image_id = 'AR-9601_v1';
  if v_source is null or v_source <> 'REVIEWED_UNCHANGED' then
    raise exception 'FAIL: revisado y dejado igual no se distingue de sin revisar';
  end if;
  raise notice 'OK: revisado sin cambios se guarda aunque no haya ningún número';
end $$;

-- ── 8. Los dos porcentajes de recorte y su techo ──────────────
-- Son la consecuencia del ajuste y no la decisión: dicen cuánto detalle de sombra
-- y de alta luz se sacrificó al aplicarlo. No llevan `check` por especificación, y
-- el techo lo pone el propio tipo: `numeric(4,2)` llega a 99,99 y un 100,00 no
-- cabe. Un ajuste que empasta la fotografía entera es alcanzable —punto negro alto
-- sobre una toma oscura—, así que quien escribe satura en 99,99, y satura sin
-- perder nada: entre «99,99 % empastado» y «100 %» no hay ninguna decisión
-- distinta que tomar. El test fija el techo para que el cliente sepa contra qué
-- satura, y para que ese «numeric field overflow» —que la usuaria no debe ver
-- nunca— no aparezca un día en su pantalla.
do $$
begin
  update public.images set color_clipped_low = 0.00, color_clipped_high = 0.00
   where image_id = 'AR-9601_v1';
  update public.images set color_clipped_low = 99.99, color_clipped_high = 99.99
   where image_id = 'AR-9601_v1';

  begin
    update public.images set color_clipped_low = 100.00 where image_id = 'AR-9601_v1';
    raise exception 'FAIL: ha entrado un 100,00 en un numeric(4,2)';
  exception when numeric_value_out_of_range then
    null; -- el techo del tipo, documentado en la migración
  end;

  raise notice 'OK: los porcentajes de recorte llegan a 99,99 y ahí topan';
end $$;

-- ── 9. Lo que la base NO prohíbe, a propósito ─────────────────
-- Una fotografía ajena con color guardado se admite, aunque el ajuste no se
-- ofrezca en las ajenas (RF-417). Si la base lo prohibiera, reclasificar como
-- ajena una fotografía ya corregida fallaría al guardar, y sería justo el caso en
-- el que más importa poder anotar la procedencia correcta. La regla vive en la
-- interfaz, que no ofrece el ajuste, y en `composeEdits`, que lanza.
--
-- El test está aquí para que la ausencia de esa restricción se lea como una
-- decisión y no como un olvido: quien la añada mañana romperá este test y leerá
-- por qué.
do $$
begin
  update public.images set
    provenance = 'OTHER_CATALOG',
    color_temperature = 12, color_gamma = 1.05, color_source = 'MANUAL'
   where image_id = 'AR-9601_v1';
  raise notice 'OK: reclasificar como ajena una fotografía ya corregida no falla';
end $$;

-- Tampoco hay nada que ligue la referencia neutra a la procedencia del ajuste: un
-- ajuste puede empezar en un preset, seguir con el cuentagotas sobre un cartón y
-- acabar retocado a mano.
do $$
begin
  update public.images set
    provenance = 'OWN',
    color_source = 'AUTO_ADJUSTED', color_reference = 'SCENE',
    color_light = 'INCANDESCENT', color_inherited = true, color_gray = true
   where image_id = 'AR-9601_v1';
  raise notice 'OK: fuente, referencia, preset y herencia conviven sin ligaduras';
end $$;

-- ── 10. Nada se rellena hacia atrás ni por omisión ────────────
-- Ninguna de las columnas de color tiene valor por omisión, y eso es el dato: un
-- `default 'MANUAL'` en color_source, o un `default 0` en la temperatura, sería
-- inventar el dato justo en las columnas que existen para no inventarlo, y lo
-- inventaría en cada fila nueva sin que nada fallara. Las tres únicas omisiones
-- son deliberadas y se comprueban una por una: los dos interruptores, cuyo valor
-- identidad es «apagado», y la procedencia, que empieza en «propia» porque con
-- nulo la regla «el color solo se ofrece en las propias» llegaría apagada para las
-- 39 filas.
--
-- Se comprueba contra el catálogo y no contando filas de la base. Contar filas
-- sería más vistoso y sería un test que se rompe solo: en cuanto se ajuste de
-- verdad el color de una fotografía, esa fila tendría color y el aserto fallaría
-- sin que nada estuviera mal.
do $$
declare r record; v_esperado text; v_sobran text;
begin
  for r in
    select column_name, column_default
      from information_schema.columns
     where table_schema = 'public' and table_name = 'images'
       and (column_name like 'color\_%' or column_name like 'file\_photo\_%'
            or column_name like 'original\_%' or column_name = 'provenance')
  loop
    v_esperado := case r.column_name
      when 'color_gray'      then 'false'
      when 'color_inherited' then 'false'
      when 'provenance'      then '''OWN''::photo_provenance'
      else null
    end;
    if coalesce(r.column_default, '') <> coalesce(v_esperado, '') then
      raise exception 'FAIL: % tiene por omisión % y debía tener %',
        r.column_name, coalesce(r.column_default, 'nulo'), coalesce(v_esperado, 'nulo');
    end if;
  end loop;
  raise notice 'OK: solo tienen omisión los dos interruptores y la procedencia';
end $$;

-- Y las filas que ya existían sobreviven a una escritura que ignora las columnas
-- nuevas, que es literalmente lo que hace el frontend viejo durante el despliegue:
-- si alguna de las restricciones nuevas rechazara una fila heredada, esa fila se
-- quedaría sin poder guardarse hasta que alguien la arreglara a mano. Sobre una
-- base recién migrada no hay filas y el aserto no dice nada, que es correcto.
do $$
declare v_total int; v_tocadas int;
begin
  select count(*) into v_total from public.images where image_id <> 'AR-9601_v1';

  update public.images set photo_author = photo_author where image_id <> 'AR-9601_v1';
  get diagnostics v_tocadas = row_count;

  if v_tocadas <> v_total then
    raise exception 'FAIL: solo % de % filas heredadas admiten una escritura del frontend viejo',
      v_tocadas, v_total;
  end if;
  raise notice 'OK: las % filas heredadas siguen escribiéndose sin las columnas nuevas', v_total;
end $$;

rollback;
