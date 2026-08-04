-- ============================================================
-- Enlaces a sitios externos (RF-1401 a RF-1408).
--
-- Hoy una dirección web que documenta una obra solo tiene un sitio donde caber:
-- dentro de una nota. Ahí no se puede pulsar, no se puede buscar, no se puede
-- comprobar y no se puede atribuir a la fotografía que salió de ella. Y no es
-- hipotético: dos notas de inventario del volcado llevan dentro la dirección de
-- la ficha del MACVA de la que se tomaron todos los datos, imagen incluida.
--
-- ── POR QUÉ UNA TABLA PROPIA Y NO UNA COLUMNA EN OTRA ───────
--
-- NO una columna `url` en `archive_documents`. No es cuestión de forma sino de
-- naturaleza. Un documento del archivo es un fichero del que somos custodios:
-- vive en el bucket privado, se sirve con URL firmada (RF-110, RNF-111), tiene
-- tamaño y tipo MIME, y la regla 3-2-1 de RNF-112 se le aplica. Un enlace es lo
-- contrario: contenido de un tercero que puede cambiar, mudarse o desaparecer
-- sin avisar, del que no se puede hacer copia de seguridad y cuyo ciclo de vida
-- es la caducidad. Fundirlos convertiría el `check` de todo-o-nada del fichero
-- en una disyunción de dos conjuntos de columnas ajenos entre sí, dejaría la
-- mitad de las columnas nulas en cada caso, obligaría a que cada regla de
-- permanencia del documento llevara escrita la cláusula «salvo si es un enlace»,
-- y arrastraría vocabularios que no aplican: una página de museo no tiene tipo
-- documental ni serie archivística.
--
-- NO una tabla puente. El glosario del proyecto define tabla puente como la que
-- modela un dato que depende de la combinación de dos entidades y no pertenece
-- de forma natural a ninguna de las dos por separado. El título de un enlace, su
-- tipo, su nota y su estado de comprobación pertenecen al enlace, y el enlace
-- pertenece a una ficha: el criterio no aplica. La puente de documentos existe
-- para no duplicar un PDF de 8 MB entre tres obras; una URL de ochenta
-- caracteres no se duplica, se escribe otra vez, y cada copia gana su propia
-- nota. El caso que sí la justificaría —el recorte de prensa de una colectiva,
-- repetido en quince obras— se resuelve anclando el enlace A LA EXPOSICIÓN, que
-- además es el dato honesto: el artículo es sobre la exposición y no sobre cada
-- cuadro. Esa ancla llega en su propia migración, cuando el catálogo razonado
-- documental esté cerrado.
--
-- NO clave ajena polimórfica. En PostgreSQL no se puede declarar: dejaría entrar
-- filas apuntando a obras inexistentes, no se podría expresar el `restrict` y la
-- política de SELECT tendría que ramificar por tipo sin poder apoyarse en la
-- política de la tabla padre. Se usa el ARCO EXCLUSIVO: una columna de clave
-- ajena declarada por ancla, nulables, y un `check` de que hay exactamente una
-- no nula. Coste aceptado y escrito: añadir un ancla obliga a rehacer el `check`
-- en una migración nueva.
--
-- ── LO QUE ESTA MIGRACIÓN NO LLEVA, Y POR QUÉ ───────────────
--
-- Escrito para que no se añada dentro de seis meses sin argumento:
--
--  * Ni `sort_order`: son cuatro enlaces por ficha, el orden es por tipo y por
--    fecha de alta, y reordenar a mano no lo ha pedido nadie.
--  * Ni publicación en `supabase_realtime`: la propia migración de vistas en
--    vivo dice que publicar de más no es gratis, y un enlace lo añade la misma
--    persona que está mirando la ficha. Añadirlo después es una línea.
--  * Ni entrada en la papelera (RF-906): un enlace no es una de las seis fichas
--    con identificador propio de RF-901.
--  * Ni normalización de URL, ni rastreador, ni descarga de icono, título o
--    previsualización del sitio enlazado — eso filtraría a un tercero qué obra
--    se está catalogando y desde qué dirección, y convertiría un enlace en
--    contenido incrustado (RF-1404).
--  * Ni acortadores, ni generados ni resueltos: un acortador esconde a dónde va
--    el enlace, que es lo contrario de enseñar el dominio.
--  * Ni *share target* de la PWA. Sería el gesto perfecto en el móvil y es una
--    entrega en sí misma —manifiesto, ruta de aterrizaje y selector de obra—;
--    queda anotado como lo primero que valorar si añadir enlaces se vuelve
--    frecuente.
-- ============================================================


