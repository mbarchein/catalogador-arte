-- El escritor del registro de cambios: RF-1502, RF-1503, RF-1505, RF-1509 a
-- RF-1512. Y el perímetro, otra vez y con el escritor ya puesto: RF-1504.
--
-- ESTE FICHERO ES LA OTRA MITAD DE change_log.test.sql. Aquel defiende que nadie
-- puede escribir en el registro; este defiende que el registro SÍ se escribe
-- cuando alguien cambia algo de verdad. Las dos mitades se necesitan: un registro
-- inviolable y vacío no es más seguro que no tener registro, es la apariencia de
-- tenerlo, y es exactamente el estado en que estuvo la base entre 20260805120000
-- y 20260805140000 —tabla cerrada, cero filas, ninguna función de escritura—.
--
-- Y hay una razón para que el candado se vuelva a medir AQUÍ, con el escritor
-- puesto, en vez de dar por bueno lo que ya midió el otro fichero: desde esta
-- migración existe en la base una función `security definer` que SÍ puede
-- insertar en el registro. Eso es superficie nueva, y lo que hay que demostrar es
-- que sigue sin haber forma de llegar a ella (bloque 9).
--
-- Todo lo que se cuenta va acotado a las obras de este fichero (`AR-96%`, `TS-%`
-- creadas aquí) y NO a la tabla entera, porque el registro es de solo añadir y
-- comparte tabla con lo que escriban los demás tests.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- Un usuario de cada papel, de verdad: los perfiles los crea el trigger de
-- auth.users. El Superusuario está aquí y no es adorno — `can_edit()` incluye
-- SUPERUSER, así que también es un autor posible del registro y su celda de la
-- matriz no la cubría nadie.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'esc-cat@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'esc-lec@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'esc-sup@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000b2';
update public.profiles set role = 'SUPERUSER' where id = '00000000-0000-0000-0000-0000000000b3';


-- ── 1. El alta deja una línea, y con el autor correcto ────────
--
-- RF-1503. Una sola línea, sin campo: el estado inicial está en la propia ficha y
-- las restricciones del registro no dejarían escribirlo de otra forma.
--
-- Se comprueba de paso lo que obliga a que el trigger sea AFTER: `catalog_id` lo
-- asigna `assign_catalog_id` en un BEFORE INSERT, así que un escritor que corriera
-- antes anotaría la clave a nulo o rompería el alta contra el `not null` de
-- `row_key`. Que la línea traiga el identificador de verdad es el aserto que lo
-- verifica.
do $$
declare v_id text; v_n integer; v_key text; v_cat text; v_col text; v_autor uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (catalog_id, artist, title, attributed_title, height_cm)
  values ('AR-9600', 'ROTILI', 'Obra del escritor', 'UNCONFIRMED', 54.00)
  returning catalog_id into v_id;
  reset role;

  select count(*) into v_n from public.change_log where row_key = 'AR-9600';
  if v_n <> 1 then
    raise exception 'FAIL: el alta de una obra debería dejar UNA línea, ha dejado % (RF-1503)', v_n;
  end if;

  select row_key, catalog_id, column_name, changed_by
    into v_key, v_cat, v_col, v_autor
    from public.change_log where row_key = 'AR-9600';

  if v_key is distinct from 'AR-9600' or v_cat is distinct from 'AR-9600' then
    raise exception 'FAIL: la línea del alta no identifica la ficha (row_key=%, catalog_id=%): el escritor no puede ser BEFORE',
      coalesce(v_key, '(nulo)'), coalesce(v_cat, '(nulo)');
  end if;
  if v_col is not null then
    raise exception 'FAIL: el alta debería ser la única línea sin campo, señala [%]', v_col;
  end if;
  if v_autor is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: el autor del alta debería ser el Catalogador que la hizo, es % (RF-1503)',
      coalesce(v_autor::text, '(nulo)');
  end if;

  raise notice 'OK: el alta deja una línea, sin campo, con la ficha identificada y el autor correcto (RF-1503)';
end $$;

reset role;

-- EL ALTA SIN IDENTIFICADOR, que es la normal en la aplicación: el formulario de
-- captura rápida no lo manda, lo asigna `assign_catalog_id` en un BEFORE INSERT
-- (RF-1204). Este es el aserto que de verdad exige que el escritor sea AFTER —
-- el bloque anterior daba el `catalog_id` escrito a mano, así que no distinguía—.
-- Con un escritor BEFORE, aquí `row_key` llegaría nula y el `not null` de la tabla
-- del registro tumbaría el alta de cualquier obra.
do $$
declare v_id text; v_n integer; v_key text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (artist, artwork_type) values ('TEST', '')
  returning catalog_id into v_id;
  reset role;

  if v_id is null or v_id !~ '^TS-[0-9]{4}$' then
    raise exception 'FAIL: el identificador no se ha asignado (%), el bloque no mide nada', coalesce(v_id, '(nulo)');
  end if;

  select count(*) into v_n from public.change_log where row_key = v_id;
  if v_n <> 1 then
    raise exception 'FAIL: el alta sin identificador debería dejar UNA línea con la clave ya asignada, ha dejado % (RF-1503)', v_n;
  end if;

  select row_key into v_key from public.change_log where row_key = v_id;
  if v_key is distinct from v_id then
    raise exception 'FAIL: la línea del alta no trae el identificador asignado por el trigger';
  end if;
  raise notice 'OK: un alta sin identificador se registra con la clave que le asignó la base (%): el escritor corre después (RF-1503)', v_id;
end $$;

reset role;

