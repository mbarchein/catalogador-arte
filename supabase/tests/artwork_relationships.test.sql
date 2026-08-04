-- RF-217: la relación entre dos obras lleva su tipo, y el tipo es vocabulario
--         propio con clave sustituta: nombre directo, nombre inverso y bandera
--         de simetría. Una simétrica se guarda una sola vez, canonicalizada; una
--         asimétrica no admite su contraria.
-- RF-212: `obras_relacionadas` es una relación múltiple autorreferencial y no un
--         campo de texto. RF-217 la extiende.
-- RF-216: la clave de una tabla maestra no es su nombre: renombrar un tipo es un
--         update de una fila y lo ve el catálogo entero (ADR-007).
-- RF-517, RF-903: una relación se retira, no se borra, y volver a añadirla la
--         restaura en vez de chocar contra la unicidad.
-- RF-901, RF-902: nada se borra, y la baja deja traza de quién y cuándo.
-- RF-801, RF-803, RF-804: la autoría y la fecha las sella la base.
-- RF-111, RF-113: las dos tablas nacen cerradas y nadie tiene DELETE.
--
-- Lo que se comprueba es lo que el cliente no debe volver a comprobar. Tres
-- cosas de esta lista son las que justifican el grupo entero, y las tres son
-- fallos que no se ven al escribirlos:
--
--   • Que la misma pareja simétrica no entra dos veces según el orden en que se
--     escriba, porque cada una se da de alta desde la ficha de su obra y nadie
--     va a recordar cómo la escribió la otra vez.
--   • Que la contraria de una asimétrica se rechaza, también al RESTAURAR una
--     relación que estaba en la papelera, que es el camino por el que la
--     contradicción entra de verdad.
--   • Que la simetría de un tipo ya usado no se puede cambiar, porque mezclar
--     las dos convenciones de guardado deja pasar la misma pareja dos veces y
--     después ya no hay forma de saber cuál sobra.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- Un catalogador, un lector y cuatro obras. Los perfiles los crea el trigger de
-- auth.users. Los identificadores se eligen a mano y en orden para poder
-- razonar sobre cuál es el menor, que es de lo que va la canonicalización.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cat-relaciones@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'lec-relaciones@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000c2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9700', 'ROTILI', 'Díptico, mitad izquierda', 'UNCONFIRMED'),
  ('AR-9701', 'ROTILI', 'Díptico, mitad derecha',   'UNCONFIRMED'),
  ('AR-9702', 'ROTILI', 'Estudio para el díptico',  'UNCONFIRMED'),
  ('AR-9703', 'ROTILI', 'Reverso catalogado aparte','UNCONFIRMED');

-- ── 1. El vocabulario nace sembrado (RF-217) ─────────────────
-- Una maestra vacía deja el selector en blanco y obliga a inventar el
-- vocabulario mientras se cataloga. Son los seis casos que el catálogo ya tiene
-- delante: tres simétricos y tres con su inversa.
do $$
declare
  v_n int;
  v_simetricos int;
begin
  select count(*) into v_n from public.artwork_relationship_types
   where name in ('Pareja de', 'Parte del mismo políptico que', 'Versión de',
                  'Estudio previo de', 'Reverso de', 'Copia de')
     and active;
  if v_n <> 6 then
    raise exception 'FAIL: el vocabulario de tipos de relación no nace sembrado (% de 6)', v_n;
  end if;

  select count(*) into v_simetricos from public.artwork_relationship_types
   where is_symmetric;
  if v_simetricos <> 3 then
    raise exception 'FAIL: no hay exactamente tres tipos simétricos sembrados (%)', v_simetricos;
  end if;

  -- La inversa de la asimétrica es el dato entero de esta maestra: sin ella, la
  -- ficha de la otra obra no tendría nada que escribir.
  if (select inverse_name from public.artwork_relationship_types
       where name = 'Estudio previo de') <> 'Obra final de' then
    raise exception 'FAIL: «Estudio previo de» no trae su etiqueta inversa';
  end if;
  if (select inverse_name from public.artwork_relationship_types
       where name = 'Pareja de') <> '' then
    raise exception 'FAIL: un tipo simétrico ha nacido con etiqueta inversa';
  end if;

  raise notice 'OK: los seis tipos de relación están sembrados, con su inversa y su simetría (RF-217)';
