-- RF-515: los tipos de documento son vocabulario abierto con clave sustituta, y
--         la clasificación archivística es un árbol y no un texto con
--         convención de separadores. Un documento puede no estar clasificado, y
--         su ubicación física apunta al árbol de lugares que ya existe.
-- RF-516: un documento se relaciona con cualquier número de obras y de
--         exposiciones, por tablas puente: con una clave ajena por lado, un
--         recorte que menciona tres obras obligaría a triplicar el PDF subido.
-- RF-408, RF-110: un documento admite un único fichero digitalizado, media
--         descripción de un fichero no existe, y no hay bandera «digitalizado»
--         que pueda contradecir a la ruta que tiene al lado.
-- RF-218: «Sin revisar» no es «no», llevado del campo al bloque documental, y
--         por las dos puertas — y con los tres bloques anteriores, que este
--         grupo REEMPLAZA y podría haberse comido sin que nada avisara.
-- RF-215, ADR-006: un lugar con documentos de archivo dentro tampoco se retira.
--         Es el guardarraíl a medio aplicar más fácil de olvidar de este diseño.
-- RF-517, RF-903: los vínculos se retiran, no se borran, y volver a añadirlos
--         los restaura en vez de chocar contra la unicidad.
-- RF-205: lo pendiente nace pendiente.
-- RF-901, RF-902: nada se borra, y la baja deja traza.
-- RF-909: los duplicados se resuelven por revisión, no por unicidad del título.
-- RF-111, RF-113: las cinco tablas nacen cerradas y nadie tiene DELETE.
--
-- Lo que se comprueba es lo que el `check` puede comprobar y el cliente no debe
-- volver a comprobar: que un documento sin nada que lo nombre no entra, que la
-- signatura es única pero opcional y editable —al contrario que la clave de una
-- obra—, que el árbol archivístico no se cierra sobre sí mismo, que media
-- descripción de un fichero no existe y un fichero de cero bytes tampoco, que un
-- documento se cuelga de tres obras sin duplicarse, y que la columna de estado
-- de investigación no puede mentir por ninguna de sus dos puertas.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
-- Un catalogador, un lector, dos obras y una exposición. Los perfiles los crea
-- el trigger de auth.users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cat-archivo@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'lec-archivo@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000d2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9700', 'ROTILI', 'La del recorte de prensa', 'UNCONFIRMED'),
  ('AR-9701', 'ROTILI', 'La que sale al fondo', 'UNCONFIRMED'),
  ('AR-9702', 'ROTILI', 'La tercera de la foto', 'UNCONFIRMED');

insert into public.exhibitions (title, year) values ('Muestra documentada', 1985);

-- ── 1. El vocabulario nace sembrado ──────────────────────────
-- Una maestra vacía deja el selector en blanco el primer día y obliga a inventar
-- el vocabulario mientras se cataloga. Son los diez valores que v11 enumera.
do $$
declare v_n int;
begin
  select count(*) into v_n from public.document_types where active;
  if v_n < 10 then
    raise exception 'FAIL: el vocabulario de tipos de documento no está sembrado (% filas)', v_n;
  end if;
  if not exists (select 1 from public.document_types where name = 'Recorte de prensa') then
    raise exception 'FAIL: falta «Recorte de prensa», que es el caso de uso del enunciado';
  end if;
  raise notice 'OK: los diez tipos de documento de v11 están sembrados (RF-515)';
end $$;

-- ── 2. Un tipo es único por clave de comparación ─────────────
-- «Recorte de prensa» y «recorte de prensa» son el mismo tipo, y descubrirlo
-- cuando ya hay dos filas cuesta repasar todo el archivo.
do $$
begin
  begin
    insert into public.document_types (name) values ('recorte de prensa');
    raise exception 'FAIL: ha entrado un tipo de documento duplicado salvo mayúsculas';
  exception when unique_violation then
    raise notice 'OK: el tipo de documento es único por clave de comparación (RF-515)';
  end;

  begin
    insert into public.document_types (name) values ('  ');
    raise exception 'FAIL: ha entrado un tipo de documento en blanco';
  exception when check_violation then
    raise notice 'OK: un tipo en blanco no clasifica nada';
  end;

  begin
    insert into public.document_types (name) values (' Telegrama ');
    raise exception 'FAIL: ha entrado un tipo con espacios alrededor';
  exception when check_violation then
    raise notice 'OK: el nombre del tipo se guarda recortado';
  end;

  -- Y ampliar la lista NO requiere migración: ese es el motivo de que sea una
  -- maestra y no un enumerado.
  insert into public.document_types (name) values ('Telegrama');
  raise notice 'OK: la usuaria amplía el vocabulario sin desplegar nada (RF-515)';
end $$;

