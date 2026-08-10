-- RF-514: publication types are an open vocabulary with a surrogate key,
--         and the BibTeX key becomes a unique, optional and editable column (DP-03).
-- RF-504: `pages` is kept as an isolated datum, separate from the note.
-- RF-506: the citation is also read from the reference («Obras citadas»).
-- RF-517, RF-903: a citation is withdrawn, not deleted, and adding it again
--         restores it instead of clashing against uniqueness.
-- RF-218: «Sin revisar» is not «no», carried from the field to the documentary block.
-- RF-901, RF-902: nothing is deleted, and the withdrawal leaves a trace.
-- RF-909: duplicates are resolved by review, not by uniqueness of the title.
-- RF-111, RF-113: the three tables are born closed and nobody has DELETE.
--
-- What is checked is what the client must not check again: that a
-- reference with no title does not go in, that a BibTeX key with a space inside is not
-- a key, that two writings of the same key are the same reference and
-- that many references with no key coexist, that an impossible year does not go in, that
-- the same artwork is not cited twice in the same reference and that adding
-- a withdrawn citation again recovers it with its pages, and that the research-state
-- column cannot lie through either of its two doors — neither
-- the bibliography one, nor the provenance one, which this group REPLACES and could
-- have swallowed with nothing warning about it.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- One cataloguer, one reader and two artworks. The profiles are created by the
-- auth.users trigger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'cat-biblio@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'lec-biblio@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000b2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9600', 'ROTILI', 'La muy citada', 'UNCONFIRMED'),
  ('AR-9601', 'ROTILI', 'La que no cita nadie', 'UNCONFIRMED');

-- ── 1. The vocabulary is born seeded ─────────────────────────
-- An empty master table leaves the selector blank and forces one to invent the
-- vocabulary while cataloguing. v11's four values plus the two that
-- are missing on the first day in the archive.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.publication_types
   where name in ('Libro', 'Artículo', 'Catálogo de exposición', 'Prensa',
                  'Tesis', 'Otro')
     and active;
  if v_n <> 6 then
    raise exception 'FAIL: el vocabulario de tipos de publicación no nace sembrado (% de 6)', v_n;
  end if;
  raise notice 'OK: los seis tipos de publicación están sembrados y activos (RF-514)';
end $$;

-- ── 2. One type, one row ─────────────────────────────────────
-- Uniqueness by comparison key and not by the literal name: «Catálogo de
-- exposición» and «catalogo de exposicion» are the same type, and discovering it
-- when there are already two rows costs going through every reference again.
do $$
begin
  begin
    insert into public.publication_types (name) values ('catalogo de EXPOSICION');
    raise exception 'FAIL: han entrado dos filas del mismo tipo de publicación';
  exception when unique_violation then
    raise notice 'OK: dos escrituras del mismo tipo son la misma fila';
  end;

  begin
    insert into public.publication_types (name) values ('   ');
    raise exception 'FAIL: ha entrado un tipo de publicación en blanco';
  exception when check_violation then
    raise notice 'OK: un tipo en blanco se rechaza';
  end;

  begin
    insert into public.publication_types (name) values (' Folleto ');
    raise exception 'FAIL: ha entrado un tipo sin recortar';
  exception when check_violation then
    raise notice 'OK: un tipo con espacios alrededor se rechaza';
  end;

  -- And extending the list is one row, which is the whole reason it is a
  -- master table and not a closed choice of four values.
  insert into public.publication_types (name) values ('Programa de radio');
  raise notice 'OK: la usuaria amplía el vocabulario sin migración (RF-514)';
end $$;

-- ── 3. A minimal reference goes in ───────────────────────────
-- The title and nothing else: what is known on noting down a photocopy with no cover.
-- Everything else is born empty and explicit, and unclassified is a legitimate
-- answer.
do $$
declare
  v_id uuid;
  v_fila public.bibliography%rowtype;
begin
  insert into public.bibliography (title)
  values ('Alberto Rotili. Obra sobre papel')
  returning id into v_id;

  select * into v_fila from public.bibliography where id = v_id;

  if v_fila.bibtex_key is not null or v_fila.publication_type_id is not null
     or v_fila.year is not null then
    raise exception 'FAIL: la clave, el tipo o el año no nacen nulos';
  end if;
  if v_fila.authors <> '' or v_fila.editors <> '' or v_fila.container_title <> ''
     or v_fila.publisher <> '' or v_fila.place <> '' or v_fila.note <> '' then
    raise exception 'FAIL: los campos opcionales no nacen vacíos';
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una referencia nueva no nace activa';
  end if;
  raise notice 'OK: una referencia mínima entra y lo pendiente queda pendiente';
