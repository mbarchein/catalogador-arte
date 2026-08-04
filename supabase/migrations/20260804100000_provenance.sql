-- ============================================================
-- La procedencia deja de ser un campo y pasa a ser una cadena de eventos
-- fechados (RF-509, RF-510, RF-511, RF-218).
--
-- El esquema de campos v11 fusionó en v4 `propietario_actual` y
-- `procedencia_historial` en un `procedencia` narrativo, y en v10 le colgó al
-- lado `propietarios_documentados` como «versión estructurada y filtrable» que
-- explícitamente «no registra fechas de adquisición ni orden cronológico». Eso
-- deja el dato con DOS representaciones y NINGUNA completa: el relato no se
-- puede consultar y la relación múltiple no sabe el orden ni las fechas, que es
-- justo lo que una cadena de procedencia es.
--
-- Aquí se invierte la jerarquía. La cadena de eventos es el REGISTRO —con su
-- orden, en qué calidad se tuvo la obra, cómo se adquirió y entre qué años— y el
-- relato narrativo es la REDACCIÓN publicable (RF-510). Es exactamente la regla
-- que ADR-004 ya aplica con `date_note` sobre `execution_date`: la estructura
-- alimenta la búsqueda y la prosa manda al imprimir, porque la prosa de un
-- catálogo razonado no se puede generar. Y `propietarios_documentados`
-- desaparece antes de llegar a existir: el `join` por `party_id` contesta a «¿qué
-- obras están vinculadas a esta institución?», que era lo único que lo
-- justificaba.
--
-- Tampoco se crea `estatus_legal`. v11 lo define como Selección (Donación /
-- Cesión / Depósito / Propiedad familia / Desconocido) y esa lista mezcla dos
-- preguntas distintas: en qué calidad se tiene la obra y cómo llegó. Con la
-- cadena, la primera es `capacity` del último eslabón y la segunda es
-- `acquisition`; un campo suelto que puede contradecir a la cadena que tiene al
-- lado sobra.
--
-- Esta migración crea la tabla de eventos y sus reglas, añade a la obra las
-- columnas de procedencia, cierra la comprobación que la migración de `parties`
-- dejó pendiente —una parte que sostiene una cadena no se retira— y traslada al
-- modelo nuevo los cuatro nodos del árbol de lugares que hoy son propiedad
-- disfrazada de sitio.
--
-- Las POLÍTICAS RLS de `provenance_events` van en la migración siguiente. Lo que
-- SÍ se hace aquí es activar RLS y revocar los privilegios, porque una tabla que
-- existe un solo despliegue sin RLS es una tabla publicada. Con RLS activado y
-- sin ninguna política, la tabla está cerrada para todo el mundo salvo el acceso
-- administrativo directo, que es el estado seguro para esperar.
-- ============================================================


-- ── Tres enumerados, y por qué no son tablas maestras ───────
--
-- El criterio del esquema es si el CÓDIGO mira el valor. `artwork_types` es
-- maestra porque el código nunca lo mira: lo renderiza. De estos tres depende
-- quién es el poseedor actual, cómo se redacta la línea publicable y si un
-- bloque documental está investigado, así que mirarlos es justo lo que hay que
-- hacer.

-- En qué calidad se tuvo la obra. Es la mitad de `estatus_legal` de v11, la que
-- responde «¿como qué la tenía?».
create type public.provenance_capacity as enum (
  'OWNER',       -- Propietario
  'DEPOSIT',     -- En depósito
  'LOAN',        -- En préstamo
  'UNKNOWN',     -- Investigado y no consta
  'UNREVIEWED'   -- Sin revisar (RF-205), que no es lo mismo
);

comment on type public.provenance_capacity is
  'En qué calidad tuvo la obra un eslabón de la cadena. «Desconocido» es investigado sin resultado; «Sin revisar» es pendiente (RF-205).';

