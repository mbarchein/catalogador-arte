-- Links to external sites: RF-1401 to RF-1408.
-- And, ahead of everything, the perimeter: RF-101, RF-105, RF-106, RF-109, RF-111,
-- RF-113, RF-609, RF-901, RF-902.
--
-- What this file really defends is ONE LINE: the address's validation.
-- Everything that goes into `url` will end up inside an `href` in the record
-- the whole team sees, there is no backend standing in between and the anonymous key
-- travels in the client. That is why the hostile list is complete and written case by case
-- —including the three the pattern's first version let through: the backslash,
-- the zero-width space and the credentials before the host— and
-- that is why it is run TWICE, against `url` and against `archive_url`. If somebody
-- loosens the pattern, this goes red.
--
-- The invisible and control characters are written with `chr()` on purpose: an
-- invisible byte stuck inside the file is not visible on review and is lost in
-- the first copy and paste, which is precisely the failure being tested.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures ─────────────────────────────────────────────────
--
-- A real cataloguer and a real reader; the profiles are created by the
-- auth.users trigger. Two artworks —one active and one withdrawn— and two photographs of the
-- active one —one active and one withdrawn—, which is the minimum for exercising the
-- inherited visibility in both anchors.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'cat-enlaces@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'lec-enlaces@test.local');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000b2';

insert into public.artworks (catalog_id, artist, title, attributed_title) values
  ('AR-9700', 'ROTILI', 'Obra con enlaces', 'UNCONFIRMED'),
  ('AR-9701', 'ROTILI', 'Obra retirada con enlaces', 'UNCONFIRMED'),
  ('AR-9702', 'ROTILI', 'Obra sin nada colgando', 'UNCONFIRMED');

insert into public.images (catalog_id, thumbnail_path, derivative_path, master_path, shot_type) values
  ('AR-9700', 'e/min1.webp', 'e/der1.webp', 'e/master1.jpg', 'GENERAL'),
  ('AR-9700', 'e/min2.webp', 'e/der2.webp', 'e/master2.jpg', 'BACK');

update public.images  set active = false where image_id  = 'AR-9700_v2';
update public.artworks set active = false where catalog_id = 'AR-9701';


-- ── 1. The table is born closed (RF-111, RF-113, RF-901) ─────
--
-- Absolute priority and before anything else: with no backend, these policies are the only
-- perimeter. The system catalogue is measured, which is where the table that
-- forgot a `revoke` is visible.
do $$
declare v_privilegios text[];
begin
  if not (select relrowsecurity from pg_class where oid = 'public.external_links'::regclass) then
    raise exception 'FAIL: external_links no tiene RLS activado (RF-111)';
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'external_links'
                and cmd in ('DELETE', 'ALL')) then
    raise exception 'FAIL: hay una política que permite DELETE sobre los enlaces (RF-901)';
  end if;

  if has_table_privilege('authenticated', 'public.external_links', 'delete')
     or has_table_privilege('anon', 'public.external_links', 'delete') then
    raise exception 'FAIL: alguien tiene privilegio de DELETE sobre los enlaces (RF-901)';
  end if;

  -- The anonymous role, not one privilege: neither table nor column. Revoking from
  -- `anon` does not undo what PUBLIC grants, so what is looked at is the
  -- result.
  select coalesce(array_agg(distinct table_name || ' (' || privilege_type || ')'), '{}')
    into v_privilegios
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'external_links' and grantee = 'anon';
  if array_length(v_privilegios, 1) > 0 then
    raise exception 'FAIL: el rol anónimo tiene privilegios sobre los enlaces: %',
      array_to_string(v_privilegios, ', ');
  end if;

  -- And the authenticated one, exactly three and not four.
  select coalesce(array_agg(distinct privilege_type order by privilege_type), '{}')
    into v_privilegios
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'external_links' and grantee = 'authenticated';
  if v_privilegios <> array['INSERT', 'SELECT', 'UPDATE'] then
    raise exception 'FAIL: el rol autenticado debería tener INSERT, SELECT y UPDATE sobre los enlaces, tiene [%]',
      array_to_string(v_privilegios, ', ');
  end if;

  raise notice 'OK: RLS activado, sin DELETE por ninguna de las dos puertas, y el anónimo sin nada (RF-111, RF-113, RF-901)';
end $$;

-- The anonymous one, really attacking.
do $$
begin
  set local role anon;
  perform 1 from public.external_links limit 1;
  reset role;
  raise exception 'FAIL: el rol anónimo ha podido consultar los enlaces (RF-101)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: el rol anónimo no llega a los enlaces (RF-101)';
end $$;

reset role;

-- And an authenticated DELETE has to fail for LACK OF PRIVILEGE and not for
-- lack of rows: if it failed for lack of rows, the day somebody granted
-- the privilege this would go on passing.
do $$
begin
  set local role authenticated;
  delete from public.external_links;
  reset role;
  raise exception 'FAIL: un usuario autenticado ha podido ejecutar un DELETE sobre los enlaces';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: el DELETE está denegado por privilegio, no por ausencia de filas (RF-901)';
end $$;

reset role;


