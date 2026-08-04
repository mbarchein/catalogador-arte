-- ============================================================
-- Personas e instituciones (RF-508), y la base común de trazabilidad (RF-804).
--
-- Es la tabla 8 del esquema de campos —«Propietarios/Instituciones»— y la
-- primera pieza del catálogo razonado documental, que hasta hoy no existía en
-- absoluto: de las nueve tablas del modelo estaban construidas tres.
--
-- UNA SOLA TABLA para personas e instituciones, y no dos, por dos motivos. El
-- primero es que la mitad de los atributos son los mismos (contacto, estado de
-- contacto, localidad, país) y partirlos obligaría a consultar dos tablas para
-- componer una línea de procedencia. El segundo es que una colección familiar se
-- convierte en fundación sin dejar de ser el mismo eslabón de la cadena, y con
-- dos tablas ese cambio sería borrar una ficha y crear otra: exactamente lo que
-- este proyecto no hace nunca.
--
-- Y es MAESTRA con clave sustituta por el criterio de ADR-006 y ADR-007 aplicado
-- tal cual: el Museo de Bellas Artes de Badajoz aparecerá como propietario de
-- unas obras, depositario de otras, sede de una exposición y titular de derechos
-- de una tercera. Si el nombre viaja copiado en cada uno de esos sitios,
-- corregirlo —o añadirle el nombre nuevo tras una fusión de instituciones— es
-- tocar todas las filas. Con clave propia es un update de una fila y lo ve el
-- catálogo entero.
--
-- Esta migración crea la tabla, sus enumerados y la función de trazabilidad
-- común. Las políticas RLS van en la migración siguiente; lo que SÍ se hace aquí
-- es activar RLS y revocar los privilegios, porque una tabla que existe un solo
-- despliegue sin RLS es una tabla publicada. Con RLS activado y sin ninguna
-- política, la tabla está cerrada para todo el mundo salvo el acceso
-- administrativo directo, que es el estado seguro para esperar.
-- ============================================================


-- ── Dos enumerados, y por qué no son tablas maestras ────────
--
-- El criterio que separa un enumerado de una maestra en este esquema es si el
-- CÓDIGO mira el valor. `artwork_types` es maestra porque el código nunca lo
-- mira: lo renderiza. Aquí es al revés en los dos casos.

-- Persona o institución. NO lleva «Sin revisar», y es una excepción consciente a
-- RF-205 con el mismo argumento con el que RF-203 se lo niega a `artist`: al
-- abrir la ficha ya se sabe si se está escribiendo una persona o un museo, y de
-- ese valor depende cómo se compone la línea de procedencia publicable
-- («Colección privada, España» frente a los créditos de una institución
-- pública). Un dato del que depende la redacción no puede quedar pendiente.
--
-- Y son dos valores que no crecen: es una distinción ontológica cerrada, no
-- vocabulario que la usuaria amplíe. Lo que sí se ha dejado FUERA a propósito es
-- el tipo de institución (galería, museo, fundación, archivo): eso sí crecería,
-- pero no lo pide nada todavía y una columna de clasificación que nadie consulta
-- se rellena mal. Cuando haga falta será una maestra, no un valor más de aquí.
create type public.party_type_value as enum ('PERSON', 'INSTITUTION');

comment on type public.party_type_value is
  'Persona o institución. Sin «Sin revisar»: de este valor depende cómo se redacta la línea de procedencia (excepción a RF-205, con el argumento de RF-203).';

-- El estado del contacto, tal cual lo enumera el esquema de campos v11: sin
-- contactar, contactado, información recibida, visita realizada, verificada. Es
-- dato de trabajo de la investigadora y su orden es un progreso, no una
-- clasificación: por eso es un enumerado y no una lista abierta.
create type public.contact_status_value as enum (
  'NOT_CONTACTED',   -- Sin contactar
  'CONTACTED',       -- Contactado
  'INFO_RECEIVED',   -- Info recibida
  'VISITED',         -- Visita realizada
  'VERIFIED'         -- Verificada
);

comment on type public.contact_status_value is
  'Progreso del contacto con una persona o institución (tabla 8 del esquema de campos v11).';


