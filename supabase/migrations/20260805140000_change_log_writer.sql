-- ============================================================
-- El escritor del registro de cambios (RF-1502, RF-1503, RF-1509 a RF-1512).
--
-- 20260805120000 creó la tabla del registro y sus tres candados, y dijo en su
-- primera línea que «el trigger que la rellena llega en la migración siguiente».
-- LA MIGRACIÓN SIGUIENTE NO LO TRAÍA: 20260805130000 es la visibilidad
-- documental, y entre una y otra el escritor se quedó sin escribir. Medido antes
-- de tocar nada: `change_log` tiene 0 filas, en `public` existen las dos
-- funciones de candado y NINGUNA función de escritura, y ni `artworks` (8
-- triggers) ni `images` (5 triggers) tienen un trigger que apunte al registro.
--
-- Así que hoy el registro es inviolable y está vacío, que es la mitad inútil de
-- la pareja: los 24 intentos de escritura ilegítima fallan —los 12 de los cuatro
-- papeles con `permission denied` y los 12 del propietario y de `postgres` con
-- los candados— y las 22 obras y 39 fotografías de la base no han dejado una sola
-- línea de historia. Un registro de auditoría que no registra nada no es más
-- seguro que no tener registro: es la apariencia de tenerlo.
--
-- Esta migración trae el escritor. NO reescribe 20260805120000, que está
-- aplicada: la tabla, sus privilegios y sus candados no se tocan ni una línea, y
-- eso es exactamente lo que aquella migración compró al partirse en dos.
--
-- ── POR QUÉ UN TRIGGER Y NO LA APLICACIÓN ───────────────────
--
-- Porque el registro tiene que capturar TODOS los caminos de escritura, y la
-- aplicación es solo uno de ellos. Un trigger sobre la tabla se dispara venga el
-- cambio de donde venga: de la PWA, de un `curl` con la clave anónima, del editor
-- SQL del panel, de una función `security definer` que se salta la RLS, o de OTRO
-- TRIGGER. Este último caso no es hipotético y va con test: `sync_photographed`
-- llama a `recalculate_photographed()`, que actualiza `artworks.photographed`
-- cuando se sube o se retira una fotografía. Ese cambio en la obra no lo escribe
-- nadie desde el formulario y tiene que quedar registrado igual, porque para
-- quien lea la historia dentro de cinco años es un cambio de la ficha.
--
-- Si el registro lo escribiera el cliente, la primera columna del historial sería
-- «lo que el cliente quiso contar», y no existiría ninguna forma de distinguirla
-- de la verdad. Con el trigger, quien quiera falsear el registro tiene que
-- falsear el dato: es el mismo argumento por el que RF-708 exigía imponer el
-- bloqueo en la base y no en el navegador.
--
-- ── AFTER Y NO BEFORE, Y ES OBLIGATORIO ─────────────────────
--
-- El trigger es AFTER INSERT OR UPDATE. No es una preferencia de estilo: en un
-- BEFORE INSERT el registro no tendría qué anotar. `assign_catalog_id` asigna
-- `catalog_id` en un BEFORE INSERT y `assign_image_id` hace lo mismo con
-- `image_id`, así que un escritor que corriera antes vería la clave a nulo y
-- escribiría una línea de auditoría sin decir de qué ficha habla —o chocaría
-- contra el `not null` de `row_key` y rompería el alta de cualquier obra.
--
-- Y en el UPDATE, AFTER es lo que garantiza que se anota el valor que QUEDÓ
-- guardado y no el que llegó: `artwork_audit_trail` sella `basic_updated_at`,
-- `tg_artwork_research_status_coherent` puede corregir un estado de
-- investigación, y `tg_image_deactivation` toca la baja. Un registro que anotara
-- lo que el cliente mandó en vez de lo que la base aceptó mentiría justamente en
-- los casos en que la base corrige al cliente, que son los que interesa auditar.
--
-- ── LO QUE NO SE ANOTA, Y POR QUÉ NO ES UNA OMISIÓN ─────────
--
-- 1. LAS MARCAS DE TRAZA. `updated_at` y `updated_by` cambian en CADA guardado,
--    por definición (RF-801, RF-803): anotarlas convertiría cada corrección de
--    una errata en tres líneas, dos de ellas sin información —«la fecha de
--    actualización pasó de las 12:04 a las 12:05»—, y el historial de una ficha
--    con doscientos cambios tendría cuatrocientas líneas de ruido delante de las
--    doscientas que alguien quiere leer. Lo mismo `created_at`, `created_by`,
--    `basic_updated_at` (RF-802) y las cuatro de la papelera —`deactivated_at`,
--    `deactivated_by`, `restored_at`, `restored_by`—, que las sella el trigger de
--    traza a partir del cambio de `active` y no las decide ninguna persona.
--
--    OJO A LO QUE SÍ SE ANOTA: `active` NO está en esa lista. Retirar y restaurar
--    son los cambios más consecuentes de una ficha y son los que dan nombre a dos
--    de los cuatro verbos del enumerado. Lo que se descarta es el sello
--    redundante que acompaña al cambio, no el cambio.
--
-- 2. LAS COLUMNAS DERIVADAS. `artworks.execution_date` es
--    `generated always as ... stored`: es una función de `date_note`,
--    `start_year`, `end_year`, `approximate_date` y `unconfirmed_date`, que sí se
--    anotan. Anotarla además sería contar el mismo cambio dos veces y, peor,
--    contar como cambio del usuario algo que el usuario no puede escribir.
--    20260805120000 ya lo había decidido al escribir que el registro «por diseño
--    no guarda las columnas derivadas».
--
-- La lista de descartes va como constante en la función y no como consulta al
-- catálogo por fila, porque se paga en cada guardado. El precio de esa decisión
-- es que una errata en un nombre no fallaría: descartaría de menos y el registro
-- se llenaría de ruido en silencio, que es el peor modo de fallo posible aquí.
-- Por eso la migración se mide a sí misma más abajo contra `pg_attribute`, en los
-- dos sentidos: que todo nombre de la lista existe de verdad en una de las dos
-- tablas auditadas, y que toda columna generada de las dos está en la lista.
--
-- ── UN UPDATE QUE NO CAMBIA NADA NO ESCRIBE NADA ────────────
--
-- RF-1510. Un `update` que manda los mismos valores —el caso normal de un
-- formulario que se guarda sin haber tocado nada, y de un `PATCH` de PostgREST
-- con el objeto entero— cambia `updated_at` y `updated_by` y ninguna otra
-- columna. Como las dos están descartadas, no queda ni un campo que anotar y el
-- `insert` escribe CERO filas. No hace falta un `if`: sale de la propia forma de
-- la consulta, que es mejor que una condición que alguien puede quitar.
--
-- Y no se escribe tampoco una línea «vacía» de operación sin campos: no podría,
-- porque la restricción `change_log_create_has_no_column` de 20260805120000 exige
-- que la única fila sin columna sea la del alta. El diseño de la tabla ya impedía
-- el registro lleno de cambios vacíos; esto es lo que hace que el escritor no
-- tenga que intentarlo.
--
-- ── NADA DE RELLENAR EL PASADO ──────────────────────────────
--
-- RF-1511. No hay backfill. Las 22 obras y las 39 fotografías que ya existen no
-- reciben una línea de alta retroactiva, y no por pereza: la única cosa que se
-- podría escribir con verdad es `changed_by` nulo y `changed_at` de hoy, o sea
-- una línea que afirma que alguien creó la ficha AR-0001 el 4 de agosto de 2026,
-- que es falso. Inventar líneas de auditoría para que el historial no empiece
-- vacío es exactamente la clase de falsificación que esta tabla existe para
-- impedir, y da igual que la escriba una migración de buena fe. El historial de
-- una ficha anterior a hoy empieza donde empieza el registro; `created_at` y
-- `created_by` de la propia fila siguen contando lo poco que se sabe de antes.
--
-- ── LO QUE SIGUE SIN SER REVERSIBLE ─────────────────────────
--
-- RF-1505, y aquí es donde había que tener cuidado, porque un escritor que sabe
-- reconstruir los valores anteriores es el 90 % de un «deshacer». No se construye
-- la otra mitad: ninguna función lee `change_log`, ninguna vista lo proyecta,
-- ninguna RPC acepta un `change_id`, y el escritor no devuelve nada ni guarda
-- identificador de transacción. Comprobado sobre la base: 0 funciones en `public`
-- que nombren `change_log` y escriban en `artworks` o en `images`, y 0 vistas
-- sobre la tabla. El test lo vuelve a comprobar y se pondrá rojo el día que
-- aparezca el atajo.
-- ============================================================