end $$;

-- ── 4. A reference with no title cannot be cited ─────────────
do $$
begin
  begin
    insert into public.bibliography (title) values ('   ');
    raise exception 'FAIL: ha entrado una referencia sin título';
  exception when check_violation then
    raise notice 'OK: un título en blanco se rechaza';
  end;
end $$;

-- ── 5. Two references can be called the same (RF-909) ────────
-- A 1985 catalogue and a 2003 monograph are both titled «Alberto
-- Rotili», and they are two legitimate entries. Uniqueness of the title would have
-- turned a real datum into an error, and the real duplicates are resolved
-- by the team's review.
do $$
begin
  insert into public.bibliography (title, year) values ('Alberto Rotili', 1985);
  insert into public.bibliography (title, year) values ('Alberto Rotili', 2003);
  raise notice 'OK: dos referencias distintas pueden llamarse igual (RF-909)';
end $$;

-- ── 6. The BibTeX key, DP-03 resolved ───────────────────────
-- It stops being a primary key and becomes a unique, OPTIONAL and EDITABLE column. All
-- three are checked, because all three are the change.
do $$
declare v_id uuid;
begin
  -- Optional, and many at once: `place_key` is strict, so the index
  -- ignores the references with no key. Without that, the second one with no key would clash.
  insert into public.bibliography (title) values ('Sin clave todavía, la primera');
  insert into public.bibliography (title) values ('Sin clave todavía, la segunda');

  insert into public.bibliography (bibtex_key, title, year)
  values ('rotili1985muba', 'Catálogo MUBA 1985', 1985)
  returning id into v_id;

  -- Unique, compared like the rest of the schema's names: two keys differing only
  -- in capitals would not be told apart by any `.bib`.
  begin
    insert into public.bibliography (bibtex_key, title)
    values ('Rotili1985MUBA', 'El mismo catálogo escrito de otra manera');
    raise exception 'FAIL: han entrado dos referencias con la misma clave BibTeX';
  exception when unique_violation then
    raise notice 'OK: la clave BibTeX es única (DP-03)';
  end;

  -- Editable, que es justo lo que no era siendo clave primaria.
  update public.bibliography set bibtex_key = 'rotili1985badajoz' where id = v_id;
  if (select bibtex_key from public.bibliography where id = v_id) <> 'rotili1985badajoz' then
    raise exception 'FAIL: la clave BibTeX no se ha podido corregir';
  end if;
  raise notice 'OK: la clave BibTeX se corrige con un update de una fila (DP-03, ADR-007)';
end $$;

-- ── 7. Y si hay clave, que sea una clave ─────────────────────
-- Un espacio o una coma parten la entrada de un fichero `.bib`, y las llaves la
-- cierran antes de tiempo. Rechazarlo aquí cuesta una línea.
do $$
begin
  begin
    insert into public.bibliography (bibtex_key, title) values ('rotili 1985', 'Con espacio');
    raise exception 'FAIL: ha entrado una clave BibTeX con un espacio dentro';
  exception when check_violation then
    raise notice 'OK: una clave con espacio se rechaza';
  end;

  begin
    insert into public.bibliography (bibtex_key, title) values ('rotili,1985', 'Con coma');
    raise exception 'FAIL: ha entrado una clave BibTeX con una coma dentro';
  exception when check_violation then
    raise notice 'OK: una clave con coma se rechaza';
  end;

  begin
    insert into public.bibliography (bibtex_key, title) values ('rotili{1985}', 'Con llaves');
    raise exception 'FAIL: ha entrado una clave BibTeX con llaves dentro';
  exception when check_violation then
    raise notice 'OK: una clave con llaves se rechaza';
  end;

  begin
    insert into public.bibliography (bibtex_key, title) values ('', 'Clave vacía');
    raise exception 'FAIL: ha entrado una clave BibTeX vacía, que no es lo mismo que no tener';
  exception when check_violation then
    raise notice 'OK: la ausencia de clave se escribe con nulo, no con cadena vacía';
  end;
end $$;

