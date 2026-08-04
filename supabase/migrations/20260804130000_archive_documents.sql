-- ============================================================
-- Archivo y documentación relacionada
-- (RF-515, RF-516, RF-408, RF-218, RF-517; ADR-006 aplicado por segunda vez).
--
-- Es la tabla 9 del esquema de campos v11 —«Archivo/Documentación»—, la última
-- de las nueve que faltaba, más dos maestras que v11 no tiene y las dos tablas
-- puente que sustituyen a sus dos claves ajenas sueltas.
--
-- Lo que este grupo cambia sobre v11, y por qué:
--
--   • `tipo_documento` pasa de «Selección abierta» a MAESTRA con clave
--     sustituta. El propio v11 la declara abierta —libro, fotografía, carta,
--     recorte de prensa, cartel, díptico…— así que el documento fuente ya pide
--     una lista que crece. Es el caso de `artwork_types` sin adaptación: la
--     usuaria añade «telegrama» sin desplegar nada y el código no mira nunca el
--     valor.
--   • `fondo_serie` pasa de texto jerárquico a ÁRBOL. v11 lo define como
--     «Agrupación archivística (fondo → serie → subserie, si aplica)», que es
--     literalmente la forma que tenía `ubicacion_fisica` antes de ADR-006: una
--     jerarquía metida dentro de un texto con una convención que hay que
--     recordar. Ese error ya se pagó una vez en este proyecto y aquí cuesta cero
--     evitarlo, porque no hay ni un documento catalogado. Nace NULABLE: si la
--     clasificación archivística no se adopta nunca, la tabla se queda vacía y
--     no estorba a nadie.
--   • `ubicacion_fisica` deja de ser texto y apunta al árbol de lugares que YA
--     existe. Una caja de cartas está en el mismo edificio que los cuadros, y un
--     segundo árbol para lo mismo sería la duplicación que ADR-006 vino a
--     quitar.
--   • `artista` deja de ser obligatorio. v11 lo declara Selección entre los dos
--     artistas, y un recorte sobre una colectiva de los dos —o un documento de
--     contexto que no es de ninguno— no puede elegir.
--   • Las relaciones con obras y con exposiciones son TABLAS PUENTE (RF-516) y
--     no las dos claves ajenas de v11 (`obra_relacionada`,
--     `exposicion_relacionada`). Con aquel modelo, un recorte de prensa que
--     menciona tres obras obliga a triplicar la ficha y con ella el PDF subido,
--     que es el caso normal y no el raro.
--   • NO se crea la columna `digitalizado` (Sí/No): es `file_path is not null`.
--     Una bandera que puede contradecir al fichero que tiene al lado es una
--     bandera que un día miente.
--
-- SOBRE EL FICHERO DIGITALIZADO Y EL BUCKET. No hace falta política nueva: el
-- fichero va al bucket privado `obras` bajo un prefijo propio, y las políticas
-- de `storage.objects` que ya existen (`bucket_id = 'obras'` y `can_read()` /
-- `can_edit()`) lo cubren tal cual, que es el criterio de RF-110 y RNF-111.
-- Comprobado el límite de tamaño del bucket, que este grupo tenía que mirar de
-- verdad: son 62 914 560 bytes (60 MiB) por fichero, y NO se toca aquí. Un
-- expediente escaneado en un solo PDF, que es lo que RF-408 recomienda para los
-- documentos multipágina, cabe holgado en blanco y negro y se puede pasar en
-- color a partir de unas decenas de páginas. Subir el límite, mandar el
-- digitalizado a B2 como los másteres o aceptar partir los expedientes muy
-- largos es una decisión de la propietaria y no de esta migración, y el número
-- no se copia a ninguna restricción de esta tabla: sería una segunda fuente de
-- verdad de un ajuste de la plataforma, que un día diría lo contrario que la
-- plataforma.
--
-- Las POLÍTICAS RLS de las cinco tablas van en la migración siguiente. Lo que SÍ
-- se hace aquí es activar RLS y revocar los privilegios, porque una tabla que
-- existe un solo despliegue sin RLS es una tabla publicada. Con RLS activado y
-- sin ninguna política, la tabla está cerrada para todo el mundo salvo el acceso
-- administrativo directo, que es el estado seguro para esperar.
-- ============================================================