-- Cómo llegó a sus manos. Es la otra mitad de `estatus_legal`, y son dos hechos
-- distintos: «Depósito» dice en qué calidad y «Donación» dice cómo llegó. Una
-- obra puede estar en depósito habiendo llegado por donación, y con un solo
-- campo había que elegir cuál de las dos verdades se guardaba.
create type public.provenance_acquisition as enum (
  'PURCHASE',    -- Compra
  'GIFT',        -- Donación
  'INHERITANCE', -- Herencia
  'COMMISSION',  -- Encargo
  'EXCHANGE',    -- Permuta
  'UNKNOWN',     -- Investigado y no consta
  'UNREVIEWED'   -- Sin revisar
);

comment on type public.provenance_acquisition is
  'Cómo llegó la obra a ese eslabón. Separado de la calidad de tenencia a propósito: una obra en depósito puede haber llegado por donación.';

-- El estado de investigación de un bloque documental de la ficha. Lo crea este
-- grupo y lo reutilizan bibliografía, exposiciones y documentación: es la misma
-- pregunta cuatro veces, y cuatro enumerados iguales divergirían.
create type public.research_status as enum (
  'UNREVIEWED',   -- Sin revisar: nadie ha mirado todavía
  'IN_PROGRESS',  -- En curso
  'NONE_FOUND',   -- Investigado y no hay nada que registrar
  'COMPLETE'      -- Investigado y registrado
);

comment on type public.research_status is
  'Estado de investigación de un bloque documental de la obra (RF-218). Distingue el bloque pendiente del investigado sin resultado: una obra sin exposiciones registradas no es una obra que no se expuso.';


-- ── La cadena ───────────────────────────────────────────────