-- Y el mismo alta hecha por el Superusuario, que también puede editar. No se da
-- por hecho que «si funciona para el Catalogador funciona para el otro»: el autor
-- lo pone `auth.uid()` y lo que se comprueba es que sale el de la sesión.
do $$
declare v_autor uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9601', 'ROTILI', 'Obra del superusuario', 'UNCONFIRMED');
  reset role;

  select changed_by into v_autor from public.change_log where row_key = 'AR-9601';
  if v_autor is distinct from '00000000-0000-0000-0000-0000000000b3'::uuid then
    raise exception 'FAIL: el autor del alta del Superusuario debería ser él, es %',
      coalesce(v_autor::text, '(nulo)');
  end if;
  raise notice 'OK: el Superusuario también queda anotado como autor de lo que cambia (RF-1503)';
end $$;

reset role;

-- El Lector no puede crear, así que no hay línea que escribir. Se comprueba que
-- el intento falla Y que no dejó rastro: un registro que anotara intentos
-- fallidos contaría cambios que no ocurrieron.
do $$
declare v_n integer;
begin
  begin
    set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
    set local role authenticated;
    insert into public.artworks (catalog_id, artist, title, attributed_title)
    values ('AR-9602', 'ROTILI', 'La que el lector no puede crear', 'UNCONFIRMED');
    reset role;
    raise exception 'FAIL: el Lector ha creado una obra (RF-106)';
  exception when insufficient_privilege then
    reset role;
  end;

  select count(*) into v_n from public.change_log where row_key = 'AR-9602';
  if v_n <> 0 then
    raise exception 'FAIL: un alta rechazada ha dejado % línea(s) en el registro', v_n;
  end if;
  raise notice 'OK: lo que la RLS rechaza no llega al registro: sin cambio no hay línea (RF-106)';
end $$;

reset role;


-- ── 2. El cambio: una fila por campo (RF-1502) ───────────────
--
-- Dos campos en un solo `update` son DOS líneas con el MISMO `change_id`, que es
-- lo que permite a la interfaz reconstruir la acción del usuario. Y los valores se
-- guardan en su representación almacenada: `'54.00'` y no «54 cm».
do $$
declare
  v_n integer; v_ids integer; v_op text;
  v_old_alto text; v_new_alto text; v_old_tec text; v_new_tec text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set height_cm = 45.00, technique = 'Hierro soldado'
   where catalog_id = 'AR-9600';
  reset role;

  select count(*), count(distinct change_id) into v_n, v_ids
    from public.change_log where row_key = 'AR-9600' and operation = 'UPDATE';
  if v_n <> 2 then
    raise exception 'FAIL: dos campos cambiados deberían ser dos líneas, son % (RF-1502)', v_n;
  end if;
  if v_ids <> 1 then
    raise exception 'FAIL: los dos campos de un mismo guardado deberían compartir change_id, hay % (RF-1502)', v_ids;
  end if;

  select old_value, new_value into v_old_alto, v_new_alto
    from public.change_log where row_key = 'AR-9600' and column_name = 'height_cm';
  if v_old_alto is distinct from '54.00' or v_new_alto is distinct from '45.00' then
    raise exception 'FAIL: el alto debería anotarse como está almacenado, se anota [%] -> [%] (RF-1502)',
      coalesce(v_old_alto, '(nulo)'), coalesce(v_new_alto, '(nulo)');
  end if;

  -- La técnica venía de la cadena vacía, que es su valor por omisión: se anota la
  -- cadena vacía y no un nulo, porque son cosas distintas y el registro es el
  -- único sitio que no puede confundirlas.
  select old_value, new_value into v_old_tec, v_new_tec
    from public.change_log where row_key = 'AR-9600' and column_name = 'technique';
  if v_old_tec is distinct from '' or v_new_tec is distinct from 'Hierro soldado' then
    raise exception 'FAIL: la técnica se anota [%] -> [%]; la cadena vacía no es un nulo',
      coalesce(v_old_tec, '(NULO)'), coalesce(v_new_tec, '(NULO)');
  end if;

  select distinct operation::text into v_op
    from public.change_log where row_key = 'AR-9600' and operation = 'UPDATE';
  if v_op <> 'UPDATE' then
    raise exception 'FAIL: el verbo de un cambio corriente debería ser UPDATE, es %', v_op;
  end if;

  raise notice 'OK: una fila por campo, mismas dos con un solo change_id, y el valor tal como se almacena (RF-1502)';
end $$;

reset role;

-- El paso de nulo a valor y de valor a nulo, que es el cambio más común de este
-- catálogo —«sin revisar» no es «no»— y el que se perdería si la comparación
-- usara `<>` en vez de `is distinct from`. Se ejerce en los DOS sentidos.
do $$
declare v_n integer; v_old text; v_new text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set width_cm = 31.00 where catalog_id = 'AR-9601';  -- nulo -> valor
  update public.artworks set width_cm = null   where catalog_id = 'AR-9601';  -- valor -> nulo
  reset role;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9601' and column_name = 'width_cm';
  if v_n <> 2 then
    raise exception 'FAIL: nulo->valor y valor->nulo deberían ser dos líneas, son %: la comparación no distingue el nulo', v_n;
  end if;

  select old_value, new_value into v_old, v_new from public.change_log
   where row_key = 'AR-9601' and column_name = 'width_cm' order by id limit 1;
  if v_old is not null or v_new is distinct from '31.00' then
    raise exception 'FAIL: el paso de nulo a valor se anota [%] -> [%]', coalesce(v_old,'(nulo)'), coalesce(v_new,'(nulo)');
  end if;

  select old_value, new_value into v_old, v_new from public.change_log
   where row_key = 'AR-9601' and column_name = 'width_cm' order by id desc limit 1;
  if v_old is distinct from '31.00' or v_new is not null then
    raise exception 'FAIL: el paso de valor a nulo se anota [%] -> [%]', coalesce(v_old,'(nulo)'), coalesce(v_new,'(nulo)');
  end if;

  raise notice 'OK: el nulo es un valor y se anota en los dos sentidos (RF-1502)';
end $$;

reset role;