-- ── Dos enumerados, y por qué no son tablas maestras ────────
--
-- El criterio que separa un enumerado de una maestra en este esquema es quién es
-- dueño de las entradas. Los lugares, los tipos de obra y las series son tablas
-- porque la catalogadora las inventa y las renombra; estos los escribe el
-- esquema, y nadie renombra «Prensa» ni la reorganiza en un árbol. Por eso no
-- necesitan pantalla de mantenimiento.

create type public.external_link_type as enum (
  'MUSEUM_PAGE',     -- Página de museo
  'ONLINE_CATALOG',  -- Catálogo en línea
  'ART_DATABASE',    -- Base de datos de arte
  'PRESS',           -- Prensa
  'VIDEO',           -- Vídeo
  'ARTIST_SITE',     -- Sitio del artista
  'PHOTO_SOURCE',    -- De dónde salió una reproducción
  'OTHER'            -- Se miró y no encaja en ninguno
);

-- AUCTION_RECORD se deja fuera a propósito hasta que alguien lo necesite: añadir
-- un valor es `alter type ... add value` en una migración nueva —con el aviso de
-- que el valor nuevo no se puede usar en la misma transacción que lo crea— y
-- quitarlo no se puede.
comment on type public.external_link_type is
  'Clase de sitio enlazado. Enumerado y no tabla maestra: la línea que las separa en este esquema es quién es dueño de las entradas. Los lugares, los tipos de obra y las series son tablas porque la catalogadora las inventa y las renombra; estos los escribe el esquema, nadie renombra «Prensa» ni los reorganiza en un árbol. Nulo es «sin clasificar» y OTHER es «se miró y no encaja»: no son lo mismo (RF-1402).';

create type public.link_check_status as enum (
  'WORKING',  -- Funciona
  'CHANGED',  -- Carga, pero ya no muestra lo que documentaba
  'BROKEN'    -- Ya no está
);

comment on type public.link_check_status is
  'Resultado de comprobar un enlace a mano. Tres valores y no dos: «ha cambiado» —la página carga pero ya no muestra lo que documentaba— es justo lo que ningún rastreador detectaría. El cuarto estado es el nulo: sin comprobar no es roto (RF-1405).';

-- Explícito, como en la migración de color: en esta plataforma conviene revocar
-- primero y conceder después, uno a uno.
revoke all on type public.external_link_type from public;
revoke all on type public.link_check_status  from public;

grant usage on type public.external_link_type to authenticated;
grant usage on type public.link_check_status  to authenticated;


