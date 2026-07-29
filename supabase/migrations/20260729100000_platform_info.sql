-- ============================================================
-- What the platform is running, for the diagnostics block of Mi perfil.
--
-- The client can tell its own version (it is compiled into the bundle) but not
-- the database's, and «what schema does production have» is the first question
-- when something behaves differently there than in local. This answers it
-- without opening the Supabase dashboard.
--
-- SECURITY DEFINER only to reach supabase_migrations, which is not exposed to
-- the API; the explicit can_read() keeps it to the team, and what it returns —
-- a version string and a migration name — is diagnostics, not catalog data.
-- ============================================================

create function public.platform_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_schema text;
  v_count integer;
begin
  if not public.can_read() then
    raise exception 'No tienes permiso para consultar la información de la plataforma';
  end if;

  -- Two bookkeepings for the same thing: the Supabase CLI writes its own in
  -- supabase_migrations (production), docker/migrate.sh keeps public._migraciones
  -- (the local stack). Whichever exists is read, so the block says the truth in
  -- both environments.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version), count(*) from supabase_migrations.schema_migrations'
      into v_schema, v_count;
  elsif to_regclass('public._migraciones') is not null then
    execute 'select max(nombre), count(*) from public._migraciones'
      into v_schema, v_count;
  end if;

  return jsonb_build_object(
    -- Just the number: version() adds the compiler and the platform, which
    -- says nothing to whoever reads the record on a phone.
    'postgres', split_part(version(), ' ', 2),
    'schema_version', v_schema,
    'migrations', coalesce(v_count, 0)
  );
end $$;

comment on function public.platform_info is
  'Postgres version and applied schema, for the diagnostics block of the profile.';

revoke all on function public.platform_info() from public, anon;
grant execute on function public.platform_info() to authenticated;