-- ── 3. Un guardado que no cambia nada no escribe nada ────────
--
-- RF-1510, y es el aserto que separa un registro que alguien lee de uno que
-- nadie lee. El caso no es raro: es el formulario que se guarda sin haber tocado
-- nada, y es el `PATCH` de PostgREST que manda el objeto entero. Se mide con
-- recuento ANTES y DESPUÉS, y se comprueba que el `update` afectó de verdad a una
-- fila, para que el bloque no pase por el motivo equivocado —«no escribió nada»
-- porque no actualizó nada—.
do $$
declare v_antes integer; v_despues integer; v_filas integer;
begin
  select count(*) into v_antes from public.change_log;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set height_cm = 45.00, technique = 'Hierro soldado', title = 'Obra del escritor'
   where catalog_id = 'AR-9600';
  get diagnostics v_filas = row_count;
  reset role;

  select count(*) into v_despues from public.change_log;

  if v_filas <> 1 then
    raise exception 'FAIL: el update no ha tocado la fila (% filas): el bloque no mide lo que dice medir', v_filas;
  end if;
  if v_despues <> v_antes then
    raise exception 'FAIL: un guardado que no cambia nada ha escrito % línea(s) en el registro (RF-1510)',
      v_despues - v_antes;
  end if;
  raise notice 'OK: un guardado con los mismos valores actualiza la fila y no escribe ni una línea (RF-1510)';
end $$;

reset role;