-- ── La trazabilidad, una sola vez para todo el esquema ──────
--
-- RF-804 pide que la trazabilidad sea «base común reutilizable por todas las
-- tablas con clave primaria propia, no solo por Obras». Hasta ahora eran tres
-- funciones casi idénticas —`tg_physical_place_authorship`,
-- `tg_artwork_type_authorship`, `tg_series_authorship`— y el catálogo razonado
-- documental añade seis tablas más con exactamente el mismo sello. Seis copias de
-- veinte líneas es la divergencia garantizada: el día que una de ellas arregle un
-- caso, las otras cinco se quedan atrás y nadie se entera.
--
-- La función lee la fila como `jsonb`, decide qué tocar según las columnas que
-- esa fila TENGA, y devuelve con `jsonb_populate_record`. El parche solo lleva
-- las columnas que cambian —y no la fila entera— para que ninguna otra columna
-- pase por una conversión de ida y vuelta que podría alterarla: lo que no está en
-- el parche sale de `new` tal como entró.
--
-- Consecuencia deliberada: una tabla sin `restored_at` funciona igual. Los
-- lugares y las maestras de vocabulario borran la traza de la baja al restaurar,
-- porque no tienen dónde guardarla; las tablas con clave propia y papelera
-- completa (RF-902) sellan la restauración y CONSERVAN la traza de la baja
-- anterior. La función distingue los dos casos por la presencia de la columna, de
-- modo que adoptarla en las tablas viejas no cambiaría su comportamiento.
--
-- No es SECURITY DEFINER: solo escribe sobre `new` y lee `auth.uid()`, que ya es
-- lo que la sesión declara.
create function public.tg_row_audit()
returns trigger language plpgsql
set search_path = public as $$
declare
  v_new   jsonb := to_jsonb(new);
  v_old   jsonb;
  v_patch jsonb := '{}'::jsonb;
  v_now   timestamptz := now();
  v_who   uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    -- Quién crea lo dice la sesión, no el cliente. Dentro de una migración
    -- `auth.uid()` no es nadie y la columna queda nula, que es la verdad: una
    -- fila trasladada por una migración no la creó ninguna persona.
    if v_new ? 'created_by' then
      v_patch := v_patch || jsonb_build_object('created_by', v_who);
    end if;
    if v_new ? 'updated_at' then
      v_patch := v_patch || jsonb_build_object('updated_at', v_now);
    end if;
    if v_new ? 'updated_by' then
      v_patch := v_patch || jsonb_build_object('updated_by', v_who);
    end if;
  else
    v_old := to_jsonb(old);

    -- RF-801: cualquier cambio mueve la fecha de actualización.
    if v_new ? 'updated_at' then
      v_patch := v_patch || jsonb_build_object('updated_at', v_now);
    end if;
    if v_new ? 'updated_by' then
      v_patch := v_patch || jsonb_build_object('updated_by', v_who);
    end if;

    -- RF-902: la baja y la restauración se sellan solas. Si dependieran de lo
    -- que manda la interfaz, la traza de la papelera valdría lo que el reloj del
    -- teléfono que la envió.
    if v_new ? 'active' then
      if (v_old->>'active')::boolean and not (v_new->>'active')::boolean then
        if v_new ? 'deactivated_at' then
          v_patch := v_patch || jsonb_build_object('deactivated_at', v_now);
        end if;
        if v_new ? 'deactivated_by' then
          v_patch := v_patch || jsonb_build_object('deactivated_by', v_who);
        end if;

      elsif not (v_old->>'active')::boolean and (v_new->>'active')::boolean then
        if v_new ? 'restored_at' then
          -- Papelera completa: se guarda el último evento de cada clase y la
          -- restauración NO borra la traza de la baja anterior.
          v_patch := v_patch || jsonb_build_object('restored_at', v_now);
          if v_new ? 'restored_by' then
            v_patch := v_patch || jsonb_build_object('restored_by', v_who);
          end if;
        else
          -- Sin sitio donde guardar la restauración, lo honrado es dejar la fila
          -- como si nunca se hubiera retirado, que es lo que ya hacen los lugares
          -- y las maestras de vocabulario.
          v_patch := v_patch || jsonb_build_object('deactivated_at', null,
                                                   'deactivated_by', null);
        end if;
      end if;
    end if;
  end if;

  if v_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_patch);
  end if;
  return new;
end $$;

comment on function public.tg_row_audit is
  'Sello común de autoría, fecha de actualización y papelera (RF-804, RF-801, RF-902). Toca solo las columnas que la fila tenga, de modo que una tabla sin fecha de restauración funciona igual.';


-- ── La tabla ────────────────────────────────────────────────