end $$;

-- ── 2. Un tipo, una fila, y coherente ────────────────────────
-- La etiqueta de la dirección contraria tiene que existir SIEMPRE en un tipo
-- asimétrico: es lo que la base garantiza para que la interfaz pueda leer las
-- dos direcciones sin comprobar nada.
do $$
begin
  begin
    insert into public.artwork_relationship_types (name, is_symmetric)
    values ('Boceto de', false);
    raise exception 'FAIL: ha entrado un tipo asimétrico sin etiqueta inversa';
  exception when check_violation then
    raise notice 'OK: un tipo asimétrico sin inversa se rechaza (RF-217)';
  end;

  begin
    insert into public.artwork_relationship_types (name, inverse_name, is_symmetric)
    values ('Gemela de', 'Gemela de', false);
    raise exception 'FAIL: ha entrado un tipo asimétrico cuya inversa es su propio nombre';
  exception when check_violation then
    raise notice 'OK: una inversa igual al nombre se rechaza: es simetría mal declarada';
  end;

  begin
    insert into public.artwork_relationship_types (name, inverse_name, is_symmetric)
    values ('Contigua de', 'Contigua de la anterior', true);
    raise exception 'FAIL: ha entrado un tipo simétrico CON etiqueta inversa';
  exception when check_violation then
    raise notice 'OK: un tipo simétrico con inversa se rechaza: serían dos etiquetas para un hecho';
  end;

  begin
    insert into public.artwork_relationship_types (name, is_symmetric) values ('   ', true);
    raise exception 'FAIL: ha entrado un tipo de relación en blanco';
  exception when check_violation then
    raise notice 'OK: un tipo en blanco se rechaza';
  end;

  begin
    insert into public.artwork_relationship_types (name, is_symmetric)
    values (' Contigua de ', true);
    raise exception 'FAIL: ha entrado un tipo sin recortar';
  exception when check_violation then
    raise notice 'OK: un tipo con espacios alrededor se rechaza';
  end;

  begin
    insert into public.artwork_relationship_types (name, inverse_name, is_symmetric)
    values ('Boceto de', ' Obra final del boceto ', false);
    raise exception 'FAIL: ha entrado una etiqueta inversa sin recortar';
  exception when check_violation then
    raise notice 'OK: una inversa con espacios alrededor se rechaza';
  end;

  -- Unicidad por clave de comparación y no por el nombre literal.
  begin
    insert into public.artwork_relationship_types (name, is_symmetric)
    values ('PAREJA DE', true);
    raise exception 'FAIL: han entrado dos filas del mismo tipo de relación';
  exception when unique_violation then
    raise notice 'OK: dos escrituras del mismo tipo son la misma fila';
  end;

  -- Y ampliar la lista es una fila, que es el motivo entero de que esto sea una
  -- maestra y no un enumerado.
  insert into public.artwork_relationship_types (name, inverse_name, is_symmetric)
  values ('Fragmento de', 'Obra de la que procede el fragmento', false);
  raise notice 'OK: la usuaria amplía el vocabulario sin migración (RF-217)';
end $$;

-- ── 3. Una relación mínima entra ─────────────────────────────
-- Dos obras y un tipo: lo que se sabe al descubrir que las dos tablas son un
-- díptico. La nota nace vacía y la relación nace activa.
do $$
declare
  v_tipo uuid;
  v_fila public.artwork_relationships%rowtype;
