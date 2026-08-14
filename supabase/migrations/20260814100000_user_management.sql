-- Gestión de usuarios dentro de la aplicación (RF-1107, que revisa RF-1105).
--
-- Hasta hoy, invitar, asignar rol y revocar se hacían en el panel de Supabase, y así
-- estaba escrito en RF-1105. Con tres personas en el equipo eso era razonable; lo que lo
-- deja de ser es el detalle de RF-108: **la mitad que prohíbe estaba puesta y la que
-- permite no**. El trigger `role_superuser_only` impide desde el primer día que quien no
-- es Superusuario cambie un rol, pero la única política de escritura de `profiles` es
-- `profiles_update_own` —`id = auth.uid()`—, y RLS filtra antes de que el trigger llegue
-- a opinar: hoy un Superusuario no puede tocar la fila de nadie. Asignar un rol desde la
-- aplicación era, literalmente, imposible.
--
-- Esta migración pone las tres cosas que faltaban, todas en la base, porque no hay
-- servidor y las políticas son el único perímetro (RF-111):
--
--   1. El acceso al catálogo como estado del perfil, y no como el hecho de tener fila.
--   2. La política que permite al Superusuario escribir en el perfil de otro.
--   3. La traza: quién cambió qué, a quién y cuándo.

-- ── 1. El acceso, con su papelera ───────────────────────────
--
-- Quitar el acceso NO es borrar la cuenta, y la diferencia importa más aquí que en
-- ninguna otra tabla: `profiles.id` cae en cascada desde `auth.users`, así que borrar la
-- cuenta de quien se va dejaría el catálogo entero firmado por un identificador que ya no
-- existe —cada «actualizado por» de cada obra que tocó—. Se retira el acceso, el nombre
-- se sigue leyendo y el gesto se deshace.
alter table public.profiles
  add column active boolean not null default true,
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.profiles (id),
  add column restored_at timestamptz,
  add column restored_by uuid references public.profiles (id);

comment on column public.profiles.active is
  'Si esta cuenta entra al catálogo. Falso es «sin acceso»: la sesión puede seguir abierta y la base no le devuelve ni una fila, salvo su propio perfil para que la aplicación pueda decírselo. No es un borrado (RF-901): el nombre se sigue leyendo en cada «actualizado por» y el gesto se deshace.';

-- El sello de la papelera lo pone la base y no el cliente, como en el resto del esquema:
-- `tg_row_audit` toca solo las columnas que la fila tenga, y ahora `profiles` las tiene.
create trigger profiles_row_audit
  before insert or update on public.profiles
  for each row execute function public.tg_row_audit();

-- ── Las tres funciones que deciden, ahora con el acceso dentro ──
--
-- `can_read()` era «existe fila en profiles». Con el acceso, es «existe fila Y entra».
-- Esta función la usan TODAS las políticas del esquema, que es exactamente por lo que el
-- acceso vive aquí y no en una comprobación de la pantalla: quitarlo cierra el catálogo
-- entero de una vez, sin repetir la regla en veintitantos sitios donde se podría olvidar.
create or replace function public.can_read()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('CATALOGER', 'SUPERUSER') from public.profiles
      where id = auth.uid() and active),
    false
  );
$$;

-- `my_role()` contesta null a quien no tiene acceso, y no es cosmética: la función Edge
-- que firma los ficheros decide con ella (RF-110), así que sin esto alguien a quien se le
-- acaba de retirar el acceso seguiría descargando másteres del bucket privado mientras le
-- durara el token.
create or replace function public.my_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

comment on function public.my_role is
  'El rol de la sesión, o null si no tiene perfil o se le ha retirado el acceso. Lo lee la aplicación y la función Edge que firma los ficheros.';

-- Quién puede administrar el equipo. Separada de `can_edit()` a propósito: un Catalogador
-- no toca usuarios (RF-104), y tenerlo en una función con nombre propio es lo que hace que
-- la política de abajo se lea sola.
create function public.can_manage_users()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'SUPERUSER' from public.profiles where id = auth.uid() and active),
    false
  );
$$;

comment on function public.can_manage_users is
  'Si la sesión puede administrar el equipo: Superusuario con acceso (RF-108, RF-104).';

revoke all on function public.can_manage_users() from public, anon;
grant execute on function public.can_manage_users() to authenticated;