-- ── 3. El árbol archivístico: hermanos y raíces ──────────────
-- Es el `fondo_serie` de v11, que era «fondo → serie → subserie» dentro de un
-- texto. Mismo error que la ubicación física antes de ADR-006, evitado antes de
-- cometerlo por segunda vez.
do $$
declare v_fondo uuid; v_serie uuid;
begin
  insert into public.archive_series (name) values ('Fondo Alberto Rotili')
  returning id into v_fondo;

  insert into public.archive_series (parent_id, name) values (v_fondo, 'Correspondencia')
  returning id into v_serie;

  -- Dos raíces homónimas: hacen falta los dos índices parciales, porque en SQL
  -- un nulo no es igual a otro nulo y sin el de raíces esto pasaría.
  begin
    insert into public.archive_series (name) values ('fondo alberto rotili');
    raise exception 'FAIL: han entrado dos fondos homónimos';
  exception when unique_violation then
    raise notice 'OK: dos raíces no se llaman igual (RF-515)';
  end;

  begin
    insert into public.archive_series (parent_id, name) values (v_fondo, 'CORRESPONDENCIA');
    raise exception 'FAIL: han entrado dos hermanas homónimas';
  exception when unique_violation then
    raise notice 'OK: dos hermanas no se llaman igual (RF-515)';
  end;

  -- Pero la misma serie bajo otro fondo sí: «Correspondencia» la tienen todos.
  insert into public.archive_series (name) values ('Fondo María Ruiz Campins');
  insert into public.archive_series (parent_id, name)
  values ((select id from public.archive_series where name = 'Fondo María Ruiz Campins'),
          'Correspondencia');
  raise notice 'OK: la misma serie bajo dos fondos son dos nodos';
end $$;

-- ── 4. El árbol no se cierra sobre sí mismo ──────────────────
-- Una serie dentro de su propia subserie deja el árbol irrecuperable: ninguna
-- consulta recursiva termina y el nodo desaparece de la jerarquía sin haberse
-- borrado.
do $$
declare v_fondo uuid; v_serie uuid; v_sub uuid;
begin
  select id into v_fondo from public.archive_series where name = 'Fondo Alberto Rotili';
  select id into v_serie from public.archive_series
   where name = 'Correspondencia' and parent_id = v_fondo;

  insert into public.archive_series (parent_id, name) values (v_serie, 'Cartas a comisarios')
  returning id into v_sub;

  begin
    update public.archive_series set parent_id = v_fondo where id = v_fondo;
    raise exception 'FAIL: una serie se ha metido dentro de sí misma';
  exception when raise_exception then
    raise notice 'OK: una serie no está dentro de sí misma: %', sqlerrm;
  end;

  begin
    update public.archive_series set parent_id = v_sub where id = v_fondo;
    raise exception 'FAIL: el fondo se ha metido dentro de su propia subserie';
  exception when raise_exception then
    raise notice 'OK: el árbol archivístico no admite ciclos: %', sqlerrm;
  end;

  -- Y mover de sitio sí, que es el motivo de que `parent_id` sea mutable.
  update public.archive_series set parent_id = v_fondo where id = v_sub;
  if (select parent_id from public.archive_series where id = v_sub) <> v_fondo then
    raise exception 'FAIL: no se ha podido mover una serie de sitio';
  end if;
  update public.archive_series set parent_id = v_serie where id = v_sub;
  raise notice 'OK: mover una serie es un update de una fila (RF-515, ADR-006)';
end $$;

-- ── 5. Un documento mínimo entra, y lo pendiente queda vacío ─
-- El título y nada más: lo que se sabe al vaciar una carpeta encima de la mesa.
-- Todo lo demás es opcional a propósito, empezando por el fondo — v11 obligaba
-- a elegir artista y un recorte sobre una colectiva de los dos no puede.
do $$
declare v_fila public.archive_documents%rowtype;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  insert into public.archive_documents (title)
  values ('Recorte sin más datos');

  select * into v_fila from public.archive_documents where title = 'Recorte sin más datos';

  if v_fila.archive_code is not null then
    raise exception 'FAIL: la signatura no nace nula';
  end if;
  if v_fila.artist_fund is not null then
    raise exception 'FAIL: el fondo no nace nulo, y v11 obligaba a elegir';
  end if;
  if v_fila.document_type_id is not null or v_fila.archive_series_id is not null
     or v_fila.physical_place_id is not null then
    raise exception 'FAIL: alguna relación opcional no nace nula';
  end if;
  if v_fila.file_path is not null then
    raise exception 'FAIL: el fichero digitalizado no nace ausente';
  end if;
  if v_fila.date_text <> '' then
    raise exception 'FAIL: la fecha compuesta no nace vacía (%)', v_fila.date_text;
  end if;
  if not v_fila.active then
    raise exception 'FAIL: un documento nuevo no nace activo';
  end if;
  raise notice 'OK: un documento mínimo entra y todo lo demás es opcional (RF-205)';
end $$;

-- ── 6. Sin título no hay documento ───────────────────────────
do $$
begin
  begin
    insert into public.archive_documents (title) values ('   ');
    raise exception 'FAIL: ha entrado un documento sin nada que lo nombre';
  exception when check_violation then
    raise notice 'OK: un documento sin título no se puede volver a encontrar';
  end;
end $$;

