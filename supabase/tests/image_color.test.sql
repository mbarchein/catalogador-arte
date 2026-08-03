-- RF-414, RF-416, RF-417, RF-418: el ajuste de color de una fotografía, la fecha
-- que trae el fichero, el tamaño del original y la procedencia.
--
-- Lo que se comprueba es lo que el `check` puede comprobar y el cliente no debe
-- volver a comprobar por su cuenta: que ningún mando entra fuera de su escala
-- —una escala mal convertida en el cliente escribiría un ajuste que después nadie
-- podría volver a abrir—, que la curva no se puede invertir ni colapsar, que medio
-- punto y medio tamaño no existen, y que una fecha del fichero sin decir si es
-- exacta no entra, porque en esa columna la duda es justo el dato.
--
-- Y dos cosas que no son sobre valores sino sobre el despliegue y sobre el
-- criterio del proyecto: que una fila escrita **sin ninguna de las columnas
-- nuevas** sigue siendo válida —es lo que hace el frontend viejo durante los
-- segundos en que las dos versiones están en el aire, y es lo que permite
-- desplegar en una fase— y que nulo no es «revisado y dejado igual», que para eso
-- existe REVIEWED_UNCHANGED.
--
-- Además, cada rechazo se comprueba **por el nombre de la restricción que lo
-- rechaza**. Es la razón por la que la migración escribió una restricción por
-- parámetro en vez de un `check` grande: lo único que Postgres dice al rechazar es
-- ese nombre, y si todos los rangos compartieran restricción, un ajuste rechazado
-- no diría qué mando se fue de la escala.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9601', 'ROTILI', 'Obra fotografiada con luz de bombilla', 'UNCONFIRMED');

-- ── 1. Una fila sin ninguna columna nueva sigue siendo válida ─
-- Es la garantía del despliegue de una sola fase, y se comprueba escribiendo
-- exactamente lo que escribe el frontend que no conoce estas columnas.
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

  -- Nulo es identidad, no desconocido: los dos interruptores nacen apagados
  -- porque apagados es su valor identidad, no porque se ignore su valor.
  if v_row.color_gray then
    raise exception 'FAIL: una foto nueva nace en blanco y negro';
  end if;
  if v_row.color_inherited then
    raise exception 'FAIL: una foto nueva nace con el color heredado';
  end if;

  -- Y la única columna de color donde nulo NO es identidad: «sin revisar» no es
  -- «no». Un valor por omisión aquí sería inventar el dato que esta columna
  -- existe para no inventar.
  if v_row.color_source is not null then
    raise exception 'FAIL: la procedencia del ajuste nace inventada (%)', v_row.color_source;
  end if;

  -- RF-417: la procedencia sí tiene omisión, y es «propia», que es lo que son 35
  -- de las 39. Con nulo, la regla «el color solo se ofrece en las propias»
  -- llegaría apagada para todas.
  if v_row.provenance <> 'OWN' then
    raise exception 'FAIL: la procedencia por omisión no es propia (%)', v_row.provenance;
  end if;

  raise notice 'OK: una fila sin columnas nuevas es válida, nace neutra y nace propia';
end $$;

-- ── 2. Cada mando, fuera de escala por arriba y por abajo ─────
-- Los rangos son los de la especificación y los mismos que los de los mandos de
-- la interfaz. Se comprueba también QUÉ restricción rechaza cada valor: es lo que
-- hace útil el mensaje de la base cuando un cliente escribe en otra escala.
--
-- Todas las columnas de color están en nulo al empezar, y siguen estándolo: un
-- `update` que la restricción rechaza no deja nada escrito. Importa porque así
-- cada valor de la lista viola una sola restricción y el nombre que se comprueba
-- no es ambiguo.
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

-- Y los topes de cada escala entran, los dos extremos, porque un rango que
-- rechaza su propio tope deja un mando que no llega al final de su recorrido.
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

-- ── 3. La curva no se invierte ni colapsa ─────────────────────
-- Entre el punto negro y el punto blanco quedan al menos 128 de los 256 códigos.
do $$
declare v_constraint text;
begin
  -- El par más apretado que los dos rangos permiten cae exactamente en el límite,
  -- y tiene que entrar: una restricción que rechaza su propio borde deja un ajuste
  -- legítimo sin poder guardarse.
  update public.images set color_black = 64, color_white = 192
   where image_id = 'AR-9601_v1';

  -- Con nulos por medio la regla sigue valiendo, y vale porque nulo es identidad:
  -- solo el negro tocado es «negro 64, blanco 255», y solo el blanco tocado es
  -- «negro 0, blanco 192». Los dos son ajustes aplicables y los dos entran.
  update public.images set color_black = 64, color_white = null where image_id = 'AR-9601_v1';
  update public.images set color_black = null, color_white = 192 where image_id = 'AR-9601_v1';
  update public.images set color_black = null, color_white = null where image_id = 'AR-9601_v1';

  -- Que la restricción existe de verdad y no es solo una frase: hoy no hay ningún
  -- par que la viole sin violar antes uno de los dos rangos —con el negro tope en
  -- 64 y el blanco tope en 192 la diferencia nunca baja de 128—, así que para verla
  -- morder hay que ensanchar uno de los dos rangos, que es exactamente el futuro
  -- por el que la migración la escribió aunque fuera redundante. Se ensancha aquí
  -- dentro, en una transacción que acaba en `rollback`.
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

