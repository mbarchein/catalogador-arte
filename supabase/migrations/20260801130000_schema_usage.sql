-- El esquema público deja de estar abierto a PUBLIC.
--
-- Tercera aparición del mismo malentendido, y la última que queda. La migración
-- inicial escribió:
--
--   revoke usage on schema public from anon;
--
-- y no revocaba nada: el USAGE lo concede PUBLIC —`=U/pg_database_owner` en la
-- ACL del esquema— y `anon` lo hereda por ser su miembro. Igual que con las
-- funciones, revocar de un rol no deshace lo concedido a PUBLIC.
--
-- Hoy es inocuo: `anon` no tiene privilegio sobre ninguna tabla ni función, así
-- que la puerta abierta no da a ninguna parte. Se cierra igualmente, porque la
-- línea de la migración inicial dice lo que quería el proyecto y conviene que
-- además sea verdad: la próxima tabla que alguien cree con un `grant` de más se
-- encuentra el esquema cerrado, no abierto.

revoke usage on schema public from public;

-- Y a quien sí lo necesita, explícito.
--
-- `authenticated` y `service_role` ya lo tenían concedido de forma directa. El
-- que faltaba es `authenticator`: es el rol con el que PostgREST se conecta e
-- introspecciona el esquema antes de cambiar de rol en cada petición. Sin esto,
-- la API entera deja de arrancar — comprobado reiniciando PostgREST contra el
-- stack local.
grant usage on schema public to authenticator;

-- Deliberadamente NO se conceden:
--
--   anon                    es el objetivo del cambio.
--   supabase_auth_admin     inserta en auth.users y dispara tg_new_user, que
--                           escribe el perfil. Es SECURITY DEFINER y corre con
--                           los privilegios de su dueño, así que el alta de
--                           cuentas sigue funcionando sin este permiso.
--   supabase_storage_admin  storage-api ejecuta las consultas con el rol de
--                           quien llama, y las políticas del bucket llaman a
--                           public.can_edit() como `authenticated`.
--
-- Las dos últimas están verificadas en local, no supuestas: dando de alta una
-- cuenta por la API de administración y subiendo un fichero como catalogador.