-- ── 8. El año, plausible o ninguno ───────────────────────────
-- `s.f.` existe y es un dato: el nulo se admite. Un año de tres cifras o del
-- siglo XXII es una errata (ADR-004).
do $$
begin
  insert into public.bibliography (title, year) values ('Sin fecha, s.f.', null);

  begin
    insert into public.bibliography (title, year) values ('Año imposible por abajo', 999);
    raise exception 'FAIL: ha entrado un año de tres cifras';
  exception when check_violation then
    raise notice 'OK: un año implausible por abajo se rechaza';
  end;

  begin
    insert into public.bibliography (title, year) values ('Año imposible por arriba', 2101);
    raise exception 'FAIL: ha entrado un año del siglo XXII';
  exception when check_violation then
    raise notice 'OK: un año implausible por arriba se rechaza';
  end;
end $$;

-- ── 9. El tipo de publicación, y lo que sostiene ─────────────
-- La clave ajena garantiza que el tipo existe; el trigger de baja garantiza que
-- no se retira uno que todavía clasifica referencias activas. Sin él, retirarlo
-- no lo retira: deja el catálogo apuntando a algo que la interfaz ya no ofrece.
do $$
declare
  v_tipo uuid;
  v_ref uuid;
begin
  select id into v_tipo from public.publication_types where name = 'Catálogo de exposición';

  insert into public.bibliography (title, publication_type_id, year, place, publisher)
  values ('Rotili en el MUBA', v_tipo, 1985, 'Badajoz', 'Diputación de Badajoz')
  returning id into v_ref;

  begin
    insert into public.bibliography (title, publication_type_id)
    values ('Apunta a un tipo inventado', '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: una referencia ha podido apuntar a un tipo inexistente';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza un tipo de publicación inexistente';
  end;

  begin
    update public.publication_types set active = false where id = v_tipo;
    raise exception 'FAIL: se ha retirado un tipo que todavía clasifica referencias';
  exception when raise_exception then
    raise notice 'OK: un tipo en uso no se retira: %', sqlerrm;
  end;

  -- Una referencia en la papelera no cuenta, como en las demás maestras: exigir
  -- vaciar la papelera antes de retirar un tipo sería hacer que la papelera
  -- estorbe.
  update public.bibliography set active = false where id = v_ref;
  update public.publication_types set active = false where id = v_tipo;
  raise notice 'OK: una referencia retirada no impide retirar su tipo (RF-905)';

  -- Y se deja todo como estaba para lo que viene después.
  update public.publication_types set active = true where id = v_tipo;
  update public.bibliography set active = true where id = v_ref;

  begin
    delete from public.publication_types where id = v_tipo;
    raise exception 'FAIL: se ha borrado un tipo de publicación en uso';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena impide borrar un tipo en uso';
  end;
end $$;

-- ── 10. La cita: páginas y nota, dos columnas (RF-504) ───────
-- v11 v9 revirtió la fusión con el argumento correcto: la página es un dato
-- citable de forma exacta y de uso recurrente, y la nota es prosa. Lo que este
-- test demuestra es que la página se consulta SIN analizar texto libre.
do $$
declare
  v_ref uuid;
  v_fila public.artwork_bibliography%rowtype;
begin
  select id into v_ref from public.bibliography where title = 'Rotili en el MUBA';

  insert into public.artwork_bibliography (catalog_id, bibliography_id, pages, note)
  values ('AR-9600', v_ref, '34-36', 'Reproducida en color, p. 34');

  select * into v_fila from public.artwork_bibliography
   where catalog_id = 'AR-9600' and bibliography_id = v_ref;

  if v_fila.pages <> '34-36' then
    raise exception 'FAIL: las páginas no se guardan aparte (%)', v_fila.pages;
  end if;
  if v_fila.note <> 'Reproducida en color, p. 34' then
    raise exception 'FAIL: la nota no se guarda aparte (%)', v_fila.note;
  end if;
  if not v_fila.active then
    raise exception 'FAIL: una cita nueva no nace activa';
  end if;

  -- «s/p» y «lám. XII» son páginas reales: por eso la columna es texto y no un
  -- número.
  insert into public.artwork_bibliography (catalog_id, bibliography_id, pages)
  values ('AR-9601', v_ref, 'lám. XII');

  raise notice 'OK: la página se guarda y se consulta como dato aislado (RF-504)';
end $$;

-- ── 11. Una obra se cita una vez en cada referencia ──────────
-- Dos páginas de la misma referencia son una cita con dos páginas dentro
-- («34, 51»), no dos filas que después habría que sumar para leer la ficha.
do $$
declare v_ref uuid;
begin
  select id into v_ref from public.bibliography where title = 'Rotili en el MUBA';

  begin
    insert into public.artwork_bibliography (catalog_id, bibliography_id, pages)
    values ('AR-9600', v_ref, '51');
    raise exception 'FAIL: la misma obra se ha citado dos veces en la misma referencia';
  exception when unique_violation then
    raise notice 'OK: la pareja obra + referencia es única';
  end;

  begin
    insert into public.artwork_bibliography (catalog_id, bibliography_id)
    values ('AR-0000', v_ref);
    raise exception 'FAIL: se ha citado una obra que no existe';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza una obra inexistente';
  end;

  begin
    insert into public.artwork_bibliography (catalog_id, bibliography_id)
    values ('AR-9600', '00000000-0000-0000-0000-00000000dead');
    raise exception 'FAIL: se ha citado una referencia que no existe';
  exception when foreign_key_violation then
    raise notice 'OK: la clave ajena rechaza una referencia inexistente';
  end;
end $$;

-- ── 12. Volver a añadir una cita retirada la RESTAURA ────────
--
-- RF-517. Con la unicidad cubriendo también las citas retiradas, un `insert`
-- crudo choca contra el índice y la interfaz convertiría un «Añadir» en una
-- violación de unicidad incomprensible. Se comprueban las dos mitades: que el
-- `insert` crudo efectivamente choca —que es por lo que la función existe— y
-- que la función restaura.
do $$
declare
  v_ref uuid;
  v_id uuid;
  v_fila public.artwork_bibliography%rowtype;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  select id into v_ref from public.bibliography where title = 'Rotili en el MUBA';
  select id into v_id from public.artwork_bibliography
   where catalog_id = 'AR-9600' and bibliography_id = v_ref;

  update public.artwork_bibliography set active = false where id = v_id;

  begin
    insert into public.artwork_bibliography (catalog_id, bibliography_id)
    values ('AR-9600', v_ref);
    raise exception 'FAIL: el insert crudo de una cita retirada no ha chocado';
  exception when unique_violation then
    raise notice 'OK: el insert crudo choca — que es por lo que existe cite_artwork';
  end;

  -- Y la función la recupera. Sin páginas: el formulario de «Añadir» viene en
  -- blanco, y lo que no se manda no puede borrar lo que alguien investigó.
  v_fila := public.cite_artwork('AR-9600', v_ref);

  if not v_fila.active then
    raise exception 'FAIL: añadir una cita retirada no la ha restaurado';
  end if;
  if v_fila.id is distinct from v_id then
    raise exception 'FAIL: se ha creado una fila nueva en vez de restaurar la que había';
  end if;
  if v_fila.pages <> '34-36' then
    raise exception 'FAIL: restaurar ha borrado las páginas investigadas (%)', v_fila.pages;
  end if;
  if v_fila.deactivated_at is not null or v_fila.deactivated_by is not null then
    raise exception 'FAIL: la cita restaurada conserva la traza de una baja que ya no existe';
  end if;

  -- Y con páginas nuevas, manda lo que se manda.
  v_fila := public.cite_artwork('AR-9600', v_ref, '34-36, 51');
  if v_fila.pages <> '34-36, 51' then
    raise exception 'FAIL: la función no ha actualizado las páginas (%)', v_fila.pages;
  end if;

  -- Una pareja que no existía se crea, que es el otro camino de la misma
  -- función.
  v_fila := public.cite_artwork('AR-9601', (select id from public.bibliography
                                             where title = 'Alberto Rotili' and year = 2003),
                                '12', 'Mencionada en pie de foto');
  if v_fila.pages <> '12' or not v_fila.active then
    raise exception 'FAIL: la función no ha creado la cita nueva';
  end if;

  raise notice 'OK: añadir una cita retirada la restaura con sus páginas (RF-517)';
end $$;

-- ── 13. Un lector no cita ────────────────────────────────────
do $$
declare v_ref uuid; v_fila public.artwork_bibliography%rowtype;
begin
  select id into v_ref from public.bibliography where title = 'Alberto Rotili' and year = 1985;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

  v_fila := public.cite_artwork('AR-9600', v_ref);
  raise exception 'FAIL: un lector ha podido citar una obra';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector no cita: %', sqlerrm;
end $$;

-- ── 14. «Sin revisar» no es «no», por las dos puertas ────────
--
-- RF-218. Una obra sin citas registradas no es una obra que nadie ha publicado.
-- La columna solo vale si no puede mentir, y para eso hacen falta las dos
-- puertas: ni se declara «investigado sin resultado» con citas debajo, ni se
-- añade una cita a una obra declarada así.
do $$
declare v_ref uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  if (select bibliography_status from public.artworks where catalog_id = 'AR-9600')
     <> 'UNREVIEWED' then
    raise exception 'FAIL: el estado de la bibliografía no nace «Sin revisar» (RF-205)';
  end if;

  -- Lo que SÍ se permite, y es intencionado: citas con el estado en «Sin
  -- revisar». Tener un dato no es haber hecho la investigación.
  if not exists (select 1 from public.artwork_bibliography
                  where catalog_id = 'AR-9600' and active) then
    raise exception 'FAIL: el fixture de este bloque no tiene la cita que necesita';
  end if;

  begin
    update public.artworks set bibliography_status = 'NONE_FOUND'
     where catalog_id = 'AR-9600';
    raise exception 'FAIL: se ha declarado la bibliografía investigada sin resultado con citas debajo';
  exception when raise_exception then
    raise notice 'OK: primera puerta — la columna no puede contradecir a las citas: %', sqlerrm;
  end;

  -- Retiradas las citas, sí se puede declarar.
  update public.artwork_bibliography set active = false where catalog_id = 'AR-9600';
  update public.artworks set bibliography_status = 'NONE_FOUND' where catalog_id = 'AR-9600';

  -- Y entonces la segunda puerta cierra por el otro lado.
  select id into v_ref from public.bibliography where title = 'Alberto Rotili' and year = 1985;
  begin
    insert into public.artwork_bibliography (catalog_id, bibliography_id)
    values ('AR-9600', v_ref);
    raise exception 'FAIL: se ha citado una obra cuya bibliografía consta investigada sin resultado';
  exception when raise_exception then
    raise notice 'OK: segunda puerta — no se cita una obra declarada sin bibliografía: %', sqlerrm;
  end;

  -- Restaurar una cita retirada es la misma puerta, y es el camino que la
  -- interfaz usará de verdad.
  begin
    update public.artwork_bibliography set active = true
     where catalog_id = 'AR-9600' and bibliography_id =
       (select id from public.bibliography where title = 'Rotili en el MUBA');
    raise exception 'FAIL: se ha restaurado una cita en una obra declarada sin bibliografía';
  exception when raise_exception then
    raise notice 'OK: restaurar una cita pasa por la misma puerta';
  end;

  -- Y una edición cualquiera de la obra no se bloquea por un estado que no
  -- cambia: la comprobación solo hace trabajo cuando el estado se mueve.
  update public.artworks set bibliography_status = 'IN_PROGRESS' where catalog_id = 'AR-9600';
  update public.artwork_bibliography set active = true where catalog_id = 'AR-9600';
  raise notice 'OK: con el estado corregido, las citas vuelven';
end $$;

-- ── 15. Y la puerta de la procedencia sigue en pie ───────────
--
-- Este grupo REEMPLAZA `tg_artwork_research_status_coherent` con `create or
-- replace` para añadir su bloque, y un reemplazo puede comerse el bloque
-- anterior sin que nada avise: la migración de la procedencia se aplicó hace
-- rato y su test pasa igual porque comprueba la función que hay, no la que
-- había. Esta es la regresión que hay que cazar aquí.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9601', 'Colección privada, España');

  begin
    update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9601';
    raise exception 'FAIL: el reemplazo de la función se ha comido la puerta de la procedencia';
  exception when raise_exception then
    if position('procedencia' in sqlerrm) = 0 then raise; end if;
    raise notice 'OK: la puerta de la procedencia sigue en pie tras el reemplazo (RF-218)';
  end;

  -- Y las dos son independientes: cada bloque mira SUS filas y ninguna de las
  -- dos comprobaciones se activa por lo que haya debajo de la otra. Retirado el
  -- eslabón, la procedencia se declara aunque la obra siga teniendo citas.
  update public.provenance_events set active = false where catalog_id = 'AR-9601';
  update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9601';

  if not exists (select 1 from public.artwork_bibliography
                  where catalog_id = 'AR-9601' and active) then
    raise exception 'FAIL: el aserto anterior no demuestra nada: la obra no tenía citas';
  end if;
  raise notice 'OK: los dos bloques documentales se declaran por separado';
end $$;

-- ── 16. El estado de investigación es un enumerado cerrado ───
do $$
begin
  update public.artworks set bibliography_status = 'PENDIENTE' where catalog_id = 'AR-9601';
  raise exception 'FAIL: el estado de la bibliografía ha admitido texto libre';
exception when invalid_text_representation then
  raise notice 'OK: el estado de investigación no admite texto libre';
end $$;

-- ── 17. La papelera de la referencia y la de la cita ─────────
--
-- La referencia es una ficha con nombre propio y lleva papelera completa
-- (RF-902): restaurar NO borra la traza de la baja anterior. La cita cuelga de
-- ella y no tiene pantalla de papelera propia, así que restaurarla la deja como
-- si nunca se hubiera retirado — la misma decisión que en las maestras de
-- vocabulario, y por eso se comprueba, para que la diferencia sea deliberada y
-- no un olvido.
do $$
declare
  v_ref uuid; v_cita uuid;
  v_baja timestamptz; v_quien uuid; v_restaurada timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  select id into v_ref from public.bibliography where title = 'Alberto Rotili' and year = 1985;

  update public.bibliography set active = false where id = v_ref;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.bibliography where id = v_ref;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la baja de la referencia no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.bibliography where id = v_ref) then
    raise exception 'FAIL: la referencia ha desaparecido al retirarla';
  end if;

  update public.bibliography set active = true where id = v_ref;
  select deactivated_at, restored_at into v_baja, v_restaurada
    from public.bibliography where id = v_ref;
  if v_restaurada is null or v_baja is null then
    raise exception 'FAIL: restaurar la referencia no ha dejado traza, o ha borrado la de la baja (RF-902)';
  end if;

  select id into v_cita from public.artwork_bibliography
   where catalog_id = 'AR-9600'
     and bibliography_id = (select id from public.bibliography where title = 'Rotili en el MUBA');

  update public.artwork_bibliography set active = false where id = v_cita;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.artwork_bibliography where id = v_cita;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la baja de la cita no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.artwork_bibliography where id = v_cita) then
    raise exception 'FAIL: la cita ha desaparecido al retirarla (RF-517 revisa RF-903)';
  end if;

  update public.artwork_bibliography set active = true where id = v_cita;
  if (select deactivated_at from public.artwork_bibliography where id = v_cita) is not null then
    raise exception 'FAIL: la cita restaurada arrastra la traza de una baja que ya no existe';
  end if;
  raise notice 'OK: la referencia guarda las dos trazas y la cita vuelve limpia';
