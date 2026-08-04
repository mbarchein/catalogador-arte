-- RF-509: la procedencia es una secuencia ordenada de eventos, no un campo.
-- RF-510: el relato narrativo y la cadena estructurada conviven sin pisarse.
-- RF-511: el titular de derechos es una relación, y una parte que sostiene una
--         cadena no se retira (revisa RF-905).
-- RF-218: «Sin revisar» no es «no» llevado del campo al bloque documental.
-- RF-517, RF-901, RF-902: un eslabón se retira, no se borra, y la baja deja traza.
-- RF-111, RF-113: la tabla nace cerrada y nadie tiene DELETE.
-- ADR-004: la fecha estructurada, con la única diferencia que este grupo cambia.
--
-- Lo que se comprueba es lo que el cliente no debe volver a comprobar: que un
-- eslabón dice de quién habla, que el orden es de la catalogadora y se rehace
-- entero o no se rehace, que los tres enumerados no admiten texto libre, que un
-- año imposible no entra, que un eslabón comprado y vendido el mismo año SÍ
-- entra —y que la obra sigue sin admitirlo—, y que la columna de estado de
-- investigación no puede mentir por ninguna de sus dos puertas.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- Un catalogador, un lector, dos obras y dos partes. Los perfiles los crea el
-- trigger de auth.users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cat-procedencia@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'lec-procedencia@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9700', 'ROTILI', 'La de la cadena larga', 'UNCONFIRMED'),
  ('AR-9701', 'ROTILI', 'La de la cadena corta', 'UNCONFIRMED');

insert into public.parties (id, party_type, name) values
  ('00000000-0000-0000-0000-0000000000e1', 'INSTITUTION', 'Galería de prueba de procedencia'),
  ('00000000-0000-0000-0000-0000000000e2', 'PERSON',      'Coleccionista de prueba'),
  -- Titular de derechos que NO aparece en ninguna cadena: es el caso de RF-511
  -- —los derechos pueden no ir con la posesión— y además es lo que permite
  -- comprobar las dos ramas del guardarraíl por separado.
  ('00000000-0000-0000-0000-0000000000e3', 'PERSON',      'Heredera de prueba');

-- ── 1. Un eslabón mínimo entra ───────────────────────────────
-- Lo que se sabe la primera vez que un nombre aparece en un catálogo de 1985: de
-- quién se habla, y nada más. Todo lo demás nace explícito y pendiente.
do $$
declare v_fila public.provenance_events%rowtype;
begin
  insert into public.provenance_events (catalog_id, party_id)
  values ('AR-9700', '00000000-0000-0000-0000-0000000000e1');

  select * into v_fila from public.provenance_events where catalog_id = 'AR-9700';

  if v_fila.capacity <> 'UNREVIEWED' or v_fila.acquisition <> 'UNREVIEWED' then
    raise exception 'FAIL: la calidad y la adquisición no nacen «Sin revisar» (% / %)',
      v_fila.capacity, v_fila.acquisition;
  end if;
  if v_fila.position <> 1 then
    raise exception 'FAIL: el primer eslabón no ocupa la posición 1 (%)', v_fila.position;
  end if;
  if not v_fila.active or v_fila.note <> '' or v_fila.party_note <> ''
     or v_fila.date_text <> '' then
    raise exception 'FAIL: los campos opcionales no nacen vacíos';
  end if;
  raise notice 'OK: un eslabón mínimo entra y lo pendiente queda pendiente (RF-509, RF-205)';
end $$;

-- ── 2. Un eslabón dice de quién habla ────────────────────────
-- Con ficha o sin ella: «Colección privada, España» y «colección desconocida»
-- son eslabones legítimos sin parte detrás, y por eso `party_id` es nulo a
-- propósito. Lo que no existe es un eslabón anónimo que además ocupa una
-- posición: una cadena con un hueco es un documento falseado.
do $$
begin
  begin
    insert into public.provenance_events (catalog_id) values ('AR-9700');
    raise exception 'FAIL: ha entrado un eslabón que no dice de quién habla';
  exception when check_violation then
    raise notice 'OK: un eslabón sin parte y sin descripción se rechaza';
  end;

  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9700', 'Colección privada, España');
  raise notice 'OK: un eslabón sin ficha detrás es legítimo (v11: «Colección privada, [país]»)';