-- ── 4. Las marcas de traza no se anotan (RF-1509) ────────────
--
-- Y ESTE BLOQUE TIENE QUE DEMOSTRAR PRIMERO QUE LAS MARCAS CAMBIARON DE VERDAD,
-- porque si no estaría pasando por el motivo equivocado: «no hay línea de
-- updated_by» es trivialmente cierto si updated_by no se movió.
--
-- LAS MARCAS QUE SE EJERCEN SON `updated_by` Y `basic_updated_at`, Y NO
-- `updated_at`, POR UNA RAZÓN QUE CONVIENE DEJAR ESCRITA: el trigger de traza
-- sella con `now()`, que es la hora de la TRANSACCIÓN, así que dentro de un test
-- —una sola transacción— `updated_at` vale lo mismo antes y después y no hay forma
-- de moverlo. Las otras dos sí se mueven de verdad aquí: la obra la crea el
-- Catalogador y la cambia el Superusuario, así que `updated_by` pasa de uno a
-- otro; y `basic_updated_at` nace nula y se sella al tocar `support`, que es campo
-- de fase 1 (RF-802). Se usa una obra NUEVA justamente para que la marca básica
-- esté sin sellar al empezar.
do $$
declare
  v_autor_antes uuid; v_autor_despues uuid;
  v_basica_antes timestamptz; v_basica_despues timestamptz;
  v_ruido text[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.artworks (catalog_id, artist, title, attributed_title)
  values ('AR-9603', 'ROTILI', 'Obra de las marcas', 'UNCONFIRMED');
  reset role;

  select updated_by, basic_updated_at into v_autor_antes, v_basica_antes
    from public.artworks where catalog_id = 'AR-9603';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set support = 'Chapa' where catalog_id = 'AR-9603';
  reset role;

  select updated_by, basic_updated_at into v_autor_despues, v_basica_despues
    from public.artworks where catalog_id = 'AR-9603';

  if v_autor_despues is not distinct from v_autor_antes then
    raise exception 'FAIL: updated_by no se ha movido (% -> %), así que este bloque no está midiendo nada (RF-803)',
      coalesce(v_autor_antes::text, '(nulo)'), coalesce(v_autor_despues::text, '(nulo)');
  end if;
  -- Y se comprueba el valor exacto y no solo que cambió: `updated_by` tiene que
  -- ser el usuario de la sesión que guardó, que es lo que pide RF-803.
  if v_autor_antes   is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid
     or v_autor_despues is distinct from '00000000-0000-0000-0000-0000000000b3'::uuid then
    raise exception 'FAIL: updated_by debería ser el Catalogador y luego el Superusuario, es % y luego % (RF-803)',
      coalesce(v_autor_antes::text, '(nulo)'), coalesce(v_autor_despues::text, '(nulo)');
  end if;
  if v_basica_antes is not null or v_basica_despues is null then
    raise exception 'FAIL: basic_updated_at no ha pasado de nula a sellada (% -> %), así que este bloque no está midiendo nada (RF-802)',
      coalesce(v_basica_antes::text, '(nulo)'), coalesce(v_basica_despues::text, '(nulo)');
  end if;

  -- Y ahora, con las dos marcas movidas de verdad, el registro no debe mencionar
  -- ninguna de las nueve.
  select coalesce(array_agg(distinct column_name order by column_name), '{}')
    into v_ruido
    from public.change_log
   where row_key = 'AR-9603'
     and column_name in ('created_at', 'created_by', 'updated_at', 'updated_by',
                         'basic_updated_at', 'deactivated_at', 'deactivated_by',
                         'restored_at', 'restored_by');
  if array_length(v_ruido, 1) > 0 then
    raise exception 'FAIL: el registro anota sus propias marcas de traza: [%]. Cada guardado dejaría líneas sin información y el historial sería ilegible (RF-1509)',
      array_to_string(v_ruido, ', ');
  end if;

  -- Lo que sí se anota es el campo que cambió, y SOLO ese: una línea, no tres.
  if not exists (select 1 from public.change_log
                  where row_key = 'AR-9603' and column_name = 'support' and new_value = 'Chapa') then
    raise exception 'FAIL: el campo que sí cambió no se ha anotado';
  end if;
  if (select count(*) from public.change_log
       where row_key = 'AR-9603' and operation = 'UPDATE') <> 1 then
    raise exception 'FAIL: el cambio de un campo ha dejado % líneas; sobran las marcas de traza (RF-1509)',
      (select count(*) from public.change_log where row_key = 'AR-9603' and operation = 'UPDATE');
  end if;

  raise notice 'OK: updated_by y basic_updated_at se mueven de verdad y el registro no las menciona; un campo cambiado es UNA línea (RF-1509)';
end $$;

reset role;

-- La columna DERIVADA, con el mismo criterio y la misma cautela: se comprueba que
-- `execution_date` cambió de verdad y que el registro anota la causa y no el
-- efecto. Anotar las dos contaría el mismo cambio dos veces y presentaría como
-- cambio del usuario algo que el usuario no puede escribir.
do $$
declare v_antes text; v_despues text; v_n integer;
begin
  select execution_date into v_antes from public.artworks where catalog_id = 'AR-9600';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set start_year = 1975 where catalog_id = 'AR-9600';
  reset role;

  select execution_date into v_despues from public.artworks where catalog_id = 'AR-9600';
  if v_despues is not distinct from v_antes then
    raise exception 'FAIL: execution_date no ha cambiado, así que este bloque no está midiendo nada';
  end if;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600' and column_name = 'execution_date';
  if v_n <> 0 then
    raise exception 'FAIL: el registro anota la columna derivada execution_date (% líneas): sería el mismo cambio contado dos veces', v_n;
  end if;

  if not exists (select 1 from public.change_log
                  where row_key = 'AR-9600' and column_name = 'start_year' and new_value = '1975') then
    raise exception 'FAIL: no se ha anotado start_year, que es la causa del cambio derivado';
  end if;

  raise notice 'OK: execution_date cambia y no se anota; se anota start_year, que es lo que escribió la persona (RF-1509)';
end $$;

reset role;


-- ── 5. La papelera: los dos verbos (RF-1503) ─────────────────
--
-- Retirar y restaurar son cambios del campo `active` y se anotan también como
-- tales: la línea lleva el campo, y el verbo es lo que la interfaz lee. Se
-- comprueba además que el sello de la papelera —`deactivated_at`,
-- `deactivated_by`— se puso de verdad y NO aparece como línea.
do $$
declare v_op text; v_col text; v_old text; v_new text; v_n integer; v_sello timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set active = false where catalog_id = 'AR-9601';
  reset role;

  select deactivated_at into v_sello from public.artworks where catalog_id = 'AR-9601';
  if v_sello is null then
    raise exception 'FAIL: la baja no se ha sellado, así que este bloque no está midiendo nada (RF-902)';
  end if;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9601' and operation = 'DEACTIVATE';
  if v_n <> 1 then
    raise exception 'FAIL: retirar una ficha debería dejar UNA línea (la de active), deja %; el sello de la papelera se está anotando como cambio', v_n;
  end if;

  select operation::text, column_name, old_value, new_value into v_op, v_col, v_old, v_new
    from public.change_log where row_key = 'AR-9601' and operation = 'DEACTIVATE';
  if v_op <> 'DEACTIVATE' or v_col <> 'active' or v_old <> 'true' or v_new <> 'false' then
    raise exception 'FAIL: la baja se anota como % / % / [%] -> [%]', v_op, v_col, v_old, v_new;
  end if;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.artworks set active = true where catalog_id = 'AR-9601';
  reset role;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9601' and operation = 'RESTORE';
  if v_n <> 1 then
    raise exception 'FAIL: restaurar una ficha debería dejar UNA línea, deja %', v_n;
  end if;
  select column_name, old_value, new_value into v_col, v_old, v_new
    from public.change_log where row_key = 'AR-9601' and operation = 'RESTORE';
  if v_col <> 'active' or v_old <> 'false' or v_new <> 'true' then
    raise exception 'FAIL: la restauración se anota como % / [%] -> [%]', v_col, v_old, v_new;
  end if;

  raise notice 'OK: retirar y restaurar dejan una línea cada uno, con su verbo y su campo, y sin el sello de la papelera (RF-1503, RF-902)';
end $$;

reset role;


-- ── 6. TODOS LOS CAMINOS DE ESCRITURA ────────────────────────
--
-- Es la razón por la que el registro lo escribe un trigger de la tabla y no la
-- aplicación: un trigger no distingue de dónde viene el cambio. Aquí se ejercen
-- los caminos que NO son «la PWA manda un update», que son justo los que se
-- olvidan.

-- 6a. LA FOTOGRAFÍA. El alta de una imagen deja su propia línea, y `catalog_id`
--     la cuelga del historial de la obra sin ningún join, que es para lo que está
--     desnormalizado.
do $$
declare v_n integer; v_key text; v_cat text; v_ent text;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type)
  values ('AR-9600', 'w/min1.webp', 'w/der1.webp', 'w/master1.jpg', 'GENERAL');
  reset role;

  select count(*) into v_n from public.change_log
   where entity = 'IMAGE' and row_key = 'AR-9600_v1' and operation = 'CREATE';
  if v_n <> 1 then
    raise exception 'FAIL: el alta de una fotografía debería dejar UNA línea, deja %', v_n;
  end if;

  select entity::text, row_key, catalog_id into v_ent, v_key, v_cat
    from public.change_log where row_key = 'AR-9600_v1' and operation = 'CREATE';
  if v_ent <> 'IMAGE' or v_key <> 'AR-9600_v1' or v_cat <> 'AR-9600' then
    raise exception 'FAIL: la línea de la fotografía dice % / % / %; row_key es la imagen y catalog_id la obra', v_ent, v_key, v_cat;
  end if;
  raise notice 'OK: la fotografía se audita como su propia ficha y cuelga del historial de la obra (RF-1503)';
end $$;

reset role;