-- ── La validación de la dirección (RF-1403) ─────────────────
--
-- Esta es la única línea del sistema que dice que NO a una dirección, y es un
-- riesgo de seguridad real y no una comodidad: no hay backend, la clave anónima
-- viaja en el cliente, y lo que entre en esta columna acabará dentro de un
-- `href` en la ficha que ve todo el equipo. La comprobación vive en la base
-- porque es la última línea y no se puede saltar atacando la API; la aplicación
-- aplica exactamente la misma regla antes de guardar, pero solo para poder
-- explicar el rechazo en español.
--
-- Predicado a predicado, porque quien los lea dentro de un año tiene que poder
-- decidir si puede tocarlos:
--
--  1. `btrim` — « javascript:alert(1)» con un espacio delante lo ejecuta el
--     navegador, que recorta, y lo deja pasar cualquier comparación ingenua que
--     no recorte antes. Aquí no se recorta el dato: se RECHAZA, para que lo que
--     se guarda sea idéntico a lo que se validó.
--  2. Longitud entre 11 (`http://a.bc`) y 2048, que es el límite práctico de los
--     navegadores: más allá es un pegado accidental y no una dirección.
--  3. Ni espacios ni caracteres de control EN NINGUNA POSICIÓN: `java<tab>script:`
--     y `java<nl>script:` los han ejecutado navegadores reales, y ninguna
--     dirección legítima los lleva sin escapar.
--  4. LISTA BLANCA de esquemas y no lista negra: empieza por `http://` o
--     `https://`, comparado en minúsculas. Rechaza de una vez `javascript:`,
--     `data:`, `vbscript:`, `file:`, `blob:`, `intent:`, `mailto:`, `tel:` y todo
--     lo que se invente después, además de la forma relativa al protocolo
--     `//evil.example`. Una lista negra habría que ampliarla cada vez que
--     aparece un esquema nuevo.
--     Se admite `http` además de `https` y es deliberado: hay museos y archivos
--     regionales sin cifrar, y si su dirección no cabe en la tabla acabará dentro
--     de una nota, que es el fallo que todo esto existe para terminar. Lo que
--     decide la seguridad no es el cifrado del destino sino esta lista blanca y
--     que nada de lo enlazado se incruste.
--  5. LISTA BLANCA ASCII SOBRE LA AUTORIDAD, y no la regla «sin @ y con un punto
--     en medio», que es insuficiente. La autoridad es lo que hay entre `://` y la
--     primera `/`, `?` o `#`, en minúsculas, y tiene que ser un nombre de
--     dominio: etiquetas de letras, cifras y guiones separadas por puntos, sin
--     guion inicial ni final en ninguna etiqueta, un dominio de primer nivel de
--     dos letras o más, y un puerto opcional de hasta cinco cifras. Esa sola
--     línea cierra, comprobadas una a una:
--
--       · https://macvac.es@evil.example/obra — credenciales antes del
--         anfitrión: se lee como del MACVA y va a otro sitio. Es la única
--         suplantación que se puede rechazar sin resolver nada por la red.
--       · https://evil.example\.ejemplo.es/ — LA BARRA INVERTIDA, que los
--         navegadores tratan como barra: el anfitrión real es `evil.example` y lo
--         que parece el dominio es la ruta.
--       · Caracteres invisibles dentro del nombre del sitio (U+200B y compañía).
--         `[[:space:]]` de PostgreSQL no caza U+200B ni ningún carácter de
--         categoría Cf, así que la lista blanca es la única forma de cerrarlo.
--       · Direcciones IP, `https://192.168.1.7/obra` y `https://[::1]/obra`, por
--         el mismo motivo por el que se rechaza `localhost`: no son una fuente
--         que un catálogo pueda citar.
--       · `https://.ejemplo.es`, `https://ejemplo.es.`, `https://ejemplo..es`,
--         `https://ejemplo_a.es`.
--
--     COSTE ACEPTADO: se rechazan los dominios internacionalizados escritos en
--     Unicode (`https://münchen.example`). Se guardan en su forma punycode
--     (`https://xn--mnchen-3ya.example`), que es la que copia el navegador al
--     pegar, y el mensaje de la interfaz lo dice con esas palabras.
--
-- La función NO comprueba que el sitio exista ni que la página cargue: eso no se
-- puede hacer desde un `check`, y fingirlo sería peor que no tenerlo.
create function public.is_web_url(p_url text) returns boolean
language sql immutable strict set search_path = public as $$
  select p_url = btrim(p_url)
     and length(p_url) between 11 and 2048
     and p_url !~ '[[:space:][:cntrl:]]'
     and lower(p_url) ~ '^https?://'
     and coalesce(substring(lower(p_url) from '^https?://([^/?#]*)'), '')
         ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:[0-9]{1,5})?$'
$$;

comment on function public.is_web_url is
  'Única regla de validación de direcciones web del esquema (RF-1403). Lista blanca de esquemas y lista blanca ASCII del nombre del sitio. Se concede a la aplicación para que aplique la misma regla sin duplicarla, como place_key. No comprueba que el sitio exista: eso no se puede hacer desde un check.';

revoke all on function public.is_web_url(text) from public;
grant execute on function public.is_web_url(text) to authenticated;

-- REGLA DE FRONTERA, que vale para todo el esquema: toda columna que guarde una
-- dirección web, en cualquier tabla presente o futura, se valida con
-- `is_web_url`. Y una dirección web vive en `external_links`, salvo el
-- identificador canónico de una publicación (DOI o enlace al ejemplar), que sería
-- de `bibliography` el día que tenga columna propia — hoy no la tiene, así que
-- `external_links` es el único sitio. `parties` NO recibe columna de sitio web:
-- para eso está el ancla a la parte, que llega con el resto de anclas.
--
-- UN `check` QUE LLAMA A UNA FUNCIÓN NO REVALIDA LAS FILAS VIEJAS CUANDO LA
-- FUNCIÓN CAMBIA. Queda escrito aquí: el día que `is_web_url` se endurezca, la
-- migración que la reemplace lleva a continuación un bloque `do` que cuenta las
-- filas de `external_links` que dejan de pasar y FALLA si hay alguna. Es también
-- la segunda razón por la que la interfaz vuelve a validar al pintar.