-- ── 2. Las políticas de profiles ────────────────────────────
--
-- La de lectura se rehace por una razón concreta: **cada uno lee siempre su propia fila,
-- tenga acceso o no**. Sin esa mitad, a quien se le retira el acceso la aplicación no
-- podría distinguir «te lo han quitado» de «no tienes perfil», y enseñaría pantallas
-- vacías sin decir por qué, que es la peor forma de negar algo.
--
-- Y quien sí tiene acceso sigue viendo el equipo entero, con acceso y sin él: la ficha de
-- una obra imprime «actualizado por» y ese nombre tiene que resolverse aunque la persona
-- ya no entre.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.can_read());

-- La que faltaba para RF-108. El trigger de abajo es quien vigila lo que se puede tocar;
-- esta política es la que deja al Superusuario llegar hasta él.
create policy profiles_update_superuser on public.profiles
  for update using (public.can_manage_users()) with check (public.can_manage_users());

-- `profiles_update_own` se queda como está: cada uno corrige su nombre. El trigger impide
-- que por esa vía se toque el rol o el acceso.

-- ── El trigger que ya existía, extendido al acceso ──────────
--
-- Era `tg_role_superuser_only` y vigilaba una columna; ahora vigila las dos que dan y
-- quitan poder. Se rehace entero en vez de añadir otro trigger al lado: dos triggers
-- vigilando la misma fila por el mismo motivo es la clase de duplicado donde un día uno
-- de los dos se queda sin actualizar.
create or replace function public.tg_role_superuser_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    -- Sin usuario autenticado la petición no viene de una sesión de la aplicación: es
    -- acceso administrativo directo (el editor SQL del panel, la clave de servicio, una
    -- semilla de desarrollo). Esa vía ya tiene poder total por definición, así que
    -- bloquearla no añadiría seguridad e impediría administrar el catálogo — incluido
    -- nombrar al primer Superusuario, que por fuerza se hace desde fuera.
    if auth.uid() is null or current_user = 'service_role' then
      return new;
    end if;

    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'SUPERUSER' and active
    ) then
      if new.role is distinct from old.role then
        raise exception 'Solo el superusuario puede cambiar el rol de un usuario (RF-108)';
      end if;
      raise exception 'Solo el superusuario puede dar o quitar el acceso al catálogo'
        using hint = 'Pídeselo a quien administre el catálogo.';
    end if;
  end if;
  return new;
end $$;

-- ── Nunca sin Superusuario ──────────────────────────────────
--
-- El candado que hace que esta pantalla no pueda dejar el catálogo sin gobierno: si el
-- último Superusuario con acceso se degrada o se queda sin acceso, no queda nadie que
-- pueda asignar roles **nunca más**, y eso no se arregla desde la aplicación — hay que
-- entrar al panel de Supabase. Un clic no puede tener esa consecuencia.
--
-- Se cuentan los OTROS: la fila que se está tocando puede seguir siendo superusuaria
-- dentro de la transacción y contarse a sí misma.
create function public.tg_profiles_keeps_one_superuser()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'SUPERUSER' and old.active
     and (new.role is distinct from 'SUPERUSER' or not new.active) then
    if not exists (
      select 1 from public.profiles
      where id <> old.id and role = 'SUPERUSER' and active
    ) then
      raise exception 'No se puede dejar el catálogo sin ningún superusuario'
        using hint = 'Nombra antes a otro superusuario: si no queda ninguno, nadie podrá volver a asignar roles desde la aplicación.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_profiles_keeps_one_superuser is
  'Impide degradar o dejar sin acceso al último superusuario activo: sin ninguno, la asignación de roles solo se recupera desde el panel de Supabase.';

create trigger profiles_keeps_one_superuser
  before update on public.profiles
  for each row execute function public.tg_profiles_keeps_one_superuser();

revoke all on function public.tg_profiles_keeps_one_superuser() from public;