-- ── El escritor ─────────────────────────────────────────────
--
-- `security definer` Y NO PUEDE NO SERLO: el rol `authenticated` no tiene
-- `insert` sobre `change_log` —de eso va la migración anterior— así que un
-- escritor que corriera con los privilegios de quien guarda fallaría con
-- «permission denied for table change_log» y, al estar dentro del trigger,
-- tumbaría el guardado de la obra. Corriendo como su propietario, que es el de
-- `change_log`, entra por la exención del propietario a la RLS: ahí es donde
-- aterriza el aviso de 20260805120000 sobre `force row level security`, que
-- anularía esa exención y rompería el catálogo entero.
--
-- Una sola función para las dos tablas, resuelta por `tg_table_name` y por
-- `to_jsonb`, y no una por tabla. Con dos copias, el día que se añada una columna
-- a `images` habría que acordarse de la otra; y la comparación campo a campo es
-- idéntica en las dos, porque no mira ningún nombre de columna del catálogo.
create function public.tg_change_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Los descartes. Van ordenados como se explica arriba: primero las marcas de
  -- traza (RF-801 a RF-804), después las cuatro de la papelera (RF-902), y al
  -- final las derivadas. `active` NO está aquí, a propósito.
  c_ignored constant text[] := array[
    'created_at', 'created_by', 'updated_at', 'updated_by', 'basic_updated_at',
    'deactivated_at', 'deactivated_by', 'restored_at', 'restored_by',
    'execution_date'
  ];

  v_entity     public.audited_entity;
  v_row_key    text;
  v_catalog_id text;
  v_operation  public.change_operation;
  v_change_id  uuid := gen_random_uuid();
  v_who        uuid := auth.uid();
  v_new        jsonb := to_jsonb(new);
  v_old        jsonb;