-- ── 2. The exclusive arc (RF-1401) ───────────────────────────
--
-- The constraint's NAME is checked and not only that it fails: what
-- PostgreSQL returns on rejecting is the name, and it is what the interface translates
-- into Spanish.
do $$
declare v_restriccion text;
begin
  begin
    insert into public.external_links (url) values ('https://ejemplo.es/sin-ancla');
    raise exception 'FAIL: ha entrado un enlace sin ancla ninguna';
  exception when check_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion <> 'external_links_exactly_one_owner' then
      raise exception 'FAIL: un enlace sin ancla lo rechaza [%] y no el arco exclusivo', v_restriccion;
    end if;
  end;

  begin
    insert into public.external_links (artwork_id, image_id, url)
    values ('AR-9700', 'AR-9700_v1', 'https://ejemplo.es/dos-anclas');
    raise exception 'FAIL: ha entrado un enlace colgando de una obra y de una fotografía a la vez';
  exception when check_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion <> 'external_links_exactly_one_owner' then
      raise exception 'FAIL: un enlace con dos anclas lo rechaza [%] y no el arco exclusivo', v_restriccion;
    end if;
  end;

  raise notice 'OK: ni cero anclas ni dos: exactamente una (RF-1401)';
end $$;

-- And both forms with a single anchor go in.
do $$
begin
  insert into public.external_links (artwork_id, url) values
    ('AR-9700', 'https://www.macvac.es/obra/saliente-en-el-espacio/');
  insert into public.external_links (image_id, url) values
    ('AR-9700_v1', 'https://www.macvac.es/artista/rotili-zampanoli-alberto/');
  raise notice 'OK: un enlace de obra y un enlace de fotografía entran (RF-1401)';
end $$;

-- The foreign key is declared, not polymorphic: an invented identifier does not
-- go in, and that is exactly what a text column with the type alongside would
-- not be able to prevent.
do $$
begin
  begin
    insert into public.external_links (artwork_id, url) values ('AR-0000', 'https://ejemplo.es/obra-fantasma');
    raise exception 'FAIL: ha entrado un enlace colgando de una obra inexistente';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.external_links (image_id, url) values ('AR-9700_v9', 'https://ejemplo.es/foto-fantasma');
    raise exception 'FAIL: ha entrado un enlace colgando de una fotografía inexistente';
  exception when foreign_key_violation then
    null;
  end;

  raise notice 'OK: las dos claves ajenas rechazan un identificador inexistente (RF-1401)';
end $$;

-- `on delete restrict`: nobody has DELETE, but if a row were ever deleted
-- by hand from administrative access, this warns instead of leaving links
-- hanging from nothing.
-- The nested block is the only way of undoing an attempt inside PL/pgSQL:
-- each `begin ... exception` is a subtransaction, and a hand-written `savepoint` is not
-- admitted here.
do $$
begin
  begin
    delete from public.artworks where catalog_id = 'AR-9700';
    raise exception 'FAIL: se ha podido borrar a mano una obra con enlaces colgando';
  exception when foreign_key_violation then
    raise notice 'OK: borrar a mano la obra choca con el restrict de los enlaces';
  end;
end $$;


-- ── 3. The address: the whole hostile list (RF-1403) ─────────
--
-- Each string with the attack it represents. The list is run against `url` and
-- afterwards, without removing a single one, against `archive_url`.
--
-- The original design's NUL byte case is not here: PostgreSQL does not admit \x00
-- inside a `text` and the literal string itself fails before reaching the
-- `check`, so testing it would be testing the lexer.
create temporary table hostiles (n integer generated always as identity, u text, porque text);

insert into hostiles (u, porque) values
  ('javascript:alert(1)',                'esquema ejecutable, el ataque de manual'),
  ('JavaScript:alert(1)',                'el mismo, con mayúsculas'),
  (' javascript:alert(1)',               'espacio delante: el navegador recorta y lo ejecuta'),
  (e'java\tscript:alert(1)',             'tabulador dentro del esquema, ejecutado por navegadores reales'),
  (e'java\nscript:alert(1)',             'salto de línea dentro del esquema'),
  ('data:text/html;base64,PHNjcmlwdD4=', 'documento incrustado'),
  ('vbscript:msgbox(1)',                 'esquema ejecutable de otra época'),
  ('file:///etc/passwd',                 'fichero local'),
  ('blob:https://ejemplo.es/x',          'blob, que empieza por algo que parece https'),
  ('//evil.example/obra',                'relativa al protocolo'),
  ('evil.example/obra',                  'sin esquema'),
  ('http://',                            'esquema sin nada detrás'),
  ('https://localhost/obra',             'nombre sin punto: no es una fuente citable'),
  ('https://macvac.es@evil.example/obra','CREDENCIALES antes del anfitrión: se lee como del MACVA y va a otro sitio'),
  ('https://user:pass@ejemplo.es/x',     'usuario y contraseña antes del anfitrión'),
  ('https://eje mplo.es',                'espacio dentro del nombre del sitio'),
  ('https://ejemplo.es/a' || chr(1) || 'b', 'carácter de control (U+0001) en la ruta'),
  ('https://ejemplo.es/a' || chr(127),   'carácter de control (DEL) al final'),
  ('https://evil.example\.ejemplo.es/',  'BARRA INVERTIDA: el navegador la lee como barra y el anfitrión real es evil.example'),
  ('https://ejemplo' || chr(8203) || '.es/x', 'ESPACIO DE ANCHO CERO (U+200B) dentro del anfitrión'),
  ('https://ejemplo.es' || chr(8203) || '/x', 'espacio de ancho cero al final del anfitrión'),
  ('https://ejemplo' || chr(173) || '.es/x', 'guion suave (U+00AD) dentro del anfitrión'),
  ('https://192.168.1.7/obra',           'dirección IP'),
  ('https://[::1]/obra',                 'dirección IP versión 6'),
  ('https://ejemplo.es./obra',           'punto final en el nombre del sitio'),
  ('https://.ejemplo.es/obra',           'punto inicial'),
  ('https://ejemplo..es/obra',           'etiqueta vacía en medio'),
  ('https://ejemplo_a.es/x',             'guion bajo, que no es carácter de dominio'),
  ('https://-ejemplo.es/x',              'etiqueta que empieza por guion'),
  ('https://ejemplo-.es/x',              'etiqueta que termina en guion'),
  ('https://ejemplo.e/x',                'dominio de primer nivel de una letra'),
  ('https://ejemplo.es:123456/x',        'puerto de seis cifras'),
  ('',                                   'la cadena vacía'),
  ('https://ejemplo.es/' || repeat('a', 3000), 'tres mil caracteres: un pegado accidental'),
  ('https://ejemplo.es/obra ',           'espacio al final'),
  ('https://münchen.example/obra',       'dominio internacionalizado en Unicode: COSTE ACEPTADO, se guarda en punycode');

