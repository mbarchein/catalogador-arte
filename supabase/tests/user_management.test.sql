-- La gestión de usuarios: rol, acceso y traza (RF-108, RF-104, RF-1107, RF-1108).
--
-- Este fichero es el más importante de la batería y conviene decir por qué: aquí no se
-- comprueba una regla del catálogo, se comprueba **quién puede tocar el catálogo**. Un
-- fallo en una restricción del esquema corrompe un dato; un fallo aquí abre el catálogo
-- entero o se lo cierra a quien trabaja. Y no hay servidor detrás que lo pare: la clave
-- anónima viaja en el cliente y estas políticas son el único perímetro (RF-111).
--
-- Todo se prueba **autenticándose de verdad** como un usuario de cada rol. Comprobar que
-- la política existe no verifica nada.
\set ON_ERROR_STOP on
begin;

-- ── Fixtures: uno de cada, y dos superusuarios ──────────────
--
-- Dos superusuarios y no uno, porque media docena de asertos de aquí abajo necesitan
-- degradar a uno y el candado del último lo impediría — que es justo lo que ese candado
-- está para hacer, y tiene su propia sección al final.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'super1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'super2@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'catal@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'lector@test.local');

update public.profiles set role = 'SUPERUSER' where id in
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');
update public.profiles set role = 'CATALOGER' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'READER'    where id = '00000000-0000-0000-0000-0000000000b2';

insert into public.artworks (catalog_id, artist, title, attributed_title)
values ('AR-8001', 'ROTILI', 'Obra para medir el acceso', 'UNCONFIRMED');

