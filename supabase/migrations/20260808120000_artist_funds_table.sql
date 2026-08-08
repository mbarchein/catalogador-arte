-- El fondo, de tipo enumerado a tabla maestra (ADR-007, segunda entrega).
--
-- La primera entrega (20260801160000) dejó esto escrito y lo aplazó a propósito:
-- «El fondo (`artist_fund`) NO entra aquí. Es un tipo enumerado y sus valores
-- sostienen el prefijo de `catalog_id`, que es la etiqueta pegada al cuadro: va
-- en la segunda entrega, para que esa parte se revise con la numeración por fondo
-- delante y no de refilón.» Esto es esa segunda entrega, y se ha revisado con la
-- numeración delante — de ahí lo que NO hace.
--
-- ── LO QUE NO CAMBIA, Y POR QUÉ ─────────────────────────────
--
-- **El tipo enumerado se queda, y las columnas también.** `artworks.artist`,
-- `series.artist` y `archive_documents.artist_fund` siguen siendo
-- `public.artist_fund`, y esta tabla se une por ese valor (`code`). Cambiarlas a
-- clave ajena obligaría a un despliegue en dos fases sobre columnas en uso, y no
-- compra nada de lo que hacía falta: lo que se pedía era poder renombrar el
-- fondo, ocultarlo y no poder borrarlo.
--
-- **La generación de `catalog_id` no se toca**, ni la restricción que ata el
-- prefijo al fondo. `AR-0001` está impreso en una etiqueta pegada a un cuadro:
-- el prefijo se guarda aquí para que la verdad esté en un sitio, pero se guarda
-- como dato de lectura, no como algo que se pueda cambiar.
--
-- **No se pueden dar de alta fondos nuevos.** Sin `insert` —ni privilegio ni
-- política— porque un fondo nuevo trae un prefijo nuevo, y ese prefijo entra en
-- la generación de identificadores, en la restricción de las obras y en la lista
-- blanca de la función que firma los ficheros del archivo. Eso es una decisión
-- de esquema, con su migración, y no una fila que se teclea un martes.
--
-- ── LOS DOS INTERRUPTORES, QUE SON DISTINTOS ────────────────
--
-- `active` es si el fondo **se ofrece**: al dar de alta una obra, en los
-- selectores, en los filtros. `hide_artworks` es si **sus obras se apartan** del
-- listado. Son independientes a propósito, porque el caso que los pidió es el
-- fondo de pruebas: se quiere dejar de ofrecerlo Y apartar sus obras, pero
-- también se quiere poder dejar de ofrecerlo sin esconder nada. Meterlos en un
-- solo interruptor obligaría a elegir por la catalogadora.
--
-- Ninguno de los dos borra nada, y `hide_artworks` no es una política: la obra
-- sigue siendo legible por su identificador y su enlace sigue funcionando. Lo
-- que hace es que el listado no la traiga por omisión. Esconderla de verdad
-- sería un borrado con otro nombre.

create table public.artist_funds (
  id uuid primary key default gen_random_uuid(),

  -- El valor del enumerado que guardan TODAS las columnas del esquema. Es la
  -- clave de unión y es legado: `ROTILI` y `RUIZ_CAMPINS` son apellidos y `TEST`
  -- ya está en inglés, así que no se traduce ni se renombra.
  code public.artist_fund not null unique,

  -- El prefijo de `catalog_id`, que es lo que está impreso en la etiqueta del
  -- cuadro. Se guarda para que la correspondencia fondo→prefijo esté escrita en
  -- una tabla y no solo dentro de un `case` de una función; NO se edita.
  prefix text not null unique,

  -- Tal cual se escribe, con sus mayúsculas y sus tildes. Esto sí se corrige:
  -- es el único dato del fondo que es una decisión editorial.
  name text not null,

  -- RF-901: nada se borra, se retira. Retirado aquí significa «no se ofrece»,
  -- no «no se ve»: ver la política de lectura.
  active boolean not null default true,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles (id),

  -- El segundo interruptor: apartar sus obras del listado. Falso por omisión,
  -- que es lo que hacen los tres fondos hoy.
  hide_artworks boolean not null default false,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  -- Un nombre en blanco no nombra nada, y uno con espacios alrededor rompería la
  -- comparación sin que se vea en pantalla.
  constraint artist_funds_name_not_blank
    check (btrim(name) <> '' and name = btrim(name)),

  -- Dos letras mayúsculas, que es la forma del prefijo en `catalog_id` y lo que
  -- da por hecho `next_catalog_id` al leer el número desde el carácter cuarto.
  constraint artist_funds_prefix_shape check (prefix ~ '^[A-Z]{2}$')
);

comment on table public.artist_funds is
  'Los fondos del catálogo como tabla maestra (ADR-007, segunda entrega). El enumerado artist_fund se queda: esta tabla se une por «code» y aporta el nombre editable, el prefijo de catalog_id como dato de lectura, y los dos interruptores. Sin insert ni delete: un fondo nuevo es una migración, y ninguno se borra.';

