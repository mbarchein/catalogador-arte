-- ============================================================
-- Vistas en vivo (ADR-005): publicar los cambios de las tablas que la interfaz
-- observa por WebSocket.
--
-- La entrega respeta RLS: Realtime evalúa la política de SELECT de cada
-- suscriptor con su JWT antes de entregarle una fila. Un Lector no recibe por
-- el canal nada que no pudiera leer con una consulta — las fichas de baja, por
-- ejemplo, no le llegan.
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
  -- Solo las tablas que alguna vista observa. Publicar de más no es gratis:
  -- cada tabla publicada es trabajo de descodificación WAL por cada suscriptor.
  foreach t in array array['obras', 'imagenes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null; -- ya estaba en la publicación
    end;
  end loop;
end $$;

-- Realtime entrega el valor viejo de la fila en los UPDATE según la identidad
-- de réplica; FULL hace que el filtro por columna (p. ej. id_catalogacion=eq.X)
-- funcione también en los DELETE lógicos. Coste asumible a esta escala.
alter table public.obras replica identity full;
alter table public.imagenes replica identity full;