-- ── RF-108: el rol lo asigna el superusuario, y nadie más ───
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  -- Sobre su propia fila la política le deja llegar, y ahí le para el trigger.
  begin
    update public.profiles set role = 'SUPERUSER'
      where id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'FAIL: el catalogador se ha nombrado superusuario';
  exception when others then
    if position('RF-108' in sqlerrm) = 0 then raise; end if;
  end;

  -- Sobre la de otro no hay excepción: la política filtra la fila y la escritura no toca
  -- nada. **Cero filas y ningún error** es lo que ve quien llama, y por eso la pantalla
  -- tiene que mirar lo que se escribió en vez de dar por bueno que no hubo error.
  update public.profiles set role = 'READER'
    where id = '00000000-0000-0000-0000-0000000000a1';
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1')
     <> 'SUPERUSER' then
    raise exception 'FAIL: el catalogador ha degradado a un superusuario';
  end if;

  -- Y el lector, lo mismo por las dos vías.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  begin
    update public.profiles set role = 'CATALOGER'
      where id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'FAIL: el lector se ha nombrado catalogador';
  exception when others then
    if position('RF-108' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK: ni el catalogador ni el lector cambian ningún rol (RF-108, RF-104)';
end $$;
reset role;

-- ── Y el superusuario sí ────────────────────────────────────
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

  update public.profiles set role = 'CATALOGER'
    where id = '00000000-0000-0000-0000-0000000000b2';
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b2')
     <> 'CATALOGER' then
    raise exception 'FAIL: el superusuario no ha podido cambiar un rol';
  end if;

  -- Y lo deja como estaba, que los asertos de abajo cuentan con el lector.
  update public.profiles set role = 'READER'
    where id = '00000000-0000-0000-0000-0000000000b2';

  raise notice 'OK: el superusuario asigna roles (RF-108)';
end $$;
reset role;

-- ── Cada uno corrige su nombre, y solo su nombre ────────────
do $$
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

  update public.profiles set name = 'Catalogadora de prueba'
    where id = '00000000-0000-0000-0000-0000000000b1';
  if (select name from public.profiles where id = '00000000-0000-0000-0000-0000000000b1')
     <> 'Catalogadora de prueba' then
    raise exception 'FAIL: nadie ha podido corregir su propio nombre';
  end if;

  -- El de otro, no: es la política `profiles_update_own`, que sigue en pie.
  update public.profiles set name = 'Nombre puesto por otra persona'
    where id = '00000000-0000-0000-0000-0000000000b2';
  if (select name from public.profiles where id = '00000000-0000-0000-0000-0000000000b2')
     = 'Nombre puesto por otra persona' then
    raise exception 'FAIL: el catalogador ha renombrado a otra persona';
  end if;

  raise notice 'OK: cada uno corrige su nombre y no el de nadie más';
end $$;
reset role;

-- ── El acceso: lo que de verdad cierra el catálogo ──────────
--
-- Es la parte con más alcance de toda la migración: `can_read()` la usan todas las
-- políticas del esquema, así que lo que se afirma aquí es que quitar el acceso cierra el
-- catálogo ENTERO y no una pantalla.
do $$
declare v_n integer;
begin
  -- Lo quita el superusuario.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  update public.profiles set active = false
    where id = '00000000-0000-0000-0000-0000000000b1';
  if (select active from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: el superusuario no ha podido retirar el acceso';
  end if;

  -- Y ahora, como esa persona: ni una obra.
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  select count(*) into v_n from public.artworks;
  if v_n <> 0 then
    raise exception 'FAIL: sin acceso se siguen leyendo % obras', v_n;
  end if;

  -- Ni una exposición, ni un fondo: es el catálogo entero y no una tabla.
  select count(*) into v_n from public.exhibitions;
  if v_n <> 0 then raise exception 'FAIL: sin acceso se leen exposiciones'; end if;
  select count(*) into v_n from public.artist_funds;
  if v_n <> 0 then raise exception 'FAIL: sin acceso se leen los fondos'; end if;

  -- Ni escribe.
  begin
    insert into public.artworks (artist, title, attributed_title)
    values ('ROTILI', 'Alta de quien no tiene acceso', 'UNCONFIRMED');
    raise exception 'FAIL: sin acceso se ha podido crear una obra';
  exception when insufficient_privilege or check_violation then
    null;
  when others then
    if position('row-level security' in sqlerrm) = 0 then raise; end if;
  end;

  -- Las tres funciones dicen que no. `my_role()` importa especialmente: con ella decide
  -- la función Edge que firma los ficheros (RF-110), así que si contestara el rol, a quien
  -- se le acaba de retirar el acceso seguiría descargando másteres del bucket privado.
  if public.can_read() then raise exception 'FAIL: can_read() dice que sí sin acceso'; end if;
  if public.can_edit() then raise exception 'FAIL: can_edit() dice que sí sin acceso'; end if;
  if public.my_role() is not null then
    raise exception 'FAIL: my_role() contesta un rol sin acceso: %', public.my_role();
  end if;

  -- Pero SÍ lee su propia fila, y eso no es un descuido: sin ella la aplicación no podría
  -- distinguir «te han quitado el acceso» de «no tienes perfil», y enseñaría pantallas
  -- vacías sin decir por qué.
  select count(*) into v_n from public.profiles
    where id = '00000000-0000-0000-0000-0000000000b1';
  if v_n <> 1 then
    raise exception 'FAIL: sin acceso no se puede leer ni el propio perfil';
  end if;

  -- Y solo la suya: el equipo entero no.
  select count(*) into v_n from public.profiles;
  if v_n <> 1 then
    raise exception 'FAIL: sin acceso se lee el equipo entero (% filas)', v_n;
  end if;

  raise notice 'OK: sin acceso no hay catálogo, y sí hay explicación';
end $$;
reset role;

-- ── Quien sí entra sigue viendo a quien no ──────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

  -- Con acceso y sin él: la ficha de una obra imprime «actualizado por» y ese nombre tiene
  -- que resolverse aunque la persona ya no entre.
  select count(*) into v_n from public.profiles
    where id = '00000000-0000-0000-0000-0000000000b1' and not active;
  if v_n <> 1 then
    raise exception 'FAIL: quien administra no ve a quien se quedó sin acceso';
  end if;

  -- Y se lo puede devolver.
  update public.profiles set active = true
    where id = '00000000-0000-0000-0000-0000000000b1';
  if not (select active from public.profiles where id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: no se ha podido devolver el acceso';
  end if;

  raise notice 'OK: el equipo se ve entero, y el acceso se devuelve';
end $$;
reset role;

-- ── La papelera del perfil se sella sola (RF-902) ───────────
do $$
declare v_row public.profiles;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

  update public.profiles set active = false
    where id = '00000000-0000-0000-0000-0000000000b2';
  select * into v_row from public.profiles where id = '00000000-0000-0000-0000-0000000000b2';
  if v_row.deactivated_at is null or v_row.deactivated_by
     is distinct from '00000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'FAIL: retirar el acceso no ha dejado quién ni cuándo';
  end if;

  update public.profiles set active = true
    where id = '00000000-0000-0000-0000-0000000000b2';
  select * into v_row from public.profiles where id = '00000000-0000-0000-0000-0000000000b2';
  if v_row.restored_at is null then
    raise exception 'FAIL: devolver el acceso no ha dejado traza';
  end if;
  -- Papelera completa: la restauración NO borra la huella de la retirada anterior.
  if v_row.deactivated_at is null then
    raise exception 'FAIL: la restauración ha borrado la traza de la retirada';
  end if;

  raise notice 'OK: quitar y devolver el acceso los sella la base (RF-902)';
end $$;
reset role;

-- ── Nunca sin superusuario ──────────────────────────────────
--
-- El candado que impide que un clic deje el catálogo sin gobierno: sin ningún
-- superusuario, la asignación de roles solo se recupera entrando al panel de Supabase.
do $$
begin
  -- Los superusuarios que hubiera en la base ANTES de este fichero se apartan aquí dentro
  -- —todo se deshace con el rollback del final—, porque si no el candado del último no se
  -- podría provocar: contaría también a los de verdad y la degradación estaría permitida.
  --
  -- Esto no es prudencia: **es el olvido que tumbó un despliegue**. La misma comprobación
  -- estaba escrita dentro de la migración, donde corre contra producción, y allí pasó lo
  -- que tenía que pasar — había un superusuario real, degradar al de mentira estaba
  -- permitido y la medida se cayó. Aquí se hace explícito en vez de suponerlo.
  update public.profiles set active = false
   where role = 'SUPERUSER' and active
     and id not in ('00000000-0000-0000-0000-0000000000a1',
                    '00000000-0000-0000-0000-0000000000a2');

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

  -- Con dos, uno se puede degradar: no es una prohibición de degradar superusuarios.
  update public.profiles set role = 'CATALOGER'
    where id = '00000000-0000-0000-0000-0000000000a2';
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a2')
     <> 'CATALOGER' then
    raise exception 'FAIL: con dos superusuarios no se ha podido degradar a uno';
  end if;

  -- Ya solo queda uno: ni degradarse…
  begin
    update public.profiles set role = 'READER'
      where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: se ha degradado al último superusuario';
  exception when others then
    if position('sin ningún superusuario' in sqlerrm) = 0 then raise; end if;
  end;

  -- …ni quitarse el acceso, que deja el catálogo igual de sin gobierno.
  begin
    update public.profiles set active = false
      where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: el último superusuario se ha quedado sin acceso';
  exception when others then
    if position('sin ningún superusuario' in sqlerrm) = 0 then raise; end if;
  end;

  -- Y un superusuario SIN acceso no cuenta como superusuario para este candado: si
  -- contara, el catálogo podría quedarse gobernado por alguien que no entra.
  update public.profiles set role = 'SUPERUSER'
    where id = '00000000-0000-0000-0000-0000000000a2';
  update public.profiles set active = false
    where id = '00000000-0000-0000-0000-0000000000a2';
  begin
    update public.profiles set role = 'READER'
      where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: el otro superusuario no entra y aun así ha valido de relevo';
  exception when others then
    if position('sin ningún superusuario' in sqlerrm) = 0 then raise; end if;
  end;
  update public.profiles set active = true
    where id = '00000000-0000-0000-0000-0000000000a2';

  raise notice 'OK: el catálogo no se queda sin superusuario con acceso';
end $$;
reset role;

-- ── RF-1108: la traza ───────────────────────────────────────
do $$
declare v_n integer; v_row public.role_changes;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

  select count(*) into v_n from public.role_changes
    where subject_id = '00000000-0000-0000-0000-0000000000b2'
      and old_role = 'READER' and new_role = 'CATALOGER'
      and actor_id = '00000000-0000-0000-0000-0000000000a1';
  if v_n <> 1 then
    raise exception 'FAIL: el cambio de rol no ha dejado una línea (%)', v_n;
  end if;

  -- El acceso también deja línea: quitarlo es tan sensible como cambiar un rol.
  select count(*) into v_n from public.role_changes
    where subject_id = '00000000-0000-0000-0000-0000000000b1'
      and old_active and not new_active;
  if v_n <> 1 then
    raise exception 'FAIL: retirar el acceso no ha dejado línea (%)', v_n;
  end if;

  -- Guarda el correo, que es lo que sigue diciendo de quién habla si la cuenta se borra
  -- desde el panel y el perfil cae en cascada.
  select * into v_row from public.role_changes
    where subject_id = '00000000-0000-0000-0000-0000000000b1' order by id limit 1;
  if v_row.subject_email <> 'catal@test.local' then
    raise exception 'FAIL: la traza no guarda el correo de quién es';
  end if;

  -- Y un cambio que no toca ni el rol ni el acceso no escribe nada: un registro que se lee
  -- entero no puede llenarse de líneas que no cuentan nada.
  select count(*) into v_n from public.role_changes;
  update public.profiles set name = 'Nombre nuevo'
    where id = '00000000-0000-0000-0000-0000000000a1';
  if (select count(*) from public.role_changes) <> v_n then
    raise exception 'FAIL: corregir un nombre ha escrito en el registro de roles';
  end if;

  raise notice 'OK: cada cambio de rol y de acceso deja su línea, y nada más la deja';
end $$;
reset role;

-- ── La traza solo la lee quien administra ───────────────────
do $$
declare v_n integer;
begin
  set local role authenticated;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  select count(*) into v_n from public.role_changes;
  if v_n <> 0 then
    raise exception 'FAIL: el catalogador lee el registro de roles (% filas)', v_n;
  end if;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  select count(*) into v_n from public.role_changes;
  if v_n <> 0 then
    raise exception 'FAIL: el lector lee el registro de roles (% filas)', v_n;
  end if;

  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select count(*) into v_n from public.role_changes;
  if v_n = 0 then
    raise exception 'FAIL: el superusuario no lee el registro de roles';
  end if;

  raise notice 'OK: el registro de roles habla de personas y solo lo lee quien administra';
end $$;
reset role;

-- ── Los candados de la traza ────────────────────────────────
--
-- Una auditoría a la que se le pueden añadir líneas inventadas está tan rota como una a
-- la que se le pueden quitar las verdaderas. Se ataca como `postgres`, que es dueño de la
-- tabla y la vía que la RLS no cierra.
do $$
begin
  begin
    insert into public.role_changes
      (subject_id, subject_email, actor_id, old_role, new_role, old_active, new_active)
    values (gen_random_uuid(), 'inventado@test.local', null, 'READER', 'SUPERUSER', true, true);
    raise exception 'FAIL: se ha podido añadir una línea inventada al registro de roles';
  exception when others then
    if position('solo escribe el trigger' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.role_changes set new_role = 'READER' where id = (select min(id) from public.role_changes);
    raise exception 'FAIL: se ha podido reescribir una línea del registro de roles';
  exception when others then
    if position('no se modifica ni se borra' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.role_changes;
    raise exception 'FAIL: se ha podido borrar el registro de roles';
  exception when others then
    if position('no se modifica ni se borra' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    truncate public.role_changes;
    raise exception 'FAIL: se ha podido vaciar el registro de roles';
  exception when others then
    if position('no se modifica ni se borra' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'OK: el registro de roles solo se añade, ni siquiera para el dueño de la tabla';
end $$;

-- ── Los privilegios, uno a uno (RF-113) ─────────────────────
do $$
declare v_priv text;
begin
  -- Del registro de roles, `select` y nada más.
  for v_priv in select unnest(array['insert', 'update', 'delete', 'truncate']) loop
    if has_table_privilege('authenticated', 'public.role_changes', v_priv) then
      raise exception 'FAIL: authenticated tiene % sobre role_changes', v_priv;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.role_changes', 'select') then
    raise exception 'FAIL: authenticated no puede leer role_changes';
  end if;
  if has_table_privilege('anon', 'public.role_changes', 'select') then
    raise exception 'FAIL: la clave anónima lee el registro de roles';
  end if;

  -- Y de los perfiles no se borra nadie: quitar el acceso no es borrar la cuenta, y
  -- borrarla dejaría el catálogo firmado por un identificador que ya no existe.
  if has_table_privilege('authenticated', 'public.profiles', 'delete') then
    raise exception 'FAIL: se pueden borrar perfiles';
  end if;

  raise notice 'OK: los privilegios del registro de roles y de los perfiles, uno a uno';
end $$;

rollback;