-- ── 3. La traza ─────────────────────────────────────────────
--
-- El registro de cambios del catálogo (20260805120000) dejó los perfiles fuera a
-- propósito, y su propio comentario decía por qué: exige `catalog_id`, tiene otra regla de
-- visibilidad y era «una decisión del propietario, no un efecto colateral de aquella
-- migración». Decidida: un cambio de rol o de acceso deja traza, en tabla propia.
--
-- Guarda el correo de la persona además de su identificador. Es la única redundancia y es
-- deliberada: si la cuenta se borrara desde el panel, la fila del perfil cae en cascada y
-- el registro se quedaría diciendo «alguien pasó a Catalogador» sin poder decir quién.
create table public.role_changes (
  id bigint generated always as identity primary key,

  -- Sin clave ajena a `profiles`, por lo mismo que el registro de cambios: borrar una
  -- cuenta desde el panel es un clic, y con clave ajena ese clic o falla o se resuelve
  -- borrando filas de auditoría, que es justo lo que esto existe para impedir.
  subject_id uuid not null,
  subject_email text not null,

  -- Quién lo hizo. Nulo cuando no hay sesión: una migración o un acceso administrativo
  -- directo. Nulo es la verdad, no un hueco.
  actor_id uuid,

  old_role public.user_role not null,
  new_role public.user_role not null,
  old_active boolean not null,
  new_active boolean not null,

  changed_at timestamptz not null default now(),

  -- Una fila que no cuenta ningún cambio es ruido en un registro que se lee entero.
  constraint role_changes_says_something
    check (old_role <> new_role or old_active <> new_active)
);

comment on table public.role_changes is
  'Quién podía hacer qué y desde cuándo: los cambios de rol y de acceso de cada cuenta (RF-1108). Solo se añade, la escribe un trigger y la lee solo el superusuario. Guarda el correo del sujeto porque la cuenta puede borrarse desde el panel y la traza tiene que seguir diciendo de quién habla.';

create index role_changes_subject_idx on public.role_changes (subject_id, changed_at desc);

create function public.tg_role_changes_writer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role or new.active is distinct from old.active then
    insert into public.role_changes (
      subject_id, subject_email, actor_id, old_role, new_role, old_active, new_active
    ) values (
      new.id, new.email, auth.uid(), old.role, new.role, old.active, new.active
    );
  end if;
  return new;
end $$;

comment on function public.tg_role_changes_writer is
  'Anota en role_changes cada cambio de rol o de acceso. «after» y no «before»: si la escritura se rechaza —el último superusuario, una política— no queda una línea de auditoría sobre algo que no pasó.';

-- AFTER, para que lo anotado sea lo que de verdad quedó escrito.
create trigger role_changes_writer
  after update on public.profiles
  for each row execute function public.tg_role_changes_writer();

revoke all on function public.tg_role_changes_writer() from public;

-- ── El perímetro de la traza ────────────────────────────────
--
-- Mismo criterio que el registro de cambios del catálogo, y por los mismos motivos.
alter table public.role_changes enable row level security;
revoke all on public.role_changes from anon, authenticated, service_role;

-- `select` y nada más. Ni insert, ni update, ni delete, ni truncate. Y la secuencia de la
-- identidad tampoco: con `generated always as identity` pertenece a la columna, y quien
-- pudiera moverla hacia atrás dejaría la tabla sin poder anotar.
grant select on public.role_changes to authenticated;
revoke all on sequence public.role_changes_id_seq from anon, authenticated, service_role;

-- Una sola política, de lectura, y solo para quien administra: esto no habla del
-- catálogo, habla de personas. No hay política de insert, update ni delete, y esa
-- ausencia es la negación (RF-111); el escritor no la necesita porque es `security
-- definer` y su propietario está exento de la RLS de esta tabla.
create policy role_changes_select on public.role_changes
  for select using (public.can_manage_users());

-- Los mismos candados que el registro de cambios: una auditoría a la que se le pueden
-- añadir líneas inventadas está tan rota como una a la que se le pueden quitar las
-- verdaderas. Estos triggers paran también al propietario de la tabla y a la clave de
-- servicio, que es la única vía que la RLS no cierra.
create function public.tg_role_changes_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'El registro de roles no se modifica ni se borra: es un registro de auditoría'
    using hint = 'Si un permiso está mal, corrígelo en la pantalla de usuarios; el registro anotará también esa corrección.';
end $$;

create trigger role_changes_append_only
  before update or delete on public.role_changes
  for each statement execute function public.tg_role_changes_append_only();

create trigger role_changes_no_truncate
  before truncate on public.role_changes
  for each statement execute function public.tg_role_changes_append_only();

create function public.tg_role_changes_insert_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Vale 1 en una inserción directa y 2 o más cuando la hace el escritor desde dentro del
  -- trigger de `profiles`. Es el mismo candado que el registro de cambios, y el motivo de
  -- que no sea un ajuste de sesión está explicado allí.
  if pg_trigger_depth() < 2 then
    raise exception 'En el registro de roles solo escribe el trigger de auditoría'
      using hint = 'Las filas las escribe la base al cambiar un rol o un acceso; no se insertan a mano.';
  end if;
  return new;