-- 6b. EL UPDATE QUE HACE OTRO TRIGGER, que es el camino que se olvida siempre.
--     Al subir la primera fotografía, `sync_photographed` llama a
--     `recalculate_photographed()`, que actualiza `artworks.photographed`. Ese
--     cambio de la obra no lo escribió nadie desde el formulario y tiene que
--     quedar registrado igual — y CON EL AUTOR CORRECTO, que es lo que se
--     perdería si el escritor sacara el autor de otro sitio que no fuera la
--     sesión: `recalculate_photographed` es `security definer`.
do $$
declare v_n integer; v_old text; v_new text; v_autor uuid; v_valor boolean;
begin
  select photographed into v_valor from public.artworks where catalog_id = 'AR-9600';
  if not v_valor then
    raise exception 'FAIL: photographed no se ha recalculado, así que este bloque no está midiendo nada';
  end if;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600' and column_name = 'photographed';
  if v_n <> 1 then
    raise exception 'FAIL: el cambio que hizo otro trigger sobre la obra no está registrado (% líneas). El registro no captura todos los caminos de escritura (RF-1512)', v_n;
  end if;

  select old_value, new_value, changed_by into v_old, v_new, v_autor
    from public.change_log where row_key = 'AR-9600' and column_name = 'photographed';
  if v_old <> 'false' or v_new <> 'true' then
    raise exception 'FAIL: photographed se anota [%] -> [%]', v_old, v_new;
  end if;
  if v_autor is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: el autor del cambio en cascada debería ser quien subió la foto, es % (RF-1512)',
      coalesce(v_autor::text, '(nulo)');
  end if;

  raise notice 'OK: lo que cambia OTRO TRIGGER queda registrado, con el autor de la sesión que lo provocó (RF-1512)';
end $$;

-- 6c. LA RPC. `set_main_image()` actualiza `images.index_image` con dos `update`
--     dentro de una función. Es un camino de escritura que no pasa por ningún
--     `PATCH` de la tabla, y el registro lo tiene que ver igual.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  perform public.set_main_image('AR-9600_v1');
  reset role;

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600_v1' and column_name = 'index_image' and new_value = 'true';
  if v_n <> 1 then
    raise exception 'FAIL: lo que cambia una RPC no queda registrado (% líneas sobre index_image) (RF-1512)', v_n;
  end if;
  raise notice 'OK: lo que cambia una RPC queda registrado (RF-1512)';
end $$;

reset role;

-- 6d. LA SESIÓN ADMINISTRATIVA, sin sesión de aplicación: `changed_by` nulo. Nulo
--     es la verdad —una migración o un acceso por consola no los hizo ninguna
--     persona— y es lo que justifica que la columna sea nulable. Lo que NO puede
--     pasar es que el cambio no se anote: el propietario de la tabla se salta la
--     RLS, y si el registro dependiera de las políticas este cambio sería
--     invisible.
do $$
declare v_n integer; v_autor uuid;
begin
  -- Se vacía la reclamación del JWT a mano: `reset role` devuelve el rol pero NO
  -- borra `request.jwt.claims`, así que sin esta línea el bloque seguiría
  -- corriendo con el usuario del bloque anterior y no mediría lo que dice medir.
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'FAIL: la sesión del test todavía tiene usuario (%), así que este bloque no mide la sesión administrativa', auth.uid();
  end if;

  update public.artworks set inventory_process_notes = 'corregido por consola'
   where catalog_id = 'AR-9600';

  select count(*) into v_n from public.change_log
   where row_key = 'AR-9600' and column_name = 'inventory_process_notes';
  if v_n <> 1 then
    raise exception 'FAIL: un cambio hecho por la sesión administrativa no se ha registrado (% líneas) (RF-1512)', v_n;
  end if;

  select changed_by into v_autor from public.change_log
   where row_key = 'AR-9600' and column_name = 'inventory_process_notes';
  if v_autor is not null then
    raise exception 'FAIL: sin sesión, el autor debería ser nulo y es %', v_autor;
  end if;
  raise notice 'OK: el cambio de una sesión sin usuario se registra igual, con autor nulo, que es la verdad (RF-1512)';
end $$;


-- ── 7. El registro no se audita a sí mismo ───────────────────
--
-- Sería una recursión: cada línea escrita generaría líneas sobre la línea. No se
-- comprueba solo que no hay trigger enganchado —eso es la forma—, sino el
-- resultado: escribir en el registro no produce más filas que las escritas.
do $$
declare v_n integer; v_esperadas integer; v_antes integer;
begin
  select count(*) into v_antes from public.change_log;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  -- Tres campos de una vez: tres líneas y ni una más.
  update public.artworks
     set signature_description = 'Ángulo inferior derecho',
         physical_location     = 'Almacén 2',
         measurements_verified = true
   where catalog_id = 'AR-9600';
  reset role;

  select count(*) into v_n from public.change_log;
  v_esperadas := v_antes + 3;
  if v_n <> v_esperadas then
    raise exception 'FAIL: tres campos deberían escribir tres líneas; la tabla ha pasado de % a % (esperado %). El registro se está auditando en cascada',
      v_antes, v_n, v_esperadas;
  end if;

  if exists (select 1 from public.change_log where row_key like 'c%-%' or catalog_id = 'change_log') then
    raise exception 'FAIL: hay líneas del registro que auditan al propio registro';
  end if;

  raise notice 'OK: tres campos son tres líneas exactas: el registro no se audita a sí mismo en cascada';
end $$;

reset role;

-- Y la forma, que es lo que impide que vuelva: ningún trigger del registro llama
-- al escritor, y el escritor no cuelga de ninguna tabla que no sea auditada.
do $$
declare v_tablas text[];
begin
  select coalesce(array_agg(distinct tgrelid::regclass::text order by tgrelid::regclass::text), '{}')
    into v_tablas
    from pg_trigger
   where tgfoid = 'public.tg_change_log()'::regprocedure and not tgisinternal;
  if v_tablas <> array['artworks', 'images'] then
    raise exception 'FAIL: el escritor del registro cuelga de [%]; debería colgar solo de artworks e images',
      array_to_string(v_tablas, ', ');
  end if;
  raise notice 'OK: el escritor cuelga exactamente de las dos tablas auditadas y de ninguna más';
