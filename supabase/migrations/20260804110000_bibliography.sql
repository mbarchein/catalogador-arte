-- ============================================================
-- Bibliografía y la cita de una obra en una referencia
-- (RF-514, RF-513, RF-504, RF-506, RF-517, RF-218; resuelve DP-03).
--
-- Son las tablas 6 y 7 del esquema de campos v11 —«Bibliografía» y la puente
-- «Obra_Bibliografia»—, más el vocabulario de tipos de publicación que v11
-- dejaba como una selección cerrada de cuatro valores.
--
-- POR QUÉ ANTES QUE LAS EXPOSICIONES, que v11 numera como tabla 4 y esta como
-- 6: la flecha apunta en este sentido. `Exposiciones.referencia_catalogo`
-- (RF-503) referencia a la bibliografía y no al revés, porque el catálogo de
-- una exposición no es una tabla propia: es una publicación como cualquier
-- otra. Construir en el orden del documento dejaría la migración de
-- exposiciones con una clave ajena a una tabla que todavía no existe.
--
-- Lo que este grupo añade sobre v11, y por qué:
--
--   • `publication_types` es una MAESTRA abierta y no una selección de cuatro
--     valores. Libro / Artículo / Catálogo / Prensa no aguanta el primer mes de
--     investigación real: tesis doctoral, catálogo de subasta, entrada de blog,
--     programa de radio, folleto. Es el caso de `artwork_types` sin adaptación
--     ninguna — la usuaria amplía la lista y el código no mira nunca el valor,
--     solo lo renderiza.
--   • `clave_bibtex` deja de ser clave primaria y pasa a columna única,
--     opcional y editable. Es DP-03, que el documento de requisitos deja
--     pendiente «solo para cuando exista Bibliografía»: ADR-007 ya decidió lo
--     esencial y aquí se ejecuta.
--   • `container_title`, que v11 no tiene y sin el cual el nombre de la revista
--     de un artículo acaba dentro del título y la cita no se puede componer.
--   • La puente conserva `pages` separado de `note`, siguiendo a v11 v9, que ya
--     revirtió la fusión con el argumento correcto: la página es un dato
--     citable de forma exacta y de uso recurrente (RF-504).
--   • Y la puente TIENE papelera, que es lo que revisa RF-903 (ver más abajo).
--
-- Las POLÍTICAS RLS de las tres tablas van en la migración siguiente. Lo que SÍ
-- se hace aquí es activar RLS y revocar los privilegios, porque una tabla que
-- existe un solo despliegue sin RLS es una tabla publicada. Con RLS activado y
-- sin ninguna política, la tabla está cerrada para todo el mundo salvo el
-- acceso administrativo directo, que es el estado seguro para esperar.
-- ============================================================


-- ── El vocabulario de tipos de publicación (RF-514) ─────────
--
-- Patrón de `artwork_types` tras ADR-007: clave sustituta, el nombre como
-- atributo único, papelera y autoría. La diferencia con aquella es que la
-- unicidad va por `place_key(name)` y no por el nombre literal: «Catálogo de
-- exposición» y «catalogo de exposicion» son el mismo tipo, y descubrirlo
-- cuando ya hay dos filas cuesta repasar todas las referencias.