begin
  select id into v_tipo from public.artwork_relationship_types
   where name = 'Parte del mismo políptico que';

  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
  values ('AR-9700', 'AR-9701', v_tipo)
  returning * into v_fila;

  if v_fila.note <> '' then
    raise exception 'FAIL: la nota no nace vacía';
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una relación nueva no nace activa';
  end if;
  raise notice 'OK: una relación mínima entra (RF-212, RF-217)';
end $$;

-- ── 4. Una obra no se relaciona consigo misma ────────────────
-- Es la fila que produce un selector con la obra actual dentro, y que después
-- pinta en la ficha un enlace a la propia ficha.
do $$
declare v_tipo uuid;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Versión de';
  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9700', 'AR-9700', v_tipo);
    raise exception 'FAIL: una obra se ha relacionado consigo misma';
  exception when check_violation then
    raise notice 'OK: una obra no es estudio previo de sí misma';
  end;
end $$;

-- ── 5. Los tres extremos existen de verdad ───────────────────
do $$
declare v_tipo uuid;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Versión de';

  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-0000', 'AR-9700', v_tipo);
    raise exception 'FAIL: se ha relacionado una obra inexistente por el extremo de salida';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza una obra inexistente a la salida';
  end;

  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9700', 'AR-0000', v_tipo);
    raise exception 'FAIL: se ha relacionado una obra inexistente por el extremo de llegada';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza una obra inexistente a la llegada';
  end;

  -- El tipo inexistente pasa por los dos triggers que leen la maestra ANTES de
  -- que la clave ajena hable: los dos tienen que callarse y dejarla hablar, o el
  -- error que ve la usuaria sería otro.
  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9700', 'AR-9702', '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: se ha usado un tipo de relación inexistente';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza un tipo inexistente, y los triggers la dejan hablar';
  end;
end $$;

-- ── 6. La misma relación es un hecho, no dos ─────────────────
-- Y dos tipos distintos entre las mismas dos obras sí conviven: el anverso y el
-- reverso de una tabla pueden ser además parte del mismo políptico.
do $$
declare v_politico uuid; v_reverso uuid;
begin
  select id into v_politico from public.artwork_relationship_types
   where name = 'Parte del mismo políptico que';
  select id into v_reverso from public.artwork_relationship_types where name = 'Reverso de';

  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9700', 'AR-9701', v_politico);
    raise exception 'FAIL: la misma relación ha entrado dos veces';
  exception when unique_violation then
    raise notice 'OK: la terna obra + obra + tipo es única';
  end;

  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
  values ('AR-9700', 'AR-9701', v_reverso);
  raise notice 'OK: dos tipos distintos entre las mismas dos obras conviven';
end $$;

-- ── 7. Una relación simétrica se guarda UNA vez ──────────────
--
-- El fallo que este bloque persigue: cada relación se da de alta desde la ficha
-- de su obra, así que la misma pareja se escribe una vez en cada sentido sin que
-- nadie lo note, y sin canonicalizar entrarían dos filas con dos notas que
-- pueden decir cosas distintas.
do $$
declare
  v_tipo uuid;
  v_fila public.artwork_relationships%rowtype;
  v_n int;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Pareja de';

  -- Escrita al revés: el mayor primero. La base la da la vuelta.
  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id, note)
  values ('AR-9703', 'AR-9702', v_tipo, 'Colgaban juntas en el estudio')
  returning * into v_fila;

  if v_fila.from_catalog_id <> 'AR-9702' or v_fila.to_catalog_id <> 'AR-9703' then
    raise exception 'FAIL: la relación simétrica no se ha canonicalizado (% → %)',
      v_fila.from_catalog_id, v_fila.to_catalog_id;
  end if;

  -- Y la misma pareja escrita en el otro sentido es la MISMA fila, así que
  -- choca. Es lo que después convierte `relate_artworks` en una restauración.
  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9702', 'AR-9703', v_tipo);
    raise exception 'FAIL: la misma pareja simétrica ha entrado dos veces';
  exception when unique_violation then
    raise notice 'OK: «A pareja de B» y «B pareja de A» son la misma fila (RF-217)';
  end;

  select count(*) into v_n from public.artwork_relationships
   where relationship_type_id = v_tipo;
  if v_n <> 1 then
    raise exception 'FAIL: la pareja simétrica ha dejado % filas', v_n;
  end if;

  -- Una relación ASIMÉTRICA no se canonicaliza: su sentido es el dato.
  select id into v_tipo from public.artwork_relationship_types where name = 'Estudio previo de';
  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
  values ('AR-9702', 'AR-9700', v_tipo)
  returning * into v_fila;
  if v_fila.from_catalog_id <> 'AR-9702' then
    raise exception 'FAIL: se ha canonicalizado una relación asimétrica y se ha perdido su sentido';
  end if;
  raise notice 'OK: la asimétrica conserva su dirección, que es su dato';