-- ── La tabla ────────────────────────────────────────────────

create table public.external_links (
  -- Clave sustituta (ADR-007, RF-204) y no la URL: la URL es precisamente lo que
  -- cambia cuando el museo reorganiza su web, y una clave primaria no se edita.
  id uuid primary key default gen_random_uuid(),

  -- El arco exclusivo. `on update cascade` en las dos anclas por coherencia con
  -- `images.catalog_id` y `provenance_events.catalog_id`, aunque `catalog_id` sea
  -- inmutable por trigger: es cinturón, no mecanismo. `on delete restrict` por lo
  -- mismo que en las maestras: nadie tiene DELETE, y si algún día se borrara una
  -- fila a mano, esto avisa en vez de dejar enlaces colgando del vacío.
  artwork_id text references public.artworks (catalog_id)
    on update cascade on delete restrict,
  image_id text references public.images (image_id)
    on update cascade on delete restrict,

  url text not null,

  -- Puede estar vacío: exigir un título al pegar rompe la captura de una mano
  -- (RNF-106, RF-1408). Cuando falta, la interfaz muestra el DOMINIO y nunca la
  -- dirección entera, así que no hay hueco. Se guarda recortado.
  title text not null default '',

  link_type public.external_link_type,

  -- Por qué importa este enlace. Texto largo, sin recorte forzado, como el resto
  -- de notas del catálogo.
  note text not null default '',

  archive_url text,

  -- Las tres columnas de comprobación. Las escribe `record_link_check` y no el
  -- cliente: ver más abajo.
  check_status public.link_check_status,
  checked_at timestamptz,
  checked_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- `updated_at`/`updated_by` existen aquí y no en `images` a propósito: la URL
  -- es el único campo del catálogo que cambia por motivos que están FUERA del
  -- catálogo, y «quién la tocó por última vez» es justo la auditoría que hace
  -- falta cuando una dirección deja de llevar donde llevaba.
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- Baja lógica con la forma de `images` y `physical_places`: sin `restored_at`
  -- ni `restored_by`. Un enlace no es una de las seis fichas de RF-901 y no entra
  -- en la papelera (RF-906): es una fila subordinada, como una fotografía, y se
  -- restaura desde la propia ficha. `tg_row_audit` detecta la ausencia de
  -- `restored_at` y devuelve a nulo las dos columnas de baja al restaurar, igual
  -- que hace en `physical_places`.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- `= 1` y no `in (0, 1)`: un enlace sin ancla no es un enlace pendiente de
  -- colocar, es basura invisible que nadie volverá a ver.
  constraint external_links_exactly_one_owner
    check (num_nonnulls(artwork_id, image_id) = 1),

  -- Cada restricción con su nombre propio, por el mismo criterio que los rangos
  -- de color: lo que PostgreSQL dice al rechazar es el nombre, y es lo que la
  -- interfaz traduce.
  constraint external_links_url_is_web
    check (public.is_web_url(url)),
  constraint external_links_archive_url_is_web
    check (archive_url is null or public.is_web_url(archive_url)),
  constraint external_links_title_trimmed
    check (title = btrim(title)),

  -- O las dos o ninguna: una fecha de comprobación sin resultado no dice nada, y
  -- un resultado sin fecha no se puede envejecer en pantalla.
  constraint external_links_check_pair
    check (num_nonnulls(check_status, checked_at) = any (array[0, 2]))
);

comment on table public.external_links is
  'Enlaces a sitios externos (RF-1401). Cada fila cuelga de exactamente una ficha por clave ajena declarada: ni polimorfismo ni tabla puente. Nada se borra: se retira (RF-1406).';

comment on column public.external_links.url is
  'La dirección, tal cual se pega. Validada por is_web_url (RF-1403), que es lista blanca de esquemas y del nombre del sitio.';

comment on column public.external_links.title is
  'Lo que lee la usuaria. Puede faltar: entonces la interfaz muestra el dominio y nunca la dirección entera (RF-1402, RF-1408).';

comment on column public.external_links.link_type is
  'Nulo es «sin clasificar» y OTHER es «se miró y no encaja en ninguno»: no son lo mismo (RF-1402).';

