-- ============================================================
-- Obras relacionadas entre sí, con el tipo de relación como dato
-- (RF-217, que extiende RF-212; RF-216, RF-517, RF-901, RF-902).
--
-- v11 dejó `obras_relacionadas` como «relación múltiple, autorreferencial»
-- dentro de la ficha de obra, y en v4 se molestó en aclarar que no es un campo
-- de texto. Lo que no tiene es el DATO que hace útil la relación: de qué clase
-- es. «AR-0012 relacionada con AR-0013» no dice si son las dos mitades de un
-- díptico, el estudio previo y la obra final, o el anverso y el reverso de la
-- misma tabla catalogados aparte — y esas tres cosas se leen distinto en la
-- ficha y se citan distinto en el catálogo razonado.
--
-- Este grupo no lo inventa: las propias «Notas de implementación» de v11
-- anticipan el caso por escrito, cuando dicen que el patrón de tabla puente
-- «puede reutilizarse en el futuro si aparecen casos similares (por ejemplo, si
-- `obras_relacionadas` necesitara en algún momento especificar el *tipo* de
-- relación entre cada par de obras)». Aparecieron: pareja, políptico, estudio
-- previo, versión, reverso catalogado aparte y copia de obra destruida.
--
-- POR QUÉ EL TIPO ES UNA MAESTRA Y NO UN ENUMERADO. El criterio que este
-- esquema usa para separar las dos cosas es si el código mira el valor:
-- `artwork_types` es maestra porque nunca lo mira, `party_type` es enumerado
-- porque de él depende cómo se redacta una línea. Aquí la lista es abierta por
-- naturaleza —la investigación descubre relaciones que nadie previó—, pero el
-- motivo fuerte es otro: cada tipo lleva DATOS que no caben en un enumerado.
-- «Estudio previo de» es asimétrico y su inversa es «Obra final de»; «Pareja
-- de» es simétrico y no tiene inversa. Ese par de etiquetas y la bandera de
-- simetría son lo que permite que la ficha de la obra B diga «obra final de
-- AR-0012» sin que nadie haya escrito una segunda fila. Un enumerado no puede
-- llevar su inversa.
--
-- LO QUE NO SE CREA: `related_artworks_status`. Las cuatro columnas de estado
-- de investigación (RF-218) cubren bloques que se investigan COMO BLOQUE —se va
-- al archivo a buscar exposiciones y se vuelve con lo que haya—, y una relación
-- entre obras no se investiga: aparece mientras se cataloga la pieza de al lado.
-- Declarar «esta obra no tiene relaciones» sería declarar algo que ninguna
-- búsqueda cierra nunca, y una columna que no puede llegar a ser verdad es peor
-- que no tenerla.
--
-- Las POLÍTICAS RLS de las dos tablas van en la migración siguiente. Lo que SÍ
-- se hace aquí es activar RLS y revocar los privilegios, porque una tabla que
-- existe un solo despliegue sin RLS es una tabla publicada. Con RLS activado y
-- sin ninguna política, la tabla está cerrada para todo el mundo salvo el acceso
-- administrativo directo, que es el estado seguro para esperar.
-- ============================================================


-- ── El vocabulario de tipos de relación (RF-217) ────────────
--
-- Patrón de `artwork_types` tras ADR-007 y de `publication_types`: clave
-- sustituta, el nombre como atributo único por clave de comparación, papelera y
-- autoría con `tg_row_audit`. Lo propio de esta maestra son las dos columnas
-- que la hacen algo más que una lista de etiquetas.