create table public.parties (
  -- Clave sustituta (ADR-007), no el nombre: renombrar una institución tiene que
  -- ser una fila y no una migración de datos, y el nombre de un museo cambia.
  id uuid primary key default gen_random_uuid(),

  party_type public.party_type_value not null,

  -- Tal cual se escribe, con sus mayúsculas y sus tildes, como en el árbol de
  -- lugares. Lo que se normaliza es la clave de comparación, no el dato.
  name text not null,

  -- Localidad y país sueltos, y no una dirección en un texto: son justo lo que la
  -- fórmula de catálogo necesita por separado para escribir «Colección privada,
  -- España» sin analizar nada.
  locality text not null default '',
  country text not null default '',

  -- Dato personal de un tercero, y la fila más importante de la matriz RLS de
  -- todo el proyecto. RF-105 decide explícitamente que el Lector lo ve —no hay
  -- restricción de visibilidad por campo—, de modo que la única barrera es la
  -- política de la tabla: un fallo aquí no corrompe el catálogo, expone el
  -- teléfono de una coleccionista.
  contact text not null default '',

  contact_status public.contact_status_value not null default 'NOT_CONTACTED',

  note text not null default '',

  -- RF-804: trazabilidad completa, sellada por `tg_row_audit`.
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),

  -- RF-901 y RF-902: nada se borra, y la papelera guarda el último evento de baja
  -- y el último de restauración, no el historial de ciclos.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),
  restored_at timestamptz,
  restored_by uuid references public.profiles (id),

  -- Un nombre en blanco no identifica a nadie, y uno con espacios alrededor
  -- rompería la comparación de duplicados sin que se vea en pantalla.
  constraint parties_name_not_blank
    check (btrim(name) <> '' and name = btrim(name))
);

comment on table public.parties is
  'Personas e instituciones (RF-508): propietarios, depositarios, prestadores, titulares de derechos y la institución detrás de una sede de exposición. Clave sustituta (ADR-007): renombrar es una fila. Nada se borra, se retira.';

comment on column public.parties.contact is
  'Datos de contacto. Es dato personal de un tercero y el Lector lo ve (RF-105): la política de la tabla es su única barrera.';
comment on column public.parties.locality is
  'Localidad, suelta para poder componer «Colección privada, [país]» sin analizar una dirección.';


-- ── Un nombre, una ficha ────────────────────────────────────
--
-- Se REUTILIZA `place_key` en vez de escribir una función gemela con otro nombre.
-- Una segunda copia de la misma regla de normalización es exactamente la
-- divergencia que este proyecto persigue en todo lo demás: el día que una de las
-- dos aprenda a tratar la ç, la otra no.
--
-- El coste aceptado: dos coleccionistas distintos que se llamen igual se
-- desambiguan en el propio nombre, que es lo que hacen los catálogos («Juan
-- Pérez (Badajoz)»). A cambio, la procedencia de una obra no se parte entre dos
-- filas del mismo museo escritas con y sin tilde, que es un error que no se ve al
-- escribirlo y solo aparece al consultar «qué obras han pasado por aquí».
--
-- El índice cubre también las fichas retiradas, como en las demás maestras:
-- volver a dar de alta un nombre que está en la papelera lo RESTAURA, y para eso
-- hay que poder encontrarlo.
create unique index parties_name_unique
  on public.parties (public.place_key(name));

create index parties_active_idx on public.parties (active);

-- El nombre de la función se ha quedado estrecho para lo que hace, y se corrige
-- con su comentario y no renombrándola: `place_key` está en los índices del árbol
-- de lugares, en el selector de ubicación y espejada carácter a carácter en
-- `app/src/lib/places.ts`. Un renombrado costaría más de lo que aclara.
comment on function public.place_key is
  'Clave de comparación de nombres de todo el esquema: minúsculas y sin tildes, conservando la ñ. Nació para el árbol de lugares (ADR-006) y la usan además las tablas maestras y la de personas e instituciones. Inmutable para poder indexarla.';


-- ── Autoría y papelera, selladas por la base ────────────────

create trigger party_row_audit
  before insert or update on public.parties
  for each row execute function public.tg_row_audit();


-- ── RLS y privilegios ───────────────────────────────────────
--
-- Una tabla sin RLS está abierta, no cerrada, y la plataforma concede por omisión
-- todos los privilegios de cada tabla nueva a los roles anónimo y autenticado,
-- incluido `delete` (RF-113). Se revoca primero y se concede después, uno a uno.
--
-- Sin DELETE: ni privilegio ni política, nunca (RF-901). Retirar una ficha es un
-- update de `active`.
--
-- Las POLÍTICAS van en la migración siguiente, y hasta que existan esta tabla no
-- la lee ni la escribe nadie con sesión: RLS activado sin política niega. Es el
-- estado seguro para quedarse a medias, y el contrario del que habría dejado
-- conceder los privilegios sin activar RLS.

alter table public.parties enable row level security;

revoke all on public.parties from anon, authenticated;

grant select, insert, update on public.parties to authenticated;

-- Explícito, como en 20260801140000: en esta plataforma una función nueva nace
-- con EXECUTE para PUBLIC pese al `alter default privileges`, y quien lo caza es
-- `function_privileges.test.sql`. Una función de trigger no la invoca nadie desde
-- la API, y aun así dispara.
revoke all on function public.tg_row_audit() from public;