begin
  -- Qué clase de ficha, GUARDADO y no deducido del formato de la clave, que es lo
  -- que pedía el comentario del enumerado. La clave de la fila se saca de la
  -- representación jsonb y no de `new.image_id`, para que la función no nombre una
  -- columna que en la otra tabla no existe.
  if tg_table_name = 'artworks' then
    v_entity  := 'ARTWORK';
    v_row_key := v_new->>'catalog_id';
  else
    v_entity  := 'IMAGE';
    v_row_key := v_new->>'image_id';
  end if;

  v_catalog_id := v_new->>'catalog_id';

  -- El alta: UNA línea y sin campo. No se enumeran los valores iniciales de la
  -- ficha, y las dos restricciones `change_log_create_has_no_column` y
  -- `change_log_create_has_no_values` no dejarían hacerlo de otra forma. Es
  -- coherente con el resto: el historial cuenta los cambios, y el estado inicial
  -- está en la propia ficha.
  if tg_op = 'INSERT' then
    insert into public.change_log
      (change_id, entity, row_key, catalog_id, operation, changed_by)
    values (v_change_id, v_entity, v_row_key, v_catalog_id, 'CREATE', v_who);
    return null;
  end if;

  v_old := to_jsonb(old);

  -- El verbo. Retirar y restaurar SON cambios del campo `active` y se anotan
  -- también como tales —la fila de campo se escribe igual, más abajo—; esto es
  -- solo el verbo con el que la interfaz lee la línea, que es lo que dice el
  -- comentario del enumerado en 20260805120000.
  if (v_old->>'active')::boolean and not (v_new->>'active')::boolean then
    v_operation := 'DEACTIVATE';
  elsif not (v_old->>'active')::boolean and (v_new->>'active')::boolean then
    v_operation := 'RESTORE';
  else
    v_operation := 'UPDATE';
  end if;

  -- Una fila por campo cambiado (RF-1502), en un solo `insert`.
  --
  -- LA COMPARACIÓN SE HACE SOBRE EL TEXTO QUE SE VA A GUARDAR, con `->>` y no
  -- con `->`. Es deliberado y es lo correcto para esta tabla: lo que el registro
  -- almacena son dos textos, así que lo que decide si hubo cambio es si esos dos
  -- textos difieren. Comparando el jsonb se podría escribir una línea cuyo valor
  -- anterior y valor nuevo fueran la misma cadena, que es un cambio vacío con
  -- otro disfraz.
  --
  -- `is distinct from` y no `<>`: un campo que pasa de nulo a un valor, o al
  -- revés, es el cambio más común de este catálogo —«sin revisar» no es «no»— y
  -- con `<>` no se anotaría ninguno de los dos.
  --
  -- El recorrido no repite ninguna clave, y de ahí sale sin índice único la
  -- invariante de «una fila por campo y operación» que 20260805120000 dijo que se
  -- afirmaría con un test en vez de con ~24 MB de índice.
  insert into public.change_log
    (change_id, entity, row_key, catalog_id, operation, column_name,
     old_value, new_value, changed_by)
  select v_change_id, v_entity, v_row_key, v_catalog_id, v_operation, n.key,
         o.value, n.value, v_who
    from jsonb_each_text(v_new) n
    join jsonb_each_text(v_old) o on o.key = n.key
   where n.key <> all (c_ignored)
     and n.value is distinct from o.value
   -- Orden estable, para que dos guardados iguales dejen la misma secuencia de
   -- líneas y una diferencia en un volcado sea una diferencia de verdad.
   order by n.key;

  return null;