end $$;

-- ── 18. La autoría la sella la base ──────────────────────────
-- RF-803 y RF-804 con la función genérica: quién y cuándo salen de la sesión,
-- no de lo que mande el cliente. Se comprueba mandando una fecha falsa y viendo
-- que el trigger la pisa; comparar dos instantes no valdría, porque dentro de
-- una transacción `now()` no avanza.
do $$
declare
  v_id uuid; v_creado uuid; v_actualizado uuid; v_cuando timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  insert into public.bibliography (title, created_by, updated_by)
  values ('Referencia con autoría mentida',
          '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2')
  returning id, created_by into v_id, v_creado;

  if v_creado is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la autoría no la ha sellado la sesión (%)', v_creado;
  end if;

  update public.bibliography
     set note = 'Consultada en la Biblioteca de Extremadura',
         updated_at = timestamptz '2000-01-01 00:00:00+00',
         updated_by = '00000000-0000-0000-0000-0000000000b2'
   where id = v_id;

  select updated_at, updated_by into v_cuando, v_actualizado
    from public.bibliography where id = v_id;
  if v_cuando <> now() then
    raise exception 'FAIL: la fecha de actualización la ha puesto el cliente (%)', v_cuando;
  end if;
  if v_actualizado is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: «actualizado por» la ha puesto el cliente (%)', v_actualizado;
  end if;
  raise notice 'OK: la autoría y la fecha de actualización las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 19. Nadie borra de verdad, y las tres nacen cerradas ─────
-- RF-901, RF-111, RF-113. Las políticas las escribe la migración siguiente; con
-- RLS activado y sin política, la tabla está cerrada, que es el estado seguro
-- para esperar. Lo que no puede pasar nunca es lo contrario: privilegios
-- concedidos sin RLS.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['publication_types', 'bibliography', 'artwork_bibliography']
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
  raise notice 'OK: RLS activado en las tres, retirar es un update y borrar no está concedido a nadie';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.bibliography limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar la bibliografía';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a la bibliografía';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.artwork_bibliography limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar las citas';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a las citas';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.publication_types limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los tipos de publicación';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los tipos de publicación';
end $$;

reset role;

rollback;