end $$;

-- LOS DOS TRIGGERS SON `AFTER`, Y ESTE ASERTO NO ES DECORACIÓN ESTRUCTURAL: ES EL
-- MÁS CARO DE TODO EL FICHERO.
--
-- Medido, enganchando el escritor como BEFORE y repitiendo el alta de un Lector:
-- la obra NO se creó (0 filas en `artworks`) y el registro SÍ anotó su línea de
-- alta (1 fila), sin que el `insert` diera ningún error. La causa es que el
-- escritor termina con `return null`, que en un AFTER se ignora y en un BEFORE
-- SIGNIFICA «descarta esta fila en silencio». Enganchado como BEFORE, el escritor
-- convierte el catálogo entero en un agujero: cada alta se pierde sin avisar y el
-- registro certifica creaciones que no ocurrieron, que es la peor combinación
-- posible de las dos mitades de esta pareja.
--
-- La migración ya lo comprueba al aplicarse; esto lo comprueba en cada
-- `make db-test`, que es donde se va a notar si alguien recrea el trigger a mano.
do $$
declare v_mal text[];
begin
  select coalesce(array_agg(tgname || ' sobre ' || tgrelid::regclass order by tgname), '{}')
    into v_mal
    from pg_trigger
   where tgfoid = 'public.tg_change_log()'::regprocedure
     and not tgisinternal
     and ((tgtype & 2) <> 0      -- before
       or (tgtype & 1) = 0);     -- por sentencia y no por fila
  if array_length(v_mal, 1) > 0 then
    raise exception 'FAIL: el escritor está enganchado como BEFORE o por sentencia en [%]. Como BEFORE, su `return null` DESCARTA la fila: se perderían las altas y el registro anotaría creaciones que no ocurrieron',
      array_to_string(v_mal, ', ');
  end if;
  raise notice 'OK: los dos triggers del escritor son AFTER y por fila; como BEFORE, su `return null` haría desaparecer cada alta en silencio';
end $$;


-- ── 8. Lo que el escritor NO puede convertirse en (RF-1505) ──
--
-- Un escritor que sabe reconstruir los valores anteriores es el 90 % de un
-- «deshacer». La otra mitad no existe y este bloque se pone rojo el día que
-- aparezca. Es deliberadamente tosco: su valor no es la precisión, es obligar a
-- que borrarlo aparezca en un diff que alguien lee.

-- 8a. Ninguna función lee el registro y escribe en el catálogo.
do $$
declare v_sospechosas text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}')
    into v_sospechosas
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname not in ('tg_change_log', 'tg_change_log_append_only', 'tg_change_log_insert_guard')
     and p.prosrc like '%change_log%'
     and (p.prosrc like '%update public.artworks%' or p.prosrc like '%update public.images%'
       or p.prosrc like '%update artworks%'        or p.prosrc like '%update images%'
       or p.prosrc like '%insert into public.artworks%' or p.prosrc like '%insert into public.images%');
  if array_length(v_sospechosas, 1) > 0 then
    raise exception 'FAIL: hay funciones que leen el registro y escriben en el catálogo: %. El registro es informativo y no reversible (RF-1505)',
      array_to_string(v_sospechosas, ', ');
  end if;
  raise notice 'OK: ninguna función devuelve un valor del registro al catálogo (RF-1505)';
end $$;

-- 8b. Y NINGUNA FUNCIÓN ACEPTA UN `change_id`, que es la firma que tendría un
--     «deshacer esta acción»: el registro agrupa por `change_id` justamente para
--     que la interfaz lea la acción, y esa misma clave es la que indexaría la
--     restauración. Se mira el nombre del parámetro y no solo el tipo, porque
--     media base usa uuid.
do $$
declare v_rpc text[];
begin
  select coalesce(array_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                            order by p.proname), '{}')
    into v_rpc
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prorettype <> 'trigger'::regtype
     and coalesce(array_to_string(p.proargnames, ','), '') ~ '(^|,)[a-z_]*change_id';
  if array_length(v_rpc, 1) > 0 then
    raise exception 'FAIL: hay funciones que reciben un change_id, que es la firma de un «deshacer»: % (RF-1505)',
      array_to_string(v_rpc, ', ');
  end if;
  raise notice 'OK: ninguna función recibe un change_id: no hay por dónde deshacer una acción (RF-1505)';
end $$;

-- 8c. Ninguna vista sobre el registro que se salte su política, y el escritor no
--     devuelve nada aprovechable: es una función de trigger.
do $$
declare v_vistas text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into v_vistas
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('v', 'm')
     and pg_get_viewdef(c.oid) like '%change_log%'
     and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%';
  if array_length(v_vistas, 1) > 0 then
    raise exception 'FAIL: hay vistas sobre el registro que se saltan su política: %',
      array_to_string(v_vistas, ', ');
  end if;

  if (select prorettype from pg_proc where oid = 'public.tg_change_log()'::regprocedure)
     <> 'trigger'::regtype then
    raise exception 'FAIL: el escritor ha dejado de ser una función de trigger y se puede invocar (RF-1505)';
  end if;
  raise notice 'OK: ni vistas ni una función invocable: el registro no tiene camino de vuelta (RF-1505)';
end $$;