comment on column public.external_links.archive_url is
  'Dirección de una copia que una persona guardó en un archivo público. La aplicación no archiva nada por su cuenta: guardar una instantánea propia en el bucket sería construir un archivador web, y si de verdad hace falta conservar una página la respuesta del esquema ya existe y es imprimirla a PDF y darla de alta como documento de archivo.';

comment on column public.external_links.checked_at is
  'La sella la base a través de record_link_check. Nulo es «sin comprobar», que no es «roto» (RF-1405).';


-- ── Índices ─────────────────────────────────────────────────
--
-- Los dos únicos parciales impiden el accidente real —pegar dos veces lo mismo en
-- la misma ficha— y NO intentan normalizar la URL: comparar `http` con `https`,
-- la barra final o el orden de los parámetros es un pozo sin fondo, y esas
-- variantes no se cazan. Son parciales sobre `active` para que retirar un enlace
-- y volver a añadirlo funcione (RF-1406).

create index external_links_artwork_idx
  on public.external_links (artwork_id, active) where artwork_id is not null;

create index external_links_image_idx
  on public.external_links (image_id, active) where image_id is not null;

create unique index external_links_artwork_url_unique
  on public.external_links (artwork_id, url) where artwork_id is not null and active;

create unique index external_links_image_url_unique
  on public.external_links (image_id, url) where image_id is not null and active;


-- ── Autoría y papelera ──────────────────────────────────────
--
-- Las sella `tg_row_audit`, la función común de RF-804 que creó
-- 20260804090000_parties.sql. No se escribe una función propia: seis copias de
-- veinte líneas es la divergencia garantizada.

create trigger external_link_row_audit
  before insert or update on public.external_links
  for each row execute function public.tg_row_audit();


-- ── La comprobación no la escribe el cliente (RF-1405) ──────
--
-- Las tres columnas de comprobación son las únicas de la tabla que afirman un
-- HECHO SOBRE EL MUNDO EXTERIOR —que esa página, hoy, carga y muestra lo que
-- decía—, y una fecha que se rellenara sola sería falsa. Así que el camino de
-- escritura es uno solo, `record_link_check`, y este trigger cierra los demás.
--
-- Lo hace EN SILENCIO y no con excepción: un formulario que manda la fila entera
-- no debe fallar por reenviar lo que ya había; el efecto que interesa es que no
-- la pueda mover.
--
-- Límite dicho en voz alta: el ajuste `app.link_check` es un guardarraíl contra
-- el cliente honesto y no un perímetro. PostgREST no deja fijar variables
-- arbitrarias de sesión, así que desde la API no hay forma de ponerlo; quien ya
-- tiene acceso directo por SQL puede. El perímetro de verdad es que solo
-- `can_edit()` escribe en esta tabla, y eso lo pone la RLS.
create function public.tg_external_link_check_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Un enlace nace sin comprobar, también el que inserte una migración: nadie
    -- ha abierto esa página hoy y la base no va a afirmar que funciona.
    new.check_status := null;
    new.checked_at   := null;
    new.checked_by   := null;
    return new;
  end if;

  if nullif(current_setting('app.link_check', true), '') is distinct from new.id::text then
    new.check_status := old.check_status;
    new.checked_at   := old.checked_at;
    new.checked_by   := old.checked_by;
  end if;
  return new;
end $$;

comment on function public.tg_external_link_check_freeze is
  'Congela las tres columnas de comprobación de un enlace: solo record_link_check las mueve (RF-1405). En silencio y no con excepción, para que un formulario que reenvía la fila entera no falle.';

create trigger external_link_check_freeze
  before insert or update on public.external_links
  for each row execute function public.tg_external_link_check_freeze();

-- El nombre importa: los triggers de una misma tabla y un mismo momento disparan
-- por orden alfabético, y `external_link_check_freeze` va antes que
-- `external_link_row_audit`. Aquí da igual porque no comparten ni una columna,
-- pero conviene que quien añada un tercero lo sepa.


-- `security invoker`, calcada de `set_main_image`, así que sigue pasando por RLS:
-- un Lector no cambia nada aunque llame a la función. Devuelve la marca de tiempo
-- para que la pantalla la muestre sin volver a consultar.
--
-- Consecuencias deseadas, todas con test: volver a confirmar el mismo estado un
-- año después SÍ mueve la fecha —es el caso más frecuente, «sigue
-- funcionando»—; poner el estado a nulo devuelve las tres columnas a nulo,
-- porque «vuelve a estar sin comprobar» es una corrección legítima; y editar la
-- nota de un enlace no mueve la fecha de comprobación pero sí `updated_at`.
create function public.record_link_check(
  p_link_id uuid, p_status public.link_check_status)
returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare
  v_when timestamptz;
  v_rows integer;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para comprobar enlaces';
  end if;

  perform set_config('app.link_check', p_link_id::text, true);

  update public.external_links
     set check_status = p_status,
         checked_at   = case when p_status is null then null else now() end,
         checked_by   = case when p_status is null then null else auth.uid() end
   where id = p_link_id
  returning checked_at into v_when;

  -- El recuento se guarda AQUÍ y no se consulta `found` más abajo: en PL/pgSQL
  -- un `perform` también escribe `found`, y el `set_config` que viene a
  -- continuación lo dejaría siempre a cierto. Un enlace inexistente pasaría sin
  -- una queja y la pantalla se quedaría esperando una fecha que no llega.
  get diagnostics v_rows = row_count;

  -- El ajuste se limpia siempre: es local a la transacción, y dejarlo puesto
  -- abriría una ventana en la que un update posterior sobre la misma fila, en la
  -- misma transacción, sí podría mover la fecha.
  perform set_config('app.link_check', '', true);

  if v_rows = 0 then
    raise exception 'No existe el enlace que se intenta comprobar';
  end if;
  return v_when;
end $$;

comment on function public.record_link_check is
  'Único camino para sellar la comprobación de un enlace (RF-1405). La fecha la pone la base y no el cliente: una fecha que llegara del teléfono valdría lo que su reloj. No existe rastreador y no puede existir sin servidor de aplicación.';

revoke all on function public.tg_external_link_check_freeze() from public;
revoke all on function public.record_link_check(uuid, public.link_check_status) from public, anon;
grant execute on function public.record_link_check(uuid, public.link_check_status) to authenticated;


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Una tabla sin RLS está abierta, no cerrada, y la plataforma concede por omisión
-- todos los privilegios de cada tabla nueva a los roles anónimo y autenticado,
-- incluido `delete` (RF-113). Se revoca primero y se concede después, uno a uno.
--
-- Y las políticas van EN ESTA MISMA MIGRACIÓN, al contrario que en el catálogo
-- razonado documental: allí eran quince tablas y una migración de perímetro
-- propia; aquí es una tabla, y una tabla que existe un solo despliegue sin
-- política es una tabla que la aplicación no puede usar.

alter table public.external_links enable row level security;

revoke all on public.external_links from anon, authenticated;

grant select, insert, update on public.external_links to authenticated;

-- Sin DELETE: ni privilegio ni política, nunca (RF-901, RF-1406). Retirar un
-- enlace es un update de `active`.

-- La primera mitad es la forma de `artworks` e `images`: el Lector ve lo activo,
-- quien edita ve también la papelera.
--
-- LA SEGUNDA MITAD ES LA VISIBILIDAD HEREDADA, y merece el comentario porque no
-- es una copia de la regla de la ficha, es la regla misma. Las subconsultas se
-- evalúan BAJO LA POLÍTICA DE SU PROPIA TABLA: la de `artworks` esconde al Lector
-- las obras retiradas y la de `images` le esconde las fotografías retiradas. De
-- ahí sale gratis el comportamiento correcto —el Catalogador ve todo, el Lector
-- no se entera de que existe el enlace de una ficha que no puede ver (RF-609)— y,
-- si mañana cambia la regla de visibilidad de las obras, la de los enlaces la
-- sigue sola.
--
-- Cuesta una búsqueda por clave primaria y evita filtrar la existencia de una
-- ficha que RF-609 esconde. Nótese que `images` sigue teniendo el hueco de
-- RF-905 —el nombre del fichero de una fotografía retirada— y que el día que se
-- cierre para las fotografías hay que hacerlo en SU PROPIA migración, no aquí.
create policy external_links_select on public.external_links
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and (
      (artwork_id is not null
        and exists (select 1 from public.artworks a where a.catalog_id = external_links.artwork_id))
      or
      (image_id is not null
        and exists (select 1 from public.images i where i.image_id = external_links.image_id))
    )
  );

create policy external_links_insert on public.external_links
  for insert with check (public.can_edit());

create policy external_links_update on public.external_links
  for update using (public.can_edit()) with check (public.can_edit());
