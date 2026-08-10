-- Syncs the passwords of the internal roles of the supabase/postgres image
-- with POSTGRES_PASSWORD. Local stack only, once at initdb.
alter user supabase_auth_admin with password 'postgres';
alter user authenticator with password 'postgres';
alter user supabase_storage_admin with password 'postgres';
alter user supabase_admin with password 'postgres';
alter user postgres with password 'postgres';

create schema if not exists _realtime authorization supabase_admin;