end $$;

-- ── 8. Y una asimétrica no admite su contraria ───────────────
--
-- «A es estudio previo de B» y «B es estudio previo de A» no pueden ser ciertas
-- a la vez. La ficha de B ya dice «obra final de A» sin que nadie escriba nada:
-- para eso existe la etiqueta inversa.
do $$
declare v_estudio uuid; v_copia uuid;
begin
  select id into v_estudio from public.artwork_relationship_types where name = 'Estudio previo de';
  select id into v_copia   from public.artwork_relationship_types where name = 'Copia de';

  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9700', 'AR-9702', v_estudio);
    raise exception 'FAIL: han entrado las dos direcciones de una relación asimétrica';
  exception when raise_exception then
    if position('contrario' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la contraria de una asimétrica se rechaza: %', sqlerrm;
  end;

  -- Lo que SÍ se permite: la pareja contraria con OTRO tipo. Que AR-9700 sea
  -- copia de AR-9702 no contradice que AR-9702 sea su estudio previo — son dos
  -- hechos distintos, y decidir si tienen sentido juntos es trabajo de la
  -- catalogadora y no de una restricción.
  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
  values ('AR-9700', 'AR-9702', v_copia);
  raise notice 'OK: la comprobación mira SU tipo y no cierra el paso a otro distinto';
end $$;

-- ── 9. La papelera de una relación (RF-517, revisa RF-903) ───
-- La fila lleva trabajo de investigación y quién la retiró es traza que
-- interesa, así que se retira y no se borra. Sin `restored_at`: se restaura
-- desde la ficha de la que cuelga y vuelve limpia, como las demás puentes.
do $$
declare
  v_tipo uuid; v_id uuid;
  v_baja timestamptz; v_quien uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  select id into v_tipo from public.artwork_relationship_types where name = 'Pareja de';
  select id into v_id from public.artwork_relationships where relationship_type_id = v_tipo;

  update public.artwork_relationships set active = false where id = v_id;

  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.artwork_relationships where id = v_id;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la baja de la relación no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.artwork_relationships where id = v_id) then
    raise exception 'FAIL: la relación ha desaparecido al retirarla (RF-517 revisa RF-903)';
  end if;

  update public.artwork_relationships set active = true where id = v_id;
  if (select deactivated_at from public.artwork_relationships where id = v_id) is not null then
    raise exception 'FAIL: la relación restaurada arrastra la traza de una baja que ya no existe';
  end if;
  raise notice 'OK: una relación se retira, deja traza y vuelve limpia (RF-902, RF-517)';
end $$;

