-- Reglas del fondo TEST. Continuación de la migración anterior: el valor del
-- enum ya está confirmado y aquí se le enseña al resto del esquema.

-- RF-202: el formato admite el prefijo del fondo de pruebas.
alter table public.obras drop constraint obras_id_formato;
alter table public.obras add constraint obras_id_formato
  check (id_catalogacion ~ '^(AR|RC|TS)-[0-9]{4}$');

-- El prefijo y el fondo siguen sin poder contradecirse.
alter table public.obras drop constraint obras_prefijo_coincide_con_artista;
alter table public.obras add constraint obras_prefijo_coincide_con_artista check (
  (artista = 'ROTILI' and id_catalogacion like 'AR-%')
  or (artista = 'RUIZ_CAMPINS' and id_catalogacion like 'RC-%')
  or (artista = 'TEST' and id_catalogacion like 'TS-%')
);

-- Las mismas funciones de DP-01, con el caso nuevo. El case pierde la rama por
-- defecto adrede: un fondo futuro sin prefijo declarado producirá un
-- identificador nulo y el insert fallará a la vista, en vez de colarse en la
-- serie RC- como hasta ahora.
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
  -- Respeta un identificador indicado explícitamente: permite recuperar la
  -- numeración de un inventario anterior o corregir una carga.
  if new.id_catalogacion is not null and new.id_catalogacion <> '' then
    return new;
  end if;

  -- Serializa la asignación por fondo. Sin este cerrojo, dos catalogadores
  -- dando de alta a la vez obtendrían el mismo número: exactamente el
  -- duplicado que el esquema anticipa como previsible. El cerrojo se libera al
  -- cerrar la transacción, que es la misma que ejecuta el insert.
  perform pg_advisory_xact_lock(hashtext('id_catalogacion:' || v_prefijo));

  -- Cuenta también las fichas dadas de baja: un identificador retirado no se
  -- recicla nunca de forma automática (RF-908). Reutilizarlo es un acto
  -- deliberado que pasa por restaurar la ficha desde la papelera.
  new.id_catalogacion := public.siguiente_id_catalogacion(new.artista);
  return new;
end $$;
