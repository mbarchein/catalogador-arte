-- RF-420, RF-411: la copia corregida a resolución completa, el cuarto nivel de
-- fichero de una fotografía.
--
-- Lo que se comprueba es lo que el `check` puede comprobar y el cliente no debe
-- volver a comprobar por su cuenta: que no entra un tamaño que no es un tamaño,
-- que media descripción de un fichero no existe, que «la copia está» y «la copia
-- falta» no pueden ser verdad en la misma fila, y —la razón de ser de todo el
-- fichero— que **la ruta de la copia corregida nunca es la del máster**. El máster
-- no se reescribe jamás (ADR-002), y la forma realista de romper esa regla no es
-- un `update` malicioso: es derivar la ruta de la copia de la del máster y que un
-- día coincidan.
--
-- Y tres cosas que no son sobre valores: que una fila escrita **sin ninguna de las
-- columnas nuevas** sigue siendo válida —es lo que hace el frontend viejo durante
-- los segundos en que las dos versiones están en el aire, y es lo que permite
-- desplegar en una fase—, que `corrected_pending` nace en falso, y que ninguna de
-- las filas que ya existen se ha rellenado sola.
--
-- Cada rechazo se comprueba **por el nombre de la restricción que lo rechaza**, que
-- es la razón por la que la migración escribió una restricción por regla en vez de
-- un `check` grande: lo único que Postgres dice al rechazar es ese nombre.
\set ON_ERROR_STOP on
begin;

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-9602', 'ROTILI', 'Obra que se manda a la imprenta', 'UNCONFIRMED');

-- ── 1. Una fila sin ninguna columna nueva sigue siendo válida ─
-- Garantía del despliegue de una sola fase: se escribe exactamente lo que escribe
-- el frontend que no conoce estas columnas. Y de paso queda fijado el único valor
-- por omisión de las tres, que es «no falta ninguna copia».
do $$
declare v_row public.images;
begin
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path)
  values ('AR-9602', 'q/min.webp', 'q/der.webp', 'q/AR-9602_ab12_master.jpg')
  returning * into v_row;

  if v_row.corrected_path is not null or v_row.corrected_bytes is not null then
    raise exception 'FAIL: una foto nueva nace con una copia corregida (% , %)',
      v_row.corrected_path, v_row.corrected_bytes;
  end if;

  -- Falso y no nulo, y el motivo es que aquí falso SÍ es un hecho: significa «no
  -- falta ninguna copia», que es cierto de una fotografía recién subida y sin
  -- correcciones. Nulo dejaría la pregunta abierta en las 39 filas y en todas las
  -- nuevas, y entonces «pendiente» no distinguiría nada, que es justo lo único
  -- que esta columna existe para hacer.
  if v_row.corrected_pending is null then
    raise exception 'FAIL: corrected_pending nace en nulo y tenía que nacer en falso';
  end if;
  if v_row.corrected_pending then
    raise exception 'FAIL: una foto nueva nace con la copia corregida pendiente';
  end if;

  raise notice 'OK: una fila sin las columnas nuevas es válida y nace sin copia y sin deuda';
end $$;

-- Y el valor por omisión está declarado en la tabla, no solo conseguido por la
-- forma de este `insert`: las otras dos no tienen ninguno, porque un valor por
-- omisión en la ruta o en el tamaño sería inventar un fichero.
do $$
declare r record; v_esperado text;
begin
  for r in
    select column_name, column_default, is_nullable
      from information_schema.columns
     where table_schema = 'public' and table_name = 'images'
       and column_name like 'corrected\_%'
  loop
    v_esperado := case r.column_name when 'corrected_pending' then 'false' else null end;
    if coalesce(r.column_default, '') <> coalesce(v_esperado, '') then
      raise exception 'FAIL: % tiene por omisión % y debía tener %',
        r.column_name, coalesce(r.column_default, 'nulo'), coalesce(v_esperado, 'nulo');
    end if;
  end loop;

  -- Y `corrected_pending` es `not null`: una fila donde no se sepa si la copia
  -- falta es la misma ambigüedad que la columna vino a quitar.
  select is_nullable into v_esperado
    from information_schema.columns
   where table_schema = 'public' and table_name = 'images'
     and column_name = 'corrected_pending';
  if v_esperado <> 'NO' then
    raise exception 'FAIL: corrected_pending admite nulo';
  end if;

  raise notice 'OK: solo corrected_pending tiene omisión, es falso, y no admite nulo';