create temporary table buenas (n integer generated always as identity, u text, porque text);

insert into buenas (u, porque) values
  ('https://www.macvac.es/obra/saliente-en-el-espacio/', 'la del caso real'),
  ('HTTPS://WWW.MACVAC.ES/OBRA/',                        'el esquema y el anfitrión en mayúsculas'),
  ('http://museo-regional.example/ficha?id=12#foto',     'http sin cifrar, con parámetros y ancla'),
  ('https://ejemplo.es/obra/españa',                     'ruta no ASCII: lo que se restringe es el anfitrión'),
  ('https://x.example/@usuaria',                         'arroba en la RUTA, que no es la autoridad'),
  ('https://ejemplo.es:8443/obra',                       'puerto explícito'),
  ('http://a.bc',                                        'la más corta admisible, once caracteres'),
  ('https://xn--muenchen-9db.example/obra',              'punycode, que es como se guarda un dominio internacionalizado'),
  ('https://sub.dominio.ejemplo.es/a?b=1&c=2#d',         'tres etiquetas y una consulta con dos parámetros');

-- 3a. Contra `url`.
do $$
declare r record; v_restriccion text;
begin
  for r in select * from hostiles order by n loop
    begin
      insert into public.external_links (artwork_id, url) values ('AR-9700', r.u);
      raise exception 'FAIL: ha entrado una dirección que no debía [%] — %', left(r.u, 70), r.porque;
    exception when check_violation then
      get stacked diagnostics v_restriccion = constraint_name;
      if v_restriccion <> 'external_links_url_is_web' then
        raise exception 'FAIL: [%] la rechaza [%] y no la validación de la dirección',
          left(r.u, 70), v_restriccion;
      end if;
    end;
  end loop;
  raise notice 'OK: las % direcciones hostiles se rechazan en `url`, todas por external_links_url_is_web (RF-1403)',
    (select count(*) from hostiles);
end $$;

-- 3b. Against `archive_url`, the whole list again. The archived copy ends up
-- in an `href` just like the original, so the rule is exactly the same and
-- not a relaxed version.
do $$
declare r record; v_restriccion text;
begin
  for r in select * from hostiles order by n loop
    begin
      insert into public.external_links (artwork_id, url, archive_url)
      values ('AR-9700', 'https://ejemplo.es/original-' || r.n, r.u);
      raise exception 'FAIL: ha entrado una copia archivada que no debía [%] — %', left(r.u, 70), r.porque;
    exception when check_violation then
      get stacked diagnostics v_restriccion = constraint_name;
      if v_restriccion <> 'external_links_archive_url_is_web' then
        raise exception 'FAIL: la copia archivada [%] la rechaza [%] y no su validación',
          left(r.u, 70), v_restriccion;
      end if;
    end;
  end loop;
  raise notice 'OK: las mismas % direcciones hostiles se rechazan en `archive_url` (RF-1403)',
    (select count(*) from hostiles);
end $$;

-- 3c. And the good ones go in, through both columns. Without this block the pattern
-- could be hardened until it admitted nothing and the two previous ones would go on
-- passing.
do $$
declare r record;
begin
  for r in select * from buenas order by n loop
    begin
      insert into public.external_links (artwork_id, url, archive_url)
      values ('AR-9702', r.u, r.u);
    exception when check_violation then
      raise exception 'FAIL: se ha rechazado una dirección legítima [%] — %', r.u, r.porque;
    end;
  end loop;
  raise notice 'OK: las % direcciones legítimas entran por `url` y por `archive_url` (RF-1403)',
    (select count(*) from buenas);
end $$;

delete from public.external_links where artwork_id = 'AR-9702';

-- 3d. The title is stored trimmed and not with spaces around it: a title with
-- spaces breaks the comparison without it being visible on screen.
do $$
declare v_restriccion text;
begin
  begin
    insert into public.external_links (artwork_id, url, title)
    values ('AR-9702', 'https://ejemplo.es/con-titulo-sucio', '  Ficha en el MACVA  ');
    raise exception 'FAIL: ha entrado un título sin recortar';
  exception when check_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion <> 'external_links_title_trimmed' then
      raise exception 'FAIL: el título sin recortar lo rechaza [%]', v_restriccion;
    end if;
  end;
  raise notice 'OK: el título se guarda recortado';
