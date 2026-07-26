-- Sincroniza las contraseñas de los roles internos de la imagen
-- supabase/postgres con POSTGRES_PASSWORD. Solo stack local, una vez al initdb.
alter user supabase_auth_admin with password 'postgres';
alter user authenticator with password 'postgres';
alter user supabase_storage_admin with password 'postgres';
alter user supabase_admin with password 'postgres';
alter user postgres with password 'postgres';