-- ── 9. El candado, con el escritor ya puesto (RF-1504) ───────
--
-- ESTE ES EL BLOQUE QUE JUSTIFICA REPETIR LO QUE YA MIDE change_log.test.sql.
-- Desde esta migración existe una función `security definer` que SÍ puede
-- insertar en el registro: es superficie nueva, y hay que demostrar que no hay
-- forma de llegar a ella. Los doce intentos —tres verbos por cada uno de los
-- cuatro papeles— sobre una tabla que AHORA TIENE FILAS DE VERDAD, escritas por
-- el escritor unos bloques más arriba, para que un `update` o un `delete` que
-- «afecta a cero filas» no pueda pasar por un fallo.
do $$
declare
  v_actores constant text[] := array['Lector', 'Catalogador', 'Superusuario', 'anónimo'];
  v_subs    constant text[] := array['00000000-0000-0000-0000-0000000000b2',
                                     '00000000-0000-0000-0000-0000000000b1',
                                     '00000000-0000-0000-0000-0000000000b3', ''];
  v_verbos  constant text[] := array['insert', 'update', 'delete'];
  v_sql     constant text[] := array[
    $q$insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
       values (gen_random_uuid(), 'ARTWORK', 'AR-9600', 'AR-9600', 'CREATE')$q$,
    $q$update public.change_log set new_value = 'lo que a mí me convenga'$q$,
    $q$delete from public.change_log$q$];
  a integer; v integer; v_filas_antes integer; v_filas_despues integer;
  v_pasaron integer := 0; v_mal_motivo text[] := '{}';
begin
  select count(*) into v_filas_antes from public.change_log;
  if v_filas_antes < 1 then
    raise exception 'FAIL: el registro está vacío, así que estos doce intentos no atacan nada';
  end if;

  for a in 1 .. array_length(v_actores, 1) loop
    for v in 1 .. array_length(v_verbos, 1) loop
      begin
        if v_actores[a] = 'anónimo' then
          set local role anon;
        else
          perform set_config('request.jwt.claims',
            '{"sub":"' || v_subs[a] || '","role":"authenticated"}', true);
          set local role authenticated;
        end if;
        execute v_sql[v];
        reset role;
        v_pasaron := v_pasaron + 1;
      exception
        when insufficient_privilege then
          -- LO CORRECTO, y el tipo de error importa tanto como el hecho de
          -- fallar: parado por PRIVILEGIO es la PRIMERA de las dos cerraduras en
          -- serie de RF-113, la que PostgREST aplica antes de mirar ninguna
          -- política y la que también para a un `curl` que se salte la interfaz.
          reset role;
        when others then
          -- Parado, pero por la SEGUNDA cerradura. Es un fallo del test y no un
          -- aprobado por los pelos: significa que alguien ha concedido el
          -- privilegio y que del par de cerraduras solo queda una. Medido: con
          -- `grant insert, update, delete ... to authenticated`, los doce intentos
          -- pasan a morir en el candado en vez de en el privilegio.
          reset role;
          v_mal_motivo := v_mal_motivo
            || (v_actores[a] || ' ' || v_verbos[v] || ' (' || sqlstate || ')');
      end;
    end loop;
  end loop;

  if v_pasaron > 0 then
    raise exception 'FAIL: % de los doce intentos de escritura sobre el registro han pasado (RF-1504)', v_pasaron;
  end if;

  if array_length(v_mal_motivo, 1) > 0 then
    raise exception 'FAIL: estos intentos fallaron, pero NO por falta de privilegio: [%]. El privilegio se ha concedido y de las dos cerraduras en serie queda una (RF-113, RF-1504)',
      array_to_string(v_mal_motivo, ', ');
  end if;

  select count(*) into v_filas_despues from public.change_log;
  if v_filas_despues <> v_filas_antes then
    raise exception 'FAIL: los doce intentos han cambiado el número de líneas del registro: % -> %',
      v_filas_antes, v_filas_despues;
  end if;

  raise notice 'OK: los doce intentos (insert, update y delete por el Lector, el Catalogador, el Superusuario y el anónimo) fallan por PRIVILEGIO, y las % líneas siguen intactas (RF-1504, RF-113)',
    v_filas_antes;
end $$;

reset role;

-- Y los dos roles que se saltan la RLS, contra una tabla con filas. A estos no
-- los para el privilegio: los para el candado, que es el argumento entero de
-- 20260805120000 visto desde el rol para el que solo sirve una de las dos
-- cerraduras.
do $$
declare v_paradas integer := 0;
begin
  begin
    insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
    values (gen_random_uuid(), 'ARTWORK', 'AR-9600', 'AR-9600', 'CREATE');
  exception when raise_exception then
    if sqlerrm <> 'En el registro de cambios solo escribe el trigger de auditoría' then
      raise exception 'FAIL: la inserción del propietario falló por otra cosa: %', sqlerrm;
    end if;
    v_paradas := v_paradas + 1;
  end;

  begin
    update public.change_log set new_value = 'corregido a posteriori';
  exception when raise_exception then
    if sqlerrm <> 'El registro de cambios no se modifica ni se borra: es un registro de auditoría' then
      raise exception 'FAIL: el update del propietario falló por otra cosa: %', sqlerrm;
    end if;
    v_paradas := v_paradas + 1;
  end;

  begin
    delete from public.change_log;
  exception when raise_exception then
    v_paradas := v_paradas + 1;
  end;

  begin
    truncate public.change_log;
  exception when raise_exception then
    v_paradas := v_paradas + 1;
  end;

  if v_paradas <> 4 then
    raise exception 'FAIL: el propietario debería quedar parado en los cuatro verbos, lo ha sido en % (RF-1504)', v_paradas;
  end if;
  raise notice 'OK: al propietario, que se salta la RLS, lo paran los candados en los cuatro verbos (RF-1504)';
end $$;

do $$
declare v_paradas integer := 0;
begin
  begin
    set local role postgres;
    insert into public.change_log (change_id, entity, row_key, catalog_id, operation)
    values (gen_random_uuid(), 'ARTWORK', 'AR-9600', 'AR-9600', 'CREATE');
    reset role;
  exception when raise_exception then
    reset role;
    v_paradas := v_paradas + 1;
  end;
  begin
    set local role postgres;
    delete from public.change_log;
    reset role;
  exception when raise_exception then
    reset role;
    v_paradas := v_paradas + 1;
  end;
  if v_paradas <> 2 then
    raise exception 'FAIL: al rol del panel deberían pararlo los dos candados, lo han hecho % (RF-1504)', v_paradas;
  end if;
  raise notice 'OK: al rol del panel de Supabase tampoco le dejan insertar ni borrar (RF-1504)';