end $$;

comment on function public.tg_change_log is
  'Escribe el registro de cambios de una obra o una fotografía: una fila por campo cambiado (RF-1502). AFTER, porque antes del INSERT la clave de la ficha todavía no está asignada y porque el valor que se anota es el que quedó guardado. Descarta las marcas de traza y las columnas derivadas, así que un guardado que no cambia nada no escribe ninguna línea. Es security definer porque ningún rol de la aplicación tiene insert sobre el registro.';

-- Ni el anónimo ni el autenticado la invocan: un trigger dispara sin que nadie
-- tenga EXECUTE sobre su función, y así lo comprueba function_privileges.
revoke all on function public.tg_change_log() from public;


-- ── Los dos triggers ────────────────────────────────────────
--
-- Sin `update of <columnas>`: la lista habría que mantenerla al añadir una
-- columna, y olvidarla dejaría un campo sin auditar en silencio. Sin `when`, por
-- lo mismo — el filtro de «no ha cambiado nada» está dentro y ahí se puede
-- explicar.
--
-- No hay trigger de DELETE, y no es un olvido: no existe el borrado real
-- (RF-901), ni `artworks` ni `images` tienen política de `delete` —medido: solo
-- insert, select y update en las dos— y el enumerado `change_operation` no tiene
-- un valor que anotarlo. Un `delete` solo lo puede hacer quien se salta la RLS,
-- y para ese caso la respuesta honrada es que no debe ocurrir, no una línea de
-- registro que lo normalice.
create trigger artwork_change_log
  after insert or update on public.artworks
  for each row execute function public.tg_change_log();

create trigger image_change_log
  after insert or update on public.images
  for each row execute function public.tg_change_log();


-- ── La migración se mide a sí misma ─────────────────────────
--
-- Se comprueba lo que un `create` correcto no garantiza y lo que un fallo
-- silencioso rompería sin avisar. NO se hace una prueba funcional aquí, y merece
-- decirse por qué: la única forma de comprobar que el escritor escribe es
-- cambiar una ficha, y eso dejaría en el registro una línea de una obra de
-- prueba que después NO SE PUEDE BORRAR, porque de eso va la tabla. La prueba
-- funcional va en el test, dentro de una transacción que se deshace.
do $$
declare
  c_ignored constant text[] := array[
    'created_at', 'created_by', 'updated_at', 'updated_by', 'basic_updated_at',
    'deactivated_at', 'deactivated_by', 'restored_at', 'restored_by',
    'execution_date'
  ];
  v_faltan  text[];
  v_sobran  text[];
  v_n       integer;