create table public.provenance_events (
  -- Clave sustituta (ADR-007). No hay ninguna etiqueta pegada a un eslabón, y
  -- reordenar la cadena no puede ser renumerar identificadores.
  id uuid primary key default gen_random_uuid(),

  -- Misma forma que `images`: `on update cascade` porque el identificador de
  -- catalogación es texto y, aunque RF-204 lo declare inmutable, la cascada
  -- cuesta cero y evita que una corrección administrativa deje eslabones
  -- huérfanos. Sin `on delete`: de `artworks` no se borra nada (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  -- El orden de la cadena, 1..n. Es MANUAL y no derivado de las fechas: la mitad
  -- de los eslabones de un catálogo razonado no tienen año conocido, y un orden
  -- derivado de nulos no es un orden. Lo asigna el trigger al insertar y lo
  -- rehace `reorder_provenance_events`, como en las fotografías (RF-401).
  position integer not null,

  -- NULO A PROPÓSITO. «Colección privada, España» y «colección desconocida» son
  -- eslabones legítimos sin ficha detrás —el propio v11 los fija como convención
  -- de redacción—, y obligar a crear una parte fantasma para cada uno ensuciaría
  -- la maestra con filas sin contacto, sin país y sin nada que consultar.
  -- `restrict` es coherente con que nadie tenga DELETE sobre `parties`: si
  -- alguna vez se borrara una a mano, esto avisa en vez de romper la cadena.
  party_id uuid references public.parties (id) on delete restrict,

  -- Cómo consta el eslabón cuando no tiene ficha, o la precisión que la ficha no
  -- da («propiedad de la tía de X» dentro de una colección familiar).
  party_note text not null default '',

  capacity public.provenance_capacity not null default 'UNREVIEWED',
  acquisition public.provenance_acquisition not null default 'UNREVIEWED',

  -- ── La fecha, con la forma estructurada de ADR-004 ────────
  -- Se repiten cinco columnas a cambio de heredar el analizador de fechas del
  -- frontend, la columna generada y los tests ya escritos. Es un buen cambio: la
  -- alternativa era un texto libre por el que no se puede preguntar.
  start_year smallint,
  end_year smallint,
  approximate_date boolean not null default false,
  unconfirmed_date boolean not null default false,
  date_note text not null default '',
  date_text text generated always as (
    case
      when date_note <> '' then date_note
      when start_year is null then ''
      else (case when approximate_date then 'c. ' else '' end)
           || start_year::text
           || coalesce('-' || end_year::text, '')
           || (case when unconfirmed_date then ' [?]' else '' end)
    end
  ) stored,

  -- La fuente del dato y el `[?]` de RF-214: «según catálogo de la exposición de
  -- 1985», «dato facilitado por la familia, sin documentar».
  note text not null default '',

  -- RF-804: trazabilidad completa, sellada por `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, que revisa RF-903: un eslabón se retira, no se borra. La premisa de
  -- RF-903 —que una fila puente no tiene nada citable y basta con rehacerla— no
  -- se sostiene aquí: el eslabón lleva años, calidad de tenencia y la fuente del
  -- dato, es trabajo de investigación, y quién lo retiró es traza que interesa.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- Un eslabón tiene que decir de quién habla, con ficha o sin ella. Uno sin
  -- ninguna de las dos cosas es un hueco en la cadena que además ocupa una
  -- posición, y una cadena con un hueco es un documento falseado. La salida es
  -- barata: `party_note` es texto libre y «colección desconocida» vale.
  constraint provenance_events_link_has_an_end
    check (party_id is not null or btrim(party_note) <> ''),

  -- El orden empieza en 1, como el de las fotografías.
  constraint provenance_events_position_positive check (position >= 1),

  -- Un año fuera de rango plausible es una errata, no una fecha (ADR-004).
  constraint provenance_events_plausible_years check (
    (start_year is null or start_year between 1000 and 2100)
    and (end_year is null or end_year between 1000 and 2100)
  ),

  -- LA ÚNICA DIFERENCIA con `artworks_coherent_range`, y es deliberada: allí el
  -- rango exige `end_year > start_year` porque «1985-1985» no es un rango de
  -- ejecución sino un año suelto mal escrito, y se escribe con `start_year` a
  -- secas. Aquí es `>=` porque una obra comprada y vendida en 1985 es una
  -- tenencia real y sus dos extremos son datos distintos.
  constraint provenance_events_coherent_range check (
    end_year is null or (start_year is not null and end_year >= start_year)
  ),

  -- Las banderas hablan de un año: sin año no hay nada que aproximar ni que
  -- poner en duda («[?]» a secas no dice nada).
  constraint provenance_events_flags_require_year check (
    start_year is not null or (not approximate_date and not unconfirmed_date)
  )
);

comment on table public.provenance_events is
  'Cadena de procedencia de una obra, un eslabón por fila (RF-509). El orden lo fija la catalogadora y no las fechas. Nada se borra: un eslabón se retira (RF-517).';

comment on column public.provenance_events.position is
  'Orden del eslabón dentro de la cadena, 1..n. Manual: la mitad de los eslabones no tienen año conocido y un orden derivado de nulos no es un orden.';
comment on column public.provenance_events.party_id is
  'Ficha de la persona o institución. Nulo es legítimo: «Colección privada, España» es un eslabón sin ficha detrás.';
comment on column public.provenance_events.date_text is
  'Generada: se compone de los campos estructurados (o de date_note si existe). No se escribe nunca directamente (ADR-004).';

-- El orden de la cadena de una obra, que es como se lee siempre.
create index provenance_events_artwork_idx
  on public.provenance_events (catalog_id, position);

-- «¿Qué obras han pasado por esta institución?». Era la única razón de ser del
-- `propietarios_documentados` de v11 v10, y aquí es un índice.
create index provenance_events_party_idx
  on public.provenance_events (party_id);


-- ── El orden se asigna solo, y se rehace a mano ─────────────

-- Un eslabón nuevo va AL FINAL, nunca en medio de un orden que alguien colocó.
-- SECURITY DEFINER como `tg_assign_image_sort_order` y por lo mismo: el máximo
-- se calcula sobre TODA la cadena, incluidos los eslabones que la política de
-- lectura pudiera ocultar a quien inserta. Un máximo calculado sobre media tabla
-- devolvería una posición repetida.
create function public.tg_assign_provenance_position()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.position is null then
    select coalesce(max(e.position), 0) + 1
      into new.position
      from provenance_events e
     where e.catalog_id = new.catalog_id;
  end if;
  return new;
end $$;

comment on function public.tg_assign_provenance_position is
  'Coloca el eslabón nuevo al final de la cadena de su obra (RF-509).';

create trigger assign_provenance_position
  before insert on public.provenance_events
  for each row execute function public.tg_assign_provenance_position();

-- Reordenar, todo o nada. Calcado de `reorder_images`, que ya tiene sus tests, y
-- sin SECURITY DEFINER por lo mismo: las políticas siguen en vigor, así que un
-- Lector no escribe aquí; la comprobación explícita solo convierte el silencioso
-- «no ha cambiado nada» en un error legible, y en español porque lo lee ella.
create function public.reorder_provenance_events(p_catalog_id text, p_event_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_active integer;
  v_given integer := coalesce(array_length(p_event_ids, 1), 0);
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para reordenar la procedencia';
  end if;

  -- Un identificador repetido pasaría el recuento de más abajo y dejaría dos
  -- eslabones peleándose por una posición, así que se rechaza primero.
  if v_given <> (select count(distinct t.id) from unnest(p_event_ids) as t(id)) then
    raise exception 'La lista de eslabones tiene identificadores repetidos';
  end if;

  -- La lista tiene que ser EXACTAMENTE los eslabones activos de la obra. Un
  -- cliente desfasado —alguien añadió o retiró un eslabón mientras tanto— dejaría
  -- si no la cadena a medio ordenar, y media cadena ordenada es peor que un
  -- rechazo: se lee como un orden y no lo es.
  select count(*) into v_active
    from provenance_events e
   where e.catalog_id = p_catalog_id and e.active;

  if v_active <> v_given then
    raise exception 'La lista de eslabones no coincide con la de la obra %', p_catalog_id;
  end if;

  if exists (
    select 1 from unnest(p_event_ids) as t(id)
    where not exists (
      select 1 from provenance_events e
       where e.id = t.id and e.catalog_id = p_catalog_id and e.active
    )
  ) then
    raise exception 'Algún eslabón no pertenece a la obra %', p_catalog_id;
  end if;

  update provenance_events e
     set position = p.new_position
    from (
      select t.id, t.ordinality::integer as new_position
        from unnest(p_event_ids) with ordinality as t(id, ordinality)
    ) p
   where e.id = p.id
     and e.position is distinct from p.new_position;
end $$;

comment on function public.reorder_provenance_events is
  'Rehace el orden de la cadena de procedencia de una obra, todo o nada (RF-509).';


-- ── Autoría y papelera ──────────────────────────────────────
-- La función genérica de RF-804, creada con `parties`. La tabla tiene las cuatro
-- columnas de la papelera completa, así que restaurar conserva la traza de la
-- baja anterior (RF-902).

create trigger provenance_event_row_audit
  before insert or update on public.provenance_events
  for each row execute function public.tg_row_audit();


-- ── Lo que la obra gana ─────────────────────────────────────

alter table public.artworks
  -- RF-510: el relato publicable. Cuando tiene texto, es lo que la ficha imprime;
  -- cuando está vacío, la ficha compone la línea a partir de los eslabones. La
  -- regla vive en la interfaz; lo que la base garantiza es que las dos
  -- representaciones existen y ninguna pisa a la otra.
  add column provenance text not null default '',

  -- El `nota_procedencia` de v11 v5: de dónde sale la información y qué
  -- fiabilidad tiene. Separado del relato a propósito, porque no se publica.
  add column provenance_note text not null default '',

  -- RF-511: el titular de los derechos es una RELACIÓN y no el «Texto/Relación»
  -- ambiguo de v11, y puede no coincidir con quien posee la obra (obra en
  -- depósito en una institución, derechos reservados a la familia).
  add column rights_holder_party_id uuid references public.parties (id) on delete restrict,
  add column rights_holder_note text not null default '',

  -- RF-218. La columna que hacía falta y que v11 no tiene en absoluto.
  add column provenance_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.provenance is
  'Relato narrativo publicable de la procedencia (RF-510). Si tiene texto, es lo que se imprime; si está vacío, la ficha compone la línea con los eslabones.';
comment on column public.artworks.provenance_note is
  'Fuente y fiabilidad del dato de procedencia. No se publica.';
comment on column public.artworks.rights_holder_party_id is
  'Titular de los derechos de reproducción (RF-511). Puede no ser quien posee la obra.';
comment on column public.artworks.provenance_status is
  'Estado de investigación de la procedencia (RF-218). «Sin revisar» no es «no hay».';

create index artworks_rights_holder_idx on public.artworks (rights_holder_party_id);


-- ── «Sin revisar» no es «no» (RF-218) ───────────────────────
--
-- Sin esta regla la columna puede mentir, y una columna que puede mentir sobre
-- si algo se investigó es peor que no tenerla: la ficha diría «investigado sin
-- resultado» debajo de una lista de eslabones.
--
-- Se comprueba por las DOS puertas, porque una sola no cierra la invariante: ni
-- se declara «investigado sin resultado» en una obra con eslabones activos, ni se
-- añade o restaura un eslabón en una obra declarada así. La segunda cuesta un
-- update más a la usuaria y es la que hace que el aserto se sostenga.
--
-- Lo que SÍ se permite, y es intencionado: eslabones con el estado en «Sin
-- revisar». Tener un dato no es haber hecho la investigación —los ocho eslabones
-- que traslada esta misma migración son exactamente ese caso—, así que la regla
-- es de un solo sentido.
--
-- Los grupos de bibliografía, exposiciones y documentación REEMPLAZAN esta
-- función con `create or replace` para añadir su bloque. El trigger se declara a
-- propósito sin lista de columnas para que no haya que recrearlo cada vez: la
-- comprobación solo hace trabajo cuando el estado cambia a «investigado sin
-- resultado».
--
-- Los `if` van anidados y no en una sola condición por un detalle de plpgsql que
-- muerde: en un trigger de INSERT el registro `old` no está asignado, y una
-- expresión que lo nombre falla aunque el `and` de la izquierda ya sea falso
-- —la expresión entera se prepara como una consulta con parámetros antes de
-- evaluarse—. Se comprueba `tg_op` en su propio `if`.
--
-- Y la comprobación se salta cuando el estado no cambia, que es lo que evita que
-- una fila que ya estuviera en un estado imposible bloqueara cualquier edición
-- de la obra en vez de dejar arreglarla.
create function public.tg_artwork_research_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.provenance_status <> 'NONE_FOUND' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.provenance_status = new.provenance_status then
      return new;
    end if;
  end if;

  if exists (select 1 from public.provenance_events
              where catalog_id = new.catalog_id and active) then
    raise exception 'No se puede dar la procedencia por investigada sin resultado: la obra % ya tiene eslabones registrados', new.catalog_id
      using hint = 'Retira antes los eslabones, o marca la procedencia como «En curso» o «Completa».';
  end if;

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218).';

create trigger artwork_research_status_coherent
  before insert or update on public.artworks
  for each row execute function public.tg_artwork_research_status_coherent();

create function public.tg_provenance_event_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select provenance_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'La procedencia de la obra % consta investigada sin resultado y este eslabón la contradice', new.catalog_id
      using hint = 'Cambia antes el estado de la procedencia a «En curso» o «Completa».';
  end if;
  return new;
end $$;

comment on function public.tg_provenance_event_status_coherent is
  'La otra puerta de RF-218: no se añade ni se restaura un eslabón en una obra cuya procedencia consta investigada sin resultado.';

create trigger provenance_event_status_coherent
  before insert or update on public.provenance_events
  for each row execute function public.tg_provenance_event_status_coherent();


-- ── Una parte que sostiene una cadena no se retira ──────────
--
-- La comprobación que la migración de `parties` no podía escribir todavía: hasta
-- ahora no había nada que comprobar. Es la misma regla que
-- `tg_series_deactivation` y `tg_physical_place_deactivation`, y aquí el motivo
-- es más fuerte que en aquellas: una cadena de procedencia con un hueco no es un
-- dato incompleto, es un documento falseado.
--
-- Esto REVISA RF-905 en lo que toca a los propietarios. RF-905 dice que un
-- propietario dado de baja «deja el campo vacío en las obras que lo tenían
-- asignado»; aplicado a la procedencia, eso sería borrar un eslabón documentado
-- por la vía indirecta. En su lugar rige la regla de las demás maestras: primero
-- se saca la parte de donde esté, y entonces se retira.
--
-- Una obra en la papelera NO cuenta, como en los lugares: está de baja lógica,
-- sus eslabones ya no se muestran (RF-905 hacia abajo), y exigir vaciar la
-- papelera antes de retirar una parte sería hacer que la papelera estorbe.
--
-- Las sedes de exposición añadirán su comprobación aquí con `create or replace`
-- cuando existan.
create function public.tg_party_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (
      select 1
        from public.provenance_events e
        join public.artworks a on a.catalog_id = e.catalog_id
       where e.party_id = new.id and e.active and a.active
    ) then
      raise exception 'No se puede retirar una parte que sostiene un eslabón de procedencia'
        using hint = 'Quita antes esa parte de las cadenas de procedencia donde aparece.';
    end if;

    if exists (
      select 1 from public.artworks
       where rights_holder_party_id = new.id and active
    ) then
      raise exception 'No se puede retirar una parte que es titular de derechos de una obra'
        using hint = 'Cambia antes el titular de derechos de esas obras.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_party_deactivation is
  'Impide retirar una persona o institución que aparece en una cadena de procedencia activa o que es titular de derechos (RF-511, revisa RF-905).';

create trigger party_deactivation
  before update of active on public.parties
  for each row execute function public.tg_party_deactivation();


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Se revoca primero y se concede después, uno a uno: la plataforma concede por
-- omisión todos los privilegios de cada tabla nueva a los roles anónimo y
-- autenticado, incluido `delete` (RF-113).
--
-- Sin DELETE: ni privilegio ni política, nunca (RF-901, RF-517). Retirar un
-- eslabón es un update de `active`.
--
-- Las políticas van en la migración siguiente. Hasta que existan, esta tabla no
-- la lee ni la escribe nadie con sesión: RLS activado sin política niega.

alter table public.provenance_events enable row level security;

revoke all on public.provenance_events from anon, authenticated;

grant select, insert, update on public.provenance_events to authenticated;

-- Explícito, como en 20260801140000 y 20260804090000: en esta plataforma una
-- función nueva nace con EXECUTE para PUBLIC pese al `alter default privileges`,
-- y quien lo caza es `function_privileges.test.sql`.
revoke all on function public.tg_assign_provenance_position() from public;
revoke all on function public.tg_artwork_research_status_coherent() from public;
revoke all on function public.tg_provenance_event_status_coherent() from public;
revoke all on function public.tg_party_deactivation() from public;

revoke all on function public.reorder_provenance_events(text, uuid[]) from public, anon;
grant execute on function public.reorder_provenance_events(text, uuid[]) to authenticated;


-- ============================================================
-- El traslado: los cuatro nodos del árbol que son propiedad, no sitio
-- ============================================================
--
-- ADR-006 dejó anotado que MUBA, MACVA y las colecciones particulares «dejarán
-- de ser lugares y pasarán a ser filas de esa tabla» cuando la tabla existiera.
-- Ya existe. Se cumple A MEDIAS Y A PROPÓSITO:
--
--   • Se crea su ficha en `parties` y un eslabón de procedencia por obra.
--   • NO se borran los nodos: un museo donde una obra está depositada sigue
--     siendo la respuesta correcta a «¿dónde está la obra?», que es para lo que
--     sirve el árbol, y el árbol ya tiene ciudades por raíz.
--   • Lo que SÍ sale del árbol es la propiedad metida dentro del nombre.
--
-- Sobre la coletilla, que es el caso que obliga a decidir: «Colección particular
-- familia Hormeño (propiedad de la tia de Almudena Hormeño)» y «Colección
-- particular familia Hormeño» son HERMANOS bajo Castelar n.º 5 y, quitada la
-- propiedad del nombre, son el MISMO sitio —y además dos hermanos homónimos, que
-- el índice de unicidad del árbol no admite. Así que no basta con recortar el
-- nombre: la obra se mueve al hermano que queda y el nodo con coletilla se
-- RETIRA (baja lógica, RF-901, nunca un borrado). La precisión que ese nombre
-- llevaba dentro no se pierde: viaja a `party_note` del eslabón, que es donde
-- significa algo.
--
-- La CALIDAD de tenencia de los ocho eslabones queda en «Sin revisar» y no en
-- «Depósito» ni en «Propietario». El árbol decía dónde está la obra, no en qué
-- calidad la tiene quien la guarda; deducir un hecho jurídico del nombre de un
-- sitio es exactamente lo que «Sin revisar no es no» prohíbe. Por lo mismo,
-- `provenance_status` de esas ocho obras se queda en «Sin revisar»: tener un
-- dato no es haber investigado la procedencia.
--
-- Si la base no lleva el volcado —integración continua, o una instalación
-- nueva—, no se encuentra ninguno de los cuatro nodos y este bloque no hace
-- absolutamente nada.

-- La auditoría de `artworks` se desactiva mientras se escribe, como en
-- 20260801150000 y 20260803160000: dentro de una migración `auth.uid()` no es
-- nadie, y el trigger borraría el «actualizado por» de las obras. Y mover una
-- obra es un campo de fase 1 (RF-802), así que además movería la fecha de la
-- última vez que alguien la tuvo delante, que no ha pasado.
alter table public.artworks disable trigger artwork_audit_trail;

do $$
declare
  v_map record;
  v_artwork record;
  v_node uuid;
  v_party uuid;
  v_parties int := 0;
  v_events int := 0;
begin
  for v_map in
    select * from (values
      -- nodo del árbol tal como está hoy escrito | ficha en `parties` | tipo | localidad | país | precisión del eslabón
      ('Colección particular familia Hormeño',
       'Colección particular familia Hormeño', 'PERSON', 'Badajoz', 'España', ''),
      ('Colección particular familia Hormeño (propiedad de la tia de Almudena Hormeño)',
       'Colección particular familia Hormeño', 'PERSON', 'Badajoz', 'España',
       'Propiedad de la tía de Almudena Hormeño'),
      ('Museo de Bellas Artes de Badajoz MUBA',
       'Museo de Bellas Artes de Badajoz (MUBA)', 'INSTITUTION', 'Badajoz', 'España', ''),
      ('Museo de arte contemporaneo Vicente Aguilera Cerni MACVA',
       'Museo de Arte Contemporáneo Vicente Aguilera Cerni (MACVA)', 'INSTITUTION',
       'Villafamés', 'España', '')
    ) as t(node_name, party_name, party_type, locality, country, party_note)
  loop
    select id into v_node
      from public.physical_places
     where public.place_key(name) = public.place_key(v_map.node_name);

    continue when v_node is null;

    -- La ficha se busca antes de crearla porque las dos colecciones Hormeño
    -- comparten parte: son la misma familia con una precisión distinta.
    --
    -- El nombre de la ficha se escribe BIEN, con sus tildes y su acrónimo entre
    -- paréntesis, y no se copia el del nodo: el árbol quedó en minúsculas y sin
    -- tildes por el traslado de ADR-006, y curar tres nombres a mano aquí es
    -- más barato que dejarlos deformados esperando una pasada de interfaz. El
    -- nodo conserva el suyo: son dos cosas distintas y cada una se llama como le
    -- toca.
    select id into v_party
      from public.parties
     where public.place_key(name) = public.place_key(v_map.party_name);

    if v_party is null then
      insert into public.parties (party_type, name, locality, country, note)
      values (v_map.party_type::public.party_type_value, v_map.party_name,
              v_map.locality, v_map.country,
              'Ficha creada al sacar la propiedad del árbol de lugares (ADR-006).')
      returning id into v_party;
      v_parties := v_parties + 1;
    end if;

    -- Un eslabón por obra, también por las que estén en la papelera: su cadena
    -- documental existe igual y restaurarlas no puede devolverlas mancas.
    for v_artwork in
      select catalog_id from public.artworks
       where physical_place_id = v_node order by catalog_id
    loop
      insert into public.provenance_events (catalog_id, party_id, party_note, note)
      values (v_artwork.catalog_id, v_party, v_map.party_note,
              format('Trasladado del árbol de lugares (ADR-006): la obra constaba en «%s».',
                     v_map.node_name));
      v_events := v_events + 1;
    end loop;
  end loop;

  raise notice 'Partes creadas: %. Eslabones de procedencia creados: %.', v_parties, v_events;
end $$;

-- ── La fusión de los dos nodos Hormeño ──────────────────────
do $$
declare
  v_long uuid;
  v_short uuid;
  v_moved int := 0;
begin
  select id into v_long from public.physical_places
   where public.place_key(name) = public.place_key(
     'Colección particular familia Hormeño (propiedad de la tia de Almudena Hormeño)');
  select id into v_short from public.physical_places
   where public.place_key(name) = public.place_key('Colección particular familia Hormeño');

  if v_long is null then
    raise notice 'Sin nodo con coletilla de propiedad: no hay nada que fusionar.';
    return;
  end if;

  if v_short is null then
    raise exception 'El nodo con coletilla existe y el nodo hermano no: la fusión no tiene destino';
  end if;

  -- Que sean hermanos es la premisa de toda esta decisión: si el árbol se ha
  -- reorganizado y ya no lo son, no son el mismo sitio y fusionarlos movería
  -- obras de edificio. Mejor parar que adivinar.
  if (select parent_id from public.physical_places where id = v_long)
     is distinct from
     (select parent_id from public.physical_places where id = v_short) then
    raise exception 'Los dos nodos Hormeño ya no cuelgan del mismo sitio: la fusión no es segura';
  end if;

  update public.artworks set physical_place_id = v_short
   where physical_place_id = v_long;
  get diagnostics v_moved = row_count;

  -- Ahora el nodo está vacío y el trigger de baja lo deja retirar. Retirar no es
  -- borrar: la fila sigue ahí con su fecha de baja (RF-901).
  update public.physical_places set active = false where id = v_long;

  raise notice 'Obras movidas al nodo hermano: %. Nodo con coletilla retirado.', v_moved;
end $$;

-- ── El recuento, que es lo que convierte esto en una migración y no en un
--    intento ────────────────────────────────────────────────
do $$
declare
  v_events int;
  v_artworks int;
  v_dangling int;
begin
  select count(*) into v_events
    from public.provenance_events
   where note like 'Trasladado del árbol de lugares%';

  -- Las obras que quedan colgando de los tres nodos supervivientes: son las que
  -- tenían que salir con eslabón. Si una se quedó sin él, los dos números
  -- discrepan y la migración se para en vez de dejar media cadena escrita.
  select count(*) into v_artworks
    from public.artworks a
    join public.physical_places p on p.id = a.physical_place_id
   where public.place_key(p.name) in (
     public.place_key('Colección particular familia Hormeño'),
     public.place_key('Museo de Bellas Artes de Badajoz MUBA'),
     public.place_key('Museo de arte contemporaneo Vicente Aguilera Cerni MACVA')
   );

  if v_events <> v_artworks then
    raise exception 'El traslado ha dejado % eslabones para % obras: algo no ha emparejado',
      v_events, v_artworks;
  end if;

  -- Y ninguna obra con dos eslabones del traslado, que sería la otra forma de
  -- que los recuentos cuadraran mintiendo.
  if exists (
    select 1 from public.provenance_events
     where note like 'Trasladado del árbol de lugares%'
     group by catalog_id having count(*) > 1
  ) then
    raise exception 'Alguna obra ha salido del traslado con más de un eslabón';
  end if;

  -- Y que no quede propiedad metida dentro del nombre de un lugar activo, que es
  -- la mitad del motivo de todo esto.
  select count(*) into v_dangling
    from public.physical_places
   where active and name ilike '%propiedad de%';

  if v_dangling > 0 then
    raise exception '% lugares activos siguen llevando la propiedad dentro del nombre', v_dangling;
  end if;

  raise notice 'Traslado comprobado: % eslabones para % obras, y ningún lugar activo con propiedad en el nombre.',
    v_events, v_artworks;
end $$;

-- La auditoría vuelve antes de que nadie más pueda escribir. Si alguna vez se
-- olvidara, el catálogo perdería la traza sin que nada fallara: por eso lo
-- comprueba también `artwork_physical_place.test.sql`.
alter table public.artworks enable trigger artwork_audit_trail;