end $$;


-- ── 4. The row's shape, and the single-phase deployment ──────
--
-- A row with only the anchor and the address is valid: it is born with no title, no
-- type, no note, unchecked and active. Nothing requires the type's column to exist,
-- so a client that does not know it goes on working.
do $$
declare v_fila public.external_links%rowtype;
begin
  insert into public.external_links (artwork_id, url)
  values ('AR-9702', 'https://museo-regional.example/ficha?id=12')
  returning * into v_fila;

  if v_fila.title <> '' or v_fila.note <> '' then
    raise exception 'FAIL: el título o la nota no nacen vacíos';
  end if;
  if v_fila.link_type is not null then
    raise exception 'FAIL: el tipo no nace «sin clasificar»';
  end if;
  if v_fila.check_status is not null or v_fila.checked_at is not null
     or v_fila.checked_by is not null then
    raise exception 'FAIL: un enlace nace comprobado, y nadie ha abierto esa página (RF-1405)';
  end if;
  if not v_fila.active or v_fila.deactivated_at is not null then
    raise exception 'FAIL: un enlace nuevo no nace activo';
  end if;
  if v_fila.archive_url is not null then
    raise exception 'FAIL: la copia archivada no nace vacía';
  end if;

  raise notice 'OK: una fila con solo el ancla y la dirección es válida y nace sin comprobar (RF-1402, RF-1405, RF-1408)';
end $$;

-- «Sin clasificar» and OTHER are not the same, and the enum admits no free text.
do $$
begin
  update public.external_links set link_type = 'OTHER'
   where artwork_id = 'AR-9702' and url = 'https://museo-regional.example/ficha?id=12';

  if (select count(*) from public.external_links
       where artwork_id = 'AR-9702' and link_type is null) <> 0 then
    raise exception 'FAIL: no se distingue «sin clasificar» de OTHER';
  end if;

  begin
    update public.external_links set link_type = 'PRENSA' where artwork_id = 'AR-9702';
    raise exception 'FAIL: el tipo de enlace ha admitido texto libre';
  exception when invalid_text_representation then
    null;
  end;

  raise notice 'OK: el tipo es un enumerado cerrado y nulo no es OTHER (RF-1402)';
end $$;

delete from public.external_links where artwork_id = 'AR-9702';


-- ── 5. A link is not added twice, and it can be added again ──
--
-- Both unique indexes are PARTIAL on `active` on purpose: pasting the same thing
-- twice into the same record is the real accident, and adding again what was
-- withdrawn is a legitimate operation (RF-1406).
do $$
declare v_id uuid;
begin
  insert into public.external_links (artwork_id, url)
  values ('AR-9702', 'https://prensa.example/critica-1985')
  returning id into v_id;

  begin
    insert into public.external_links (artwork_id, url)
    values ('AR-9702', 'https://prensa.example/critica-1985');
    raise exception 'FAIL: la misma dirección ha entrado dos veces en la misma obra';
  exception when unique_violation then
    null;
  end;

  -- The same address in ANOTHER artwork does: the same article can document two
  -- artworks, and each copy earns its own note.
  insert into public.external_links (artwork_id, url)
  values ('AR-9700', 'https://prensa.example/critica-1985');

  -- And once withdrawn, it can be added again.
  update public.external_links set active = false where id = v_id;
  insert into public.external_links (artwork_id, url)
  values ('AR-9702', 'https://prensa.example/critica-1985');

  raise notice 'OK: no dos veces activa en la misma ficha; sí en otra ficha y sí después de retirarla (RF-1406)';
end $$;

delete from public.external_links where artwork_id in ('AR-9702');
delete from public.external_links where url = 'https://prensa.example/critica-1985';


-- ── 6. The logical deletion (RF-901, RF-902, RF-1406) ────────
--
-- A link is never deleted: it is withdrawn, with a trace of who and when, and it is
-- restored from the record itself. With no `restored_at`, which `tg_row_audit` detects:
-- on restoring it returns both withdrawal columns to null, as in the places.
do $$
declare v_id uuid; v_fila public.external_links%rowtype;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;

  insert into public.external_links (artwork_id, url, title)
  values ('AR-9700', 'https://ejemplo.es/para-retirar', 'Para retirar')
  returning id into v_id;

  update public.external_links set active = false where id = v_id;
  reset role;

  select * into v_fila from public.external_links where id = v_id;
  if v_fila.active then
    raise exception 'FAIL: el enlace sigue activo después de retirarlo';
  end if;
  if v_fila.deactivated_at is null
     or v_fila.deactivated_by is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: retirar no ha sellado quién y cuándo (RF-902)';
  end if;
  if v_fila.created_by is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: el alta no ha sellado el autor (RF-804)';
  end if;

  -- Y restaurar.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.external_links set active = true where id = v_id;
  reset role;

  select * into v_fila from public.external_links where id = v_id;
  if not v_fila.active or v_fila.deactivated_at is not null or v_fila.deactivated_by is not null then
    raise exception 'FAIL: restaurar no ha devuelto a nulo la traza de la baja';
  end if;

  raise notice 'OK: retirar sella quién y cuándo, restaurar lo limpia, y la fila sigue ahí (RF-901, RF-902)';