-- ── 10. Volver a relacionar RESTAURA, en cualquier orden ─────
--
-- RF-517. Con la unicidad cubriendo también las relaciones retiradas, un
-- `insert` crudo choca contra el índice y la interfaz convertiría un «Añadir» en
-- una violación de unicidad incomprensible. Se comprueban las dos mitades: que
-- el `insert` crudo efectivamente choca —que es por lo que la función existe— y
-- que la función restaura, incluso con las dos obras pasadas al revés, que es lo
-- propio de esta puente y de ninguna de las otras tres.
do $$
declare
  v_tipo uuid; v_id uuid;
  v_fila public.artwork_relationships%rowtype;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  select id into v_tipo from public.artwork_relationship_types where name = 'Pareja de';
  select id into v_id from public.artwork_relationships where relationship_type_id = v_tipo;

  update public.artwork_relationships set active = false where id = v_id;

  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9702', 'AR-9703', v_tipo);
    raise exception 'FAIL: el insert crudo de una relación retirada no ha chocado';
  exception when unique_violation then
    raise notice 'OK: el insert crudo choca — que es por lo que existe relate_artworks';
  end;

  -- Y la función la recupera, pasando las obras EN EL OTRO ORDEN: la usuaria la
  -- está añadiendo desde la ficha de la otra obra y no tiene por qué recordar
  -- cómo se escribió la primera vez. Sin nota: el formulario de «Añadir» viene
  -- en blanco y lo que no se manda no puede borrar lo que alguien investigó.
  v_fila := public.relate_artworks('AR-9703', 'AR-9702', v_tipo);

  if not v_fila.active then
    raise exception 'FAIL: volver a relacionar no ha restaurado la relación';
  end if;
  if v_fila.id is distinct from v_id then
    raise exception 'FAIL: se ha creado una fila nueva en vez de restaurar la que había';
  end if;
  if v_fila.note <> 'Colgaban juntas en el estudio' then
    raise exception 'FAIL: restaurar ha borrado la nota investigada (%)', v_fila.note;
  end if;
  if v_fila.deactivated_at is not null or v_fila.deactivated_by is not null then
    raise exception 'FAIL: la relación restaurada conserva la traza de una baja que ya no existe';
  end if;

  -- Y con nota nueva, manda lo que se manda.
  v_fila := public.relate_artworks('AR-9702', 'AR-9703', v_tipo, 'Se subastaron por separado en 1994');
  if v_fila.note <> 'Se subastaron por separado en 1994' then
    raise exception 'FAIL: la función no ha actualizado la nota (%)', v_fila.note;
  end if;

  -- Una terna que no existía se crea, que es el otro camino de la misma función.
  select id into v_tipo from public.artwork_relationship_types where name = 'Versión de';
  v_fila := public.relate_artworks('AR-9703', 'AR-9701', v_tipo, 'Misma composición, otro soporte');
  if not v_fila.active or v_fila.from_catalog_id <> 'AR-9701' then
    raise exception 'FAIL: la función no ha creado la relación nueva ya canonicalizada';
  end if;
  raise notice 'OK: volver a relacionar restaura, en cualquier orden y con su nota (RF-517)';
end $$;

