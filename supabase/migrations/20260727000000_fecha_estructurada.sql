-- ============================================================
-- Fecha de ejecución estructurada (ADR-004, revisa RF-207).
--
-- `fecha_ejecucion` era texto libre y por tanto inservible para buscar: «obra
-- de los setenta» no se puede preguntar contra "c. 1975-1978". Se sustituye por
-- cuatro columnas estructuradas más una nota, y el texto publicable pasa a ser
-- una COLUMNA GENERADA: se compone solo, no puede desincoronizarse de los datos
-- y sigue siendo lo que leen la ficha, el listado y el futuro catálogo impreso.
--
--   anio_inicio / anio_fin      el año, o el rango si anio_fin no es nulo
--   fecha_aproximada            «c.» — la obra es de alrededor de ese año
--   fecha_sin_confirmar         «[?]» — se desconoce; el año es una estimación
--   fecha_nota                  texto libre para lo que la estructura no dice
--                               («finales de los setenta»); si existe, es lo
--                               que se publica, y los años siguen sirviendo
--                               para buscar
--
-- `fecha_orden` desaparece: era el apaño para ordenar texto libre, y
-- anio_inicio hace su trabajo siendo además un dato de verdad.
-- ============================================================

alter table public.obras
  add column anio_inicio smallint,
  add column anio_fin smallint,
  add column fecha_aproximada boolean not null default false,
  add column fecha_sin_confirmar boolean not null default false,
  add column fecha_nota text not null default '';

comment on column public.obras.fecha_nota is
  'Redacción libre de la fecha cuando la estructura no alcanza («finales de los setenta»). Si no está vacía, es lo que se publica; los años estructurados siguen alimentando la búsqueda.';

-- ── Relleno desde el texto existente ────────────────────────
-- Los cuatro formatos del esquema (y el sufijo [?]) se analizan; cualquier otro
-- texto se conserva ÍNTEGRO en fecha_nota. No se pierde ni se reinterpreta
-- nada: un matiz escrito a mano vale más que una estructura adivinada.
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
    -- Un rango invertido o degenerado («1978-1975») no es un formato distinto:
    -- es un error de captura, y va a la nota para que alguien lo arregle viendo
    -- el original.
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

-- ── El texto pasa a ser columna generada ────────────────────
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

-- ── Reglas que la interfaz no puede garantizar ──────────────
alter table public.obras
  -- Un año fuera de rango plausible es una errata, no una fecha.
  add constraint obras_anios_plausibles check (
    (anio_inicio is null or anio_inicio between 1000 and 2100)
    and (anio_fin is null or anio_fin between 1000 and 2100)
  ),
  -- Un rango necesita inicio, y acaba después de empezar.
  add constraint obras_rango_coherente check (
    anio_fin is null or (anio_inicio is not null and anio_fin > anio_inicio)
  ),
  -- Las banderas hablan de un año: sin año no hay nada que aproximar ni que
  -- poner en duda («[?]» a secas no dice nada).
  add constraint obras_banderas_requieren_anio check (
    anio_inicio is not null or (not fecha_aproximada and not fecha_sin_confirmar)
  );

-- ── fecha_orden desaparece ──────────────────────────────────
drop index if exists public.obras_orden_idx;
drop index if exists public.obras_activas_idx;
alter table public.obras drop column fecha_orden;

create index obras_activas_idx on public.obras (activo, artista, anio_inicio);
-- La consulta de época («obra de los setenta») es el motivo de todo esto.
create index obras_anio_idx on public.obras (anio_inicio) where activo;