create table public.artwork_relationship_types (
  id uuid primary key default gen_random_uuid(),

  -- La etiqueta DIRECTA, la que se lee desde la obra de la que sale la flecha:
  -- «Estudio previo de». Tal cual se escribe, con sus mayúsculas y sus tildes;
  -- lo que se normaliza es la clave de comparación, no el dato.
  name text not null,

  -- La etiqueta que ve la obra del otro extremo: «Obra final de». Es la columna
  -- que evita la segunda fila. Sin ella, registrar que AR-0012 es estudio previo
  -- de AR-0013 obligaría a escribir a mano la relación contraria para que la
  -- ficha de AR-0013 dijera algo, y ese par de filas puede divergir: se edita
  -- una, se retira la otra, y el catálogo se contradice consigo mismo.
  --
  -- Vacía en las relaciones simétricas, donde las dos fichas dicen lo mismo.
  inverse_name text not null default '',

  -- Simétrica quiere decir que la relación no tiene dirección: si A es pareja de
  -- B, B es pareja de A, y es UN hecho y no dos. De esta bandera dependen la
  -- canonicalización de la fila y la comprobación de la contraria, más abajo.
  --
  -- Se llama `is_symmetric` y no `symmetric` porque `symmetric` es palabra
  -- RESERVADA en SQL —la del `between symmetric`— y una columna así solo se
  -- puede nombrar entrecomillada para siempre, en el esquema, en las consultas y
  -- en el cliente. El prefijo es más feo que la alternativa y bastante menos
  -- frágil.
  is_symmetric boolean not null default false,

  -- RF-901: nada se borra, se retira. Sin `restored_at`, como en las demás
  -- maestras de vocabulario: restaurar deja la fila como si nunca se hubiera
  -- retirado, y `tg_row_audit` distingue ese caso por la ausencia de la columna.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- Un tipo en blanco no dice nada, y uno con espacios alrededor rompería la
  -- comparación de duplicados sin que se vea en pantalla.
  constraint artwork_relationship_types_name_not_blank
    check (btrim(name) <> '' and name = btrim(name)),

  constraint artwork_relationship_types_inverse_name_trimmed
    check (inverse_name = btrim(inverse_name)),

  -- La coherencia que sostiene todo lo demás, y por eso es una restricción y no
  -- una convención:
  --
  --   • Una relación SIMÉTRICA no tiene inversa. Si la tuviera, habría dos
  --     etiquetas para el mismo hecho y la ficha elegiría una al azar según de
  --     qué lado se mire.
  --   • Una relación ASIMÉTRICA la tiene que tener, y distinta del nombre
  --     directo. Sin inversa, la ficha de la otra obra se queda sin nada que
  --     escribir; con la inversa igual al nombre, el tipo es simétrico mal
  --     declarado y la canonicalización no se aplicaría.
  constraint artwork_relationship_types_inverse_coherent check (
    (is_symmetric and inverse_name = '')
    or (not is_symmetric and inverse_name <> '' and inverse_name <> name)
  )
);

comment on table public.artwork_relationship_types is
  'Vocabulario abierto de tipos de relación entre obras (RF-217), con clave sustituta (ADR-007): renombrar es una fila. Cada tipo lleva su etiqueta inversa y su simetría, que es lo que un enumerado no puede llevar.';

comment on column public.artwork_relationship_types.inverse_name is
  'Etiqueta que ve la obra del otro extremo («Obra final de»). Vacía en las simétricas. Es lo que permite que la ficha contraria diga algo sin una segunda fila que pueda divergir.';
comment on column public.artwork_relationship_types.is_symmetric is
  'La relación no tiene dirección: A pareja de B es UN hecho, no dos. De aquí dependen la canonicalización de la fila y el rechazo de la contraria.';

-- Unicidad por clave de comparación y no por el nombre literal, como en el
-- resto del esquema: «Estudio previo de» y «estudio previo de» son el mismo
-- tipo. El índice cubre también los tipos retirados, porque volver a dar de alta
-- uno que está en la papelera tiene que poder encontrarlo.
--
-- NO se impone unicidad cruzada entre `name` e `inverse_name`. Sería posible y
-- se ha descartado: dar de alta «Obra final de» como tipo directo sería
-- redundante, pero no corrompe nada —la ficha mostraría dos formas de decir lo
-- mismo— y la regla es de las que se explican peor de lo que valen. Los
-- duplicados de vocabulario se resuelven por revisión (RF-909).
create unique index artwork_relationship_types_name_unique
  on public.artwork_relationship_types (public.place_key(name));

create index artwork_relationship_types_active_idx
  on public.artwork_relationship_types (active);