comment on column public.artist_funds.code is
  'Valor del enumerado que guardan las columnas del esquema. Legado: no se traduce ni se renombra. Inmutable (ver tg_artist_fund_keys_immutable).';
comment on column public.artist_funds.prefix is
  'Prefijo de catalog_id, impreso en la etiqueta física de la obra. Inmutable.';
comment on column public.artist_funds.active is
  'Si el fondo SE OFRECE al dar de alta y en los selectores. Retirado no es invisible: sus obras se siguen leyendo y su nombre se sigue mostrando.';
comment on column public.artist_funds.hide_artworks is
  'Si sus obras se apartan del listado por omisión. Independiente de «active», y nunca un borrado: la obra sigue siendo legible por su identificador.';

create index artist_funds_active_idx on public.artist_funds (active);

-- Los tres que hay, con el prefijo que ya sostienen sus identificadores. El
-- nombre es el que la aplicación traía escrito a mano en `ARTIST_LABEL`.
insert into public.artist_funds (code, prefix, name) values
  ('ROTILI', 'AR', 'Alberto Rotili'),
  ('RUIZ_CAMPINS', 'RC', 'María Ruiz Campins'),
  ('TEST', 'TS', 'Pruebas');

-- ── Lo que no se puede tocar ────────────────────────────────
--
-- `code` es lo que guardan miles de filas de otras tablas y `prefix` está
-- impreso en las etiquetas pegadas a las obras. Cambiar cualquiera de los dos no
-- es corregir un dato: es dejar el catálogo diciendo una cosa y el mundo otra.
-- La interfaz no los ofrece, y esto es lo que lo garantiza cuando la interfaz se
-- equivoque.
create function public.tg_artist_fund_keys_immutable()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.code is distinct from old.code then
    raise exception 'El código de un fondo no se puede cambiar'
      using hint = 'Es el valor que guardan todas las obras, las series y los documentos de ese fondo.';
  end if;
  if new.prefix is distinct from old.prefix then
    raise exception 'El prefijo de un fondo no se puede cambiar'
      using hint = 'Está impreso en la etiqueta pegada a cada obra de este fondo.';
  end if;
  return new;
end $$;

create trigger artist_fund_keys_immutable
  before update on public.artist_funds
  for each row execute function public.tg_artist_fund_keys_immutable();

-- ── Siempre queda uno que ofrecer ───────────────────────────
--
-- Con los tres retirados, dar de alta una obra sería una pantalla con un
-- selector vacío y sin forma de salir de ahí desde la aplicación: para volver a
-- activar uno hay que poder llegar a la tabla, y para catalogar hay que poder
-- elegir fondo. Se niega el último, y se dice por qué.
create function public.tg_artist_fund_keeps_one_active()
returns trigger language plpgsql
set search_path = public as $$
begin
  if old.active and not new.active then
    if (select count(*) from public.artist_funds where active and id <> new.id) = 0 then
      raise exception 'No se puede retirar el último fondo activo'
        using hint = 'Si se retiran todos, no queda ninguno que elegir al dar de alta una obra.';
    end if;
  end if;
  return new;
end $$;

create trigger artist_fund_keeps_one_active
  before update of active on public.artist_funds
  for each row execute function public.tg_artist_fund_keeps_one_active();

-- RF-902: la baja y la restauración las sella la base, no lo que mande el
-- cliente. El mismo disparador que las demás maestras.
create trigger artist_funds_row_audit
  before insert or update on public.artist_funds
  for each row execute function public.tg_row_audit();

-- ── Perímetro ───────────────────────────────────────────────
--
-- La plataforma concede TODOS los privilegios de una tabla nueva a los roles
-- anónimo y autenticado, `delete` incluido, así que primero se revoca y luego se
-- concede uno a uno. Aquí se conceden dos: leer y corregir. Ni `insert` —un
-- fondo nuevo es una migración— ni `delete` —RF-901, y sobre todo: borrar un
-- fondo dejaría sin nombre a todas sus obras.
alter table public.artist_funds enable row level security;
revoke all on public.artist_funds from anon, authenticated;
grant select, update on public.artist_funds to authenticated;

-- Lee todo el equipo, ACTIVOS Y RETIRADOS, que es donde esta tabla se aparta de
-- las otras maestras. Un tipo de publicación retirado casi no lo cita nadie; el
-- fondo lo lleva TODA obra, así que esconder la fila a quien solo consulta
-- dejaría sin nombre al fondo de cada obra que la Lectora abriera. Retirado
-- significa que no se ofrece, no que no se ve.
create policy artist_funds_select on public.artist_funds
  for select using (public.can_read());

create policy artist_funds_update on public.artist_funds
  for update using (public.can_edit()) with check (public.can_edit());