-- ── 7. La signatura: única, opcional y EDITABLE ──────────────
-- Es la diferencia deliberada con `catalog_id`, que es la etiqueta pegada a una
-- obra real y por eso no se edita (RF-204). Esta no está pegada a nada todavía,
-- y una clasificación archivística se reorganiza.
do $$
declare v_id uuid;
begin
  insert into public.archive_documents (archive_code, title)
  values ('AR-ARCH-0001', 'Carta de 1985')
  returning id into v_id;

  begin
    insert into public.archive_documents (archive_code, title)
    values ('ar-arch-0001', 'La misma signatura escrita en minúsculas');
    raise exception 'FAIL: han entrado dos signaturas equivalentes';
  exception when unique_violation then
    raise notice 'OK: la signatura es única por clave de comparación';
  end;

  -- Editable, que es lo que no sería siendo clave primaria.
  update public.archive_documents set archive_code = 'AR-ARCH-0002' where id = v_id;
  if (select archive_code from public.archive_documents where id = v_id) <> 'AR-ARCH-0002' then
    raise exception 'FAIL: la signatura no se ha podido corregir';
  end if;

  -- Y muchos documentos sin signatura conviven: `place_key` es `strict`, así que
  -- devuelve nulo y el índice único los ignora.
  insert into public.archive_documents (title) values ('Sin signatura 1'), ('Sin signatura 2');
  raise notice 'OK: la signatura es única, opcional y editable (RF-515)';

  begin
    insert into public.archive_documents (archive_code, title) values ('  ', 'Signatura en blanco');
    raise exception 'FAIL: ha entrado una signatura en blanco';
  exception when check_violation then
    raise notice 'OK: una signatura en blanco es un hueco con índice único';
  end;
end $$;

-- ── 8. Dos documentos se pueden describir igual (RF-909) ─────
do $$
begin
  insert into public.archive_documents (title) values ('Nota de prensa de la inauguración');
  insert into public.archive_documents (title) values ('Nota de prensa de la inauguración');
  raise notice 'OK: dos documentos se describen igual; los duplicados se revisan (RF-909)';
end $$;

-- ── 9. La fecha estructurada de ADR-004 ──────────────────────
-- La misma forma que en los eslabones de procedencia, con la misma diferencia
-- respecto a la obra: aquí un rango puede empezar y acabar el mismo año, porque
-- una carpeta de correspondencia de 1985 es un rango real.
do $$
declare v_id uuid; v_texto text;
begin
  insert into public.archive_documents
         (title, start_year, end_year, approximate_date)
  values ('Correspondencia con la galería', 1985, 1985, true)
  returning id into v_id;

  select date_text into v_texto from public.archive_documents where id = v_id;
  if v_texto <> 'c. 1985-1985' then
    raise exception 'FAIL: la fecha compuesta no es la esperada (%)', v_texto;
  end if;

  -- La nota manda sobre la composición, como en la obra y en la procedencia.
  update public.archive_documents set date_note = 'entre la posguerra y los sesenta' where id = v_id;
  select date_text into v_texto from public.archive_documents where id = v_id;
  if v_texto <> 'entre la posguerra y los sesenta' then
    raise exception 'FAIL: la nota de fecha no manda sobre la compuesta (%)', v_texto;
  end if;

  begin
    update public.archive_documents set date_text = 'a mano' where id = v_id;
    raise exception 'FAIL: se ha escrito directamente en una columna generada';
  exception when generated_always then
    raise notice 'OK: la fecha compuesta no se escribe nunca a mano (ADR-004)';
  end;

  begin
    insert into public.archive_documents (title, start_year) values ('Del año 999', 999);
    raise exception 'FAIL: ha entrado un año implausible';
  exception when check_violation then
    raise notice 'OK: un año fuera de rango es una errata, no una fecha';
  end;

  begin
    insert into public.archive_documents (title, start_year, end_year)
    values ('Rango invertido', 1990, 1985);
    raise exception 'FAIL: ha entrado un rango invertido';
  exception when check_violation then
    raise notice 'OK: un rango invertido se rechaza';
  end;

  begin
    insert into public.archive_documents (title, end_year) values ('Final sin principio', 1985);
    raise exception 'FAIL: ha entrado media fecha: un final sin principio';
  exception when check_violation then
    raise notice 'OK: media fecha no existe';
  end;

  begin
    insert into public.archive_documents (title, unconfirmed_date)
    values ('Dudosa sin año', true);
    raise exception 'FAIL: ha entrado una bandera de duda sin año que poner en duda';
  exception when check_violation then
    raise notice 'OK: las banderas hablan de un año («[?]» a secas no dice nada)';
  end;
end $$;

-- ── 10. El fichero digitalizado: todo o nada ─────────────────
-- RF-408 y el mismo criterio que la copia corregida de una fotografía: media
-- descripción de un fichero no existe. Y NO hay columna «digitalizado»: la
-- respuesta es `file_path is not null`, que no puede contradecir al fichero.
do $$
declare v_id uuid; v_digitalizados int;
begin
  select id into v_id from public.archive_documents where title = 'Carta de 1985';

  begin
    update public.archive_documents set file_path = 'documentos/ar-arch-0002.pdf'
     where id = v_id;
    raise exception 'FAIL: ha entrado una ruta de fichero sin tamaño, tipo ni fecha';
  exception when check_violation then
    raise notice 'OK: media descripción de un fichero no existe (RF-408)';
  end;

  begin
    update public.archive_documents set
      file_path = 'documentos/ar-arch-0002.pdf', file_size_bytes = 0,
      mime_type = 'application/pdf', uploaded_at = now()
     where id = v_id;
    raise exception 'FAIL: ha entrado un fichero de cero bytes';
  exception when check_violation then
    raise notice 'OK: un fichero de cero bytes es un fallo de subida disfrazado';
  end;

  update public.archive_documents set
    file_path = 'documentos/ar-arch-0002.pdf', file_size_bytes = 1234567,
    mime_type = 'application/pdf', uploaded_at = now()
   where id = v_id;

  -- La bandera que NO existe: se contesta con una consulta y no con una columna
  -- que un día diga lo contrario que el fichero.
  select count(*) into v_digitalizados
    from public.archive_documents where file_path is not null and active;
  if v_digitalizados <> 1 then
    raise exception 'FAIL: «digitalizado» no se contesta con la ruta (% filas)', v_digitalizados;
  end if;

  -- Y quitar el fichero es quitarlo entero, no dejar la ruta colgando.
  update public.archive_documents set
    file_path = null, file_size_bytes = null, mime_type = null, uploaded_at = null
   where id = v_id;
  raise notice 'OK: el fichero digitalizado es todo o nada, y no hay bandera que lo contradiga';

  -- Se deja puesto para el resto del fichero de tests.
  update public.archive_documents set
    file_path = 'documentos/ar-arch-0002.pdf', file_size_bytes = 1234567,
    mime_type = 'application/pdf', uploaded_at = now()
   where id = v_id;