create trigger artwork_relationship_type_row_audit
  before insert or update on public.artwork_relationship_types
  for each row execute function public.tg_row_audit();

-- La siembra: los seis casos que el catálogo ya tiene delante. Una maestra vacía
-- deja el selector en blanco y obliga a inventar el vocabulario mientras se
-- cataloga, que es como se acaban teniendo «Pareja» y «Pareja de» en la misma
-- lista. Ampliarla no requiere migración: ese es el motivo entero de que sea una
-- maestra.
--
-- «Versión de» va como simétrica porque entre dos versiones de una misma
-- composición no hay una que sea la versión de la otra: son versiones la una de
-- la otra. Cuando una precede claramente a la otra, lo que se registra es
-- «Estudio previo de», que sí tiene dirección.
--
-- `created_by` queda nulo a propósito: dentro de una migración `auth.uid()` no
-- es nadie, y estas filas no las creó ninguna persona.
insert into public.artwork_relationship_types (name, inverse_name, is_symmetric) values
  ('Pareja de',                     '',              true),
  ('Parte del mismo políptico que', '',              true),
  ('Versión de',                    '',              true),
  ('Estudio previo de',             'Obra final de', false),
  ('Reverso de',                    'Anverso de',    false),
  ('Copia de',                      'Original de',   false);


-- ── Lo que no se puede hacer con un tipo en uso ─────────────

-- Un tipo que todavía relaciona obras no se retira, con la misma regla que
-- `tg_artwork_type_deactivation`, `tg_series_deactivation` y
-- `tg_publication_type_deactivation`: retirarlo no lo retira, deja el catálogo
-- apuntando a algo que la interfaz ya no ofrece. Una relación en la papelera no
-- cuenta, como en las demás.
create function public.tg_artwork_relationship_type_deactivation()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.active = false and old.active = true
     and exists (select 1 from public.artwork_relationships
                  where relationship_type_id = new.id and active) then
    raise exception 'No se puede retirar un tipo de relación que todavía usan obras relacionadas del catálogo'
      using hint = 'Cambia antes el tipo de esas relaciones.';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_relationship_type_deactivation is
  'Impide retirar un tipo de relación que todavía relaciona obras activas (RF-217).';

-- Y la simetría de un tipo no se cambia cuando ya tiene relaciones guardadas.
--
-- No es una regla de purismo: las filas de un tipo simétrico están
-- CANONICALIZADAS —el identificador menor va siempre en el extremo de salida—, y
-- las de uno asimétrico no. Cambiar la bandera dejaría filas guardadas con una
-- convención y filas nuevas con otra, de modo que la misma pareja de obras
-- podría entrar dos veces sin que la unicidad lo notase. Es el fallo silencioso
-- que este grupo entero está escrito para evitar, y solo se puede evitar aquí:
-- una vez guardadas las dos filas, ya no hay forma de saber cuál sobra.
--
-- Se miran también las relaciones RETIRADAS, al contrario que en la regla de
-- arriba: una relación en la papelera se puede restaurar, y restauraría una fila
-- escrita con la convención antigua.
create function public.tg_artwork_relationship_type_symmetry_locked()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.is_symmetric is distinct from old.is_symmetric
     and exists (select 1 from public.artwork_relationships
                  where relationship_type_id = new.id) then
    raise exception 'No se puede cambiar la simetría de un tipo de relación que ya se ha usado'
      using hint = 'Crea un tipo nuevo con la simetría que necesitas y cambia esas relaciones al tipo nuevo.';
  end if;
  return new;
end $$;

comment on function public.tg_artwork_relationship_type_symmetry_locked is
  'La simetría de un tipo no cambia una vez usado: las filas simétricas están canonicalizadas y las asimétricas no, y mezclar las dos convenciones deja pasar la misma pareja dos veces (RF-217).';

create trigger artwork_relationship_type_deactivation
  before update of active on public.artwork_relationship_types
  for each row execute function public.tg_artwork_relationship_type_deactivation();

