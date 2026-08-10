-- The public schema stops being open to PUBLIC.
--
-- Third appearance of the same misunderstanding, and the last one left. The initial
-- migration wrote:
--
--   revoke usage on schema public from anon;
--
-- and it revoked nothing: the USAGE is granted by PUBLIC —`=U/pg_database_owner` in the
-- schema's ACL— and `anon` inherits it for being its member. Just as with the
-- functions, revoking from a role does not undo what is granted to PUBLIC.
--
-- Today it is harmless: `anon` has no privilege over any table or function, so
-- the open door leads nowhere. It is closed all the same, because the
-- initial migration's line says what the project wanted and it is worth it
-- being true as well: the next table somebody creates with one `grant` too many
-- finds the schema closed, not open.

revoke usage on schema public from public;

-- And to whoever does need it, explicitly.
--
-- `authenticated` and `service_role` already had it granted directly. The
-- one that was missing is `authenticator`: it is the role PostgREST connects with and
-- introspects the schema with before switching role on each request. Without this,
-- the whole API stops starting up — checked by restarting PostgREST against the
-- local stack.
grant usage on schema public to authenticator;

-- Deliberately NOT granted:
--
--   anon                    it is the point of the change.
--   supabase_auth_admin     it inserts into auth.users and fires tg_new_user, which
--                           writes the profile. It is SECURITY DEFINER and runs with
--                           its owner's privileges, so account
--                           registration goes on working without this permission.
--   supabase_storage_admin  storage-api runs the queries with the role of
--                           whoever calls, and the bucket's policies call
--                           public.can_edit() as `authenticated`.
--
-- The last two are verified locally, not assumed: by registering an
-- account through the administration API and uploading a file as a cataloguer.