end $$;

-- ── 11. El bucket que guarda el fichero, comprobado ──────────
-- RF-110 y RNF-111: ningún fichero es legible sin firma, y el documento
-- digitalizado va al bucket privado que ya existe, sin política nueva. Lo que
-- este bloque comprueba de verdad es que el bucket sigue siendo privado y que
-- tiene un techo de tamaño: sin techo, un expediente escaneado de medio giga
-- entraría en silencio y nadie se enteraría hasta la factura.
--
-- El valor concreto NO se afirma aquí y NO se copia a ninguna restricción de la
-- tabla: es un ajuste de la plataforma, y un test que exija los 60 MiB exactos
-- se pondría rojo el día que la propietaria decida subirlos, que es justo la
-- decisión que este grupo deja abierta.
do $$
declare v_publico boolean; v_limite bigint; v_politicas int;
begin
  select public, file_size_limit into v_publico, v_limite
    from storage.buckets where id = 'obras';

  if v_publico is null then
    raise exception 'FAIL: no existe el bucket donde va el documento digitalizado';
  end if;
  if v_publico then
    raise exception 'FAIL: el bucket de los ficheros es legible sin firma (RF-110, RNF-111)';
  end if;
  if v_limite is null then
    raise exception 'FAIL: el bucket no tiene techo de tamaño por fichero';
  end if;

  -- Y las políticas de storage.objects que ya existen cubren el prefijo nuevo
  -- sin política añadida: están escritas sobre el bucket entero.
  select count(*) into v_politicas
    from pg_policies where schemaname = 'storage' and tablename = 'objects';
  if v_politicas < 3 then
    raise exception 'FAIL: el bucket de ficheros se ha quedado sin sus políticas (%)', v_politicas;
  end if;

  raise notice 'OK: el fichero digitalizado va a un bucket privado con techo (% bytes) y sin política nueva (RF-408, RF-110)', v_limite;
end $$;

-- ── 12. Un tipo en uso no se retira ──────────────────────────
do $$
declare v_tipo uuid; v_doc uuid;
begin
  select id into v_tipo from public.document_types where name = 'Carta';
  select id into v_doc from public.archive_documents where title = 'Carta de 1985';

  update public.archive_documents set document_type_id = v_tipo where id = v_doc;

  begin
    update public.document_types set active = false where id = v_tipo;
    raise exception 'FAIL: se ha retirado un tipo que todavía clasifica documentos';
  exception when raise_exception then
    raise notice 'OK: un tipo en uso no se retira: %', sqlerrm;
  end;

  -- Un documento en la papelera no lo impide, como en las demás maestras:
  -- exigir vaciar la papelera antes de retirar un tipo sería hacer que la
  -- papelera estorbe.
  update public.archive_documents set active = false where id = v_doc;
  update public.document_types set active = false where id = v_tipo;
  raise notice 'OK: un documento en la papelera no impide retirar su tipo';

  update public.document_types set active = true where id = v_tipo;
  update public.archive_documents set active = true where id = v_doc;
end $$;

-- ── 13. Una serie con contenido no se retira ─────────────────
do $$
declare v_fondo uuid; v_hoja uuid; v_doc uuid;
begin
  select id into v_fondo from public.archive_series where name = 'Fondo Alberto Rotili';
  -- Una hoja del árbol, para que la comprobación de documentos se ejercite de
  -- verdad: sobre una serie con subseries saltaría antes la de hijos y este
  -- bloque pasaría sin llegar nunca a la que este grupo añade.
  select id into v_hoja from public.archive_series where name = 'Cartas a comisarios';
  select id into v_doc from public.archive_documents where title = 'Carta de 1985';

  begin
    update public.archive_series set active = false where id = v_fondo;
    raise exception 'FAIL: se ha retirado un fondo que todavía contiene series';
  exception when raise_exception then
    raise notice 'OK: una serie con subseries dentro no se retira: %', sqlerrm;
  end;

  -- La hoja, vacía, sí se retira y se restaura.
  update public.archive_series set active = false where id = v_hoja;
  update public.archive_series set active = true where id = v_hoja;

  update public.archive_documents set archive_series_id = v_hoja where id = v_doc;

  begin
    update public.archive_series set active = false where id = v_hoja;
    raise exception 'FAIL: se ha retirado una serie que todavía tiene documentos dentro';
  exception when raise_exception then
    if position('documentos' in sqlerrm) = 0 then
      raise exception 'FAIL: ha saltado otra comprobación, no la de documentos: %', sqlerrm;
    end if;
    raise notice 'OK: una serie con documentos dentro no se retira: %', sqlerrm;
  end;

  -- Y con el documento en la papelera sí, como en las demás maestras.
  update public.archive_documents set active = false where id = v_doc;
  update public.archive_series set active = false where id = v_hoja;
  update public.archive_series set active = true where id = v_hoja;
  update public.archive_documents set active = true where id = v_doc;
  raise notice 'OK: un documento en la papelera no impide retirar su serie';