create trigger artwork_relationship_type_symmetry_locked
  before update of is_symmetric on public.artwork_relationship_types
  for each row execute function public.tg_artwork_relationship_type_symmetry_locked();


-- ── La relación entre dos obras ─────────────────────────────

create table public.artwork_relationships (
  id uuid primary key default gen_random_uuid(),

  -- Misma forma que `images`, `provenance_events` y las tres puentes
  -- anteriores: `on update cascade` porque el identificador de catalogación es
  -- texto, y sin `on delete` porque de `artworks` no se borra nada (RF-901).
  --
  -- Los dos extremos son iguales de nombre y de tipo a propósito: en una
  -- relación simétrica no hay origen ni destino, y en una asimétrica el sentido
  -- lo pone el tipo y no la columna.
  from_catalog_id text not null references public.artworks (catalog_id) on update cascade,
  to_catalog_id   text not null references public.artworks (catalog_id) on update cascade,

  relationship_type_id uuid not null
    references public.artwork_relationship_types (id) on delete restrict,

  -- La circunstancia de esta relación concreta: «el reverso se separó del
  -- soporte en la restauración de 1998», «la pareja se subastó por separado».
  note text not null default '',

  -- RF-804: trazabilidad completa, sellada por `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-517, que revisa RF-903: nada se borra, tampoco aquí. Sin `restored_at`,
  -- como en las tres puentes anteriores: esta fila no tiene pantalla de papelera
  -- propia, se restaura desde la ficha de la obra de la que cuelga, y volver a
  -- añadirla la deja como si nunca se hubiera retirado.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- Una obra no es estudio previo de sí misma. Es la clase de fila que produce
  -- un selector con la obra actual dentro, y que después pinta en la ficha un
  -- enlace a la propia ficha.
  constraint artwork_relationships_two_artworks
    check (from_catalog_id <> to_catalog_id),

  -- La misma relación entre las mismas dos obras es un hecho, no dos. La
  -- restricción cubre también las relaciones retiradas, que es lo que permite
  -- que volver a añadir una restaure en vez de duplicar (ver `relate_artworks`).
  --
  -- Dos tipos distintos entre las mismas dos obras SÍ conviven: el anverso y el
  -- reverso de una tabla pueden ser además parte del mismo políptico.
  constraint artwork_relationships_unique
    unique (from_catalog_id, to_catalog_id, relationship_type_id)
);

comment on table public.artwork_relationships is
  'Relación tipada entre dos obras catalogadas (RF-217, extiende RF-212). Las simétricas se guardan una sola vez, canonicalizadas. Nada se borra: una relación se retira (RF-517).';

comment on column public.artwork_relationships.from_catalog_id is
  'Extremo de salida. En un tipo simétrico es siempre el identificador menor, puesto ahí por el trigger de canonicalización: la pareja se guarda una sola vez.';

-- La ficha se consulta desde los dos lados —«qué obras se relacionan con esta»
-- no distingue de qué extremo salió la flecha—, así que hacen falta los dos
-- índices. El de salida lo sirve el índice único, que ya empieza por
-- `from_catalog_id`.
create index artwork_relationships_to_idx
  on public.artwork_relationships (to_catalog_id);
create index artwork_relationships_type_idx
  on public.artwork_relationships (relationship_type_id);


-- ── Una relación simétrica se guarda UNA vez ────────────────
--
-- «AR-0003 pareja de AR-0007» y «AR-0007 pareja de AR-0003» son el mismo hecho.
-- Sin canonicalizar, la unicidad no los ve iguales y entran las dos filas: dos
-- notas que pueden decir cosas distintas, dos bajas que hay que acordarse de
-- hacer, y la ficha mostrando la pareja dos veces. Se guarda siempre con el
-- identificador menor en el extremo de salida, de modo que la segunda escritura
-- choque contra la restricción de unicidad y `relate_artworks` la resuelva.
--
-- La comparación va con `collate "C"`, byte a byte, y no con la de la base: los
-- identificadores son ASCII y cualquier collation da hoy el mismo orden, pero si
-- la de la base cambiara alguna vez, las filas guardadas quedarían
-- canonicalizadas con un criterio y las nuevas con otro — y entonces la misma
-- pareja entraría dos veces. El criterio tiene que ser el mismo para siempre.
create function public.tg_canonicalize_artwork_relationship()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_symmetric boolean;
  v_swap text;
begin
  select is_symmetric into v_symmetric
    from public.artwork_relationship_types
   where id = new.relationship_type_id;

  -- El tipo no existe todavía a ojos de esta comprobación: las claves ajenas se
  -- verifican DESPUÉS de los triggers `before`, así que aquí no se inventa un
  -- error propio y se deja hablar a la clave ajena, que dirá lo mismo mejor.
  if v_symmetric is null then
    return new;
  end if;

  if v_symmetric and new.from_catalog_id collate "C" > new.to_catalog_id collate "C" then
    v_swap := new.from_catalog_id;
    new.from_catalog_id := new.to_catalog_id;
    new.to_catalog_id := v_swap;
  end if;

  return new;
end $$;

comment on function public.tg_canonicalize_artwork_relationship is
  'Una relación simétrica se guarda con el identificador menor en el extremo de salida (RF-217): así «A pareja de B» y «B pareja de A» son la misma fila y no dos que pueden divergir.';


-- ── Y una asimétrica no admite su contraria ─────────────────
--
-- Si ya consta que A es estudio previo de B, que B sea estudio previo de A no es
-- un dato más: es una contradicción documental, y de las que no se ven al
-- escribirlas porque cada una se da de alta desde la ficha de su obra. La ficha
-- de B ya dice «obra final de A» sin que nadie escriba nada, que es justamente
-- para lo que existe `inverse_name`.
--
-- Se comprueba también al RESTAURAR una relación retirada, que es el camino por
-- el que la contradicción entraría de verdad: la contraria se escribió mientras
-- esta estaba en la papelera.
create function public.tg_artwork_relationship_not_reversed()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_type public.artwork_relationship_types%rowtype;
begin
  if not new.active then
    return new;
  end if;

  select * into v_type
    from public.artwork_relationship_types
   where id = new.relationship_type_id;

  -- Como arriba: si el tipo no se ve, habla la clave ajena.
  if v_type.id is null or v_type.is_symmetric then
    return new;
  end if;

  if exists (select 1 from public.artwork_relationships
              where from_catalog_id = new.to_catalog_id
                and to_catalog_id = new.from_catalog_id
                and relationship_type_id = new.relationship_type_id
                and active) then
    raise exception 'Ya consta que % es «% %», y lo contrario no puede ser cierto a la vez',
      new.to_catalog_id, v_type.name, new.from_catalog_id
      using hint = format('La ficha de %s ya muestra «%s %s» sin necesidad de esta fila. Si la relación estaba al revés, retira antes la que consta.',
                          new.from_catalog_id, v_type.inverse_name, new.to_catalog_id);
  end if;

  return new;
end $$;

comment on function public.tg_artwork_relationship_not_reversed is
  'Rechaza la pareja inversa de una relación asimétrica (RF-217): «A es estudio previo de B» y «B es estudio previo de A» no pueden ser ciertas a la vez.';


-- Los dos triggers de regla disparan en orden alfabético de nombre, y ese orden
-- importa: la canonicalización tiene que haber puesto los extremos en su sitio
-- antes de que nadie busque la relación contraria. `canonicalize` va antes que
-- `not_reversed`, y `row_audit` después, que le da igual.
create trigger artwork_relationship_canonicalize
  before insert or update on public.artwork_relationships
  for each row execute function public.tg_canonicalize_artwork_relationship();

create trigger artwork_relationship_not_reversed
  before insert or update on public.artwork_relationships
  for each row execute function public.tg_artwork_relationship_not_reversed();

create trigger artwork_relationship_row_audit
  before insert or update on public.artwork_relationships
  for each row execute function public.tg_row_audit();


-- ── Volver a relacionar dos obras RESTAURA la relación ──────
--
-- Mismo caso y misma solución que `cite_artwork`, `exhibit_artwork`,
-- `document_artwork` y `document_exhibition`: con la unicidad cubriendo también
-- las relaciones retiradas, un `insert` de una pareja que está en la papelera
-- choca contra el índice, y la interfaz convertiría un «Añadir» en una violación
-- de unicidad incomprensible.
--
-- Aquí hace además una segunda cosa que las otras cuatro no necesitaban: como el
-- trigger de canonicalización ya ha puesto los extremos en su sitio antes de la
-- comprobación de conflicto, añadir «AR-0007 pareja de AR-0003» encuentra y
-- restaura la fila «AR-0003 pareja de AR-0007» que ya existía. La usuaria no
-- tiene que acordarse de en qué orden la escribió la primera vez.
--
-- Función y no un trigger `before insert` que devuelva `null`: un trigger así
-- deja el `insert` sin filas afectadas y quien llame desde la API pidiendo la
-- fila creada no recibirá ninguna. La función devuelve siempre la fila.
--
-- Sin SECURITY DEFINER: las políticas siguen en vigor y un Lector no escribe
-- aquí. La comprobación explícita solo convierte el silencioso «no ha cambiado
-- nada» en un error legible, y en español porque lo lee ella.
create function public.relate_artworks(
  p_from_catalog_id text,
  p_to_catalog_id text,
  p_relationship_type_id uuid,
  p_note text default ''
)
returns public.artwork_relationships
language plpgsql
set search_path = public
as $$
declare
  v_row public.artwork_relationships;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para relacionar dos obras';
  end if;

  insert into public.artwork_relationships
    (from_catalog_id, to_catalog_id, relationship_type_id, note)
  values (p_from_catalog_id, p_to_catalog_id, p_relationship_type_id,
          coalesce(p_note, ''))
  on conflict (from_catalog_id, to_catalog_id, relationship_type_id) do update
     set active = true,
         -- Lo que no se manda no se borra: volver a añadir una relación que ya
         -- existía no puede vaciar la nota que alguien escribió, porque el
         -- formulario de «Añadir» viene en blanco. Vaciarla es editar la
         -- relación, que es otra operación.
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else artwork_relationships.note end
  returning * into v_row;

  return v_row;
end $$;

comment on function public.relate_artworks is
  'Relaciona dos obras, o RESTAURA la relación que estuviera retirada en vez de chocar contra la unicidad (RF-217, RF-517). En un tipo simétrico da igual el orden en que se pasen las obras.';


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Se revoca primero y se concede después, uno a uno: la plataforma concede por
-- omisión todos los privilegios de cada tabla nueva a los roles anónimo y
-- autenticado, incluido `delete` (RF-113).
--
-- Sin DELETE en ninguna de las dos: ni privilegio ni política, nunca (RF-901,
-- RF-517). Retirar una relación es un update de `active`.
--
-- Las políticas van en la migración siguiente. Hasta que existan, estas tablas
-- no las lee ni las escribe nadie con sesión: RLS activado sin política niega.

alter table public.artwork_relationship_types enable row level security;
alter table public.artwork_relationships enable row level security;

revoke all on public.artwork_relationship_types from anon, authenticated;
revoke all on public.artwork_relationships from anon, authenticated;

grant select, insert, update on public.artwork_relationship_types to authenticated;
grant select, insert, update on public.artwork_relationships to authenticated;

-- Explícito, como en 20260801140000 y en los cuatro grupos anteriores: en esta
-- plataforma una función nueva nace con EXECUTE para PUBLIC pese al `alter
-- default privileges`, y quien lo caza es `function_privileges.test.sql`. Una
-- función de trigger no la invoca nadie desde la API, y aun así dispara.
revoke all on function public.tg_artwork_relationship_type_deactivation() from public;
revoke all on function public.tg_artwork_relationship_type_symmetry_locked() from public;
revoke all on function public.tg_canonicalize_artwork_relationship() from public;
revoke all on function public.tg_artwork_relationship_not_reversed() from public;

revoke all on function public.relate_artworks(text, text, uuid, text) from public, anon;
grant execute on function public.relate_artworks(text, text, uuid, text) to authenticated;