end $$;

create trigger role_changes_insert_guard
  before insert on public.role_changes
  for each row execute function public.tg_role_changes_insert_guard();

revoke all on function public.tg_role_changes_append_only() from public;
revoke all on function public.tg_role_changes_insert_guard() from public;

-- ── La medida del perímetro, aquí y ahora ───────────────────
--
-- Lo mismo que hizo la migración del cartel: se mide contra el esquema recién aplicado, de
-- modo que un error de esta migración se ve en el despliegue y no en la primera pantalla.
--
-- **Aquí solo cabe lo que no depende de los datos que ya haya.** Esto corre contra
-- producción, donde hay cuentas de verdad, y no contra una base vacía. El primer intento
-- de esta migración se cayó en el despliegue por olvidarlo: medía el candado del último
-- superusuario degradando al superusuario de mentira que acababa de crear, y en producción
-- eso está PERMITIDO y debe estarlo, porque queda el superusuario real. Falló la medida, no
-- la regla. Ese candado se prueba en `user_management.test.sql`, donde las únicas cuentas
-- que existen son las que el test crea.
do $$
declare
  v_id_super uuid := '00000000-0000-0000-0000-00000000ff01';
  v_id_cat   uuid := '00000000-0000-0000-0000-00000000ff02';
  v_n integer;
begin
  -- TODA la medida va dentro de un bloque que termina lanzando su propia excepción, y por
  -- eso se deshace entera: los candados de solo-añadir impiden —bien— que ni siquiera esta
  -- migración borre las líneas de auditoría que acaba de provocar, así que la única
  -- limpieza posible es no haber escrito nada. Es también lo que evita dejar dos cuentas
  -- inventadas en `auth.users` de producción.
  begin
    insert into auth.users (id, email) values
      (v_id_super, 'medida-super@local'), (v_id_cat, 'medida-cat@local');
    update public.profiles set role = 'SUPERUSER' where id = v_id_super;
    update public.profiles set role = 'CATALOGER' where id = v_id_cat;

    -- El Catalogador no cambia roles ni accesos.
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_id_cat, 'role', 'authenticated')::text, true);

    begin
      update public.profiles set role = 'SUPERUSER' where id = v_id_cat;
      raise exception 'MEDIDA: el catalogador ha podido nombrarse superusuario';
    exception when others then
      if position('RF-108' in sqlerrm) = 0 then raise; end if;
    end;

    -- Sobre la fila de OTRO no hay excepción, y conviene saberlo: la política filtra la
    -- fila antes de que el trigger llegue a opinar, así que la escritura no falla, no toca
    -- nada y contesta «cero filas». Es la misma sorpresa que el resto del proyecto ya se
    -- llevó con PostgREST, y es la razón de que la pantalla tenga que mirar lo que se
    -- escribió en vez de dar por bueno que no hubo error.
    update public.profiles set active = false where id = v_id_super;
    if not (select active from public.profiles where id = v_id_super) then
      raise exception 'MEDIDA: el catalogador ha podido quitar el acceso a otro';
    end if;

    -- Y sobre la suya propia sí hay excepción, porque ahí la política sí le deja llegar.
    begin
      update public.profiles set active = false where id = v_id_cat;
      raise exception 'MEDIDA: el catalogador ha podido quitarse el acceso a sí mismo';
    exception when others then
      if position('superusuario' in sqlerrm) = 0 then raise; end if;
    end;

    -- El Superusuario sí, y queda anotado.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_id_super, 'role', 'authenticated')::text, true);
    update public.profiles set role = 'READER' where id = v_id_cat;

    select count(*) into v_n from public.role_changes
      where subject_id = v_id_cat and old_role = 'CATALOGER' and new_role = 'READER'
        and actor_id = v_id_super;
    if v_n <> 1 then
      raise exception 'MEDIDA: el cambio de rol no ha dejado traza (%)', v_n;
    end if;

    -- Todo medido: se deshace lo hecho lanzando la señal de salida.
    raise exception 'MEDIDA_HECHA';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'MEDIDA_HECHA' then raise; end if;
  end;

  raise notice 'Medido: el perímetro de la gestión de usuarios responde como se espera.';
end $$;
