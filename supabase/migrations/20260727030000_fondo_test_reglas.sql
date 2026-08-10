-- Rules of the TEST fund. Continuation of the previous migration: the enum's value
-- is already committed and here it is taught to the rest of the schema.

-- RF-202: the format admits the test fund's prefix.
alter table public.obras drop constraint obras_id_formato;
alter table public.obras add constraint obras_id_formato
  check (id_catalogacion ~ '^(AR|RC|TS)-[0-9]{4}$');

-- The prefix and the fund still cannot contradict each other.
alter table public.obras drop constraint obras_prefijo_coincide_con_artista;
alter table public.obras add constraint obras_prefijo_coincide_con_artista check (
  (artista = 'ROTILI' and id_catalogacion like 'AR-%')
  or (artista = 'RUIZ_CAMPINS' and id_catalogacion like 'RC-%')
  or (artista = 'TEST' and id_catalogacion like 'TS-%')
);

-- The same DP-01 functions, with the new case. The case loses its default
-- branch on purpose: a future fund with no declared prefix will produce a
-- null identifier and the insert will fail in plain sight, instead of slipping into the
-- RC- series as it did until now.
create or replace function public.siguiente_id_catalogacion(p_artista fondo_artista)
returns text language sql stable security definer set search_path = public as $$
  select
    case p_artista
      when 'ROTILI' then 'AR'
      when 'RUIZ_CAMPINS' then 'RC'
      when 'TEST' then 'TS'
    end
    || '-'
    || lpad((
      coalesce(max(substring(id_catalogacion from 4)::integer), 0) + 1
    )::text, 4, '0')
  from public.obras
  where id_catalogacion like
    (case p_artista
      when 'ROTILI' then 'AR'
      when 'RUIZ_CAMPINS' then 'RC'
      when 'TEST' then 'TS'
    end) || '-%';
$$;

create or replace function public.tg_asignar_id_catalogacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefijo text := case new.artista
    when 'ROTILI' then 'AR'
    when 'RUIZ_CAMPINS' then 'RC'
    when 'TEST' then 'TS'
  end;
begin
  -- It respects an explicitly given identifier: it allows recovering the
  -- numbering of an earlier inventory or correcting a load.
  if new.id_catalogacion is not null and new.id_catalogacion <> '' then
    return new;
  end if;

  -- It serialises the assignment per fund. Without this lock, two cataloguers
  -- creating records at once would get the same number: exactly the
  -- duplicate the schema anticipates as foreseeable. The lock is released on
  -- closing the transaction, which is the same one that runs the insert.
  perform pg_advisory_xact_lock(hashtext('id_catalogacion:' || v_prefijo));

  -- It also counts the withdrawn records: a withdrawn identifier is never
  -- recycled automatically (RF-908). Reusing it is a deliberate act
  -- that goes through restoring the record from the wastebasket.
  new.id_catalogacion := public.siguiente_id_catalogacion(new.artista);
  return new;
end $$;