-- ── 11. Restaurar pasa por la misma puerta ───────────────────
--
-- Es el camino por el que la contradicción entra de verdad: la relación
-- contraria se escribió mientras esta estaba en la papelera, y restaurarla
-- dejaría las dos direcciones activas a la vez sin que nadie insertara nada.
do $$
declare v_tipo uuid; v_id uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  select id into v_tipo from public.artwork_relationship_types where name = 'Estudio previo de';
  select id into v_id from public.artwork_relationships
   where relationship_type_id = v_tipo and from_catalog_id = 'AR-9702';

  update public.artwork_relationships set active = false where id = v_id;

  -- Con la primera retirada, la contraria ya se puede registrar: retirar una
  -- relación es decir que no consta, y entonces no hay contradicción.
  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
  values ('AR-9700', 'AR-9702', v_tipo);

  begin
    update public.artwork_relationships set active = true where id = v_id;
    raise exception 'FAIL: se ha restaurado una relación cuya contraria consta activa';
  exception when raise_exception then
    if position('contrario' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: restaurar pasa por la misma puerta que insertar (RF-217)';
  end;

  -- Y con la contraria retirada, la restauración vuelve a ser posible.
  update public.artwork_relationships set active = false
   where relationship_type_id = v_tipo and from_catalog_id = 'AR-9700';
  update public.artwork_relationships set active = true where id = v_id;
  raise notice 'OK: retirada la contraria, la relación se restaura';
end $$;

-- ── 12. La simetría de un tipo usado no se cambia ────────────
--
-- No es purismo: las filas de un tipo simétrico están canonicalizadas y las de
-- uno asimétrico no. Cambiar la bandera dejaría filas guardadas con una
-- convención y filas nuevas con otra, y la misma pareja entraría dos veces sin
-- que la unicidad lo notase. Después ya no hay forma de saber cuál sobra.
do $$
declare v_tipo uuid; v_libre uuid;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Pareja de';

  begin
    update public.artwork_relationship_types
       set is_symmetric = false, inverse_name = 'Pareja de la anterior'
     where id = v_tipo;
    raise exception 'FAIL: se ha cambiado la simetría de un tipo que ya se ha usado';
  exception when raise_exception then
    if position('simetría' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la simetría de un tipo usado está cerrada: %', sqlerrm;
  end;

  -- Un tipo que todavía no ha relacionado nada sí se corrige: la regla protege
  -- las filas guardadas, no el vocabulario.
  select id into v_libre from public.artwork_relationship_types where name = 'Fragmento de';
  update public.artwork_relationship_types
     set is_symmetric = true, inverse_name = ''
   where id = v_libre;
  raise notice 'OK: un tipo sin usar se corrige entero';

  -- Y las relaciones RETIRADAS también cuentan, al contrario que en la regla de
  -- la baja: una relación en la papelera se puede restaurar, y volvería escrita
  -- con la convención antigua.
  update public.artwork_relationships set active = false where relationship_type_id = v_tipo;
  begin
    update public.artwork_relationship_types
       set is_symmetric = false, inverse_name = 'Pareja de la anterior'
     where id = v_tipo;
    raise exception 'FAIL: una relación en la papelera no ha impedido cambiar la simetría';
  exception when raise_exception then
    if position('simetría' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: una relación retirada también cierra la simetría de su tipo';
  end;
  update public.artwork_relationships set active = true where relationship_type_id = v_tipo;
end $$;

-- ── 13. El tipo en uso no se retira ──────────────────────────
-- Misma regla que en las demás maestras: retirarlo no lo retira, deja el
-- catálogo apuntando a algo que la interfaz ya no ofrece. Una relación en la
-- papelera no cuenta, que es la diferencia con el bloque anterior y es
-- deliberada: exigir vaciar la papelera para retirar un tipo sería hacer que la
-- papelera estorbe.
do $$
declare v_tipo uuid;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Reverso de';

  begin
    update public.artwork_relationship_types set active = false where id = v_tipo;
    raise exception 'FAIL: se ha retirado un tipo que todavía relaciona obras';
  exception when raise_exception then
    if position('retirar' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: un tipo en uso no se retira: %', sqlerrm;
  end;

  update public.artwork_relationships set active = false where relationship_type_id = v_tipo;
  update public.artwork_relationship_types set active = false where id = v_tipo;
  raise notice 'OK: una relación retirada no impide retirar su tipo (RF-905)';

  -- Y la baja del vocabulario se sella y se deshace, como en las demás maestras:
  -- sin `restored_at`, restaurar deja la fila como si nunca se hubiera retirado.
  if (select deactivated_at from public.artwork_relationship_types where id = v_tipo) is null then
    raise exception 'FAIL: la baja del tipo no ha quedado sellada';
  end if;
  update public.artwork_relationship_types set active = true where id = v_tipo;
  if (select deactivated_at from public.artwork_relationship_types where id = v_tipo) is not null then
    raise exception 'FAIL: el tipo restaurado arrastra la traza de una baja que ya no existe';
  end if;

  begin
    delete from public.artwork_relationship_types where id = v_tipo;
    raise exception 'FAIL: se ha borrado un tipo de relación en uso';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena impide borrar un tipo en uso';
  end;

  update public.artwork_relationships set active = true where relationship_type_id = v_tipo;
end $$;

-- ── 14. Renombrar el tipo es un update de una fila ───────────
-- RF-216 y ADR-007: la clave de una maestra no es su nombre. Las relaciones ya
-- guardadas ven el nombre nuevo sin que nadie las toque, que es lo que un
-- enumerado no puede hacer y la razón de que esto sea una tabla.
do $$
declare v_tipo uuid; v_etiqueta text; v_inversa text;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Estudio previo de';

  update public.artwork_relationship_types
     set name = 'Estudio preparatorio de', inverse_name = 'Obra definitiva de'
   where id = v_tipo;

  select t.name, t.inverse_name into v_etiqueta, v_inversa
    from public.artwork_relationships r
    join public.artwork_relationship_types t on t.id = r.relationship_type_id
   where r.relationship_type_id = v_tipo
   limit 1;

  if v_etiqueta <> 'Estudio preparatorio de' or v_inversa <> 'Obra definitiva de' then
    raise exception 'FAIL: renombrar el tipo no lo ha visto el catálogo (% / %)', v_etiqueta, v_inversa;
  end if;
  raise notice 'OK: renombrar un tipo es una fila y lo ve el catálogo entero (RF-216, ADR-007)';

  update public.artwork_relationship_types
     set name = 'Estudio previo de', inverse_name = 'Obra final de'
   where id = v_tipo;
end $$;

-- ── 15. Las dos direcciones se leen desde cada extremo ───────
-- Lo que la base garantiza es que la etiqueta de la dirección contraria existe
-- SIEMPRE: componer la línea de la ficha es interfaz, pero sin esta garantía la
-- interfaz tendría que inventarse un texto cuando falta.
do $$
declare v_linea text;
begin
  select case when r.from_catalog_id = 'AR-9700' then t.name else t.inverse_name end
    into v_linea
    from public.artwork_relationships r
    join public.artwork_relationship_types t on t.id = r.relationship_type_id
   where t.name = 'Estudio previo de'
     and (r.from_catalog_id = 'AR-9700' or r.to_catalog_id = 'AR-9700')
     and r.active
   limit 1;

  if v_linea is distinct from 'Obra final de' then
    raise exception 'FAIL: la ficha del otro extremo no tiene etiqueta que mostrar (%)', v_linea;
  end if;
  raise notice 'OK: la etiqueta de la dirección contraria existe sin una segunda fila (RF-217)';
end $$;

-- ── 16. Un lector no relaciona ───────────────────────────────
do $$
declare v_tipo uuid; v_fila public.artwork_relationships%rowtype;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Copia de';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';

  v_fila := public.relate_artworks('AR-9701', 'AR-9702', v_tipo);
  raise exception 'FAIL: un lector ha podido relacionar dos obras';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector no relaciona: %', sqlerrm;
end $$;

-- ── 17. La autoría la sella la base ──────────────────────────
-- RF-803 y RF-804 con la función genérica: quién y cuándo salen de la sesión, no
-- de lo que mande el cliente. Se comprueba mandando una fecha falsa y viendo que
-- el trigger la pisa; comparar dos instantes no valdría, porque dentro de una
-- transacción `now()` no avanza.
do $$
declare
  v_tipo uuid; v_id uuid; v_creado uuid; v_actualizado uuid; v_cuando timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

  select id into v_tipo from public.artwork_relationship_types where name = 'Copia de';

  insert into public.artwork_relationships
    (from_catalog_id, to_catalog_id, relationship_type_id, created_by, updated_by)
  values ('AR-9701', 'AR-9702', v_tipo,
          '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2')
  returning id, created_by into v_id, v_creado;

  if v_creado is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: la autoría no la ha sellado la sesión (%)', v_creado;
  end if;

  update public.artwork_relationships
     set note = 'La original se destruyó en el incendio de 1991',
         updated_at = timestamptz '2000-01-01 00:00:00+00',
         updated_by = '00000000-0000-0000-0000-0000000000c2'
   where id = v_id;

  select updated_at, updated_by into v_cuando, v_actualizado
    from public.artwork_relationships where id = v_id;
  if v_cuando <> now() then
    raise exception 'FAIL: la fecha de actualización la ha puesto el cliente (%)', v_cuando;
  end if;
  if v_actualizado is distinct from '00000000-0000-0000-0000-0000000000c1'::uuid then
    raise exception 'FAIL: «actualizado por» la ha puesto el cliente (%)', v_actualizado;
  end if;
  raise notice 'OK: la autoría y la fecha las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 18. La cascada del identificador, por los DOS extremos ───
--
-- `on update cascade` en las dos columnas, como en `images`, `provenance_events`
-- y las tres puentes anteriores. No se puede ejercitar cambiando un
-- `catalog_id`: RF-204 lo declara inmutable y `tg_catalog_id_immutable` rechaza
-- el update antes de que la cascada llegue a existir. Lo que se comprueba
-- entonces es la declaración, y es lo único comprobable — pero comprobar solo
-- una de las dos columnas sería no comprobar nada, porque olvidarlo en la
-- segunda es exactamente el error que se comete al copiar la primera.
do $$
declare v_sin_cascada text[];
begin
  select coalesce(array_agg(conname order by conname), '{}') into v_sin_cascada
    from pg_constraint
   where conrelid = 'public.artwork_relationships'::regclass
     and contype = 'f'
     and confrelid = 'public.artworks'::regclass
     and confupdtype <> 'c';

  if array_length(v_sin_cascada, 1) > 0 then
    raise exception 'FAIL: hay claves ajenas a la obra sin «on update cascade»: %',
      array_to_string(v_sin_cascada, ', ');
  end if;
  if (select count(*) from pg_constraint
       where conrelid = 'public.artwork_relationships'::regclass
         and contype = 'f'
         and confrelid = 'public.artworks'::regclass) <> 2 then
    raise exception 'FAIL: no hay dos claves ajenas a la obra, una por extremo';
  end if;
  raise notice 'OK: los dos extremos siguen al identificador de su obra si algún día cambia';
end $$;

-- ── 19. Nadie borra de verdad, y las dos nacen cerradas ──────
-- RF-901, RF-111, RF-113. Las políticas las escribe la migración siguiente; con
-- RLS activado y sin política, la tabla está cerrada, que es el estado seguro
-- para esperar. Lo que no puede pasar nunca es lo contrario: privilegios
-- concedidos sin RLS.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['artwork_relationship_types', 'artwork_relationships']
  loop
    if exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = v_tabla
                  and cmd in ('DELETE', 'ALL')) then
      raise exception 'FAIL: hay una política que permite DELETE sobre %', v_tabla;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_tabla, 'delete')
       or has_table_privilege('anon', 'public.' || v_tabla, 'delete') then
      raise exception 'FAIL: alguien tiene privilegio de DELETE sobre %', v_tabla;
    end if;
    if not (select relrowsecurity from pg_class
             where oid = ('public.' || v_tabla)::regclass) then
      raise exception 'FAIL: la tabla % no tiene RLS activado', v_tabla;
    end if;
  end loop;
  raise notice 'OK: RLS activado en las dos, retirar es un update y borrar no está concedido a nadie';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.artwork_relationships limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar las obras relacionadas';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a las obras relacionadas';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.artwork_relationship_types limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los tipos de relación';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los tipos de relación';
end $$;

reset role;

rollback;