end $$;

-- ── 14. Un lugar con documentos dentro tampoco ───────────────
-- El guardarraíl a medio aplicar más fácil de olvidar de todo este diseño: la
-- función que lo impide se REEMPLAZA en esta migración, y un reemplazo que se
-- coma uno de los dos bloques anteriores no rompe nada visible. Por eso se
-- comprueban los tres.
do $$
declare v_edificio uuid; v_balda uuid; v_doc uuid; v_obra text;
begin
  insert into public.physical_places (name) values ('Edificio del archivo de prueba')
  returning id into v_edificio;
  insert into public.physical_places (parent_id, name) values (v_edificio, 'Balda de prueba')
  returning id into v_balda;

  -- Primer bloque, el de siempre: un lugar con lugares dentro.
  begin
    update public.physical_places set active = false where id = v_edificio;
    raise exception 'FAIL: se ha retirado un lugar que todavía contiene otros lugares';
  exception when raise_exception then
    raise notice 'OK: primer bloque en pie — un lugar con lugares dentro no se retira';
  end;

  -- Segundo bloque: un lugar con obras dentro.
  update public.artworks set physical_place_id = v_balda where catalog_id = 'AR-9700';
  begin
    update public.physical_places set active = false where id = v_balda;
    raise exception 'FAIL: se ha retirado un lugar que todavía tiene obras dentro';
  exception when raise_exception then
    raise notice 'OK: segundo bloque en pie — un lugar con obras dentro no se retira';
  end;
  update public.artworks set physical_place_id = null where catalog_id = 'AR-9700';

  -- Tercer bloque, el que añade este grupo: un lugar con documentos dentro.
  select id into v_doc from public.archive_documents where title = 'Carta de 1985';
  update public.archive_documents set physical_place_id = v_balda where id = v_doc;

  begin
    update public.physical_places set active = false where id = v_balda;
    raise exception 'FAIL: se ha retirado el lugar donde está el archivo entero';
  exception when raise_exception then
    if position('documentos' in sqlerrm) = 0 then
      raise exception 'FAIL: ha saltado otra comprobación, no la de documentos: %', sqlerrm;
    end if;
    raise notice 'OK: tercer bloque — un lugar con documentos de archivo dentro no se retira: %', sqlerrm;
  end;

  -- Y con el documento en la papelera sí, como con las obras.
  update public.archive_documents set active = false where id = v_doc;
  update public.physical_places set active = false where id = v_balda;
  update public.physical_places set active = true where id = v_balda;
  update public.archive_documents set active = true where id = v_doc;
  raise notice 'OK: un documento en la papelera no impide retirar su lugar (RF-215, ADR-006)';
end $$;

-- ── 15. Un documento se cuelga de varias obras (RF-516) ──────
-- Es el caso que justifica la tabla puente: con la clave ajena de v11, este
-- recorte serían tres filas y tres PDF subidos.
do $$
declare v_doc uuid; v_n int;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  insert into public.archive_documents (title, document_type_id)
  values ('Recorte que menciona tres obras',
          (select id from public.document_types where name = 'Recorte de prensa'))
  returning id into v_doc;

  perform public.document_artwork('AR-9700', v_doc, 'reproducida en la página 3');
  perform public.document_artwork('AR-9701', v_doc);
  perform public.document_artwork('AR-9702', v_doc, 'aparece al fondo de la fotografía');

  select count(*) into v_n from public.artwork_documents
   where document_id = v_doc and active;
  if v_n <> 3 then
    raise exception 'FAIL: el documento no se ha vinculado con las tres obras (%)', v_n;
  end if;

  select count(*) into v_n from public.archive_documents
   where title = 'Recorte que menciona tres obras';
  if v_n <> 1 then
    raise exception 'FAIL: el documento se ha duplicado, que es lo que la puente evita (%)', v_n;
  end if;

  -- Y con una exposición además, que es el cartel o el díptico de la muestra.
  perform public.document_exhibition(
    (select id from public.exhibitions where title = 'Muestra documentada'),
    v_doc, 'la muestra de la que habla el recorte');

  raise notice 'OK: un documento, tres obras y una exposición, una sola fila y un solo PDF (RF-516)';
end $$;

-- ── 16. Un documento se vincula una vez con cada obra ────────
do $$
declare v_doc uuid;
begin
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';

  begin
    insert into public.artwork_documents (catalog_id, document_id)
    values ('AR-9700', v_doc);
    raise exception 'FAIL: ha entrado un vínculo duplicado';
  exception when unique_violation then
    raise notice 'OK: un documento se vincula una vez con cada obra';
  end;

  begin
    insert into public.exhibition_documents (exhibition_id, document_id)
    values ((select id from public.exhibitions where title = 'Muestra documentada'), v_doc);
    raise exception 'FAIL: ha entrado un vínculo con la exposición duplicado';
  exception when unique_violation then
    raise notice 'OK: un documento se vincula una vez con cada exposición';
  end;