begin
  -- 1. La función es `security definer`. Sin esto no escribe una sola línea y,
  --    peor, tumba el guardado de cualquier obra con «permission denied».
  if not (select prosecdef from pg_proc where oid = 'public.tg_change_log()'::regprocedure) then
    raise exception 'FALLO: tg_change_log no es security definer; no podrá insertar en el registro y romperá el guardado';
  end if;

  -- 2. Los dos triggers, y AFTER. `tgtype` bit 1 (valor 2) es BEFORE: si
  --    estuviera puesto, el alta de una obra escribiría una línea con la clave a
  --    nulo. Bit 0 (valor 1) es FOR EACH ROW, y sin él no habría `new`.
  select count(*) into v_n
    from pg_trigger
   where tgrelid in ('public.artworks'::regclass, 'public.images'::regclass)
     and tgfoid = 'public.tg_change_log()'::regprocedure
     and not tgisinternal
     and (tgtype & 1) = 1    -- for each row
     and (tgtype & 2) = 0    -- after, no before
     and (tgtype & 4) <> 0   -- insert
     and (tgtype & 16) <> 0; -- update
  if v_n <> 2 then
    raise exception 'FALLO: deberían existir dos triggers AFTER INSERT OR UPDATE FOR EACH ROW del escritor, hay %', v_n;
  end if;

  -- 3. LOS DESCARTES, CONTRA EL CATÁLOGO Y EN LOS DOS SENTIDOS. Este es el
  --    bloque que caza el error real de esta entrega, porque una errata en un
  --    nombre no falla: descarta de menos y llena el registro de ruido sin que
  --    nadie se entere.
  --
  --    Sentido 1: todo nombre de la lista existe en `artworks` o en `images`.
  select coalesce(array_agg(i order by i), '{}') into v_faltan
    from unnest(c_ignored) i
   where not exists (
     select 1 from pg_attribute
      where attrelid in ('public.artworks'::regclass, 'public.images'::regclass)
        and attname = i and attnum > 0 and not attisdropped
   );
  if array_length(v_faltan, 1) > 0 then
    raise exception 'FALLO: el escritor descarta columnas que no existen en ninguna tabla auditada: [%]. Una errata aquí no falla: descarta de menos y el registro se llena de ruido',
      array_to_string(v_faltan, ', ');
  end if;

  --    Sentido 2: toda columna GENERADA de las dos tablas está en la lista. Sin
  --    esto, añadir mañana una columna derivada la anotaría como si la hubiera
  --    escrito una persona, y contaría dos veces el cambio del que se deriva.
  select coalesce(array_agg(attrelid::regclass || '.' || attname order by attname), '{}')
    into v_sobran
    from pg_attribute
   where attrelid in ('public.artworks'::regclass, 'public.images'::regclass)
     and attgenerated <> '' and attnum > 0 and not attisdropped
     and attname <> all (c_ignored);
  if array_length(v_sobran, 1) > 0 then
    raise exception 'FALLO: hay columnas generadas que el escritor anotaría como cambios del usuario: [%]',
      array_to_string(v_sobran, ', ');
  end if;

  -- 4. `active` NO está descartada. Es el aserto al revés del bloque anterior:
  --    con `active` en la lista, retirar una obra no dejaría rastro y dos de los
  --    cuatro verbos del enumerado no llegarían a escribirse nunca.
  if 'active' = any (c_ignored) then
    raise exception 'FALLO: el escritor descarta `active`; retirar o restaurar una ficha no dejaría rastro';
  end if;

  -- 5. El registro no se audita a sí mismo. Un trigger sobre `change_log` que
  --    escribiera en `change_log` sería una recursión que se come el disco al
  --    primer guardado.
  if exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.change_log'::regclass
       and not t.tgisinternal
       and t.tgfoid = 'public.tg_change_log()'::regprocedure
  ) then
    raise exception 'FALLO: el escritor del registro está enganchado al propio registro: se auditaría a sí mismo en cascada';
  end if;

  -- 6. Y los candados de 20260805120000 siguen en pie y activos. Esta migración
  --    no los toca, pero es la que estrena la primera escritura legítima: si
  --    alguien hubiera dejado uno desactivado, este es el momento de saberlo.
  select count(*) into v_n
    from pg_trigger
   where tgrelid = 'public.change_log'::regclass
     and not tgisinternal
     and tgname in ('change_log_append_only', 'change_log_no_truncate', 'change_log_insert_guard')
     and tgenabled = 'O';
  if v_n <> 3 then
    raise exception 'FALLO: los tres candados del registro deberían estar activos, hay % (¿alguien dejó uno desactivado?)', v_n;
  end if;

  raise notice 'OK: el escritor es security definer, cuelga AFTER de las dos tablas auditadas, descarta exactamente las marcas de traza y las derivadas, no se audita a sí mismo, y los tres candados siguen activos';
end $$;
