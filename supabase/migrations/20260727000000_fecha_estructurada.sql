-- ============================================================
-- Structured execution date (ADR-004, revises RF-207).
--
-- `fecha_ejecucion` was free text and therefore useless for searching: «artwork
-- from the seventies» cannot be asked against "c. 1975-1978". It is replaced by
-- four structured columns plus a note, and the publishable text becomes
-- a GENERATED COLUMN: it composes itself, it cannot get out of step with the data
-- and it goes on being what the record, the listing and the future printed catalogue read.
--
--   anio_inicio / anio_fin      the year, or the range if anio_fin is not null
--   fecha_aproximada            «c.» — the artwork is from around that year
--   fecha_sin_confirmar         «[?]» — it is unknown; the year is an estimate
--   fecha_nota                  free text for what the structure does not say
--                               («finales de los setenta»); if it exists, it is what
--                               is published, and the years go on serving
--                               for searching
--
-- `fecha_orden` disappears: it was the workaround for sorting free text, and
-- anio_inicio does its job while also being a real datum.
-- ============================================================

alter table public.obras
  add column anio_inicio smallint,
  add column anio_fin smallint,
  add column fecha_aproximada boolean not null default false,
  add column fecha_sin_confirmar boolean not null default false,
  add column fecha_nota text not null default '';

comment on column public.obras.fecha_nota is
  'Redacción libre de la fecha cuando la estructura no alcanza («finales de los setenta»). Si no está vacía, es lo que se publica; los años estructurados siguen alimentando la búsqueda.';

-- ── Fill from the existing text ─────────────────────────────
-- The schema's four formats (and the [?] suffix) are parsed; any other
-- text is kept WHOLE in fecha_nota. Nothing is lost and nothing is
-- reinterpreted: a nuance written by hand is worth more than a guessed structure.
with analizada as (
  select
    id_catalogacion,
    trim(fecha_ejecucion) as texto,
    regexp_match(
      trim(fecha_ejecucion),
      '^(c\.|ca\.)?\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?\s*(\[\?\])?$'
    ) as m
  from public.obras
),
valorada as (
  select *,
    -- An inverted or degenerate range («1978-1975») is not a different format:
    -- it is a capture error, and it goes to the note so that somebody fixes it seeing
    -- the original.
    (m is not null and (m[3] is null or m[3]::int > m[2]::int)) as valida
  from analizada
)
update public.obras o
set
  anio_inicio         = case when v.valida then v.m[2]::smallint end,
  anio_fin            = case when v.valida then v.m[3]::smallint end,
  fecha_aproximada    = v.valida and v.m[1] is not null,
  fecha_sin_confirmar = v.valida and v.m[4] is not null,
  fecha_nota          = case when not v.valida and v.texto <> '' then v.texto else '' end
from valorada v
where v.id_catalogacion = o.id_catalogacion;

-- ── The text becomes a generated column ─────────────────────
alter table public.obras drop column fecha_ejecucion;

alter table public.obras add column fecha_ejecucion text
  generated always as (
    case
      when fecha_nota <> '' then fecha_nota
      when anio_inicio is null then ''
      else (case when fecha_aproximada then 'c. ' else '' end)
           || anio_inicio::text
           || coalesce('-' || anio_fin::text, '')
           || (case when fecha_sin_confirmar then ' [?]' else '' end)
    end
  ) stored;

comment on column public.obras.fecha_ejecucion is
  'Generada: se compone de los campos estructurados (o de fecha_nota si existe). No se escribe nunca directamente.';

-- ── Rules the interface cannot guarantee ────────────────────
alter table public.obras
  -- A year outside a plausible range is a typo, not a date.
  add constraint obras_anios_plausibles check (
    (anio_inicio is null or anio_inicio between 1000 and 2100)
    and (anio_fin is null or anio_fin between 1000 and 2100)
  ),
  -- A range needs a start, and it ends after it begins.
  add constraint obras_rango_coherente check (
    anio_fin is null or (anio_inicio is not null and anio_fin > anio_inicio)
  ),
  -- The flags speak about a year: with no year there is nothing to approximate nor to
  -- cast doubt on («[?]» on its own says nothing).
  add constraint obras_banderas_requieren_anio check (
    anio_inicio is not null or (not fecha_aproximada and not fecha_sin_confirmar)
  );

-- ── fecha_orden desaparece ──────────────────────────────────
drop index if exists public.obras_orden_idx;
drop index if exists public.obras_activas_idx;
alter table public.obras drop column fecha_orden;

create index obras_activas_idx on public.obras (activo, artista, anio_inicio);
-- The period query («obra de los setenta») is the reason for all this.
create index obras_anio_idx on public.obras (anio_inicio) where activo;