end $$;

-- ── 17. Volver a vincular un documento lo RESTAURA ───────────
-- RF-517, que revisa RF-903. Con la unicidad cubriendo también los vínculos
-- retirados, un `insert` de una pareja que está en la papelera choca contra el
-- índice y la interfaz convertiría un «Añadir» en un error incomprensible.
do $$
declare v_doc uuid; v_fila public.artwork_documents%rowtype; v_expo uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';

  update public.artwork_documents set active = false
   where catalog_id = 'AR-9700' and document_id = v_doc;

  v_fila := public.document_artwork('AR-9700', v_doc);

  if not v_fila.active then
    raise exception 'FAIL: volver a vincular no ha restaurado el vínculo (RF-517)';
  end if;
  -- Lo que no se manda no se borra: el formulario de «Añadir» viene en blanco y
  -- no puede vaciar la nota que alguien escribió.
  if v_fila.note <> 'reproducida en la página 3' then
    raise exception 'FAIL: la nota investigada se ha perdido al restaurar (%)', v_fila.note;
  end if;
  if (select count(*) from public.artwork_documents
       where catalog_id = 'AR-9700' and document_id = v_doc) <> 1 then
    raise exception 'FAIL: restaurar ha dejado dos filas';
  end if;

  -- Y una nota nueva sí manda.
  v_fila := public.document_artwork('AR-9700', v_doc, 'reproducida en la página 3, a color');
  if v_fila.note <> 'reproducida en la página 3, a color' then
    raise exception 'FAIL: la nota nueva no ha entrado (%)', v_fila.note;
  end if;

  -- Lo mismo por el lado de la exposición.
  select id into v_expo from public.exhibitions where title = 'Muestra documentada';
  update public.exhibition_documents set active = false
   where exhibition_id = v_expo and document_id = v_doc;
  if not (public.document_exhibition(v_expo, v_doc)).active then
    raise exception 'FAIL: volver a vincular con la exposición no ha restaurado';
  end if;

  raise notice 'OK: volver a añadir un vínculo retirado lo restaura y conserva su nota (RF-517)';
end $$;

-- ── 18. Un lector no archiva ─────────────────────────────────
do $$
declare v_doc uuid; v_fila public.artwork_documents%rowtype;
begin
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

  v_fila := public.document_artwork('AR-9701', v_doc);
  raise exception 'FAIL: un lector ha podido vincular un documento con una obra';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector no archiva: %', sqlerrm;
end $$;

do $$
declare v_doc uuid; v_expo uuid; v_fila public.exhibition_documents%rowtype;
begin
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';
  select id into v_expo from public.exhibitions where title = 'Muestra documentada';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

  v_fila := public.document_exhibition(v_expo, v_doc);
  raise exception 'FAIL: un lector ha podido vincular un documento con una exposición';
exception when others then
  if position('permiso' in sqlerrm) = 0 then raise; end if;
  raise notice 'OK: el lector tampoco vincula con exposiciones: %', sqlerrm;
end $$;

-- ── 19. «Sin revisar» no es «no», por las dos puertas ────────
--
-- RF-218. Una obra sin documentos vinculados no es una obra de la que no se
-- conserve nada: es una obra cuyo archivo nadie ha mirado. La columna solo vale
-- si no puede mentir, y para eso hacen falta las dos puertas.
do $$
declare v_doc uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  if (select documentation_status from public.artworks where catalog_id = 'AR-9700')
     <> 'UNREVIEWED' then
    raise exception 'FAIL: la documentación no nace «Sin revisar» (RF-205)';
  end if;

  -- Lo que SÍ se permite, y es intencionado: vínculos con el estado en «Sin
  -- revisar». Tener un dato no es haber hecho la investigación.
  if not exists (select 1 from public.artwork_documents
                  where catalog_id = 'AR-9700' and active) then
    raise exception 'FAIL: el fixture de este bloque no tiene el vínculo que necesita';
  end if;

  begin
    update public.artworks set documentation_status = 'NONE_FOUND'
     where catalog_id = 'AR-9700';
    raise exception 'FAIL: se ha declarado la documentación investigada sin resultado con vínculos debajo';
  exception when raise_exception then
    raise notice 'OK: primera puerta — la columna no puede contradecir a los vínculos: %', sqlerrm;
  end;

  -- Retirados los vínculos, sí se puede declarar.
  update public.artwork_documents set active = false where catalog_id = 'AR-9700';
  update public.artworks set documentation_status = 'NONE_FOUND' where catalog_id = 'AR-9700';

  -- Y entonces la segunda puerta cierra por el otro lado. Con un documento
  -- NUEVO, para que lo que rechace la operación sea la comprobación y no la
  -- unicidad de una pareja que ya existe: sin esta precaución, quitar el
  -- guardarraíl dejaría el test rojo por otro motivo y el aserto no verificaría
  -- lo que dice.
  insert into public.archive_documents (title) values ('Cartel de la muestra')
  returning id into v_doc;
  begin
    insert into public.artwork_documents (catalog_id, document_id)
    values ('AR-9700', v_doc);
    raise exception 'FAIL: se ha vinculado un documento a una obra declarada sin documentación';
  exception when raise_exception then
    if position('contradice' in sqlerrm) = 0 then
      raise exception 'FAIL: ha fallado por otro motivo, no por la segunda puerta: %', sqlerrm;
    end if;
    raise notice 'OK: segunda puerta — no se archiva una obra declarada sin documentación: %', sqlerrm;
  end;

  -- Y restaurar un vínculo retirado tampoco cuela por la puerta de atrás.
  select id into v_doc from public.archive_documents
   where title = 'Recorte que menciona tres obras';
  begin
    perform public.document_artwork('AR-9700', v_doc);
    raise exception 'FAIL: restaurar un vínculo ha esquivado la comprobación';
  exception when raise_exception then
    if position('contradice' in sqlerrm) = 0 then
      raise exception 'FAIL: restaurar ha fallado por otro motivo: %', sqlerrm;
    end if;
    raise notice 'OK: restaurar tampoco esquiva la segunda puerta';
  end;

  update public.artworks set documentation_status = 'UNREVIEWED' where catalog_id = 'AR-9700';
  update public.artwork_documents set active = true where catalog_id = 'AR-9700';
