-- ============================================================
-- Exposiciones, sus sedes y la participación de cada obra
-- (RF-512, RF-501, RF-502, RF-503, RF-505, RF-513, RF-517, RF-218).
--
-- Son las tablas 4 y 5 del esquema de campos v11 —«Exposiciones» y la puente
-- «Obra_Exposicion»—, más la maestra de sedes que v11 no tiene: allí el sitio
-- donde ocurrió una muestra son dos textos sueltos, `lugar` e `institucion`.
--
-- POR QUÉ DESPUÉS DE LA BIBLIOGRAFÍA, aunque v11 numere esta tabla como la 4 y
-- aquella como la 6: la flecha apunta en aquel sentido. RF-503 decide que el
-- catálogo de una exposición no tiene tabla propia —es una publicación como
-- cualquier otra— y por eso `catalogue_reference_id` sale de aquí y entra en
-- `bibliography`. Construir en el orden del documento habría dejado esta
-- migración con una clave ajena a una tabla inexistente.
--
-- Lo que este grupo cambia sobre v11, y por qué:
--
--   • La SEDE es una tabla maestra con clave sustituta y NO dos textos. Con dos
--     textos, corregir el nombre de un museo es tocar todas sus exposiciones,
--     que es exactamente el problema que ADR-006 ya resolvió una vez para los
--     lugares del almacén.
--   • Y NO es el árbol de lugares. Son dos tablas y la razón no es de
--     comodidad: `physical_places` contesta «dónde está la obra hoy», sus nodos
--     son contenedores con `parent_id`, regla anticiclos y la prohibición de
--     retirar un lugar con algo dentro; una sede contesta «dónde ocurrió una
--     muestra en 1985», es histórica —una sala que cerró en 1988 tiene que
--     seguir existiendo para siempre—, tiene localidad y país propios y no
--     contiene nada. Fundirlas pondría «Balda 2» en el selector de sedes y el
--     Museo del Prado en el árbol del almacén.
--   • NO se crea el código `EXPO-0001` que v11 proponía. A diferencia de
--     `catalog_id`, ese código no está impreso en nada ni pegado a ningún objeto
--     del mundo: ADR-007 fija clave sustituta, y un segundo identificador sin
--     uso es una columna más que mantener coherente.
--   • Se DESHACE la fusión que v11 hizo en v7: `catalogue_number` vuelve a ser
--     columna aparte de la nota, con el criterio que el propio v11 escribió en
--     v9 para NO fusionar `paginas` —dato estructurado de uso recurrente y
--     citable de forma exacta— y con la advertencia que v7 dejó escrita de lo
--     que se perdía: «la posibilidad de buscar o filtrar por número de catálogo
--     de exposición». «cat. 12 bis» se cita en el ensayo del catálogo razonado.
--     Revisa RF-501.
--   • La puente TIENE papelera (RF-517, que revisa RF-903), por lo mismo que la
--     de bibliografía: con el número de catálogo dentro, la premisa de RF-903
--     —«no tienen etiqueta física ni número citable y basta con volver a
--     crearlas»— deja de sostenerse.
--
-- Las POLÍTICAS RLS de las tres tablas van en la migración siguiente. Lo que SÍ
-- se hace aquí es activar RLS y revocar los privilegios, porque una tabla que
-- existe un solo despliegue sin RLS es una tabla publicada. Con RLS activado y
-- sin ninguna política, la tabla está cerrada para todo el mundo salvo el
-- acceso administrativo directo, que es el estado seguro para esperar.
-- ============================================================


-- ── Un enumerado, y por qué no es una maestra ───────────────
--
-- El criterio del esquema es si el CÓDIGO mira el valor. Aquí lo mira: de él
-- depende cómo se redacta la línea del historial expositivo (una individual se
-- escribe con el nombre del artista implícito, una colectiva no) y es la
-- distinción que el catálogo razonado usa para separar los dos bloques. Son dos
-- valores que no crecen, más el «Sin revisar» de RF-205 — que aquí sí procede,
-- al contrario que en `party_type`: al anotar una exposición de un recorte de
-- prensa se sabe el título y no siempre si fue individual o colectiva.
create type public.exhibition_type_value as enum (
  'INDIVIDUAL',  -- Individual
  'COLLECTIVE',  -- Colectiva
  'UNREVIEWED'   -- Sin revisar (RF-205)
);