end $$;

reset role;


-- ── 7. The check (RF-1405) ───────────────────────────────────
--
-- The three columns state a fact about the outside world, so they are written only
-- by `record_link_check`. Null is «unchecked» and is NOT «broken».
do $$
declare
  v_sin uuid; v_roto uuid; v_cuando timestamptz; v_fila public.external_links%rowtype;
begin
  insert into public.external_links (artwork_id, url, title)
  values ('AR-9700', 'https://ejemplo.es/sin-comprobar', 'Sin comprobar')
  returning id into v_sin;

  insert into public.external_links (artwork_id, url, title)
  values ('AR-9700', 'https://ejemplo.es/roto', 'Roto')
  returning id into v_roto;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  v_cuando := public.record_link_check(v_roto, 'BROKEN');
  reset role;

  if v_cuando is null then
    raise exception 'FAIL: record_link_check no devuelve la marca de tiempo que la pantalla necesita';
  end if;

  select * into v_fila from public.external_links where id = v_roto;
  if v_fila.check_status <> 'BROKEN' or v_fila.checked_at is distinct from v_cuando
     or v_fila.checked_by is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: la comprobación no ha quedado sellada con su fecha y su autor';
  end if;

  select * into v_fila from public.external_links where id = v_sin;
  if v_fila.check_status is not null then
    raise exception 'FAIL: un enlace sin comprobar no está a nulo';
  end if;

  -- And the distinction, which is the whole requirement: the one nobody has looked at cannot
  -- be confused with the one that was looked at and was broken.
  if (select count(*) from public.external_links
       where id in (v_sin, v_roto) and check_status is null) <> 1 then
    raise exception 'FAIL: «sin comprobar» y «roto» no se distinguen (RF-1405)';
  end if;

  raise notice 'OK: la comprobación se sella con fecha y autor, y nulo no es BROKEN (RF-1405)';
end $$;

reset role;

-- 7b. A direct `update` trying to write the three columns leaves them as
-- they were, and does NOT throw: a form that resends the whole row must not fail
-- for resending what was already there.
do $$
declare v_id uuid; v_antes public.external_links%rowtype; v_despues public.external_links%rowtype;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://ejemplo.es/roto';
  select * into v_antes from public.external_links where id = v_id;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.external_links
     set title = 'Roto, con la fila entera reenviada',
         check_status = 'WORKING',
         checked_at = '2001-01-01T00:00:00Z',
         checked_by = '00000000-0000-0000-0000-0000000000b2'
   where id = v_id;
  reset role;

  select * into v_despues from public.external_links where id = v_id;
  if v_despues.title <> 'Roto, con la fila entera reenviada' then
    raise exception 'FAIL: el update ha fallado en lugar de ignorar las tres columnas congeladas';
  end if;
  if v_despues.check_status <> v_antes.check_status
     or v_despues.checked_at is distinct from v_antes.checked_at
     or v_despues.checked_by is distinct from v_antes.checked_by then
    raise exception 'FAIL: un update directo ha movido el estado de comprobación (RF-1405)';
  end if;

  raise notice 'OK: un update directo no mueve la comprobación, y tampoco falla por intentarlo';
end $$;

reset role;

-- 7c. Confirming the same state again a year later DOES move the date: it is the
-- most frequent case, «it still works». Since `now()` is the transaction's
-- time, the date is put back by hand —with the setting in place, which is the only
-- way— in order to see the RPC move it forward.
do $$
declare v_id uuid; v_antigua timestamptz; v_nueva timestamptz;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://ejemplo.es/roto';

  perform set_config('app.link_check', v_id::text, true);
  update public.external_links
     set check_status = 'WORKING', checked_at = now() - interval '1 year',
         checked_by = '00000000-0000-0000-0000-0000000000b1'
   where id = v_id;
  perform set_config('app.link_check', '', true);

  select checked_at into v_antigua from public.external_links where id = v_id;
  if v_antigua > now() - interval '300 days' then
    raise exception 'FAIL: no se ha podido atrasar la fecha para montar el caso';
  end if;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  v_nueva := public.record_link_check(v_id, 'WORKING');
  reset role;

  if v_nueva <= v_antigua then
    raise exception 'FAIL: volver a confirmar el mismo estado no ha movido la fecha (RF-1405)';
  end if;

  raise notice 'OK: reconfirmar «sigue funcionando» mueve la fecha, que es para lo que existe';
end $$;

reset role;

-- 7d. Editing the note does not move the check date, but it does move the
-- update one and its author: they are two different facts and they do not tread on each other.
do $$
declare v_id uuid; v_comprobada timestamptz; v_fila public.external_links%rowtype;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://ejemplo.es/roto';

  -- The check is put back so a change is noticeable.
  perform set_config('app.link_check', v_id::text, true);
  update public.external_links set checked_at = now() - interval '30 days' where id = v_id;
  perform set_config('app.link_check', '', true);
  select checked_at into v_comprobada from public.external_links where id = v_id;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;
  reset role;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  update public.external_links set note = 'Guardada la copia del periódico en papel' where id = v_id;
  reset role;

  select * into v_fila from public.external_links where id = v_id;
  if v_fila.checked_at is distinct from v_comprobada then
    raise exception 'FAIL: editar la nota ha movido la fecha de comprobación';
  end if;
  if v_fila.updated_at is distinct from now()
     or v_fila.updated_by is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: editar la nota no ha movido la fecha de actualización ni su autor (RF-801)';
  end if;

  raise notice 'OK: editar la nota mueve la actualización y no la comprobación (RF-801, RF-1405)';
