-- ============================================================
-- Live views (ADR-005): publishing the changes of the tables the interface
-- watches over WebSocket.
--
-- Delivery respects RLS: Realtime evaluates each subscriber's SELECT policy
-- with their JWT before delivering them a row. A Reader receives over
-- the channel nothing they could not read with a query — the withdrawn records, for
-- example, do not reach them.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  -- Only the tables some view watches. Publishing more than needed is not free:
  -- every published table is WAL decoding work for every subscriber.
  foreach t in array array['obras', 'imagenes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- ya estaba en la publicación
    end;
  end loop;
end $$;

-- Realtime delivers the row's old value on UPDATEs according to the replica
-- identity; FULL makes the per-column filter (e.g. id_catalogacion=eq.X)
-- work on logical DELETEs too. An acceptable cost at this scale.
alter table public.obras replica identity full;
alter table public.imagenes replica identity full;
