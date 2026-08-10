-- RF-217: the relationship between two artworks carries its type, and the type is a
--         vocabulary of its own with a surrogate key: direct name, inverse name and a symmetry
--         flag. A symmetric one is stored once, canonicalised; an
--         asymmetric one does not admit its opposite.
-- RF-212: `obras_relacionadas` is a multiple self-referential relationship and not a
--         text field. RF-217 extends it.
-- RF-216: a master table's key is not its name: renaming a type is an
--         update of one row and the whole catalogue sees it (ADR-007).
-- RF-517, RF-903: a relationship is withdrawn, not deleted, and adding it again
--         restores it instead of clashing against uniqueness.
-- RF-901, RF-902: nothing is deleted, and the withdrawal leaves a trace of who and when.
-- RF-801, RF-803, RF-804: the authorship and the date are stamped by the base.
-- RF-111, RF-113: both tables are born closed and nobody has DELETE.
--
-- What is checked is what the client must not check again. Three
-- things on this list are what justify the whole group, and all three are
-- failures that are not visible while writing them:
--
--   • That the same symmetric pair does not go in twice depending on the order it is
--     written in, because each one is created from its own artwork's record and nobody
--     is going to remember how the other one wrote it.
--   • That the opposite of an asymmetric one is rejected, also on RESTORING a
--     relationship that was in the wastebasket, which is the path the
--     contradiction really comes in by.
--   • That the symmetry of an already used type cannot be changed, because mixing
--     the two storage conventions lets the same pair through twice and
--     afterwards there is no way of knowing which one is superfluous.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- One cataloguer, one reader and four artworks. The profiles are created by the
-- auth.users trigger. The identifiers are chosen by hand and in order to be able to
-- reason about which is the lesser, which is what the canonicalisation is about.
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

-- ── 1. The vocabulary is born seeded (RF-217) ────────────────
-- An empty master table leaves the selector blank and forces one to invent the
-- vocabulary while cataloguing. They are the six cases the catalogue already has
-- in front of it: three symmetric and three with their inverse.
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

  -- The asymmetric one's inverse is this master table's whole point: without it, the
  -- other artwork's record would have nothing to write.
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

-- ── 2. One type, one row, and coherent ───────────────────────
-- The opposite direction's label has to exist ALWAYS in an
-- asymmetric type: it is what the base guarantees so the interface can read the
-- two directions without checking anything.
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

  -- Uniqueness by comparison key and not by the literal name.
  begin
    insert into public.artwork_relationship_types (name, is_symmetric)
    values ('PAREJA DE', true);
    raise exception 'FAIL: han entrado dos filas del mismo tipo de relación';
  exception when unique_violation then
    raise notice 'OK: dos escrituras del mismo tipo son la misma fila';
  end;

  -- And extending the list is one row, which is the whole reason this is a
  -- master table and not an enum.
  insert into public.artwork_relationship_types (name, inverse_name, is_symmetric)
  values ('Fragmento de', 'Obra de la que procede el fragmento', false);
  raise notice 'OK: la usuaria amplía el vocabulario sin migración (RF-217)';
end $$;

-- ── 3. A minimal relationship goes in ────────────────────────
-- Two artworks and a type: what is known on discovering that the two panels are a
-- diptych. The note is born empty and the relationship is born active.
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

-- ── 4. An artwork does not relate to itself ──────────────────
-- It is the row that a selector with the current artwork inside produces, and that
-- afterwards paints in the record a link to the record itself.
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

-- ── 5. The three ends really exist ───────────────────────────
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

  -- The non-existent type goes through the two triggers that read the master table BEFORE
  -- the foreign key speaks: both have to keep quiet and let it speak, or the
  -- error the user sees would be a different one.
  begin
    insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
    values ('AR-9700', 'AR-9702', '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: se ha usado un tipo de relación inexistente';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza un tipo inexistente, y los triggers la dejan hablar';
  end;
end $$;

-- ── 6. The same relationship is one fact, not two ────────────
-- And two different types between the same two artworks do coexist: the front and the
-- back of a panel can also be part of the same polyptych.
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

-- ── 7. A symmetric relationship is stored ONCE ───────────────
--
-- The failure this block pursues: each relationship is created from its own artwork's
-- record, so the same pair is written once in each direction without
-- anybody noticing, and without canonicalising two rows would go in with two notes that
-- may say different things.
do $$
declare
  v_tipo uuid;
  v_fila public.artwork_relationships%rowtype;
  v_n int;
begin
  select id into v_tipo from public.artwork_relationship_types where name = 'Pareja de';

  -- Written backwards: the greater first. The base turns it round.
  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id, note)
  values ('AR-9703', 'AR-9702', v_tipo, 'Colgaban juntas en el estudio')
  returning * into v_fila;

  if v_fila.from_catalog_id <> 'AR-9702' or v_fila.to_catalog_id <> 'AR-9703' then
    raise exception 'FAIL: la relación simétrica no se ha canonicalizado (% → %)',
      v_fila.from_catalog_id, v_fila.to_catalog_id;
  end if;

  -- And the same pair written the other way round is the SAME row, so it
  -- clashes. It is what afterwards turns `relate_artworks` into a restoration.
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

  -- An ASYMMETRIC relationship is not canonicalised: its direction is the datum.
  select id into v_tipo from public.artwork_relationship_types where name = 'Estudio previo de';
  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
  values ('AR-9702', 'AR-9700', v_tipo)
  returning * into v_fila;
  if v_fila.from_catalog_id <> 'AR-9702' then
    raise exception 'FAIL: se ha canonicalizado una relación asimétrica y se ha perdido su sentido';
  end if;
  raise notice 'OK: la asimétrica conserva su dirección, que es su dato';
end $$;

-- ── 8. And an asymmetric one does not admit its opposite ─────
--
-- «A es estudio previo de B» and «B es estudio previo de A» cannot both be true
-- at once. B's record already says «obra final de A» without anybody writing anything:
-- that is what the inverse label exists for.
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

  -- What IS allowed: the opposite pair with ANOTHER type. That AR-9700 is
  -- a copy of AR-9702 does not contradict AR-9702 being its preparatory study — they are two
  -- different facts, and deciding whether they make sense together is the cataloguer's
  -- work and not a constraint's.
  insert into public.artwork_relationships (from_catalog_id, to_catalog_id, relationship_type_id)
  values ('AR-9700', 'AR-9702', v_copia);
  raise notice 'OK: la comprobación mira SU tipo y no cierra el paso a otro distinto';
end $$;

-- ── 9. A relationship's wastebasket (RF-517, revises RF-903) ─
-- The row carries research work and who withdrew it is a trace of
-- interest, so it is withdrawn and not deleted. With no `restored_at`: it is restored
-- from the record it hangs from and comes back clean, like the other bridges.
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