end $$;

-- ── 2. Un tamaño que no es un tamaño ─────────────────────────
-- Cero bytes es un fichero vacío y un negativo es una cuenta mal hecha. Los dos
-- llegarían a la ficha como una descarga que promete algo que no está.
do $$
declare r record; v_constraint text;
begin
  for r in
    select * from (values
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = 0',
       'images_corrected_bytes_positive'),
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = -1',
       'images_corrected_bytes_positive'),
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = -4194304',
       'images_corrected_bytes_positive')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9602_v1'
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

  -- Un solo byte entra: el tope de abajo es 1 y no un mínimo inventado. Nadie sabe
  -- cuál es el JPEG más pequeño que un dispositivo raro puede producir, y ponerle
  -- un suelo a ojo rechazaría una copia legítima sin ganar nada.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 1
   where image_id = 'AR-9602_v1';

  -- Y el tamaño real de la peor de las fotografías del lote: 19 MB. El techo lo
  -- pone `integer`, que llega a 2 GB.
  update public.images set corrected_bytes = 19922944 where image_id = 'AR-9602_v1';

  raise notice 'OK: el tamaño de la copia es positivo, y 1 byte y 19 MB entran';
end $$;

-- ── 3. La ruta y el tamaño son un fichero, no dos datos ──────
do $$
declare r record; v_constraint text;
begin
  update public.images set corrected_path = null, corrected_bytes = null
   where image_id = 'AR-9602_v1';

  for r in
    select * from (values
      -- Ruta sin tamaño: obliga a quien la lee a preguntarle el tamaño al almacén,
      -- que es el viaje que la columna existe para ahorrar.
      ('corrected_path = ''q/AR-9602_ab12_corr.jpg'', corrected_bytes = null',
       'images_corrected_copy_pair'),
      -- Tamaño sin ruta: un número que no describe ningún fichero.
      ('corrected_path = null, corrected_bytes = 3145728',
       'images_corrected_copy_pair')
    ) as t(asignacion, restriccion)
  loop
    begin
      execute format(
        'update public.images set %s where image_id = %L', r.asignacion, 'AR-9602_v1'
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

  -- Los dos juntos entran, y ninguno de los dos también: «no hay copia corregida»
  -- es el estado normal de una fotografía sin correcciones, y no un hueco que haya
  -- que rellenar.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
   where image_id = 'AR-9602_v1';
  update public.images set corrected_path = null, corrected_bytes = null
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la copia son ruta y tamaño juntos, o ninguno de los dos';
end $$;

-- ── 4. Pendiente y presente son excluyentes ──────────────────
-- Si la copia está, no está pendiente. Una fila que dijera las dos cosas obligaría
-- a quien la lee a elegir a cuál creer, y la interfaz enseñaría a la vez el botón
-- de descargar la copia y el aviso de que falta.
do $$
declare v_constraint text; v_pendiente boolean; v_ruta text;
begin
  -- Pendiente a secas: el estado que la columna existe para poder escribir. Este es
  -- el dispositivo que no ha podido con el lienzo, y consta.
  update public.images set corrected_pending = true where image_id = 'AR-9602_v1';

  -- Y desde ahí, añadirle una ruta se rechaza.
  begin
    update public.images
       set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 2097152
     where image_id = 'AR-9602_v1';
    raise exception 'FAIL: una copia presente y pendiente a la vez ha entrado';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_pending_exclusive' then
      raise exception 'FAIL: presente y pendiente lo rechazó % y no images_corrected_pending_exclusive',
        v_constraint;
    end if;
  end;

  -- El `update` rechazado no deja nada escrito: la fila sigue pendiente y sin
  -- ruta, que es lo que tiene que pasar cuando la generación falla otra vez.
  select corrected_pending, corrected_path into v_pendiente, v_ruta
    from public.images where image_id = 'AR-9602_v1';
  if not v_pendiente or v_ruta is not null then
    raise exception 'FAIL: el rechazo ha dejado la fila en (pendiente %, ruta %)',
      v_pendiente, v_ruta;
  end if;

  -- Y por el otro lado: marcar pendiente una fila que ya tiene copia también se
  -- rechaza. Es el orden en que lo haría un reintento mal escrito.
  update public.images
     set corrected_pending = false,
         corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 2097152
   where image_id = 'AR-9602_v1';

  begin
    update public.images set corrected_pending = true where image_id = 'AR-9602_v1';
    raise exception 'FAIL: se ha marcado pendiente una copia que está';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_pending_exclusive' then
      raise exception 'FAIL: marcar pendiente lo rechazó % y no images_corrected_pending_exclusive',
        v_constraint;
    end if;
  end;

  -- La transición legítima de «pendiente» a «hecha» es una sola escritura, y entra:
  -- es la que hace el ordenador que sí ha podido generar la copia.
  update public.images set corrected_path = null, corrected_bytes = null,
                           corrected_pending = true
   where image_id = 'AR-9602_v1';
  update public.images
     set corrected_pending = false,
         corrected_path = 'q/AR-9602_cd34_corr.jpg', corrected_bytes = 4194304
   where image_id = 'AR-9602_v1';

  raise notice 'OK: pendiente y presente se excluyen, y la transición entre los dos entra';
end $$;

-- ── 5. La copia NUNCA comparte ruta con el máster (RF-411) ────
-- Es la regla que protege el documento de archivo. El máster se sube una vez con
-- los bytes originales y no se vuelve a escribir nunca (ADR-002); lo que se manda a
-- una imprenta o a un comisario es la copia corregida, y son dos ficheros
-- distintos porque responden a dos preguntas distintas.
--
-- Se comprueba por construcción y por restricción, en las dos direcciones: mover la
-- copia sobre el máster y mover el máster sobre la copia.
do $$
declare v_master text; v_copia text; v_constraint text;
begin
  update public.images
     set master_path    = 'q/AR-9602_ab12_master.jpg',
         corrected_path = 'q/AR-9602_ab12_corr.jpg',
         corrected_bytes = 3145728
   where image_id = 'AR-9602_v1';

  select master_path, corrected_path into v_master, v_copia
    from public.images where image_id = 'AR-9602_v1';
  if v_master is null or v_copia is null then
    raise exception 'FAIL: el máster y la copia corregida no conviven en la misma fila';
  end if;
  if v_master = v_copia then
    raise exception 'FAIL: la copia corregida ha quedado en la ruta del máster (%)', v_master;
  end if;

  -- Dirección 1: llevar la copia a la ruta del máster. Es lo que pasaría el día en
  -- que alguien derivara la ruta de la copia de la del máster reutilizando su base
  -- y su extensión.
  begin
    update public.images set corrected_path = v_master where image_id = 'AR-9602_v1';
    raise exception 'FAIL: la copia corregida ha podido apuntar al máster';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_not_master' then
      raise exception 'FAIL: la colisión con el máster la rechazó % y no images_corrected_not_master',
        v_constraint;
    end if;
  end;

  -- Dirección 2: llevar el máster a la ruta de la copia. La restricción es simétrica
  -- a propósito: la que importa es que las dos columnas no coincidan, y da igual
  -- cuál de las dos se mueva para hacerlas coincidir.
  begin
    update public.images set master_path = v_copia where image_id = 'AR-9602_v1';
    raise exception 'FAIL: el máster ha podido apuntar a la copia corregida';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'images_corrected_not_master' then
      raise exception 'FAIL: mover el máster sobre la copia lo rechazó % y no images_corrected_not_master',
        v_constraint;
    end if;
  end;

  -- Y el camino degradado: quitarle el máster a una fila que ya tiene copia no
  -- falla y no se lleva la copia por delante. Es el caso de una fotografía cuyo
  -- máster se reubica cuando la copia ya está subida.
  --
  -- Este aserto **no** distingue `is distinct from` de un `<>` en la restricción, y
  -- se dice para que nadie lo cuente como que sí: con la guarda `corrected_path is
  -- null` delante, las dos formas admiten las mismas filas —con el máster nulo,
  -- `<>` da nulo y el `check` pasa igual—. Lo que se verifica aquí es la conducta
  -- que la ficha necesita, no la sintaxis con que está escrita.
  update public.images set master_path = null where image_id = 'AR-9602_v1';
  select master_path, corrected_path into v_master, v_copia
    from public.images where image_id = 'AR-9602_v1';
  if v_copia is null then
    raise exception 'FAIL: quitar el máster ha borrado la copia corregida';
  end if;
  update public.images set master_path = 'q/AR-9602_ab12_master.jpg'
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la ruta de la copia corregida nunca es la del máster, en las dos direcciones';
end $$;

-- Y lo mismo sobre todas las filas de la base, que es donde la regla tiene que
-- valer de verdad: ninguna fila tiene la copia en la ruta de su máster.
do $$
declare v_malas int;
begin
  select count(*) into v_malas
    from public.images
   where corrected_path is not null and corrected_path = master_path;
  if v_malas > 0 then
    raise exception 'FAIL: % filas tienen la copia corregida en la ruta del máster', v_malas;
  end if;
  raise notice 'OK: ninguna fila de la base tiene la copia sobre su máster';
end $$;

-- ── 6. Nada se ha rellenado hacia atrás ──────────────────────
-- Las filas que ya existían se quedan sin copia y sin deuda: no hay copia porque
-- nadie ha aplicado una corrección desde que este nivel existe, y no falta ninguna
-- porque tampoco hacía falta. Marcarlas pendientes en la migración habría creado
-- 39 tareas que nadie pidió; darles una ruta habría inventado 39 ficheros que no
-- están en el almacén, y la ficha ofrecería descargar un 404.
--
-- Se cuentan TODAS las filas y no solo las activas: las dadas de baja siguen ahí
-- —nunca un borrado real— y una baja lógica con una copia corregida inventada
-- seguiría siendo un dato inventado, además de un fichero fantasma que nadie
-- volvería a mirar.
--
-- Sobre una base recién migrada no hay filas y el aserto no dice nada, y es
-- correcto que no lo diga: este test mide la base cargada con el volcado, donde
-- son 39 activas de 44.
do $$
declare v_total int; v_con_copia int; v_pendientes int;
begin
  select count(*) into v_total from public.images where image_id <> 'AR-9602_v1';

  select count(*) into v_con_copia
    from public.images
   where image_id <> 'AR-9602_v1'
     and num_nonnulls(corrected_path, corrected_bytes) > 0;
  if v_con_copia > 0 then
    raise exception 'FAIL: % de las % filas heredadas tienen una copia corregida inventada',
      v_con_copia, v_total;
  end if;

  select count(*) into v_pendientes
    from public.images where image_id <> 'AR-9602_v1' and corrected_pending;
  if v_pendientes > 0 then
    raise exception 'FAIL: % de las % filas heredadas han nacido con una copia pendiente',
      v_pendientes, v_total;
  end if;

  raise notice 'OK: las % filas heredadas siguen sin copia corregida y sin deuda', v_total;
end $$;

-- Y siguen admitiendo una escritura que ignora las columnas nuevas, que es
-- literalmente lo que hace el frontend viejo durante el despliegue: si alguna de
-- las restricciones nuevas rechazara una fila heredada, esa fila se quedaría sin
-- poder guardarse hasta que alguien la arreglara a mano.
do $$
declare v_total int; v_tocadas int;
begin
  select count(*) into v_total from public.images where image_id <> 'AR-9602_v1';

  update public.images set photo_author = photo_author where image_id <> 'AR-9602_v1';
  get diagnostics v_tocadas = row_count;

  if v_tocadas <> v_total then
    raise exception 'FAIL: solo % de % filas heredadas admiten una escritura del frontend viejo',
      v_tocadas, v_total;
  end if;
  raise notice 'OK: las % filas heredadas se siguen escribiendo sin las columnas nuevas', v_total;
end $$;

-- ── 7. Lo que la base NO prohíbe, a propósito ────────────────
-- Está aquí para que la ausencia de estas dos restricciones se lea como una
-- decisión y no como un olvido: quien las añada mañana romperá este test y leerá
-- por qué.
do $$
begin
  -- Una copia corregida sin máster en la fila. Hoy no se puede llegar ahí porque
  -- sin máster el color se prohíbe en el cliente, pero la regla es de renderizado
  -- y vive allí: escribirla en la base impediría guardar el caso de una copia ya
  -- generada cuyo máster se reubique, y lo impediría cuando ya no hay nada que
  -- hacer.
  update public.images
     set master_path = null,
         corrected_path = 'q/AR-9602_ef56_corr.jpg', corrected_bytes = 1048576
   where image_id = 'AR-9602_v1';

  -- Y una fila marcada pendiente sin ninguna corrección que aplicar. Es inofensivo
  -- —quien lo lea reintentará y dejará el trabajo hecho— y un `check` que exigiera
  -- «hay algo que aplicar» tendría que repetir aquí la definición de las cuatro
  -- correcciones y se desalinearía la primera vez que hubiera una quinta.
  update public.images
     set corrected_path = null, corrected_bytes = null, corrected_pending = true,
         rotation = 0, crop_x = null, crop_y = null, crop_width = null, crop_height = null,
         color_temperature = null, color_gamma = null
   where image_id = 'AR-9602_v1';

  raise notice 'OK: la base no exige máster para la copia ni correcciones para la deuda';
end $$;

-- ── 8. Quién escribe la copia y quién solo la descarga ───────
-- RF-106, RF-411, RF-420.
--
-- Las tres columnas son superficie nueva de escritura, y CLAUDE.md pone las
-- políticas RLS por delante de todo lo demás: no hay backend, la clave anónima
-- viaja en el cliente y estas políticas son el único perímetro que hay. No se ha
-- escrito ninguna política nueva para ellas, y es deliberado —quien puede editar
-- una fotografía puede editar su copia corregida—, así que lo que hay que
-- demostrar es que la `images_update` que ya existe (`can_edit()`) alcanza a las
-- tres. Leer la migración no demuestra nada: esto se autentica de verdad.
--
-- La cobertura está aquí y no en `rls_role_matrix.test.sql` porque ese fichero
-- pertenece a otro trabajo en curso y hoy cubre las columnas de color y no
-- estas. Vale en cualquiera de los dos sitios; lo que no vale es en ninguno.
--
-- Y aquí se comprueba la asimetría de RF-411, que es la que se puede romper sin
-- que nadie se entere: el Lector **descarga** la copia corregida —para eso
-- existe— y por tanto tiene que poder LEER `corrected_path` y
-- `corrected_bytes`, pero no puede escribir ninguna de las tres. Una política
-- que le negara la lectura no daría ningún error: dejaría el botón de descarga
-- sin ruta que firmar, y la ficha entregaría el máster sin corregir creyendo que
-- no había copia.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000096c1', 'cat-corr@test.local'),
  ('00000000-0000-0000-0000-0000000096d1', 'lec-corr@test.local');

update public.profiles set role = 'CATALOGER'
 where id = '00000000-0000-0000-0000-0000000096c1';
update public.profiles set role = 'READER'
 where id = '00000000-0000-0000-0000-0000000096d1';

-- Estado de partida limpio y explícito: el bloque anterior dejó la fila sin
-- máster y con deuda a propósito, y lo que se mide ahora es otra cosa.
update public.images
   set master_path = 'q/AR-9602_ab12_master.jpg',
       corrected_path = null, corrected_bytes = null, corrected_pending = false
 where image_id = 'AR-9602_v1';

do $$
declare v_row public.images;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096c1","role":"authenticated"}';
  set local role authenticated;

  -- Los dos estados que un catalogador escribe de verdad. Primero la copia
  -- hecha, que es lo que ocurre cuando el dispositivo ha podido generarla.
  update public.images
     set corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
   where image_id = 'AR-9602_v1'
  returning * into v_row;

  if v_row.corrected_path is null or v_row.corrected_bytes <> 3145728 then
    raise exception 'FAIL: el catalogador no ha podido escribir la copia corregida';
  end if;

  -- Y después la deuda, que es lo que ocurre cuando no ha podido: si can_edit()
  -- no alcanzara esta tercera columna, el móvil no podría ni dejar constancia de
  -- que la copia falta, que es justo para lo que existe.
  update public.images
     set corrected_path = null, corrected_bytes = null, corrected_pending = true
   where image_id = 'AR-9602_v1'
  returning * into v_row;

  if not v_row.corrected_pending or v_row.corrected_path is not null then
    raise exception 'FAIL: el catalogador no ha podido anotar la copia como pendiente';
  end if;

  raise notice 'OK: el catalogador escribe la copia corregida y su deuda';
end $$;

reset role;

-- La fila queda con copia, que es el estado en el que el Lector la descarga.
update public.images
   set corrected_pending = false,
       corrected_path = 'q/AR-9602_ab12_corr.jpg', corrected_bytes = 3145728
 where image_id = 'AR-9602_v1';

do $$
declare v_afectadas integer; v_row public.images; v_ruta text; v_bytes integer;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  -- RF-411: el Lector LEE la ruta y el tamaño. Es lo que la ficha necesita para
  -- pedir la URL firmada y para anunciar el peso de lo que se va a descargar.
  select corrected_path, corrected_bytes into v_ruta, v_bytes
    from public.images where image_id = 'AR-9602_v1';
  if v_ruta is null or v_bytes is null then
    raise exception 'FAIL: el Lector no ve la copia corregida y no puede descargarla (RF-411)';
  end if;

  -- RF-106: y no escribe la ruta ni el tamaño. Un `update` que la política USING
  -- esconde no falla: no afecta a ninguna fila. Ese silencio es lo que hay que
  -- afirmar, porque sin afirmarlo el test pasaría igual sobre una tabla sin
  -- ninguna política.
  --
  -- Los valores elegidos son válidos para las cuatro restricciones a propósito
  -- —pareja completa, tamaño positivo y ruta distinta de la del máster—, y eso es
  -- parte del test y no un descuido: si la escritura del Lector rompiera además un
  -- `check`, el rechazo podría venir del `check` en vez de la política y este
  -- bloque dejaría de medir la política, que es lo único que aquí se mide. Con la
  -- política abierta esta escritura entraría sin una queja.
  update public.images
     set corrected_path = 'q/robada_corr.jpg', corrected_bytes = 1
   where image_id = 'AR-9602_v1';
  get diagnostics v_afectadas = row_count;

  reset role;
  if v_afectadas <> 0 then
    raise exception 'FAIL: el Lector ha modificado la copia corregida de % fila(s)', v_afectadas;
  end if;

  -- Y la fila sigue con lo que escribió el catalogador, comprobado ya fuera de la
  -- sesión del Lector: `row_count` a solas no cazaría una política que dejara
  -- pasar la escritura y escondiera la fila después.
  select * into v_row from public.images where image_id = 'AR-9602_v1';
  if v_row.corrected_path <> 'q/AR-9602_ab12_corr.jpg'
     or v_row.corrected_bytes <> 3145728 or v_row.corrected_pending then
    raise exception 'FAIL: la escritura del Lector ha dejado algo puesto';
  end if;

  raise notice 'OK: el Lector descarga la copia corregida y no la escribe (RF-411)';
end $$;

reset role;

-- La tercera columna aparte, y por la misma razón: para que `corrected_pending`
-- se pueda atacar sin romper `images_corrected_pending_exclusive`, la fila tiene
-- que quedar primero sin copia. Así el único motivo posible de que la escritura
-- no entre es la política.
update public.images
   set corrected_path = null, corrected_bytes = null, corrected_pending = false
 where image_id = 'AR-9602_v1';

do $$
declare v_afectadas integer; v_pendiente boolean;
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  update public.images set corrected_pending = true where image_id = 'AR-9602_v1';
  get diagnostics v_afectadas = row_count;

  reset role;
  if v_afectadas <> 0 then
    raise exception 'FAIL: el Lector ha marcado pendiente % fila(s)', v_afectadas;
  end if;

  select corrected_pending into v_pendiente
    from public.images where image_id = 'AR-9602_v1';
  if v_pendiente then
    raise exception 'FAIL: el Lector ha podido inventar una deuda de copia corregida';
  end if;

  raise notice 'OK: el Lector tampoco escribe corrected_pending';
end $$;

reset role;

-- Y tampoco cuela una copia por una fotografía nueva, que es el camino que queda
-- cuando el `update` no le sirve.
do $$
begin
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000096d1","role":"authenticated"}';
  set local role authenticated;

  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path,
                             corrected_path, corrected_bytes)
  values ('AR-9602', 'q/min2.webp', 'q/der2.webp', 'q/AR-9602_gh78_master.jpg',
          'q/AR-9602_gh78_corr.jpg', 1048576);
  raise exception 'FAIL: el Lector ha podido añadir una fotografía con copia corregida';
exception
  when insufficient_privilege then
    raise notice 'OK: el Lector no añade fotografías, con copia corregida ni sin ella';
end $$;

reset role;
rollback;