end $$;

reset role;

-- 7e. Setting the state to null through the RPC returns ALL THREE columns to null:
-- «it is unchecked again» is a legitimate correction and not a loss of
-- data.
do $$
declare v_id uuid; v_fila public.external_links%rowtype; v_cuando timestamptz;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://ejemplo.es/roto';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  v_cuando := public.record_link_check(v_id, null);
  reset role;

  select * into v_fila from public.external_links where id = v_id;
  if v_cuando is not null or v_fila.check_status is not null
     or v_fila.checked_at is not null or v_fila.checked_by is not null then
    raise exception 'FAIL: volver a «sin comprobar» no ha limpiado las tres columnas (RF-1405)';
  end if;

  raise notice 'OK: volver a «sin comprobar» limpia las tres columnas';
end $$;

reset role;

-- 7f. The setting is ALWAYS cleared: after calling the RPC, a second direct update
-- over the same row and inside the same transaction does not move the three
-- columns either. Without the clearing, that window would exist.
do $$
declare v_id uuid; v_fila public.external_links%rowtype;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://ejemplo.es/roto';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  perform public.record_link_check(v_id, 'CHANGED');
  update public.external_links
     set check_status = 'WORKING', checked_by = '00000000-0000-0000-0000-0000000000b2'
   where id = v_id;
  reset role;

  select * into v_fila from public.external_links where id = v_id;
  if v_fila.check_status <> 'CHANGED'
     or v_fila.checked_by is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'FAIL: el ajuste app.link_check ha quedado abierto tras la RPC';
  end if;

  raise notice 'OK: el ajuste se limpia y la ventana de después de la RPC no existe';
end $$;

reset role;

-- 7g. A date with no state is not stored. It can only be attempted with the setting
-- in place, which is the only path that reaches the constraint.
do $$
declare v_id uuid; v_restriccion text;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://ejemplo.es/roto';

  begin
    perform set_config('app.link_check', v_id::text, true);
    update public.external_links set check_status = null, checked_at = now() where id = v_id;
    raise exception 'FAIL: ha entrado una fecha de comprobación sin estado';
  exception when check_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion <> 'external_links_check_pair' then
      raise exception 'FAIL: la fecha sin estado la rechaza [%]', v_restriccion;
    end if;
  end;
  perform set_config('app.link_check', '', true);

  raise notice 'OK: o las dos o ninguna: external_links_check_pair (RF-1405)';
end $$;

-- 7h. And the state does not admit free text either.
do $$
declare v_id uuid;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://ejemplo.es/roto';
  begin
    perform public.record_link_check(v_id, 'ROTO');
    raise exception 'FAIL: el estado de comprobación ha admitido texto libre';
  exception when invalid_text_representation then
    raise notice 'OK: el estado de comprobación es un enumerado cerrado';
  end;
end $$;

-- 7i. A link that does not exist is not checked in silence.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;
  begin
    perform public.record_link_check('11111111-1111-4111-8111-111111111111', 'WORKING');
    reset role;
    raise exception 'FAIL: comprobar un enlace inexistente no ha protestado';
  exception when raise_exception then
    reset role;
    raise notice 'OK: comprobar un enlace inexistente lanza en español y no devuelve nulo en silencio';
  end;
end $$;

reset role;


-- ── 8. The role matrix, authenticating for real ──────────────
--
-- RF-105, RF-106, RF-109. Checking that the policy exists verifies nothing: what
-- matters is what the base answers when the request comes from whom it
-- comes.

-- 8a. The Cataloguer does their own: creates, classifies, notes, archives a copy,
-- withdraws and restores.
do $$
declare v_id uuid; v_fila public.external_links%rowtype;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;

  insert into public.external_links (artwork_id, url)
  values ('AR-9700', 'https://catalogo.example/obra/9700')
  returning id into v_id;

  update public.external_links
     set title = 'Ficha en el catálogo en línea',
         link_type = 'ONLINE_CATALOG',
         note = 'De aquí sale la medida del bastidor',
         archive_url = 'https://archivo.example/copia/9700'
   where id = v_id;

  update public.external_links set active = false where id = v_id;
  update public.external_links set active = true  where id = v_id;

  reset role;

  select * into v_fila from public.external_links where id = v_id;
  if v_fila.title <> 'Ficha en el catálogo en línea' or v_fila.link_type <> 'ONLINE_CATALOG'
     or v_fila.note = '' or v_fila.archive_url is null or not v_fila.active then
    raise exception 'FAIL: el catalogador no ha podido crear, clasificar, anotar y archivar un enlace (RF-103)';
  end if;

  raise notice 'OK: el catalogador crea, clasifica, anota, archiva, retira y restaura (RF-103)';
end $$;

reset role;

-- 8b. The Reader reads what is active of a record they can see.
do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://catalogo.example/obra/9700';
  reset role;

  if v_n <> 1 then
    raise exception 'FAIL: el lector no ve un enlace activo de una obra activa (RF-105)';
  end if;
  raise notice 'OK: el lector lee los enlaces activos de lo que puede ver (RF-105)';
