-- TEST fund (prefix TS-): trial records in production, with their own
-- numbering series so as not to dirty the real AR- and RC- series.
--
-- Only the ALTER TYPE, isolated on purpose: a new enum value cannot
-- be used in the same transaction that creates it, and `supabase db push` applies each
-- migration in one transaction. The rules that use the value go in the
-- next migration.
alter type fondo_artista add value 'TEST';