create table public.publication_types (
  id uuid primary key default gen_random_uuid(),

  -- Tal cual se escribe, con sus mayúsculas y sus tildes. Lo que se normaliza
  -- es la clave de comparación, no el dato.
  name text not null,

  -- RF-901: nada se borra, se retira. Sin `restored_at`: como en las demás
  -- maestras de vocabulario, restaurar deja la fila como si nunca se hubiera
  -- retirado, y `tg_row_audit` distingue ese caso por la ausencia de la
  -- columna.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- Un tipo en blanco no clasifica nada, y uno con espacios alrededor rompería
  -- la comparación de duplicados sin que se vea en pantalla.
  constraint publication_types_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.publication_types is
  'Vocabulario abierto de tipos de publicación (RF-514), con clave sustituta (ADR-007): renombrar es una fila. v11 lo dejaba como selección cerrada de cuatro valores. Nada se borra, se retira.';

create unique index publication_types_name_unique
  on public.publication_types (public.place_key(name));

create index publication_types_active_idx on public.publication_types (active);

-- Autoría y papelera con la función genérica de RF-804, y no con una cuarta
-- copia de `tg_artwork_type_authorship`: era exactamente la divergencia que
-- `tg_row_audit` vino a evitar.
create trigger publication_type_row_audit
  before insert or update on public.publication_types
  for each row execute function public.tg_row_audit();

-- La siembra, que es lo que hace que la interfaz sirva el primer día: una
-- maestra vacía deja el selector en blanco y obliga a inventar el vocabulario
-- mientras se cataloga. Son los cuatro valores de v11 con el de catálogo
-- escrito entero —«Catálogo» a secas se confunde con el catálogo razonado que
-- este proyecto está haciendo—, más «Tesis» y «Otro», que son los dos que
-- faltan el primer día de archivo. Ampliar la lista no requiere migración: ese
-- es el motivo de que sea una maestra.
--
-- `created_by` queda nulo a propósito: dentro de una migración `auth.uid()` no
-- es nadie, y estas filas no las creó ninguna persona.
insert into public.publication_types (name) values
  ('Libro'),
  ('Artículo'),
  ('Catálogo de exposición'),
  ('Prensa'),
  ('Tesis'),
  ('Otro');

-- Un tipo que todavía clasifica referencias no se retira, con la misma regla
-- que `tg_artwork_type_deactivation` y `tg_series_deactivation`: retirarlo no
-- lo retira, deja el catálogo apuntando a algo que la interfaz ya no ofrece.
-- Una referencia en la papelera no cuenta, como en las demás.
create function public.tg_publication_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.bibliography
                  where publication_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de publicación que todavía usan referencias del catálogo'
      using hint = 'Cambia antes el tipo de esas referencias.';
  end if;
  return new;
end $$;

comment on function public.tg_publication_type_deactivation is
  'Impide retirar un tipo de publicación que todavía clasifica referencias activas (RF-514).';

create trigger publication_type_deactivation
  before update of active on public.publication_types
  for each row execute function public.tg_publication_type_deactivation();


-- ── La referencia bibliográfica ─────────────────────────────

create table public.bibliography (
  -- Clave sustituta (ADR-007). La clave BibTeX era la clave primaria en v11 y
  -- deja de serlo: ver la columna siguiente.
  id uuid primary key default gen_random_uuid(),

  -- DP-03, resuelta. Es el asa corta con la que la investigadora nombra una
  -- referencia («rotili1985muba»), y por eso se conserva aunque RF-507 —la
  -- exportación a `.bib`— esté retirada: el catálogo impreso está aparcado, no
  -- cancelado. Lo que cambia es su papel:
  --
  --   • NULA PERMITIDA, porque una referencia recién anotada de un recorte de
  --     prensa no tiene clave todavía y obligar a inventarla llenaría la tabla
  --     de claves que nadie eligió.
  --   • EDITABLE, que es justo lo que no era siendo clave primaria: una clave
  --     BibTeX se corrige al descubrir que el año era otro.
  --   • ÚNICA, comparada como el resto de nombres del esquema: dos claves que
  --     solo difieren en mayúsculas son la misma clave y `.bib` no las
  --     distinguiría.
  --
  -- Y NO lleva un `bibtex_type` al lado: sería construir para RF-507, que está
  -- tachado, y así es como se acumula el código que después nadie puede quitar.
  bibtex_key text,

  -- Texto libre y NO una relación a `parties`, a propósito: el autor de un
  -- artículo de 1985 no es un contacto del catálogo —no tiene procedencia, ni
  -- teléfono, ni derechos— y meterlo en la maestra la llenaría de fichas vacías
  -- que después estorban en el selector de propietarios. El día que un autor sí
  -- sea además un propietario, tendrá su ficha por ese otro motivo.
  authors text not null default '',
  -- El editor o coordinador del volumen, cuando es distinto del autor
  -- (frecuente en catálogos colectivos). v11 lo añadió en v4 para poder buscar
  -- por él.
  editors text not null default '',

  title text not null,

  -- La revista, el volumen o el catálogo que CONTIENE el texto citado. v11 no
  -- lo tiene, y sin él el nombre de la revista acaba dentro del título: la cita
  -- deja de poder componerse y buscar «todo lo publicado en tal revista» pasa a
  -- ser una búsqueda de texto libre dentro de otro campo.
  container_title text not null default '',

  -- Nulo es «sin clasificar todavía», que es una respuesta legítima mientras la
  -- referencia se anota de una fotocopia. `restrict` por lo mismo que en el
  -- resto del esquema: nadie tiene DELETE, y si alguna vez se borrara una fila
  -- a mano esto avisa en vez de dejar referencias apuntando al vacío.
  publication_type_id uuid references public.publication_types (id) on delete restrict,

  -- Nulo permitido: `s.f.` existe y es un dato, no un hueco. Es un año suelto y
  -- no la forma estructurada de ADR-004 porque una referencia se cita por su
  -- año de publicación, que no es un rango ni una aproximación.
  year smallint,

  publisher text not null default '',
  place text not null default '',
  note text not null default '',

  -- RF-804: trazabilidad completa, sellada por `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 y RF-902: papelera completa, con la traza de la última baja y de la
  -- última restauración.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- Una referencia sin título no se puede citar. NO se exige además que esté
  -- recortado, a diferencia de los nombres de las maestras: aquí no hay clave
  -- de comparación que un espacio pueda romper, y un título se pega de un PDF.
  constraint bibliography_title_not_blank check (btrim(title) <> ''),

  -- Si hay clave, que sea una clave: recortada, no vacía y sin los caracteres
  -- que un fichero `.bib` no admite dentro de una — un espacio o una coma
  -- parten la entrada, y las llaves la cierran antes de tiempo. Rechazarlo aquí
  -- cuesta una línea; descubrirlo el día que alguien exporte, un rato.
  constraint bibliography_bibtex_key_shape check (
    bibtex_key is null
    or (bibtex_key = btrim(bibtex_key)
        and bibtex_key <> ''
        and bibtex_key !~ '[[:space:],{}]')
  ),

  -- Un año fuera de rango plausible es una errata, no una fecha (ADR-004).
  constraint bibliography_plausible_year check (
    year is null or year between 1000 and 2100
  )
);

comment on table public.bibliography is
  'Referencias bibliográficas (tabla 6 del esquema de campos v11). Clave sustituta (ADR-007) y clave BibTeX como columna única, opcional y editable (DP-03). Nada se borra, se retira.';

comment on column public.bibliography.bibtex_key is
  'Asa corta con la que se nombra la referencia («rotili1985muba»). Única, opcional y editable: deja de ser clave primaria (DP-03, ADR-007).';
comment on column public.bibliography.container_title is
  'Revista, volumen o catálogo que contiene el texto citado. Sin esta columna el nombre de la revista acaba dentro del título.';
comment on column public.bibliography.authors is
  'Texto libre, no una relación a personas e instituciones: el autor de un artículo no es un contacto del catálogo.';
comment on column public.bibliography.year is
  'Año de publicación. Nulo es «sin fecha», que en bibliografía es un dato y no un hueco.';

-- Única por clave de comparación, y solo donde hay clave: `place_key` es
-- `strict`, así que devuelve nulo para las referencias sin clave y el índice
-- las ignora — que es lo que permite tener muchas sin clave y ninguna
-- duplicada.
create unique index bibliography_bibtex_key_unique
  on public.bibliography (public.place_key(bibtex_key));

-- SIN unicidad sobre el título, a propósito: dos referencias distintas se
-- llaman igual («Alberto Rotili») y son dos entradas legítimas del catálogo.
-- Los duplicados se resuelven por revisión del equipo (RF-909), que es lo que
-- el proyecto ya decidió para el resto de las altas.

create index bibliography_publication_type_idx
  on public.bibliography (publication_type_id);
create index bibliography_active_idx on public.bibliography (active);

create trigger bibliography_row_audit
  before insert or update on public.bibliography
  for each row execute function public.tg_row_audit();


-- ── La cita de una obra en una referencia (RF-504) ──────────
--
-- La tabla puente 7 de v11. Registra en qué páginas de qué referencia aparece
-- mencionada o reproducida cada obra.

create table public.artwork_bibliography (
  id uuid primary key default gen_random_uuid(),

  -- Misma forma que `images` y que `provenance_events`: `on update cascade`
  -- porque el identificador de catalogación es texto, y sin `on delete` porque
  -- de `artworks` no se borra nada (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  bibliography_id uuid not null references public.bibliography (id) on delete restrict,

  -- DOS COLUMNAS y no una nota fundida, siguiendo a v11 v9, que ya revirtió esa
  -- fusión con el argumento correcto: la página es un dato de uso recurrente y
  -- citable de forma exacta —se cita en el ensayo del catálogo razonado y se
  -- busca—, mientras que la nota es prosa («reproducida en color», «mencionada
  -- en pie de foto, sin reproducir»). Es texto y no un número porque «34-36»,
  -- «s/p» y «lám. XII» son páginas reales.
  pages text not null default '',
  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, que REVISA RF-903. El requisito justificaba el borrado real de las
  -- puente en que «no tienen etiqueta física ni número citable y basta con
  -- volver a crearlas»; con `pages` dentro, esa premisa no se sostiene: la fila
  -- lleva trabajo de investigación y quién la retiró es traza que interesa. Y
  -- hay una razón de perímetro además de la documental: `rls_default_deny`
  -- lanza excepción ante cualquier política DELETE en `public`, así que el
  -- borrado real de dos tablas exigiría debilitar el guardarraíl que ha cazado
  -- errores reales.
  --
  -- Sin `restored_at`: como en las maestras de vocabulario, una cita que se
  -- vuelve a añadir queda como si nunca se hubiera retirado. La papelera
  -- completa de RF-902 es de las fichas con nombre propio; esta fila se
  -- restaura desde la ficha de la que cuelga y no desde una pantalla de
  -- papelera.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- Una obra citada dos veces en la misma referencia es una sola cita con dos
  -- páginas dentro («34, 51»), no dos filas. La restricción cubre también las
  -- citas retiradas, que es lo que permite que volver a añadir una restaure en
  -- vez de duplicar (ver `cite_artwork`).
  constraint artwork_bibliography_unique unique (catalog_id, bibliography_id)
);

comment on table public.artwork_bibliography is
  'Cita de una obra en una referencia bibliográfica (tabla puente 7 del esquema de campos v11, RF-504). Nada se borra: una cita se retira (RF-517, revisa RF-903).';

comment on column public.artwork_bibliography.pages is
  'Páginas donde aparece la obra en esa referencia. Columna aparte de la nota por ser dato citable de forma exacta (RF-504, v11 v9). Texto: «34-36», «s/p» y «lám. XII» son páginas.';

-- El bloque «Obras citadas» de la ficha bibliográfica (RF-506) se lee por este
-- lado; el bloque de bibliografía de la ficha de obra usa el índice único, que
-- ya empieza por `catalog_id`.
create index artwork_bibliography_reference_idx
  on public.artwork_bibliography (bibliography_id);

create trigger artwork_bibliography_row_audit
  before insert or update on public.artwork_bibliography
  for each row execute function public.tg_row_audit();


-- ── Añadir una cita retirada la RESTAURA ────────────────────
--
-- Con la unicidad cubriendo también las citas retiradas, un `insert` de una
-- pareja que está en la papelera choca contra el índice, y la interfaz
-- convertiría un «Añadir» en una violación de unicidad incomprensible. Es
-- exactamente el caso que `masterTables.test.ts` ya cubre para el vocabulario,
-- y aquí se resuelve en la base para que no dependa de que el cliente lo
-- recuerde.
--
-- Se hace con una función y no con un trigger `before insert` que devuelva
-- `null`: un trigger así deja el `insert` sin filas afectadas, y quien llame
-- desde la API pidiendo la fila creada no recibirá ninguna. La función
-- devuelve siempre la fila, exista ya o no.
--
-- Sin SECURITY DEFINER, como `reorder_provenance_events`: las políticas siguen
-- en vigor y un Lector no escribe aquí. La comprobación explícita solo convierte
-- el silencioso «no ha cambiado nada» en un error legible, y en español porque
-- lo lee ella.
create function public.cite_artwork(
  p_catalog_id text,
  p_bibliography_id uuid,
  p_pages text default '',
  p_note text default ''
)
returns public.artwork_bibliography
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_bibliography;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para citar una obra en una referencia';
  end if;

  insert into public.artwork_bibliography (catalog_id, bibliography_id, pages, note)
  values (p_catalog_id, p_bibliography_id,
          coalesce(p_pages, ''), coalesce(p_note, ''))
  on conflict (catalog_id, bibliography_id) do update
     set active = true,
         -- Lo que no se manda no se borra: añadir una cita que ya existía no
         -- puede vaciar las páginas que alguien investigó, porque el formulario
         -- de «Añadir» viene en blanco. Cambiarlas a vacío es editar la cita,
         -- que es otra operación.
         pages = case when btrim(excluded.pages) <> ''
                      then excluded.pages
                      else artwork_bibliography.pages end,
         note  = case when btrim(excluded.note) <> ''
                      then excluded.note
                      else artwork_bibliography.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.cite_artwork is
  'Añade la cita de una obra en una referencia, o RESTAURA la que estuviera retirada en vez de chocar contra la unicidad (RF-504, RF-517).';


-- ── Lo que la obra gana (RF-218) ────────────────────────────

alter table public.artworks
  add column bibliography_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.bibliography_status is
  'Estado de investigación de la bibliografía de la obra (RF-218). Una obra sin citas registradas no es una obra que nadie ha publicado.';


-- ── «Sin revisar» no es «no», también en bibliografía ───────
--
-- La migración de la procedencia dejó escrito que los grupos siguientes
-- REEMPLAZAN esta función con `create or replace` para añadir su bloque, y que
-- el trigger se declara sin lista de columnas para no tener que recrearlo. Esto
-- es ese reemplazo.
--
-- Se comprueba por las DOS puertas, como allí: ni se declara «investigado sin
-- resultado» en una obra con citas activas, ni se añade o restaura una cita en
-- una obra declarada así.
--
-- `set search_path = public` se repite porque `create or replace` reemplaza la
-- definición entera y con ella su configuración.
--
-- Los `if` que miran `old` van dentro de su propio `if tg_op = 'UPDATE'` por el
-- detalle de plpgsql que la versión anterior documenta: en un trigger de INSERT
-- el registro `old` no está asignado, y una expresión que lo nombre falla
-- aunque el `and` de la izquierda ya sea falso.
create or replace function public.tg_artwork_research_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
declare
  -- En un alta todo es un cambio. En una edición, solo lo que cambia se
  -- comprueba: así una fila que ya estuviera en un estado imposible se puede
  -- arreglar en vez de bloquear cualquier otra edición de la obra.
  v_provenance_changed boolean := true;
  v_bibliography_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_provenance_changed :=
      old.provenance_status is distinct from new.provenance_status;
    v_bibliography_changed :=
      old.bibliography_status is distinct from new.bibliography_status;
  end if;

  if new.provenance_status = 'NONE_FOUND' and v_provenance_changed then
    if exists (select 1 from public.provenance_events
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar la procedencia por investigada sin resultado: la obra % ya tiene eslabones registrados', new.catalog_id
        using hint = 'Retira antes los eslabones, o marca la procedencia como «En curso» o «Completa».';
    end if;
  end if;

  if new.bibliography_status = 'NONE_FOUND' and v_bibliography_changed then
    if exists (select 1 from public.artwork_bibliography
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar la bibliografía por investigada sin resultado: la obra % ya tiene citas registradas', new.catalog_id
        using hint = 'Retira antes las citas, o marca la bibliografía como «En curso» o «Completa».';
    end if;
  end if;

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218). Cubre procedencia y bibliografía; los grupos siguientes añaden su bloque.';

-- La otra puerta. Lo que SÍ se permite, y es intencionado: citas en una obra
-- cuyo estado sigue en «Sin revisar». Tener un dato no es haber hecho la
-- investigación, así que la regla es de un solo sentido.
create function public.tg_artwork_citation_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select bibliography_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'La bibliografía de la obra % consta investigada sin resultado y esta cita la contradice', new.catalog_id
      using hint = 'Cambia antes el estado de la bibliografía a «En curso» o «Completa».';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_citation_status_coherent is
  'La otra puerta de RF-218: no se añade ni se restaura una cita en una obra cuya bibliografía consta investigada sin resultado.';

create trigger artwork_citation_status_coherent
  before insert or update on public.artwork_bibliography
  for each row execute function public.tg_artwork_citation_status_coherent();


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Se revoca primero y se concede después, uno a uno: la plataforma concede por
-- omisión todos los privilegios de cada tabla nueva a los roles anónimo y
-- autenticado, incluido `delete` (RF-113).
--
-- Sin DELETE en ninguna de las tres: ni privilegio ni política, nunca (RF-901,
-- RF-517). Retirar una cita es un update de `active`.
--
-- Las políticas van en la migración siguiente. Hasta que existan, estas tablas
-- no las lee ni las escribe nadie con sesión: RLS activado sin política niega.

alter table public.publication_types enable row level security;
alter table public.bibliography enable row level security;
alter table public.artwork_bibliography enable row level security;

revoke all on public.publication_types from anon, authenticated;
revoke all on public.bibliography from anon, authenticated;
revoke all on public.artwork_bibliography from anon, authenticated;

grant select, insert, update on public.publication_types to authenticated;
grant select, insert, update on public.bibliography to authenticated;
grant select, insert, update on public.artwork_bibliography to authenticated;

-- Explícito, como en 20260801140000, 20260804090000 y 20260804100000: en esta
-- plataforma una función nueva nace con EXECUTE para PUBLIC pese al `alter
-- default privileges`, y quien lo caza es `function_privileges.test.sql`.
revoke all on function public.tg_publication_type_deactivation() from public;
revoke all on function public.tg_artwork_citation_status_coherent() from public;
-- `create or replace` conserva los privilegios de la función anterior, pero se
-- repite para que la migración no dependa de ese detalle.
revoke all on function public.tg_artwork_research_status_coherent() from public;

revoke all on function public.cite_artwork(text, uuid, text, text) from public, anon;
grant execute on function public.cite_artwork(text, uuid, text, text) to authenticated;