comment on type public.exhibition_type_value is
  'Individual o colectiva (v11, tabla 4). Con «Sin revisar» (RF-205): de un recorte de prensa se saca el título antes que el carácter de la muestra.';


-- ── La sede: dónde ocurrió la muestra (RF-512) ──────────────
--
-- Patrón de las maestras de vocabulario tras ADR-007: clave sustituta, el nombre
-- como atributo, papelera y autoría de alta. Sin `updated_at`/`updated_by` y sin
-- `restored_at`, como `publication_types` y `artwork_types`: es vocabulario que
-- cuelga de las fichas, no una ficha con pantalla de papelera propia (RF-901
-- enumera las tablas que sí la tienen y las sedes no están en esa lista).

create table public.exhibition_venues (
  id uuid primary key default gen_random_uuid(),

  -- Tal cual se escribe, con sus mayúsculas y sus tildes. Lo que se normaliza es
  -- la clave de comparación, no el dato.
  name text not null,

  -- Localidad y país sueltos, y no una dirección en un texto: RF-502 compone
  -- «[año], [fechas], [título], [institución], [lugar]» y necesita el lugar
  -- aparte para escribirlo sin analizar nada.
  locality text not null default '',
  country text not null default '',

  -- La institución que hay detrás, opcional. Opcional a propósito: una casa de
  -- cultura o una sala municipal son sedes reales sin ficha de institución
  -- detrás, y obligar a crearla llenaría `parties` de filas sin contacto ni
  -- procedencia. Cuando la hay, el contacto del museo no se duplica.
  -- `restrict` por coherencia con el resto del esquema: nadie tiene DELETE, y si
  -- alguna vez se borrara una parte a mano esto avisa en vez de dejar la sede
  -- apuntando al vacío.
  party_id uuid references public.parties (id) on delete restrict,

  note text not null default '',

  -- RF-901: nada se borra, se retira.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- Una sede en blanco no sitúa nada, y una con espacios alrededor rompería la
  -- comparación de duplicados sin que se vea en pantalla.
  constraint exhibition_venues_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.exhibition_venues is
  'Sedes de exposición (RF-512), con clave sustituta (ADR-007). NO es el árbol de lugares: aquel contesta dónde está la obra hoy y contiene cosas; esta contesta dónde ocurrió una muestra y es histórica. Nada se borra, se retira.';

comment on column public.exhibition_venues.party_id is
  'Institución que hay detrás de la sede, opcional: una casa de cultura es una sede sin ficha de institución. Cuando la hay, su contacto no se duplica.';
comment on column public.exhibition_venues.locality is
  'Localidad, suelta porque RF-502 la imprime aparte del nombre de la institución.';

-- Nombre Y localidad, no el nombre solo: hay una «Casa de Cultura» en cada
-- pueblo y una «Sala de Exposiciones» en cada capital, y con la unicidad por el
-- nombre a secas la segunda sería un error incomprensible. Comparado con
-- `place_key`, que es la clave de comparación de nombres de todo el esquema: dos
-- sedes que solo difieren en una tilde son la misma sede, y descubrirlo cuando
-- ya hay dos filas cuesta repasar todas las exposiciones.
--
-- El índice cubre también las sedes retiradas, como en las demás maestras:
-- volver a dar de alta una que está en la papelera tiene que poder encontrarla.
create unique index exhibition_venues_name_unique
  on public.exhibition_venues (public.place_key(name), public.place_key(locality));

create index exhibition_venues_party_idx on public.exhibition_venues (party_id);
create index exhibition_venues_active_idx on public.exhibition_venues (active);

-- Autoría y papelera con la función genérica de RF-804. Sin `restored_at`, la
-- función deja la fila como si nunca se hubiera retirado, que es lo que ya hacen
-- los lugares y las maestras de vocabulario.
create trigger exhibition_venue_row_audit
  before insert or update on public.exhibition_venues
  for each row execute function public.tg_row_audit();


-- ── La exposición ───────────────────────────────────────────

create table public.exhibitions (
  -- Clave sustituta (ADR-007). Ver la cabecera: no se crea `EXPO-0001`.
  id uuid primary key default gen_random_uuid(),

  title text not null,

  exhibition_type public.exhibition_type_value not null default 'UNREVIEWED',

  -- La sede, opcional, y la nota para cuando consta sin identificar. Las dos
  -- juntas: un recorte que dice «expuesta en una galería de Madrid» es un dato,
  -- y obligar a crear la ficha de una galería que no se sabe cuál es llenaría la
  -- maestra de sedes inventadas.
  venue_id uuid references public.exhibition_venues (id) on delete restrict,
  venue_note text not null default '',

  -- El año es el eje del historial expositivo: RF-502 lo imprime primero y
  -- ordena por él. Nulo mientras no haya ni año ni fechas... que es un caso que
  -- el check de más abajo no permite: una exposición sin fecha ninguna no se
  -- puede colocar en un historial cronológico, y colocarla al final «porque no
  -- se sabe» sería inventar el dato.
  year smallint,

  -- Las fechas exactas, opcionales. Es la diferencia con la forma estructurada
  -- de ADR-004, que se usa en la obra y en los eslabones de procedencia: una
  -- exposición no fue «hacia 1985», tuvo unas fechas de apertura y cierre que o
  -- se conocen o no. Lo aproximado de una exposición es su año, y para eso está
  -- `year` suelto.
  start_date date,
  end_date date,
  date_note text not null default '',

  -- «Sin revisar» no es «no», literal: que no conste catálogo no es que no lo
  -- hubiera. Se reutiliza el enumerado que ya existe en vez de crear un cuarto
  -- tri-estado igual.
  catalogue_published public.tri_state not null default 'UNREVIEWED',

  -- RF-503: el catálogo de una exposición no tiene tabla propia, es una
  -- publicación como cualquier otra y vive en `bibliography`.
  catalogue_reference_id uuid references public.bibliography (id) on delete restrict,

  -- El `nota_exposicion` de v11 v6: comisariado, contexto, circunstancias de la
  -- muestra como conjunto. Distinto de la nota de la puente, que recoge las
  -- circunstancias de UNA obra dentro de esta exposición.
  note text not null default '',

  -- RF-804: trazabilidad completa, sellada por `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 y RF-902: la exposición es una ficha con nombre propio y de las que
  -- el requisito enumera, así que lleva papelera completa: la restauración se
  -- sella y NO borra la traza de la baja anterior.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- Una exposición sin título no se puede citar en un historial. Como en la
  -- bibliografía, NO se exige además que esté recortado: aquí no hay clave de
  -- comparación que un espacio pueda romper, y un título se pega de un PDF.
  constraint exhibitions_title_not_blank check (btrim(title) <> ''),

  -- Un año fuera de rango plausible es una errata, no una fecha (ADR-004).
  constraint exhibitions_plausible_year check (
    year is null or year between 1000 and 2100
  ),

  -- Al menos una de las dos formas de fechar. Con el trigger de más abajo
  -- rellenando el año desde la fecha de inicio, en la práctica esto exige que
  -- toda exposición tenga año: es lo que hace que el historial cronológico de
  -- RF-502 se pueda ordenar entero y no a trozos.
  constraint exhibitions_dated check (
    year is not null or start_date is not null
  ),

  -- Un cierre anterior a la apertura es una errata. Y un cierre SIN apertura es
  -- media fecha: se rechaza también, con el mismo criterio de todo-o-nada con el
  -- que `images` trata el fichero corregido. Un `end_date >= start_date` a secas
  -- lo habría dejado pasar, porque una comparación con nulo no es falsa.
  constraint exhibitions_coherent_dates check (
    end_date is null
    or (start_date is not null and end_date >= start_date)
  ),

  -- Y el año no puede contradecir a la fecha de inicio. Sin esto, una corrección
  -- de la fecha que olvide el año deja la exposición ordenada por 1985 e impresa
  -- como de 1986.
  constraint exhibitions_year_matches_start_date check (
    start_date is null or year is null
    or extract(year from start_date)::smallint = year
  ),

  -- RF-503: si hay ficha del catálogo, entonces consta que hubo catálogo. Al
  -- revés no: un catálogo puede constar publicado y no estar todavía dado de
  -- alta en la bibliografía, que es el estado normal mientras se investiga.
  constraint exhibitions_catalogue_reference_needs_catalogue check (
    catalogue_reference_id is null or catalogue_published = 'YES'
  )
);

comment on table public.exhibitions is
  'Exposiciones en las que ha participado obra del fondo (tabla 4 del esquema de campos v11). Clave sustituta (ADR-007): no se crea el código EXPO-0001, que no está impreso en nada. Nada se borra, se retira.';

comment on column public.exhibitions.year is
  'Año de la muestra, eje del historial cronológico (RF-502). Se rellena solo desde la fecha de inicio cuando esta existe.';
comment on column public.exhibitions.venue_note is
  'La sede que consta sin identificar («una galería de Madrid»). Evita inventar fichas de sede para poder guardar el dato.';
comment on column public.exhibitions.catalogue_published is
  'Si la muestra generó catálogo. «Sin revisar» no es «No»: que no conste catálogo no es que no lo hubiera.';
comment on column public.exhibitions.catalogue_reference_id is
  'Ficha bibliográfica del catálogo de la muestra (RF-503). El catálogo de una exposición no tiene tabla propia.';
comment on column public.exhibitions.note is
  'Nota de la muestra como conjunto (comisariado, contexto). Distinta de la nota de la participación de una obra concreta.';

-- SIN unicidad sobre el título, a propósito y por lo mismo que en la
-- bibliografía: dos muestras itinerantes de años distintos se llaman igual, y
-- «Alberto Rotili. Antológica» en Badajoz y en Cáceres son dos exposiciones. Los
-- duplicados se resuelven por revisión del equipo (RF-909).

-- El orden del historial expositivo de RF-502, que es ascendente y por fecha: la
-- de inicio cuando se conoce, y el 1 de enero del año cuando no. La expresión no
-- puede dar nulo —el check `exhibitions_dated` y el trigger del año lo
-- garantizan— así que el índice ordena la tabla entera y no una parte.
create index exhibitions_chronology_idx
  on public.exhibitions ((coalesce(start_date, make_date(year::integer, 1, 1))));

create index exhibitions_venue_idx on public.exhibitions (venue_id);
create index exhibitions_catalogue_reference_idx
  on public.exhibitions (catalogue_reference_id);
create index exhibitions_active_idx on public.exhibitions (active);


-- ── El año se deduce de la fecha, nunca al revés ────────────
--
-- Escribir las fechas exactas y además el año sería pedir dos veces el mismo
-- dato y garantizar que un día no coincidan. El check
-- `exhibitions_year_matches_start_date` impide que se contradigan; este trigger
-- evita además que la interfaz tenga que calcularlo, que es donde ese cálculo se
-- olvida.
--
-- Al revés NO: de un año suelto no se inventa un 1 de enero. La fecha exacta
-- ausente es un dato que no se conoce, y rellenarlo sería publicar una apertura
-- que nadie ha documentado.
create function public.tg_exhibition_year_from_dates()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.year is null and new.start_date is not null then
    new.year := extract(year from new.start_date)::smallint;
  end if;
  return new;
end $$;

comment on function public.tg_exhibition_year_from_dates is
  'Rellena el año de la exposición desde su fecha de inicio cuando falta (RF-502). Nunca al revés: de un año no se inventa un día.';

create trigger exhibition_year_from_dates
  before insert or update on public.exhibitions
  for each row execute function public.tg_exhibition_year_from_dates();


-- ── Autoría y papelera ──────────────────────────────────────

create trigger exhibition_row_audit
  before insert or update on public.exhibitions
  for each row execute function public.tg_row_audit();


-- ── Una sede que sostiene una muestra no se retira ──────────
--
-- Misma regla que `tg_publication_type_deactivation`, `tg_series_deactivation` y
-- `tg_physical_place_deactivation`: retirar la sede no la retira, deja el
-- historial expositivo apuntando a algo que la interfaz ya no ofrece. Una
-- exposición en la papelera no cuenta, como en las demás: exigir vaciar la
-- papelera antes de retirar una sede sería hacer que la papelera estorbe.
create function public.tg_exhibition_venue_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.exhibitions
                  where venue_id = new.id and active) then
    raise exception 'No se puede retirar una sede que todavía acoge exposiciones del catálogo'
      using hint = 'Cambia antes la sede de esas exposiciones.';
  end if;
  return new;
end $$;

comment on function public.tg_exhibition_venue_deactivation is
  'Impide retirar una sede que todavía acoge exposiciones activas (RF-512).';

create trigger exhibition_venue_deactivation
  before update of active on public.exhibition_venues
  for each row execute function public.tg_exhibition_venue_deactivation();


-- ── Y una parte que hay detrás de una sede, tampoco ─────────
--
-- La comprobación que la migración de la procedencia dejó anunciada por escrito
-- («las sedes de exposición añadirán su comprobación aquí con `create or
-- replace` cuando existan») y que sin este grupo se quedaría a medias: hoy se
-- podría retirar el Museo de Bellas Artes de Badajoz teniendo una sede que
-- apunta a él, y la sede quedaría con el contacto colgando de una ficha que la
-- interfaz ya no ofrece.
--
-- `create or replace` reemplaza la definición entera, así que los dos bloques
-- anteriores —eslabón de procedencia y titular de derechos— se repiten aquí
-- literalmente. Un reemplazo que se los coma no rompería nada visible, y por eso
-- el test comprueba los tres.
--
-- `set search_path = public` se repite por lo mismo: `create or replace`
-- reemplaza también la configuración de la función.
create or replace function public.tg_party_deactivation()
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

    if exists (
      select 1 from public.exhibition_venues
       where party_id = new.id and active
    ) then
      raise exception 'No se puede retirar una parte que es la institución de una sede de exposición'
        using hint = 'Retira antes esa sede, o quítale la institución.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_party_deactivation is
  'Impide retirar una persona o institución que aparece en una cadena de procedencia activa, que es titular de derechos o que está detrás de una sede de exposición activa (RF-511, RF-512, revisa RF-905).';


-- ── La participación de una obra en la muestra (RF-501) ─────
--
-- La tabla puente 5 de v11. Registra el HECHO de que una obra concreta participó
-- en una exposición concreta, independientemente de si hubo catálogo.

create table public.artwork_exhibitions (
  id uuid primary key default gen_random_uuid(),

  -- Misma forma que `images`, `provenance_events` y `artwork_bibliography`: `on
  -- update cascade` porque el identificador de catalogación es texto, y sin `on
  -- delete` porque de `artworks` no se borra nada (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  exhibition_id uuid not null references public.exhibitions (id) on delete restrict,

  -- DOS COLUMNAS, deshaciendo la fusión de v11 v7. El número con el que la obra
  -- apareció en el catálogo o en las cartelas es dato estructurado de uso
  -- recurrente y citable de forma exacta —«cat. 12 bis» se cita en el ensayo del
  -- catálogo razonado y se busca—, y la nota es prosa: préstamo por un tercero,
  -- estado en el momento de la muestra, diferencias con la ficha actual. El
  -- propio v7 dejó escrito lo que se perdía al fundirlos, y v9 fijó el criterio
  -- para no repetirlo con `paginas`. Es texto y no un número porque «12 bis»,
  -- «s/n» y «II.4» son números de catálogo reales.
  catalogue_number text not null default '',
  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, que REVISA RF-903, igual que en la puente de bibliografía: con el
  -- número de catálogo dentro, la premisa del requisito —«no tienen etiqueta
  -- física ni número citable y basta con volver a crearlas»— deja de sostenerse.
  -- La fila lleva trabajo de investigación y quién la retiró es traza que
  -- interesa. Y hay una razón de perímetro además de la documental:
  -- `rls_default_deny` lanza excepción ante cualquier política DELETE en
  -- `public`, así que el borrado real exigiría debilitar el guardarraíl que ha
  -- cazado errores reales.
  --
  -- Sin `restored_at`: esta fila se restaura desde la ficha de la que cuelga y
  -- no desde una pantalla de papelera, así que volver a añadirla la deja como si
  -- nunca se hubiera retirado.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- Una obra expuesta dos veces en la misma muestra es una participación con dos
  -- números dentro, no dos filas. La restricción cubre también las retiradas,
  -- que es lo que permite que volver a añadir restaure en vez de duplicar (ver
  -- `exhibit_artwork`).
  constraint artwork_exhibitions_unique unique (catalog_id, exhibition_id)
);

comment on table public.artwork_exhibitions is
  'Participación de una obra en una exposición (tabla puente 5 del esquema de campos v11, RF-501). Nada se borra: una participación se retira (RF-517, revisa RF-903).';

comment on column public.artwork_exhibitions.catalogue_number is
  'Número con el que la obra apareció en el catálogo o las cartelas de esa muestra («12 bis», «s/n»). Columna aparte de la nota: deshace la fusión de v11 v7 con el criterio de v9 (RF-513).';
comment on column public.artwork_exhibitions.note is
  'Circunstancias de ESTA participación: préstamo por un tercero, estado en el momento, diferencias con la ficha actual.';

-- El bloque «Obras participantes» de la ficha de exposición (RF-505) se lee por
-- este lado; el historial expositivo de la ficha de obra usa el índice único,
-- que ya empieza por `catalog_id`.
create index artwork_exhibitions_exhibition_idx
  on public.artwork_exhibitions (exhibition_id);

create trigger artwork_exhibition_row_audit
  before insert or update on public.artwork_exhibitions
  for each row execute function public.tg_row_audit();


-- ── Añadir una participación retirada la RESTAURA ───────────
--
-- Mismo caso y misma solución que `cite_artwork`: con la unicidad cubriendo
-- también las participaciones retiradas, un `insert` de una pareja que está en
-- la papelera choca contra el índice, y la interfaz convertiría un «Añadir» en
-- una violación de unicidad incomprensible.
--
-- Función y no un trigger `before insert` que devuelva `null`: un trigger así
-- deja el `insert` sin filas afectadas y quien llame desde la API pidiendo la
-- fila creada no recibirá ninguna. La función devuelve siempre la fila.
--
-- Sin SECURITY DEFINER: las políticas siguen en vigor y un Lector no escribe
-- aquí. La comprobación explícita solo convierte el silencioso «no ha cambiado
-- nada» en un error legible, y en español porque lo lee ella.
create function public.exhibit_artwork(
  p_catalog_id text,
  p_exhibition_id uuid,
  p_catalogue_number text default '',
  p_note text default ''
)
returns public.artwork_exhibitions
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_exhibitions;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir una obra a una exposición';
  end if;

  insert into public.artwork_exhibitions
         (catalog_id, exhibition_id, catalogue_number, note)
  values (p_catalog_id, p_exhibition_id,
          coalesce(p_catalogue_number, ''), coalesce(p_note, ''))
  on conflict (catalog_id, exhibition_id) do update
     set active = true,
         -- Lo que no se manda no se borra: añadir una participación que ya
         -- existía no puede vaciar el número de catálogo que alguien
         -- investigó, porque el formulario de «Añadir» viene en blanco.
         -- Cambiarlo a vacío es editar la participación, que es otra operación.
         catalogue_number = case when btrim(excluded.catalogue_number) <> ''
                                 then excluded.catalogue_number
                                 else artwork_exhibitions.catalogue_number end,
         note             = case when btrim(excluded.note) <> ''
                                 then excluded.note
                                 else artwork_exhibitions.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.exhibit_artwork is
  'Añade la participación de una obra en una exposición, o RESTAURA la que estuviera retirada en vez de chocar contra la unicidad (RF-501, RF-517).';


-- ── Lo que la obra gana (RF-218) ────────────────────────────

alter table public.artworks
  add column exhibition_history_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.exhibition_history_status is
  'Estado de investigación del historial expositivo de la obra (RF-218). Es el caso que da nombre a la regla: una obra sin participaciones registradas no es una obra que no se expuso.';


-- ── «Sin revisar» no es «no», también en exposiciones ───────
--
-- Tercer reemplazo de la misma función: la creó la procedencia, la bibliografía
-- le añadió su bloque y este le añade el suyo. Los tres se comprueban en el
-- test, porque un `create or replace` puede comerse un bloque anterior sin que
-- nada avise — la migración que lo escribió se aplicó hace rato y su test pasa
-- igual, porque comprueba la función que hay y no la que había.
--
-- Se comprueba por las DOS puertas, como en los dos grupos anteriores: ni se
-- declara «investigado sin resultado» en una obra con participaciones activas,
-- ni se añade o restaura una participación en una obra declarada así.
--
-- `set search_path = public` se repite porque `create or replace` reemplaza la
-- definición entera y con ella su configuración.
--
-- Los `if` que miran `old` van dentro de su propio `if tg_op = 'UPDATE'` por el
-- detalle de plpgsql que las versiones anteriores documentan: en un trigger de
-- INSERT el registro `old` no está asignado, y una expresión que lo nombre falla
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
  v_exhibition_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_provenance_changed :=
      old.provenance_status is distinct from new.provenance_status;
    v_bibliography_changed :=
      old.bibliography_status is distinct from new.bibliography_status;
    v_exhibition_changed :=
      old.exhibition_history_status is distinct from new.exhibition_history_status;
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

  if new.exhibition_history_status = 'NONE_FOUND' and v_exhibition_changed then
    if exists (select 1 from public.artwork_exhibitions
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar el historial expositivo por investigado sin resultado: la obra % ya tiene participaciones registradas', new.catalog_id
        using hint = 'Retira antes las participaciones, o marca el historial como «En curso» o «Completo».';
    end if;
  end if;

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218). Cubre procedencia, bibliografía e historial expositivo; el grupo de documentación añadirá el suyo.';

-- La otra puerta. Lo que SÍ se permite, y es intencionado: participaciones en
-- una obra cuyo estado sigue en «Sin revisar». Tener un dato no es haber hecho
-- la investigación, así que la regla es de un solo sentido.
create function public.tg_artwork_exhibition_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select exhibition_history_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'El historial expositivo de la obra % consta investigado sin resultado y esta participación lo contradice', new.catalog_id
      using hint = 'Cambia antes el estado del historial expositivo a «En curso» o «Completo».';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_exhibition_status_coherent is
  'La otra puerta de RF-218: no se añade ni se restaura una participación en una obra cuyo historial expositivo consta investigado sin resultado.';

create trigger artwork_exhibition_status_coherent
  before insert or update on public.artwork_exhibitions
  for each row execute function public.tg_artwork_exhibition_status_coherent();


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Se revoca primero y se concede después, uno a uno: la plataforma concede por
-- omisión todos los privilegios de cada tabla nueva a los roles anónimo y
-- autenticado, incluido `delete` (RF-113).
--
-- Sin DELETE en ninguna de las tres: ni privilegio ni política, nunca (RF-901,
-- RF-517). Retirar una participación es un update de `active`.
--
-- Las políticas van en la migración siguiente. Hasta que existan, estas tablas
-- no las lee ni las escribe nadie con sesión: RLS activado sin política niega.

alter table public.exhibition_venues enable row level security;
alter table public.exhibitions enable row level security;
alter table public.artwork_exhibitions enable row level security;

revoke all on public.exhibition_venues from anon, authenticated;
revoke all on public.exhibitions from anon, authenticated;
revoke all on public.artwork_exhibitions from anon, authenticated;

grant select, insert, update on public.exhibition_venues to authenticated;
grant select, insert, update on public.exhibitions to authenticated;
grant select, insert, update on public.artwork_exhibitions to authenticated;

-- Explícito, como en 20260801140000 y en los tres grupos anteriores: en esta
-- plataforma una función nueva nace con EXECUTE para PUBLIC pese al `alter
-- default privileges`, y quien lo caza es `function_privileges.test.sql`.
revoke all on function public.tg_exhibition_year_from_dates() from public;
revoke all on function public.tg_exhibition_venue_deactivation() from public;
revoke all on function public.tg_artwork_exhibition_status_coherent() from public;
-- `create or replace` conserva los privilegios de la función anterior, pero se
-- repite para que la migración no dependa de ese detalle.
revoke all on function public.tg_artwork_research_status_coherent() from public;
revoke all on function public.tg_party_deactivation() from public;

revoke all on function public.exhibit_artwork(text, uuid, text, text) from public, anon;
grant execute on function public.exhibit_artwork(text, uuid, text, text) to authenticated;