-- ── 4. El gris del cuentagotas es un sitio, no dos números ────
do $$
declare r record; v_constraint text;
begin
  for r in
    select * from (values
      -- Media coordenada no es medio punto: es ningún punto, y quien lo leyera
      -- tendría que adivinar la otra mitad.
      ('color_neutral_x = 0.5, color_neutral_y = null', 'images_color_neutral_pair'),
      ('color_neutral_x = null, color_neutral_y = 0.5', 'images_color_neutral_pair'),
      -- Fuera del encuadre no hay píxeles de donde leer un gris. Estos dos valores
      -- serían legítimos en una esquina —la obra se sale de la toma en cinco
      -- fotografías del lote y hay que poder arrastrar la esquina fuera del
      -- borde—, y aquí no lo son: son casos distintos y la base los distingue.
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

  -- Las dos juntas entran, incluidas las dos esquinas del encuadre, y las dos en
  -- nulo también: no haber tocado ningún gris es el caso normal.
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

-- ── 5. El tamaño del original: los dos lados o ninguno ────────
-- Un ancho sin alto no es un tamaño, y un cero sería una fotografía sin píxeles,
-- dato que solo puede venir de una cuenta mal hecha.
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

-- ── 6. La fecha del fichero, y si es exacta (RF-416) ──────────
-- De los 44 másteres, 21 traen DateTimeOriginal y los 14 críticos de 2022 solo
-- traen el DateTime del IFD0, que por especificación es la fecha de modificación
-- del fichero y por tanto solo se aproxima a la de la toma. Guardar «2022-10-09, y
-- quién sabe» en una sola columna es lo que la aplicación no puede permitirse.
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

  -- Los dos grados de confianza entran, y se distinguen.
  update public.images
     set file_photo_date = '2022-10-09', file_photo_date_exact = true
   where image_id = 'AR-9601_v1';
  update public.images
     set file_photo_date = '2022-10-09', file_photo_date_exact = false
   where image_id = 'AR-9601_v1';

  -- Y la fecha del fichero NO pisa la de la ficha: son dos hechos distintos, uno
  -- lo que dice el fichero y otro lo que declara quien cataloga, y hoy difieren
  -- las 39 filas activas. Que puedan convivir con valores distintos en la misma
  -- fila es la decisión, y aquí es donde queda verificada.
  update public.images set photo_date = '2026-08-03' where image_id = 'AR-9601_v1';
  select photo_date, file_photo_date, file_photo_date_exact
    into v_ficha, v_fichero, v_exacta
    from public.images where image_id = 'AR-9601_v1';
  if v_ficha <> '2026-08-03' or v_fichero <> '2022-10-09' or v_exacta then
    raise exception 'FAIL: las dos fechas no conviven (ficha %, fichero %, exacta %)',
      v_ficha, v_fichero, v_exacta;
  end if;

  -- La precisión sin fecha sí se admite, y a propósito: la restricción prohíbe la
  -- fecha huérfana de su confianza, que es la que engaña, y no al revés. Un
  -- `file_photo_date_exact` suelto es un dato inútil pero no una mentira, y
  -- prohibirlo obligaría a ordenar dos escrituras que salen del mismo sitio.
  update public.images
     set file_photo_date = null, file_photo_date_exact = true
   where image_id = 'AR-9601_v1';
  update public.images
     set file_photo_date = null, file_photo_date_exact = null
   where image_id = 'AR-9601_v1';

  raise notice 'OK: la fecha del fichero declara su confianza y no pisa la de la ficha';
end $$;

-- ── 7. Los cuatro enumerados son cerrados ─────────────────────
-- Un enumerado y no un texto: lo que aquí entra son los estados que el proyecto
-- decidió, y no las variantes que cada versión del cliente se invente. Un
-- 'TARGET' o un 'CARTA' entrando por texto libre haría inútil la columna que
-- existe justo para poder creerse —o no— el gris de una fotografía.
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

-- Y los valores completos de cada enumerado entran, uno por uno: un valor que se
-- declara y no se puede escribir es peor que no declararlo.
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

-- «Sin revisar» no es «no»: haber mirado el color con la obra delante y haberlo
-- dejado igual es trabajo hecho, y no puede leerse igual que no haberlo mirado.
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