end $$;

-- ── 20. Y los tres bloques anteriores siguen en pie ──────────
-- Esta migración REEMPLAZA `tg_artwork_research_status_coherent` por cuarta vez,
-- y un reemplazo que se coma un bloque anterior no rompe nada visible: la
-- migración que lo escribió se aplicó hace rato y su test sigue pasando, porque
-- comprueba la función que hay y no la que había.
do $$
declare v_expo uuid; v_ref uuid;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  -- Procedencia.
  insert into public.provenance_events (catalog_id, party_note)
  values ('AR-9701', 'Colección privada, España');
  begin
    update public.artworks set provenance_status = 'NONE_FOUND' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el bloque de procedencia se ha perdido en el reemplazo';
  exception when raise_exception then
    raise notice 'OK: el bloque de procedencia sigue en pie';
  end;

  -- Bibliografía.
  insert into public.bibliography (title) values ('Referencia de prueba del archivo')
  returning id into v_ref;
  perform public.cite_artwork('AR-9701', v_ref, '34');
  begin
    update public.artworks set bibliography_status = 'NONE_FOUND' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el bloque de bibliografía se ha perdido en el reemplazo';
  exception when raise_exception then
    raise notice 'OK: el bloque de bibliografía sigue en pie';
  end;

  -- Historial expositivo.
  select id into v_expo from public.exhibitions where title = 'Muestra documentada';
  perform public.exhibit_artwork('AR-9701', v_expo, '12 bis');
  begin
    update public.artworks set exhibition_history_status = 'NONE_FOUND' where catalog_id = 'AR-9701';
    raise exception 'FAIL: el bloque de historial expositivo se ha perdido en el reemplazo';
  exception when raise_exception then
    raise notice 'OK: el bloque de historial expositivo sigue en pie';
  end;
end $$;

-- ── 21. El estado de investigación es un enumerado cerrado ───
do $$
begin
  begin
    update public.artworks set documentation_status = 'PENDIENTE' where catalog_id = 'AR-9702';
    raise exception 'FAIL: ha entrado un estado de investigación inventado';
  exception when invalid_text_representation then
    raise notice 'OK: el estado de investigación no admite texto libre (RF-218)';
  end;

  begin
    insert into public.archive_documents (title, artist_fund) values ('De un tercer artista', 'PICASSO');
    raise exception 'FAIL: ha entrado un fondo que no existe';
  exception when invalid_text_representation then
    raise notice 'OK: el fondo del documento es un enumerado cerrado';
  end;
end $$;