-- ── El vocabulario de tipos de documento (RF-515) ───────────
--
-- Patrón de `artwork_types` tras ADR-007 y de `publication_types`: clave
-- sustituta, el nombre como atributo único por `place_key`, papelera y autoría
-- de alta. Sin `updated_at`/`updated_by` y sin `restored_at`, como las demás
-- maestras de vocabulario: es una lista que cuelga de las fichas, no una ficha
-- con pantalla de papelera propia (RF-901 enumera las que sí la tienen).

create table public.document_types (
  id uuid primary key default gen_random_uuid(),

  -- Tal cual se escribe, con sus mayúsculas y sus tildes. Lo que se normaliza es
  -- la clave de comparación, no el dato.
  name text not null,

  -- RF-901: nada se borra, se retira.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- Un tipo en blanco no clasifica nada, y uno con espacios alrededor rompería
  -- la comparación de duplicados sin que se vea en pantalla.
  constraint document_types_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.document_types is
  'Vocabulario abierto de tipos de documento de archivo (RF-515), con clave sustituta (ADR-007): renombrar es una fila. Nada se borra, se retira.';

create unique index document_types_name_unique
  on public.document_types (public.place_key(name));

create index document_types_active_idx on public.document_types (active);

-- Autoría y papelera con la función genérica de RF-804, no con una quinta copia
-- de `tg_artwork_type_authorship`.
create trigger document_type_row_audit
  before insert or update on public.document_types
  for each row execute function public.tg_row_audit();

-- La siembra, que es lo que hace que la interfaz sirva el primer día: una
-- maestra vacía deja el selector en blanco y obliga a inventar el vocabulario
-- mientras se cataloga. Son exactamente los diez valores que v11 enumera en su
-- tabla 9. Ampliar la lista no requiere migración: ese es el motivo de que sea
-- una maestra.
--
-- `created_by` queda nulo a propósito: dentro de una migración `auth.uid()` no
-- es nadie, y estas filas no las creó ninguna persona.
insert into public.document_types (name) values
  ('Libro'),
  ('Publicación'),
  ('Fotografía'),
  ('Carta'),
  ('Recorte de prensa'),
  ('Manuscrito'),
  ('Cartel'),
  ('Díptico'),
  ('Folleto'),
  ('Nota de prensa');

-- Un tipo que todavía clasifica documentos no se retira, con la misma regla que
-- `tg_publication_type_deactivation` y `tg_artwork_type_deactivation`: retirarlo
-- no lo retira, deja el archivo apuntando a algo que la interfaz ya no ofrece.
-- Un documento en la papelera no cuenta, como en las demás: exigir vaciar la
-- papelera antes de retirar un tipo sería hacer que la papelera estorbe.
create function public.tg_document_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.archive_documents
                  where document_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de documento que todavía usan documentos del archivo'
      using hint = 'Cambia antes el tipo de esos documentos.';
  end if;
  return new;
end $$;

comment on function public.tg_document_type_deactivation is
  'Impide retirar un tipo de documento que todavía clasifica documentos activos (RF-515).';

create trigger document_type_deactivation
  before update of active on public.document_types
  for each row execute function public.tg_document_type_deactivation();


-- ── La clasificación archivística, como árbol (RF-515) ──────
--
-- Patrón de `physical_places` (ADR-006), y por el mismo motivo: el nombre se
-- guarda tal cual se escribe y lo que se normaliza es la clave de comparación;
-- `parent_id` es mutable porque reorganizar un fondo es una operación normal; y
-- nada se borra.
--
-- Es la más discutible de las maestras nuevas y por eso nace NULABLE del lado
-- del documento: si la clasificación archivística no se adopta, esta tabla se
-- queda vacía y ningún documento la echa de menos.

create table public.archive_series (
  id uuid primary key default gen_random_uuid(),

  -- Nulo es un fondo (la raíz). MUTABLE a propósito: descubrir que lo que se
  -- anotó como serie es en realidad una subserie de otra tiene que ser un
  -- update, no un rehacer. `restrict` porque un nodo con hijos no se retira: se
  -- vacía primero.
  parent_id uuid references public.archive_series (id) on delete restrict,

  name text not null,

  -- RF-901: nada se borra, se retira. Sin `restored_at`, como el árbol de
  -- lugares: restaurar deja el nodo como si nunca se hubiera retirado, y
  -- `tg_row_audit` distingue ese caso por la ausencia de la columna.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  constraint archive_series_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.archive_series is
  'Árbol de clasificación archivística: fondo → serie → subserie (RF-515). Es el `fondo_serie` de v11, que era un texto jerárquico, resuelto con la forma que ADR-006 ya fijó para los lugares. Nada se borra, se retira.';

comment on column public.archive_series.parent_id is
  'Nulo es un fondo (raíz). Mutable: reorganizar la clasificación es una operación normal y no toca ningún documento.';

-- Dos hermanos no pueden llamarse igual, comparado sin tildes ni mayúsculas. Son
-- dos índices porque en SQL un nulo no es igual a otro nulo: sin el parcial, dos
-- fondos homónimos pasarían.
create unique index archive_series_root_unique
  on public.archive_series (public.place_key(name))
  where parent_id is null;

create unique index archive_series_siblings_unique
  on public.archive_series (parent_id, public.place_key(name))
  where parent_id is not null;

create index archive_series_parent_idx on public.archive_series (parent_id);
create index archive_series_active_idx on public.archive_series (active);

-- Sin ciclos. Una serie dentro de su propia subserie deja el árbol
-- irrecuperable: ninguna consulta recursiva termina y el nodo desaparece de la
-- jerarquía sin haberse borrado. Es barato de comprobar y caro de descubrir, y
-- es el mismo cinturón de 100 saltos de `tg_physical_place_no_cycle`: si el
-- árbol ya estuviera corrupto, esto para en vez de colgarse.
create function public.tg_archive_series_no_cycle()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_ancestor uuid := new.parent_id;
  v_hops int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Una serie no puede estar dentro de sí misma';
  end if;

  while v_ancestor is not null loop
    if v_ancestor = new.id then
      raise exception 'Ese movimiento metería la serie dentro de una de sus subseries';
    end if;
    v_hops := v_hops + 1;
    if v_hops > 100 then
      raise exception 'La clasificación archivística tiene un ciclo';
    end if;
    select parent_id into v_ancestor from public.archive_series where id = v_ancestor;
  end loop;

  return new;
end $$;

comment on function public.tg_archive_series_no_cycle is
  'Impide que la clasificación archivística se cierre sobre sí misma (RF-515), con el cinturón de 100 saltos de ADR-006.';

create trigger archive_series_no_cycle
  before insert or update of parent_id on public.archive_series
  for each row execute function public.tg_archive_series_no_cycle();

create trigger archive_series_row_audit
  before insert or update on public.archive_series
  for each row execute function public.tg_row_audit();

-- Una serie con contenido no se retira: primero se vacía. Vale para las
-- subseries y para los documentos, igual que en el árbol de lugares.
create function public.tg_archive_series_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.archive_series
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar una serie que todavía contiene otras series'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;

    if exists (select 1 from public.archive_documents
                where archive_series_id = new.id and active) then
      raise exception 'No se puede retirar una serie que todavía tiene documentos dentro'
        using hint = 'Mueve antes los documentos a otra serie.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_archive_series_deactivation is
  'Impide retirar una serie archivística con subseries o con documentos activos dentro (RF-515).';

create trigger archive_series_deactivation
  before update of active on public.archive_series
  for each row execute function public.tg_archive_series_deactivation();


-- ── El documento de archivo ─────────────────────────────────

create table public.archive_documents (
  -- Clave sustituta (ADR-007). La etiqueta de la carpeta va en la columna
  -- siguiente y no es la identidad de la fila: ver el porqué allí.
  id uuid primary key default gen_random_uuid(),

  -- El `id_documento` de v11 (`AR-ARCH-0001`), y aquí está la diferencia con
  -- `catalog_id`: aquella es una etiqueta pegada a una obra real y por eso es la
  -- clave y no se edita (RF-204); esta no está pegada todavía a nada, y una
  -- clasificación archivística se reorganiza. Separarla de la identidad es lo
  -- que permite corregirla sin migración.
  --
  --   • NULA PERMITIDA: un recorte que se anota antes de archivarlo no tiene
  --     signatura, y obligar a inventarla llenaría el archivo de códigos que
  --     nadie eligió.
  --   • EDITABLE, que es justo lo que no sería siendo clave primaria.
  --   • ÚNICA, comparada como el resto de nombres del esquema: dos signaturas
  --     que solo difieren en mayúsculas son la misma signatura.
  archive_code text,

  -- NULO PERMITIDO, al contrario que en v11, que lo declaraba Selección
  -- obligatoria entre los dos artistas: un recorte de prensa sobre una colectiva
  -- de los dos no pertenece a un solo fondo, y un documento de contexto no es de
  -- ninguno. Obligar a elegir habría metido un dato falso en la mitad de las
  -- fichas de archivo.
  artist_fund public.artist_fund,

  -- Nulo es «sin clasificar todavía», que es una respuesta legítima mientras el
  -- documento se anota de una fotocopia. `restrict` por lo mismo que en el resto
  -- del esquema: nadie tiene DELETE, y si alguna vez se borrara una fila a mano
  -- esto avisa en vez de dejar documentos apuntando al vacío.
  document_type_id uuid references public.document_types (id) on delete restrict,

  -- El `titulo_descripcion` de v11: título o descripción breve. Es lo único
  -- obligatorio de la ficha, porque un documento sin nada que lo nombre no se
  -- puede volver a encontrar.
  title text not null,

  -- La clasificación archivística, opcional. Ver la nota de la tabla: nace
  -- nulable a propósito.
  archive_series_id uuid references public.archive_series (id) on delete restrict,

  -- ── La fecha, con la forma estructurada de ADR-004 ────────
  -- La misma que en los eslabones de procedencia, y por lo mismo: se repiten
  -- cinco columnas a cambio de heredar el analizador de fechas del frontend, la
  -- columna generada y los tests ya escritos. La alternativa era el `Texto` de
  -- v11, por el que no se puede preguntar.
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

  -- Dónde está el papel. REUTILIZA el árbol de lugares que ya existe (ADR-006):
  -- una caja de cartas está en el mismo edificio que los cuadros, y un segundo
  -- árbol para lo mismo sería la duplicación que este diseño evita. Nulo es
  -- «todavía sin sitio», como en las obras.
  physical_place_id uuid references public.physical_places (id) on delete restrict,

  -- ── El fichero digitalizado (RF-408) ──────────────────────
  -- Cuatro columnas y NO una bandera `digitalizado`: la respuesta a «¿está
  -- digitalizado?» es `file_path is not null`, y una bandera al lado del fichero
  -- acaba contradiciéndolo.
  --
  -- Un fichero por fila, sin los tres niveles de las fotografías: RF-413 se
  -- retiró por sobreingeniería y para los documentos multipágina RF-408 fija un
  -- único PDF con todas las páginas, no una fila por página.
  file_path text,
  file_size_bytes bigint,
  mime_type text,
  uploaded_at timestamptz,

  note text not null default '',

  -- RF-804: trazabilidad completa, sellada por `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 y RF-902: el documento es una de las fichas que el requisito enumera,
  -- así que lleva papelera completa y la restauración NO borra la traza de la
  -- baja anterior.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- Sin título no hay documento. NO se exige además que esté recortado, como en
  -- la bibliografía y en las exposiciones: aquí no hay clave de comparación que
  -- un espacio pueda romper, y una descripción se pega de un PDF.
  constraint archive_documents_title_not_blank check (btrim(title) <> ''),

  -- Si hay signatura, que sea una signatura: recortada y no vacía. Una cadena de
  -- espacios pasaría por código y sería un hueco con índice único.
  constraint archive_documents_code_shape check (
    archive_code is null
    or (archive_code = btrim(archive_code) and archive_code <> '')
  ),

  -- Un año fuera de rango plausible es una errata, no una fecha (ADR-004).
  constraint archive_documents_plausible_years check (
    (start_year is null or start_year between 1000 and 2100)
    and (end_year is null or end_year between 1000 and 2100)
  ),

  -- Como en los eslabones de procedencia y al contrario que en
  -- `artworks_coherent_range`: aquí `>=`, porque una carpeta de correspondencia
  -- de 1985 abierta y cerrada el mismo año es un rango real. Y un final sin
  -- principio es media fecha: se rechaza, porque una comparación con nulo no es
  -- falsa y sin esta forma se colaría.
  constraint archive_documents_coherent_range check (
    end_year is null or (start_year is not null and end_year >= start_year)
  ),

  -- Las banderas hablan de un año: sin año no hay nada que aproximar ni que
  -- poner en duda («[?]» a secas no dice nada).
  constraint archive_documents_flags_require_year check (
    start_year is not null or (not approximate_date and not unconfirmed_date)
  ),

  -- Todo o nada, como la copia corregida de una fotografía: media descripción de
  -- un fichero no existe. Una ruta sin tamaño no se puede ofrecer con su peso, y
  -- un tamaño sin ruta es un fichero que nadie puede bajar.
  constraint archive_documents_file_all_or_nothing check (
    num_nonnulls(file_path, file_size_bytes, mime_type, uploaded_at) in (0, 4)
  ),

  -- Un fichero de cero bytes es un fallo de subida disfrazado de documento
  -- digitalizado.
  constraint archive_documents_file_size_positive check (
    file_size_bytes is null or file_size_bytes > 0
  ),

  constraint archive_documents_file_path_shape check (
    file_path is null or (file_path = btrim(file_path) and file_path <> '')
  ),

  constraint archive_documents_mime_type_shape check (
    mime_type is null or (mime_type = btrim(mime_type) and mime_type <> '')
  )
);

comment on table public.archive_documents is
  'Documentación de archivo sobre los artistas y sus exposiciones que no es obra (tabla 9 del esquema de campos v11). Se relaciona con obras y con exposiciones por tablas puente (RF-516). Nada se borra, se retira.';

comment on column public.archive_documents.archive_code is
  'Signatura de la carpeta («AR-ARCH-0001»). Única, opcional y EDITABLE, al contrario que la clave de catalogación de una obra: esta no está pegada a nada del mundo y una clasificación archivística se reorganiza.';
comment on column public.archive_documents.artist_fund is
  'Fondo al que pertenece el documento. Nulo permitido, al contrario que en v11: un recorte sobre una colectiva de los dos artistas no pertenece a uno solo.';
comment on column public.archive_documents.archive_series_id is
  'Nodo del árbol de clasificación archivística (RF-515). Nulo es «sin clasificar», que también es una respuesta.';
comment on column public.archive_documents.physical_place_id is
  'Dónde está el papel, en el MISMO árbol de lugares que las obras (ADR-006): una caja de cartas está en el mismo edificio que los cuadros.';
comment on column public.archive_documents.date_text is
  'Generada: se compone de los campos estructurados (o de date_note si existe). No se escribe nunca directamente (ADR-004).';
comment on column public.archive_documents.file_path is
  'Ruta del fichero digitalizado en el bucket privado `obras` (RF-408, RF-110). No hay columna «digitalizado»: es esta ruta, que no puede mentir. Para un documento multipágina, un único PDF.';
comment on column public.archive_documents.file_size_bytes is
  'Tamaño del fichero. El bucket limita hoy a 60 MiB por fichero; el número no se copia aquí para no tener dos fuentes de verdad de un ajuste de la plataforma.';

-- Única por clave de comparación, y solo donde hay signatura: `place_key` es
-- `strict`, así que devuelve nulo para los documentos sin código y el índice los
-- ignora — que es lo que permite tener muchos sin signatura y ninguno duplicado.
create unique index archive_documents_code_unique
  on public.archive_documents (public.place_key(archive_code));

-- SIN unicidad sobre el título, a propósito y como en la bibliografía y las
-- exposiciones: tres recortes distintos se describen igual («Nota de prensa de
-- la inauguración»). Los duplicados se resuelven por revisión (RF-909).

create index archive_documents_type_idx
  on public.archive_documents (document_type_id);
create index archive_documents_series_idx
  on public.archive_documents (archive_series_id);
create index archive_documents_place_idx
  on public.archive_documents (physical_place_id);
create index archive_documents_active_idx on public.archive_documents (active);

create trigger archive_document_row_audit
  before insert or update on public.archive_documents
  for each row execute function public.tg_row_audit();


-- ── Un lugar con documentos dentro tampoco se retira ────────
--
-- Es el guardarraíl a medio aplicar más fácil de olvidar de todo este diseño:
-- `tg_physical_place_deactivation` comprueba hoy los lugares hijos y las obras
-- dentro, y sin este reemplazo se podría retirar el edificio donde está el
-- archivo entero sin que nada avisara.
--
-- `create or replace` reemplaza la definición ENTERA, así que los dos bloques
-- anteriores se repiten aquí literalmente y el test comprueba los tres: un
-- reemplazo que se coma uno de ellos no rompe nada visible el día que se
-- escribe. `set search_path = public` se repite por lo mismo, porque el
-- reemplazo se lleva también la configuración de la función.
create or replace function public.tg_physical_place_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true then
    if exists (select 1 from public.physical_places
                where parent_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía contiene otros lugares'
        using hint = 'Retira o mueve antes lo que hay dentro.';
    end if;

    if exists (select 1 from public.artworks
                where physical_place_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía tiene obras dentro'
        using hint = 'Mueve antes las obras a otro sitio.';
    end if;

    if exists (select 1 from public.archive_documents
                where physical_place_id = new.id and active) then
      raise exception 'No se puede retirar un lugar que todavía tiene documentos de archivo dentro'
        using hint = 'Mueve antes esos documentos a otro sitio.';
    end if;
  end if;
  return new;
end $$;

comment on function public.tg_physical_place_deactivation is
  'Impide retirar un lugar que todavía contiene lugares, obras activas o documentos de archivo activos (ADR-006, RF-215, RF-515).';


-- ── El documento y la obra (RF-516) ─────────────────────────
--
-- Tabla puente, y no la clave ajena `obra_relacionada` de v11: con una sola
-- referencia por lado, un recorte de prensa que menciona tres obras obliga a
-- triplicar la ficha y con ella el PDF subido. Y el propio v11 fija el criterio
-- en sus notas de implementación: cuando un dato depende de la combinación de
-- dos entidades, se modela como tabla propia.

create table public.artwork_documents (
  id uuid primary key default gen_random_uuid(),

  -- Misma forma que `images`, `provenance_events`, `artwork_bibliography` y
  -- `artwork_exhibitions`: `on update cascade` porque el identificador de
  -- catalogación es texto, y sin `on delete` porque de `artworks` no se borra
  -- nada (RF-901).
  catalog_id text not null references public.artworks (catalog_id) on update cascade,

  document_id uuid not null references public.archive_documents (id) on delete restrict,

  -- Qué dice ese documento de ESTA obra: «reproducida en la página 3», «la obra
  -- aparece al fondo de la fotografía». Distinto de la nota del documento, que
  -- habla del documento como conjunto.
  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, que REVISA RF-903, igual que en las otras dos puentes: nada de este
  -- esquema se borra nunca, sin excepciones que recordar. Sin `restored_at`:
  -- esta fila se restaura desde la ficha de la que cuelga y no desde una
  -- pantalla de papelera, así que volver a añadirla la deja como si nunca se
  -- hubiera retirado.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- Un documento que menciona dos veces la misma obra es un vínculo con una nota
  -- más larga, no dos filas. La restricción cubre también los vínculos
  -- retirados, que es lo que permite que volver a añadir restaure en vez de
  -- duplicar (ver `document_artwork`).
  constraint artwork_documents_unique unique (catalog_id, document_id)
);

comment on table public.artwork_documents is
  'Vínculo entre un documento de archivo y una obra (RF-516). Tabla puente y no la clave ajena de v11: un recorte que menciona tres obras no puede obligar a triplicar el PDF. Nada se borra (RF-517).';

-- El bloque «Documentación relacionada» de la ficha de obra usa el índice único,
-- que ya empieza por `catalog_id`; este sirve al bloque «Relacionado con» de la
-- ficha del documento (RF-310).
create index artwork_documents_document_idx
  on public.artwork_documents (document_id);

create trigger artwork_document_row_audit
  before insert or update on public.artwork_documents
  for each row execute function public.tg_row_audit();


-- ── El documento y la exposición (RF-516) ───────────────────
--
-- El cartel, el díptico o el folleto de una muestra documentan la exposición en
-- su conjunto y no una obra concreta, que es el caso que v11 añadió en v4 con
-- `exposicion_relacionada`. Aquí es puente por lo mismo que la anterior: una
-- nota de prensa que cubre dos muestras es una fila y dos vínculos.

create table public.exhibition_documents (
  id uuid primary key default gen_random_uuid(),

  exhibition_id uuid not null references public.exhibitions (id) on delete restrict,
  document_id uuid not null references public.archive_documents (id) on delete restrict,

  note text not null default '',

  -- RF-804.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, y sin `restored_at` por lo mismo que la puente anterior.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  constraint exhibition_documents_unique unique (exhibition_id, document_id)
);

comment on table public.exhibition_documents is
  'Vínculo entre un documento de archivo y una exposición (RF-516): cartel, díptico, folleto o nota de prensa de la muestra. Nada se borra (RF-517).';

create index exhibition_documents_document_idx
  on public.exhibition_documents (document_id);

create trigger exhibition_document_row_audit
  before insert or update on public.exhibition_documents
  for each row execute function public.tg_row_audit();


-- ── Volver a vincular un documento retirado lo RESTAURA ─────
--
-- Mismo caso y misma solución que `cite_artwork` y `exhibit_artwork`: con la
-- unicidad cubriendo también los vínculos retirados, un `insert` de una pareja
-- que está en la papelera choca contra el índice, y la interfaz convertiría un
-- «Añadir» en una violación de unicidad incomprensible.
--
-- Funciones y no un trigger `before insert` que devuelva `null`: un trigger así
-- deja el `insert` sin filas afectadas y quien llame desde la API pidiendo la
-- fila creada no recibirá ninguna. La función devuelve siempre la fila.
--
-- Sin SECURITY DEFINER: las políticas siguen en vigor y un Lector no escribe
-- aquí. La comprobación explícita solo convierte el silencioso «no ha cambiado
-- nada» en un error legible, y en español porque lo lee ella.

create function public.document_artwork(
  p_catalog_id text,
  p_document_id uuid,
  p_note text default ''
)
returns public.artwork_documents
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_documents;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para vincular un documento con una obra';
  end if;

  insert into public.artwork_documents (catalog_id, document_id, note)
  values (p_catalog_id, p_document_id, coalesce(p_note, ''))
  on conflict (catalog_id, document_id) do update
     set active = true,
         -- Lo que no se manda no se borra: volver a añadir un vínculo que ya
         -- existía no puede vaciar la nota que alguien escribió, porque el
         -- formulario de «Añadir» viene en blanco. Vaciarla es editar el
         -- vínculo, que es otra operación.
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else artwork_documents.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.document_artwork is
  'Vincula un documento de archivo con una obra, o RESTAURA el vínculo que estuviera retirado en vez de chocar contra la unicidad (RF-516, RF-517).';

create function public.document_exhibition(
  p_exhibition_id uuid,
  p_document_id uuid,
  p_note text default ''
)
returns public.exhibition_documents
language plpgsql
set search_path = public
as $$
declare
  v_row public.exhibition_documents;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para vincular un documento con una exposición';
  end if;

  insert into public.exhibition_documents (exhibition_id, document_id, note)
  values (p_exhibition_id, p_document_id, coalesce(p_note, ''))
  on conflict (exhibition_id, document_id) do update
     set active = true,
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else exhibition_documents.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.document_exhibition is
  'Vincula un documento de archivo con una exposición, o RESTAURA el vínculo que estuviera retirado (RF-516, RF-517).';


-- ── Lo que la obra gana (RF-218) ────────────────────────────

alter table public.artworks
  add column documentation_status public.research_status not null default 'UNREVIEWED';

comment on column public.artworks.documentation_status is
  'Estado de investigación de la documentación relacionada de la obra (RF-218). Una obra sin documentos vinculados no es una obra de la que no se conserve nada: es una obra cuyo archivo nadie ha mirado todavía.';


-- ── «Sin revisar» no es «no», también en documentación ──────
--
-- Cuarto y último reemplazo de la misma función: la creó la procedencia, la
-- bibliografía y las exposiciones le añadieron el suyo y este cierra los cuatro
-- bloques documentales de RF-218. Los cuatro se comprueban en el test, porque un
-- `create or replace` puede comerse un bloque anterior sin que nada avise — la
-- migración que lo escribió se aplicó hace rato y su test sigue pasando, porque
-- comprueba la función que hay y no la que había.
--
-- Se comprueba por las DOS puertas, como en los tres grupos anteriores: ni se
-- declara «investigado sin resultado» en una obra con documentos vinculados, ni
-- se vincula un documento a una obra declarada así.
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
  v_documentation_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_provenance_changed :=
      old.provenance_status is distinct from new.provenance_status;
    v_bibliography_changed :=
      old.bibliography_status is distinct from new.bibliography_status;
    v_exhibition_changed :=
      old.exhibition_history_status is distinct from new.exhibition_history_status;
    v_documentation_changed :=
      old.documentation_status is distinct from new.documentation_status;
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

  if new.documentation_status = 'NONE_FOUND' and v_documentation_changed then
    if exists (select 1 from public.artwork_documents
                where catalog_id = new.catalog_id and active) then
      raise exception 'No se puede dar la documentación por investigada sin resultado: la obra % ya tiene documentos vinculados', new.catalog_id
        using hint = 'Retira antes esos vínculos, o marca la documentación como «En curso» o «Completa».';
    end if;
  end if;

  return new;
end $$;

comment on function public.tg_artwork_research_status_coherent is
  'Impide declarar un bloque documental «investigado sin resultado» cuando ya tiene filas debajo (RF-218). Cubre los cuatro bloques: procedencia, bibliografía, historial expositivo y documentación.';

-- La otra puerta. Lo que SÍ se permite, y es intencionado: documentos vinculados
-- a una obra cuyo estado sigue en «Sin revisar». Tener un dato no es haber hecho
-- la investigación, así que la regla es de un solo sentido.
create function public.tg_artwork_document_status_coherent()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active
     and (select documentation_status from public.artworks
           where catalog_id = new.catalog_id) = 'NONE_FOUND' then
    raise exception 'La documentación de la obra % consta investigada sin resultado y este vínculo la contradice', new.catalog_id
      using hint = 'Cambia antes el estado de la documentación a «En curso» o «Completa».';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_document_status_coherent is
  'La otra puerta de RF-218: no se vincula ni se restaura un documento en una obra cuya documentación consta investigada sin resultado.';

create trigger artwork_document_status_coherent
  before insert or update on public.artwork_documents
  for each row execute function public.tg_artwork_document_status_coherent();


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Se revoca primero y se concede después, uno a uno: la plataforma concede por
-- omisión todos los privilegios de cada tabla nueva a los roles anónimo y
-- autenticado, incluido `delete` (RF-113).
--
-- Sin DELETE en ninguna de las cinco: ni privilegio ni política, nunca (RF-901,
-- RF-517). Retirar un documento o un vínculo es un update de `active`.
--
-- Las políticas van en la migración siguiente. Hasta que existan, estas tablas
-- no las lee ni las escribe nadie con sesión: RLS activado sin política niega.

alter table public.document_types enable row level security;
alter table public.archive_series enable row level security;
alter table public.archive_documents enable row level security;
alter table public.artwork_documents enable row level security;
alter table public.exhibition_documents enable row level security;

revoke all on public.document_types from anon, authenticated;
revoke all on public.archive_series from anon, authenticated;
revoke all on public.archive_documents from anon, authenticated;
revoke all on public.artwork_documents from anon, authenticated;
revoke all on public.exhibition_documents from anon, authenticated;

grant select, insert, update on public.document_types to authenticated;
grant select, insert, update on public.archive_series to authenticated;
grant select, insert, update on public.archive_documents to authenticated;
grant select, insert, update on public.artwork_documents to authenticated;
grant select, insert, update on public.exhibition_documents to authenticated;

-- Explícito, como en 20260801140000 y en los cuatro grupos anteriores: en esta
-- plataforma una función nueva nace con EXECUTE para PUBLIC pese al `alter
-- default privileges`, y quien lo caza es `function_privileges.test.sql`.
revoke all on function public.tg_document_type_deactivation() from public;
revoke all on function public.tg_archive_series_no_cycle() from public;
revoke all on function public.tg_archive_series_deactivation() from public;
revoke all on function public.tg_artwork_document_status_coherent() from public;
-- `create or replace` conserva los privilegios de la función anterior, pero se
-- repite para que la migración no dependa de ese detalle.
revoke all on function public.tg_artwork_research_status_coherent() from public;
revoke all on function public.tg_physical_place_deactivation() from public;

revoke all on function public.document_artwork(text, uuid, text) from public, anon;
grant execute on function public.document_artwork(text, uuid, text) to authenticated;
revoke all on function public.document_exhibition(uuid, uuid, text) from public, anon;
grant execute on function public.document_exhibition(uuid, uuid, text) to authenticated;