end $$;

-- ── 3. El orden lo pone la catalogadora ──────────────────────
-- Manual y no derivado de las fechas: la mitad de los eslabones de un catálogo
-- razonado no tienen año conocido, y un orden derivado de nulos no es un orden.
do $$
declare v_orden integer[];
begin
  insert into public.provenance_events (catalog_id, party_id)
  values ('AR-9700', '00000000-0000-0000-0000-0000000000e2');

  select array_agg(position order by created_at, position) into v_orden
    from public.provenance_events where catalog_id = 'AR-9700';
  if v_orden <> array[1, 2, 3] then
    raise exception 'FAIL: los eslabones no se numeraron por orden de llegada: %', v_orden;
  end if;

  -- Y el orden es de cada obra: el primero de otra empieza en 1.
  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9701', 'colección desconocida');
  if (select position from public.provenance_events where catalog_id = 'AR-9701') <> 1 then
    raise exception 'FAIL: el orden no es independiente por obra';
  end if;
  raise notice 'OK: cada eslabón nuevo se coloca al final de la cadena de su obra';
end $$;

-- ── 4. Rehacer el orden es todo o nada ───────────────────────
--
-- El test NO cambia de rol a `authenticated`, al contrario que el de las
-- fotografías, y es a propósito: las políticas de esta tabla las escribe la
-- migración siguiente, así que con RLS activado y sin política un rol con sesión
-- no vería ni una fila y la función fallaría por no encontrar la cadena, no por
-- lo que aquí se comprueba. Lo que sí se fija es la sesión, que es de donde
-- `can_edit()` saca el papel de quien llama.
do $$
declare
  v_ids uuid[];
  v_orden uuid[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select array_agg(id order by position) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700' and active;

  perform public.reorder_provenance_events(
    'AR-9700', array[v_ids[3], v_ids[1], v_ids[2]]
  );

  select array_agg(id order by position) into v_orden
    from public.provenance_events where catalog_id = 'AR-9700' and active;
  if v_orden <> array[v_ids[3], v_ids[1], v_ids[2]] then
    raise exception 'FAIL: el orden guardado no es el pedido';
  end if;
  raise notice 'OK: el catalogador rehace el orden de la cadena (RF-509)';
end $$;

do $$
declare
  v_ids uuid[];
  v_antes uuid[];
  v_despues uuid[];
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select array_agg(id order by position) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700' and active;
  v_antes := v_ids;

  -- Falta uno: media cadena ordenada se lee como un orden y no lo es.
  begin
    perform public.reorder_provenance_events('AR-9700', array[v_ids[2], v_ids[1]]);
    raise exception 'FAIL: se admitió una lista incompleta';
  exception when others then
    if position('no coincide' in sqlerrm) = 0 then raise; end if;
  end;

  -- Repetido: pasaría el recuento y dejaría dos eslabones peleándose una posición.
  begin
    perform public.reorder_provenance_events(
      'AR-9700', array[v_ids[1], v_ids[1], v_ids[2]]);
    raise exception 'FAIL: se admitieron identificadores repetidos';
  exception when others then
    if position('repetidos' in sqlerrm) = 0 then raise; end if;
  end;

  -- De otra obra: arrastraría la cadena de al lado.
  begin
    perform public.reorder_provenance_events(
      'AR-9700',
      array[v_ids[1], v_ids[2],
            (select id from public.provenance_events where catalog_id = 'AR-9701')]);
    raise exception 'FAIL: se admitió un eslabón de otra obra';
  exception when others then
    if position('no pertenece' in sqlerrm) = 0 then raise; end if;
  end;

  select array_agg(id order by position) into v_despues
    from public.provenance_events where catalog_id = 'AR-9700' and active;
  if v_antes <> v_despues then
    raise exception 'FAIL: una lista rechazada dejó el orden a medias';
  end if;
  raise notice 'OK: una lista que no es exactamente la cadena se rechaza entera';
end $$;

-- ── 5. Un lector no reordena ─────────────────────────────────
do $$
declare v_ids uuid[];
begin
  select array_agg(id order by position) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700' and active;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

  perform public.reorder_provenance_events('AR-9700', array[v_ids[2], v_ids[1], v_ids[3]]);
  raise exception 'FAIL: un lector pudo reordenar la procedencia';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector no reordena la cadena: %', sqlerrm;
end $$;

-- ── 6. Los tres enumerados son cerrados ──────────────────────
-- Son enumerados y no maestras porque el CÓDIGO mira su valor: de la calidad de
-- tenencia depende quién es el poseedor actual y cómo se redacta la línea.
do $$
declare v_id uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events set capacity = 'DEPOSIT', acquisition = 'GIFT'
   where id = v_id;
  raise notice 'OK: en depósito habiendo llegado por donación es un eslabón normal';

  begin
    update public.provenance_events set capacity = 'PRESTADO' where id = v_id;
    raise exception 'FAIL: la calidad de tenencia ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: la calidad de tenencia es un enumerado cerrado';
  end;

  begin
    update public.provenance_events set acquisition = 'REGALO' where id = v_id;
    raise exception 'FAIL: la forma de adquisición ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: la forma de adquisición es un enumerado cerrado';
  end;

  begin
    update public.artworks set provenance_status = 'PENDIENTE' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el estado de investigación ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el estado de investigación es un enumerado cerrado';
  end;

  -- Y los dos que distinguen lo pendiente de lo investigado sin resultado
  -- conviven, que es el motivo de que sean cinco valores y no cuatro (RF-205).
  update public.provenance_events set capacity = 'UNKNOWN' where id = v_id;
  update public.provenance_events set capacity = 'UNREVIEWED' where id = v_id;
  raise notice 'OK: «Desconocido» y «Sin revisar» son dos valores distintos';
end $$;

-- ── 7. La fecha, con la forma de ADR-004 ─────────────────────
do $$
declare v_id uuid; v_texto text;
begin
  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events
     set start_year = 1985, end_year = 1991, approximate_date = true
   where id = v_id;
  select date_text into v_texto from public.provenance_events where id = v_id;
  if v_texto <> 'c. 1985-1991' then
    raise exception 'FAIL: el texto de la fecha no se compone solo (%)', v_texto;
  end if;

  -- La nota manda sobre la composición, como `date_note` sobre `execution_date`.
  update public.provenance_events set date_note = 'finales de los ochenta' where id = v_id;
  select date_text into v_texto from public.provenance_events where id = v_id;
  if v_texto <> 'finales de los ochenta' then
    raise exception 'FAIL: la nota de fecha no manda sobre la fecha compuesta (%)', v_texto;
  end if;
  update public.provenance_events set date_note = '' where id = v_id;

  -- Y no se escribe nunca directamente.
  begin
    update public.provenance_events set date_text = 'a mano' where id = v_id;
    raise exception 'FAIL: se ha podido escribir la columna generada';
  exception when generated_always then
    raise notice 'OK: el texto de la fecha es generado y no se escribe';
  end;

  begin
    update public.provenance_events set start_year = 985 where id = v_id;
    raise exception 'FAIL: ha entrado un año imposible';
  exception when check_violation then
    raise notice 'OK: un año fuera de rango plausible es una errata, no una fecha';
  end;

  begin
    update public.provenance_events
       set start_year = null, end_year = null, unconfirmed_date = true where id = v_id;
    raise exception 'FAIL: una bandera de duda sin año ha entrado';
  exception when check_violation then
    raise notice 'OK: «[?]» a secas no dice nada: las banderas exigen año';
  end;

  begin
    update public.provenance_events set start_year = 1990, end_year = 1985 where id = v_id;
    raise exception 'FAIL: ha entrado un rango invertido';
  exception when check_violation then
    raise notice 'OK: un rango no acaba antes de empezar';
  end;
end $$;

-- ── 8. Comprada y vendida en 1985 ────────────────────────────
-- La ÚNICA diferencia con `artworks_coherent_range`, y es la que justifica
-- repetir las cinco columnas en vez de reutilizar las de la obra: allí el rango
-- exige estrictamente mayor y aquí admite el mismo año, porque una tenencia de
-- unos meses es un eslabón perfectamente normal.
do $$
declare v_id uuid;
begin
  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events set start_year = 1985, end_year = 1985 where id = v_id;
  raise notice 'OK: un eslabón que empieza y acaba en 1985 entra';

  begin
    update public.artworks set start_year = 1985, end_year = 1985 where catalog_id = 'AR-9701';
    raise exception 'FAIL: la obra ha admitido un rango de un solo año';
  exception when check_violation then
    raise notice 'OK: la obra sigue exigiendo un rango de verdad (ADR-004, sin tocar)';
  end;
end $$;

-- ── 9. El relato y la cadena conviven ────────────────────────
-- RF-510: cuando el relato tiene texto es lo que la ficha imprime, y cuando está
-- vacío la ficha compone la línea con los eslabones. La regla vive en la
-- interfaz; lo que la base garantiza es que las dos representaciones existen y
-- ninguna pisa a la otra.
do $$
declare v_fila public.artworks%rowtype; v_eslabones int;
begin
  update public.artworks
     set provenance = 'Colección del artista; Galería de prueba, 1985 [?]; colección privada, España.',
         provenance_note = 'Según catálogo de la exposición de 1985.',
         rights_holder_party_id = '00000000-0000-0000-0000-0000000000e3',
         rights_holder_note = 'Derechos reservados a la familia pese al depósito.'
   where catalog_id = 'AR-9700';

  select * into v_fila from public.artworks where catalog_id = 'AR-9700';
  select count(*) into v_eslabones
    from public.provenance_events where catalog_id = 'AR-9700' and active;

  if v_fila.provenance = '' or v_eslabones < 3 then
    raise exception 'FAIL: escribir el relato ha borrado la cadena, o al revés (% eslabones)',
      v_eslabones;
  end if;
  if v_fila.rights_holder_party_id is distinct from '00000000-0000-0000-0000-0000000000e3'::uuid then
    raise exception 'FAIL: el titular de derechos no se ha guardado como relación (RF-511)';
  end if;
  raise notice 'OK: el relato publicable y la cadena estructurada conviven (RF-510, RF-511)';
end $$;

-- ── 10. «Sin revisar» no es «no», por las dos puertas ────────
-- RF-218. Sin esto la columna puede mentir, y una columna que puede mentir sobre
-- si algo se investigó es peor que no tenerla: la ficha diría «investigado sin
-- resultado» encima de una lista de eslabones.
do $$
declare v_ids uuid[];
begin
  -- Primera puerta: declararlo con eslabones debajo.
  begin
    update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9700';
    raise exception 'FAIL: se ha declarado la procedencia investigada sin resultado con eslabones';
  exception when others then
    if position('investigada sin resultado' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: no se declara «investigado sin resultado» habiendo cadena';
  end;

  -- Con la cadena retirada sí se puede: es la diferencia entre no haber mirado y
  -- haber mirado y no encontrar nada.
  update public.provenance_events set active = false where catalog_id = 'AR-9700';
  update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9700';
  raise notice 'OK: sin cadena activa, «investigado sin resultado» es una respuesta legítima';

  -- Segunda puerta: añadir un eslabón a una obra declarada así.
  begin
    insert into public.provenance_events (catalog_id, party_note)
    values ('AR-9700', 'Un hallazgo posterior');
    raise exception 'FAIL: se ha añadido un eslabón a una procedencia investigada sin resultado';
  exception when others then
    if position('contradice' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: un eslabón nuevo no contradice en silencio al estado declarado';
  end;

  -- Y restaurar uno retirado tampoco cuela por la puerta de atrás.
  select array_agg(id) into v_ids
    from public.provenance_events where catalog_id = 'AR-9700';
  begin
    update public.provenance_events set active = true where id = v_ids[1];
    raise exception 'FAIL: restaurar un eslabón ha esquivado la comprobación';
  exception when others then
    if position('contradice' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: restaurar un eslabón tampoco contradice al estado declarado';
  end;

  -- Lo que SÍ se permite, y es intencionado: eslabones con el estado en «Sin
  -- revisar». Tener un dato no es haber hecho la investigación.
  update public.artworks set provenance_status = 'UNREVIEWED' where catalog_id = 'AR-9700';
  update public.provenance_events set active = true where catalog_id = 'AR-9700';
  raise notice 'OK: una cadena con el estado «Sin revisar» es normal: tener datos no es haber investigado';
end $$;

-- ── 11. Una parte que sostiene una cadena no se retira ───────
-- RF-511, y revisa RF-905: dejar el campo vacío en las obras que la tenían
-- asignada sería borrar un eslabón documentado por la vía indirecta.
do $$
declare v_id uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  begin
    update public.parties set active = false
     where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FAIL: se ha retirado una parte que sostiene un eslabón';
  exception when others then
    if position('eslabón de procedencia' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una parte con eslabón activo no se retira';
  end;

  begin
    update public.parties set active = false
     where id = '00000000-0000-0000-0000-0000000000e3';
    raise exception 'FAIL: se ha retirado una parte que es titular de derechos';
  exception when others then
    if position('titular de derechos' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una parte titular de derechos de una obra activa no se retira';
  end;

  -- Sacada de la cadena, sí se retira: la regla no es un candado, es un orden.
  update public.provenance_events set active = false
   where party_id = '00000000-0000-0000-0000-0000000000e1';
  update public.parties set active = false
   where id = '00000000-0000-0000-0000-0000000000e1';
  raise notice 'OK: sacada de la cadena, la parte se retira con normalidad';

  -- Y una obra en la papelera no cuenta, como en los lugares: sus eslabones ya no
  -- se muestran (RF-905 hacia abajo) y exigir vaciar la papelera antes de retirar
  -- una parte sería hacer que la papelera estorbe.
  update public.provenance_events set active = true
   where party_id = '00000000-0000-0000-0000-0000000000e1';
  update public.parties set active = true
   where id = '00000000-0000-0000-0000-0000000000e1';
  update public.artworks set active = false, rights_holder_party_id = null
   where catalog_id = 'AR-9700';
  update public.parties set active = false
   where id = '00000000-0000-0000-0000-0000000000e1';
  raise notice 'OK: los eslabones de una obra en la papelera no retienen a su parte';

  update public.artworks set active = true where catalog_id = 'AR-9700';
  update public.parties set active = true where id = '00000000-0000-0000-0000-0000000000e1';
end $$;

-- ── 12. Una parte en uso tampoco se borra a la fuerza ────────
-- `on delete restrict` es el cinturón por debajo de que nadie tenga DELETE:
-- si alguna vez se borrara una parte a mano, esto avisa en vez de romper la
-- cadena en silencio.
do $$
begin
  begin
    delete from public.parties where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FAIL: se ha borrado una parte que sostiene un eslabón';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena impide borrar una parte en uso';
  end;
end $$;

-- ── 13. La papelera del eslabón ──────────────────────────────
-- RF-517, que revisa RF-903: la premisa de RF-903 —que una fila puente no tiene
-- nada citable y basta con rehacerla— no se sostiene en un eslabón que lleva
-- años, calidad de tenencia y la fuente del dato.
do $$
declare
  v_id uuid;
  v_baja timestamptz; v_quien uuid;
  v_restaurada timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select id into v_id from public.provenance_events where catalog_id = 'AR-9701';

  update public.provenance_events set active = false where id = v_id;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.provenance_events where id = v_id;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del eslabón no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.provenance_events where id = v_id) then
    raise exception 'FAIL: el eslabón ha desaparecido al retirarlo';
  end if;

  update public.provenance_events set active = true where id = v_id;
  select deactivated_at, restored_at into v_baja, v_restaurada
    from public.provenance_events where id = v_id;
  if v_restaurada is null or v_baja is null then
    raise exception 'FAIL: restaurar no ha dejado traza, o ha borrado la de la baja (RF-902)';
  end if;
  raise notice 'OK: el eslabón se retira, se restaura y conserva las dos trazas';
end $$;

-- ── 14. Nadie borra de verdad, y la tabla nace cerrada ───────
-- RF-901, RF-111, RF-113. Las políticas las escribe la migración siguiente; con
-- RLS activado y sin política, la tabla está cerrada, que es el estado seguro
-- para esperar. Lo que no puede pasar nunca es lo contrario: privilegios
-- concedidos sin RLS.
do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'provenance_events'
                and cmd in ('DELETE', 'ALL')) then
    raise exception 'FAIL: hay una política que permite DELETE sobre los eslabones';
  end if;
  if has_table_privilege('authenticated', 'public.provenance_events', 'delete')
     or has_table_privilege('anon', 'public.provenance_events', 'delete') then
    raise exception 'FAIL: alguien tiene privilegio de DELETE sobre los eslabones';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.provenance_events'::regclass) then
    raise exception 'FAIL: la tabla de eslabones no tiene RLS activado';
  end if;
  raise notice 'OK: RLS activado, retirar es un update y borrar no está concedido a nadie';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.provenance_events limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar la procedencia';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a la procedencia';
end $$;

reset role;

-- ── 15. El traslado de los cuatro nodos del árbol ────────────
-- Sobre una base cargada con el volcado: ADR-006 anticipó que los museos y las
-- colecciones dejarían de ser lugares, y esta migración lo cumple a medias y a
-- propósito —el nodo se queda, porque sigue contestando a «dónde está la obra»;
-- lo que sale del árbol es la propiedad metida dentro del nombre.
--
-- En una base sin el volcado (integración continua) no hay nada que comprobar y
-- el bloque lo dice en voz alta en vez de dar por bueno un cero.
do $$
declare
  v_eslabones int;
  v_fichas int;
  v_matiz int;
  v_inventados int;
  v_lugar text;
begin
  select count(*) into v_eslabones
    from public.provenance_events where note like 'Trasladado del árbol de lugares%';

  if v_eslabones = 0 then
    raise notice 'OK (base sin volcado): no hay traslado del árbol que comprobar';
    return;
  end if;

  if v_eslabones <> 8 then
    raise exception 'FAIL: el traslado dejó % eslabones y las obras afectadas eran 8', v_eslabones;
  end if;

  select count(*) into v_fichas
    from public.parties where note like 'Ficha creada al sacar la propiedad%';
  if v_fichas <> 3 then
    raise exception 'FAIL: el traslado creó % fichas de parte y eran 3 (las dos Hormeño comparten)',
      v_fichas;
  end if;

  -- Ningún lugar activo lleva ya la propiedad dentro del nombre, que es la mitad
  -- del motivo de todo esto.
  if exists (select 1 from public.physical_places where active and name ilike '%propiedad de%') then
    raise exception 'FAIL: sigue habiendo un lugar activo con la propiedad dentro del nombre';
  end if;

  -- Y la precisión que ese nombre llevaba dentro no se ha perdido: viaja al
  -- eslabón, que es donde significa algo. La obra sigue en el árbol, en el nodo
  -- hermano.
  select count(*) into v_matiz
    from public.provenance_events
   where note like 'Trasladado del árbol de lugares%' and party_note <> '';
  if v_matiz <> 1 then
    raise exception 'FAIL: la precisión de propiedad no ha llegado al eslabón (% filas)', v_matiz;
  end if;

  select p.name into v_lugar
    from public.provenance_events e
    join public.artworks a on a.catalog_id = e.catalog_id
    join public.physical_places p on p.id = a.physical_place_id
   where e.note like 'Trasladado del árbol de lugares%' and e.party_note <> '';
  if v_lugar is null or v_lugar ilike '%propiedad de%' then
    raise exception 'FAIL: la obra de la coletilla no ha quedado en el nodo hermano (%)', v_lugar;
  end if;

  -- Y no se ha inventado ningún hecho jurídico: el árbol decía dónde está la
  -- obra, no en qué calidad la tiene quien la guarda.
  select count(*) into v_inventados
    from public.provenance_events
   where note like 'Trasladado del árbol de lugares%'
     and (capacity <> 'UNREVIEWED' or acquisition <> 'UNREVIEWED');
  if v_inventados > 0 then
    raise exception 'FAIL: % eslabones trasladados se inventan la calidad o la adquisición',
      v_inventados;
  end if;

  raise notice 'OK: los ocho eslabones del árbol están, con su matiz y sin inventarse nada';
end $$;

rollback;