end $$;

reset role;

-- 8c. And does NOT write a single column. What has to be asserted is the SILENCE: an
-- update the USING clause hides does not fail, it affects no row. The
-- content is checked OUTSIDE their session, because a `row_count` of zero does not
-- distinguish «it did not write» from «it wrote and then it was hidden from them».
do $$
declare v_id uuid; v_afectadas integer; v_fila public.external_links%rowtype;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://catalogo.example/obra/9700';

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;

  update public.external_links
     set title = 'Secuestrado por el lector',
         url = 'https://evil.example/obra',
         note = 'Nota indebida',
         link_type = 'PRESS',
         archive_url = 'https://evil.example/copia',
         active = false
   where id = v_id;
  get diagnostics v_afectadas = row_count;
  reset role;

  if v_afectadas <> 0 then
    raise exception 'FAIL: el lector ha modificado % fila(s) de enlaces (RF-106)', v_afectadas;
  end if;

  select * into v_fila from public.external_links where id = v_id;
  if v_fila.title <> 'Ficha en el catálogo en línea'
     or v_fila.url <> 'https://catalogo.example/obra/9700'
     or v_fila.note = 'Nota indebida' or v_fila.link_type <> 'ONLINE_CATALOG'
     or v_fila.archive_url <> 'https://archivo.example/copia/9700'
     or not v_fila.active then
    raise exception 'FAIL: el update del lector ha dejado algo escrito (RF-106)';
  end if;

  raise notice 'OK: el update del lector no afecta a ninguna fila y no deja nada escrito (RF-106)';
end $$;

reset role;

-- 8d. Nor do they create.
do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;
  insert into public.external_links (artwork_id, url) values ('AR-9700', 'https://alta.example/indebida');
  reset role;
  raise exception 'FAIL: el lector ha podido dar de alta un enlace (RF-106)';
exception
  when insufficient_privilege then
    reset role;
    raise notice 'OK: el lector no da de alta ningún enlace (RF-106)';
end $$;

reset role;

-- 8e. Nor do they check: the RPC is `security invoker` and on top of that it asks about
-- `can_edit()`, so the reader is left out through both doors. And the
-- state has not moved, checked from outside their session.
do $$
declare v_id uuid; v_estado public.link_check_status;
begin
  select id into v_id from public.external_links
   where artwork_id = 'AR-9700' and url = 'https://catalogo.example/obra/9700';
  select check_status into v_estado from public.external_links where id = v_id;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;
  begin
    perform public.record_link_check(v_id, 'WORKING');
    reset role;
    raise exception 'FAIL: el lector ha podido comprobar un enlace (RF-106)';
  exception when raise_exception then
    reset role;
  end;

  if (select check_status from public.external_links where id = v_id) is distinct from v_estado then
    raise exception 'FAIL: la llamada del lector ha movido el estado de comprobación';
  end if;

  raise notice 'OK: el lector no comprueba enlaces y su llamada no deja rastro (RF-106, RF-1405)';
end $$;

reset role;


-- ── 9. The inherited visibility (RF-609, RF-1401) ────────────
--
-- The policy's subqueries are evaluated under the policy of THEIR OWN
-- table, so the Reader does not find out that the link of a record or of
-- a photograph they cannot see exists. It is not a copy of the rule: it is the rule
-- itself, and if the artworks' one changes tomorrow, this one follows it on its own.
insert into public.external_links (artwork_id, url, title) values
  ('AR-9701', 'https://ejemplo.es/de-obra-retirada', 'De una obra retirada');
insert into public.external_links (image_id, url, title) values
  ('AR-9700_v2', 'https://ejemplo.es/de-foto-retirada', 'De una fotografía retirada');
insert into public.external_links (image_id, url, title) values
  ('AR-9700_v1', 'https://ejemplo.es/de-foto-activa', 'De una fotografía activa');

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.external_links
   where url = 'https://ejemplo.es/de-obra-retirada';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve el enlace de una obra retirada (RF-609)';
  end if;

  select count(*) into v_n from public.external_links
   where url = 'https://ejemplo.es/de-foto-retirada';
  if v_n <> 0 then
    raise exception 'FAIL: el lector ve el enlace de una fotografía retirada (RF-609)';
  end if;

  select count(*) into v_n from public.external_links
   where url = 'https://ejemplo.es/de-foto-activa';
  if v_n <> 1 then
    raise exception 'FAIL: el lector no ve el enlace de una fotografía activa (RF-105)';
  end if;

  reset role;
  raise notice 'OK: el lector no ve los enlaces de lo que la ficha le esconde (RF-609)';
end $$;

reset role;

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  set local role authenticated;

  select count(*) into v_n from public.external_links
   where url in ('https://ejemplo.es/de-obra-retirada', 'https://ejemplo.es/de-foto-retirada',
                 'https://ejemplo.es/de-foto-activa');
  reset role;

  if v_n <> 3 then
    raise exception 'FAIL: el catalogador debería ver los tres enlaces, ve % (RF-906)', v_n;
  end if;
  raise notice 'OK: el catalogador sí ve los enlaces de la papelera (RF-906)';
end $$;

reset role;