-- ── 22. La papelera de cada una ──────────────────────────────
--
-- El documento es una ficha con nombre propio y de las que RF-901 enumera: lleva
-- papelera completa y restaurar NO borra la traza de la baja anterior (RF-902).
-- El tipo, la serie y los dos vínculos cuelgan de otra cosa y no tienen pantalla
-- de papelera propia, así que restaurarlos los deja como si nunca se hubieran
-- retirado — y por eso se comprueba, para que la diferencia sea deliberada y no
-- un olvido.
do $$
declare
  v_doc uuid; v_tipo uuid; v_serie uuid; v_vinculo uuid;
  v_baja timestamptz; v_quien uuid; v_restaurado timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  select id into v_doc from public.archive_documents where title = 'Sin signatura 1';

  update public.archive_documents set active = false where id = v_doc;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.archive_documents where id = v_doc;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del documento no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.archive_documents where id = v_doc) then
    raise exception 'FAIL: el documento ha desaparecido al retirarlo (RF-901)';
  end if;

  update public.archive_documents set active = true where id = v_doc;
  select deactivated_at, restored_at into v_baja, v_restaurado
    from public.archive_documents where id = v_doc;
  if v_restaurado is null or v_baja is null then
    raise exception 'FAIL: restaurar el documento no ha dejado traza, o ha borrado la de la baja (RF-902)';
  end if;

  select id into v_tipo from public.document_types where name = 'Telegrama';
  update public.document_types set active = false where id = v_tipo;
  if (select deactivated_by from public.document_types where id = v_tipo)
     is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del tipo no ha quedado sellada';
  end if;
  update public.document_types set active = true where id = v_tipo;
  if (select deactivated_at from public.document_types where id = v_tipo) is not null then
    raise exception 'FAIL: el tipo restaurado arrastra la traza de una baja que ya no existe';
  end if;

  -- Una serie vacía y sin subseries, para que lo que se compruebe aquí sea la
  -- papelera y no la regla de «no se retira lo que tiene algo dentro».
  insert into public.archive_series (name) values ('Fondo de prueba de la papelera')
  returning id into v_serie;
  update public.archive_series set active = false where id = v_serie;
  if (select deactivated_by from public.archive_series where id = v_serie)
     is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja de la serie no ha quedado sellada';
  end if;
  update public.archive_series set active = true where id = v_serie;
  if (select deactivated_at from public.archive_series where id = v_serie) is not null then
    raise exception 'FAIL: la serie restaurada arrastra la traza de una baja que ya no existe';
  end if;

  select id into v_vinculo from public.artwork_documents where catalog_id = 'AR-9702';
  update public.artwork_documents set active = false where id = v_vinculo;
  select deactivated_at, deactivated_by into v_baja, v_quien
    from public.artwork_documents where id = v_vinculo;
  if v_baja is null or v_quien is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la baja del vínculo no ha quedado sellada (% / %)', v_baja, v_quien;
  end if;
  if not exists (select 1 from public.artwork_documents where id = v_vinculo) then
    raise exception 'FAIL: el vínculo ha desaparecido al retirarlo (RF-517 revisa RF-903)';
  end if;
  update public.artwork_documents set active = true where id = v_vinculo;
  if (select deactivated_at from public.artwork_documents where id = v_vinculo) is not null then
    raise exception 'FAIL: el vínculo restaurado arrastra la traza de una baja que ya no existe';
  end if;

  raise notice 'OK: el documento guarda las dos trazas; el vocabulario y los vínculos vuelven limpios';
end $$;

-- ── 23. La autoría la sella la base ──────────────────────────
-- RF-803 y RF-804 con la función genérica: quién y cuándo salen de la sesión, no
-- de lo que mande el cliente. Se comprueba mandando una fecha falsa y viendo que
-- el trigger la pisa; comparar dos instantes no valdría, porque dentro de una
-- transacción `now()` no avanza.
do $$
declare v_id uuid; v_creado uuid; v_actualizado uuid; v_cuando timestamptz;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';

  insert into public.archive_documents (title, created_by, updated_by)
  values ('Documento con autoría mentida',
          '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2')
  returning id, created_by into v_id, v_creado;

  if v_creado is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la autoría no la ha sellado la sesión (%)', v_creado;
  end if;

  update public.archive_documents
     set note = 'Localizado en la caja 4',
         updated_at = timestamptz '2000-01-01 00:00:00+00',
         updated_by = '00000000-0000-0000-0000-0000000000d2'
   where id = v_id;

  select updated_at, updated_by into v_cuando, v_actualizado
    from public.archive_documents where id = v_id;
  if v_cuando <> now() then
    raise exception 'FAIL: la fecha de actualización la ha puesto el cliente (%)', v_cuando;
  end if;
  if v_actualizado is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: «actualizado por» la ha puesto el cliente (%)', v_actualizado;
  end if;

  -- Y en la serie y en el tipo, que no tienen columnas de actualización: la
  -- función genérica toca solo las columnas que la fila tenga (RF-804).
  insert into public.archive_series (name, created_by)
  values ('Fondo con autoría mentida', '00000000-0000-0000-0000-0000000000d2');
  if (select created_by from public.archive_series where name = 'Fondo con autoría mentida')
     is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'FAIL: la autoría de la serie no la ha sellado la sesión';
  end if;

  raise notice 'OK: la autoría y la fecha de actualización las sella la base (RF-801, RF-803, RF-804)';
end $$;

-- ── 24. Nadie borra de verdad, y las cinco nacen cerradas ────
-- RF-901, RF-111, RF-113. Las políticas las escribe la migración siguiente; con
-- RLS activado y sin política, la tabla está cerrada, que es el estado seguro
-- para esperar. Lo que no puede pasar nunca es lo contrario: privilegios
-- concedidos sin RLS.
do $$
declare v_tabla text;
begin
  foreach v_tabla in array array['document_types', 'archive_series', 'archive_documents',
                                 'artwork_documents', 'exhibition_documents']
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
  raise notice 'OK: RLS activado en las cinco, retirar es un update y borrar no está concedido a nadie';
end $$;

do $$
begin
  set local role anon;
  perform 1 from public.document_types limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los tipos de documento';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los tipos de documento';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.archive_series limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar la clasificación archivística';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a la clasificación archivística';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.archive_documents limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los documentos de archivo';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los documentos de archivo';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.artwork_documents limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los vínculos con obras';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los vínculos con obras';
end $$;

reset role;

do $$
begin
  set local role anon;
  perform 1 from public.exhibition_documents limit 1;
  raise exception 'FAIL: el rol anónimo ha podido consultar los vínculos con exposiciones';
exception
  when insufficient_privilege then
    raise notice 'OK: el rol anónimo no llega a los vínculos con exposiciones';
end $$;

reset role;

rollback;