end $$;

reset role;

-- LA VÍA QUE ABRIRÍA EL PROPIO CANDADO SI SE MIRARA MAL. El candado de inserción
-- deja pasar cualquier `insert` que venga de dentro de otro trigger
-- (`pg_trigger_depth() >= 2`). Eso sería explotable si un rol de la aplicación
-- pudiera CREAR una tabla con un trigger propio y meter desde ahí una línea
-- inventada. No puede, por dos razones independientes, y las dos se miden porque
-- si se cayera una quedaría la otra sola.
do $$
begin
  if has_schema_privilege('authenticated', 'public', 'create')
     or has_schema_privilege('anon', 'public', 'create') then
    raise exception 'FAIL: un rol de la aplicación puede crear objetos en el esquema público; podría montar un trigger y colar líneas en el registro por el hueco de pg_trigger_depth()';
  end if;
  -- Y aunque pudiera: seguiría sin tener `insert` sobre el registro, que se
  -- comprueba antes que ningún trigger.
  if has_table_privilege('authenticated', 'public.change_log', 'insert')
     or has_table_privilege('anon', 'public.change_log', 'insert') then
    raise exception 'FAIL: un rol de la aplicación tiene insert sobre el registro (RF-1504)';
  end if;
  -- Ni EXECUTE sobre el escritor, que es la tercera puerta y la más directa:
  -- invocarlo no serviría —es una función de trigger— pero no se deja abierta.
  if has_function_privilege('authenticated', 'public.tg_change_log()', 'execute')
     or has_function_privilege('anon', 'public.tg_change_log()', 'execute') then
    raise exception 'FAIL: un rol de la aplicación puede ejecutar el escritor del registro';
  end if;
  raise notice 'OK: el hueco de pg_trigger_depth() no es explotable: ningún rol de la aplicación crea objetos, ni tiene insert, ni ejecuta el escritor (RF-1504)';
end $$;


-- ── 10. Quién ve la historia que el escritor acaba de escribir ─
--
-- RF-1506 y RF-609, ahora sobre líneas REALES y no sobre un fixture insertado a
-- mano. Es la comprobación que faltaba: la política se escribió contra filas
-- puestas con el candado desactivado, y hasta hoy nunca se había leído una línea
-- que hubiera escrito el trigger.
do $$
declare v_n integer;
begin
  -- La obra AR-9601 queda ACTIVA (se restauró en el bloque 5) y AR-9600 también.
  -- Se retira AR-9601 para leer la historia de una ficha de la papelera.
  update public.artworks set active = false where catalog_id = 'AR-9601';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.change_log where row_key = 'AR-9601';
  if v_n <> 0 then
    raise exception 'FAIL: el Lector ve % línea(s) de la historia de una obra retirada (RF-609, RF-1506)', v_n;
  end if;

  select count(*) into v_n from public.change_log where row_key = 'AR-9600';
  if v_n = 0 then
    raise exception 'FAIL: el Lector no ve nada de la historia de una obra activa (RF-105, RF-1506)';
  end if;
  reset role;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.change_log where row_key = 'AR-9601';
  if v_n = 0 then
    raise exception 'FAIL: el Catalogador no ve la historia de la ficha que está en la papelera (RF-913, RF-1506)';
  end if;
  reset role;

  raise notice 'OK: sobre líneas escritas por el trigger, el Lector no ve la historia de la papelera y el Catalogador sí (RF-609, RF-913, RF-1506)';
end $$;

reset role;


-- ── 11. Lo que el escritor descarta, medido contra el catálogo ─
--
-- Los dos sentidos, igual que en la migración, para que este fichero se ponga
-- rojo si alguien añade una columna generada a una tabla auditada sin decidir qué
-- hacer con ella. En la migración el aserto se ejecuta una vez; aquí se ejecuta
-- en cada `make db-test`, que es donde se va a notar.
do $$
declare
  c_ignored constant text[] := array[
    'created_at', 'created_by', 'updated_at', 'updated_by', 'basic_updated_at',
    'deactivated_at', 'deactivated_by', 'restored_at', 'restored_by',
    'execution_date'
  ];
  v_mal   text[];
  v_fuente text := (select prosrc from pg_proc
                     where oid = 'public.tg_change_log()'::regprocedure);
begin
  -- Que la lista de este test siga siendo la de la función: si alguien cambia una
  -- y no la otra, este fichero deja de medir lo que dice medir. Se busca cada
  -- nombre en el cuerpo del escritor, que es lo único observable desde aquí.
  select coalesce(array_agg(i order by i), '{}') into v_mal
    from unnest(c_ignored) i
   where position(i in v_fuente) = 0;
  if array_length(v_mal, 1) > 0 then
    raise exception 'FAIL: la lista de descartes de este test no coincide con la del escritor; el escritor no menciona: [%]',
      array_to_string(v_mal, ', ');
  end if;

  select coalesce(array_agg(attrelid::regclass || '.' || attname order by attname), '{}')
    into v_mal
    from pg_attribute
   where attrelid in ('public.artworks'::regclass, 'public.images'::regclass)
     and attgenerated <> '' and attnum > 0 and not attisdropped
     and attname <> all (c_ignored);
  if array_length(v_mal, 1) > 0 then
    raise exception 'FAIL: hay columnas generadas nuevas que el escritor anotaría como cambios del usuario: [%]',
      array_to_string(v_mal, ', ');
  end if;

  if 'active' = any (c_ignored) then
    raise exception 'FAIL: `active` está descartada; retirar una ficha no dejaría rastro';
  end if;

  raise notice 'OK: los descartes del escritor son exactamente las marcas de traza y las derivadas, y `active` no está entre ellos (RF-1509)';
end $$;

rollback;