-- And the WITHDRAWN link of an active artwork: the reader does not either.
do $$
declare v_id uuid; v_n integer;
begin
  insert into public.external_links (artwork_id, url, title)
  values ('AR-9700', 'https://ejemplo.es/enlace-retirado', 'Enlace retirado')
  returning id into v_id;
  update public.external_links set active = false where id = v_id;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.external_links where id = v_id;
  reset role;

  if v_n <> 0 then
    raise exception 'FAIL: el lector ve un enlace retirado de una obra activa (RF-906)';
  end if;
  raise notice 'OK: el lector no ve los enlaces retirados (RF-906)';
end $$;

reset role;

-- And the policy names both anchors: the day a third is added without
-- extending it, its links would be invisible to everybody and nobody would know
-- why.
do $$
declare v_expresion text;
begin
  select qual into v_expresion from pg_policies
   where schemaname = 'public' and tablename = 'external_links'
     and policyname = 'external_links_select';
  if v_expresion is null then
    raise exception 'FAIL: no existe la política de SELECT de los enlaces';
  end if;
  if v_expresion not like '%artworks%' or v_expresion not like '%images%' then
    raise exception 'FAIL: la política de SELECT no consulta las tablas de las dos anclas: %', v_expresion;
  end if;
  raise notice 'OK: la política de SELECT pregunta por la ficha ancla y hereda su visibilidad';
end $$;


-- ── 10. The functions (RF-111) ───────────────────────────────
do $$
declare v_volatilidad char; v_config text[];
begin
  select provolatile, proconfig into v_volatilidad, v_config
    from pg_proc where oid = 'public.is_web_url(text)'::regprocedure;

  -- Immutable: if it were not, it could not be used in a `check`, which is where it lives.
  if v_volatilidad <> 'i' then
    raise exception 'FAIL: is_web_url no es inmutable (%)', v_volatilidad;
  end if;
  if not exists (select 1 from unnest(coalesce(v_config, '{}')) c where c like 'search\_path=%') then
    raise exception 'FAIL: is_web_url no fija su search_path';
  end if;
  if has_function_privilege('public', 'public.is_web_url(text)', 'execute') then
    raise exception 'FAIL: is_web_url es ejecutable por PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.is_web_url(text)', 'execute') then
    raise exception 'FAIL: la aplicación no puede ejecutar is_web_url, y la necesita para no duplicar la regla';
  end if;

  if has_function_privilege('public', 'public.record_link_check(uuid, public.link_check_status)', 'execute')
     or has_function_privilege('anon', 'public.record_link_check(uuid, public.link_check_status)', 'execute') then
    raise exception 'FAIL: record_link_check es ejecutable por PUBLIC o por el anónimo';
  end if;
  if has_function_privilege('public', 'public.tg_external_link_check_freeze()', 'execute') then
    raise exception 'FAIL: la función de trigger del congelado es ejecutable por PUBLIC';
  end if;

  -- `security invoker`, like set_main_image: this way it still goes through RLS and a
  -- reader changes nothing even if they call it.
  if (select prosecdef from pg_proc
       where oid = 'public.record_link_check(uuid, public.link_check_status)'::regprocedure) then
    raise exception 'FAIL: record_link_check es SECURITY DEFINER y se saltaría la RLS';
  end if;

  raise notice 'OK: is_web_url es inmutable, con search_path fijo y no de PUBLIC; la RPC no se salta la RLS (RF-111)';
end $$;

-- The authorship is stamped by RF-804's COMMON function and not by a copy of its own. Six
-- copies of twenty lines is guaranteed divergence.
do $$
declare v_funcion text;
begin
  if exists (select 1 from pg_proc
              where pronamespace = 'public'::regnamespace
                and proname = 'tg_external_link_authorship') then
    raise exception 'FAIL: existe una función de autoría propia de los enlaces; la común es tg_row_audit (RF-804)';
  end if;

  select p.proname into v_funcion
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.external_links'::regclass
     and t.tgname = 'external_link_row_audit';

  if v_funcion is distinct from 'tg_row_audit' then
    raise exception 'FAIL: el trigger de autoría de los enlaces llama a [%] y no a tg_row_audit', v_funcion;
  end if;
  raise notice 'OK: la autoría la sella tg_row_audit, la función común (RF-804)';
end $$;

-- And `is_web_url` is the same rule for both columns and for whoever calls it
-- directly: the application uses it to give the message in Spanish before
-- saving. The TypeScript mirror lives in the frontend and its hostile list is
-- THIS same one; the source of truth is this function, and the drift can only make
-- the client stricter and never the base more permissive.
do $$
declare r record;
begin
  for r in select * from hostiles order by n loop
    if public.is_web_url(r.u) then
      raise exception 'FAIL: is_web_url acepta [%] llamada directamente — %', left(r.u, 70), r.porque;
    end if;
  end loop;
  for r in select * from buenas order by n loop
    if not public.is_web_url(r.u) then
      raise exception 'FAIL: is_web_url rechaza [%] llamada directamente — %', r.u, r.porque;
    end if;
  end loop;
  if public.is_web_url(null) is not null then
    raise exception 'FAIL: is_web_url no es STRICT y devuelve algo para nulo';
  end if;
  raise notice 'OK: la misma lista hostil contra la función suelta, que es la que espeja el cliente (RF-1403)';
end $$;

rollback;
