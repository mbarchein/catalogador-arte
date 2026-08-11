-- ============================================================
-- La pertenencia a una sección deja de ser la posición y pasa a ser una columna
-- (RF-1619, RF-1620, ADR-011).
--
-- 20260811140000 la dejó implícita: una sección eran su rótulo y todo lo que
-- viniera detrás hasta el siguiente. Era menos esquema y se vino abajo al usarla:
-- **una sección no se podía mover entre obras sueltas**. Subirla un puesto ponía
-- su bloque delante de esas obras, que al quedar detrás del rótulo pasaban a ser
-- suyas, así que el único movimiento posible era apropiarse del dossier entero. Y
-- «obra suelta detrás de una sección» no era un estado que el modelo pudiera
-- escribir, ni siquiera para decir que no.
--
-- Con `section_item_id` cada elemento dice a qué sección pertenece, y entonces:
--
--   · mover una sección **no cambia la pertenencia de nada**, así que se desliza
--     entre las obras sueltas de una en una;
--   · una obra puede estar suelta en cualquier sitio, también al final;
--   · el pie de una página del PDF sale de la fila y no de recorrer las anteriores.
--
-- ── LO QUE SE CONSERVA: LOS BLOQUES VAN SEGUIDOS ────────────
--
-- Una columna sola admitiría una sección con sus obras repartidas por el dossier,
-- y eso rompe dos cosas que ya están impresas: la portadilla anuncia un bloque, y
-- el índice dice en qué página empieza cada sección. Así que el orden y la
-- pertenencia se comprueban juntos en `reorder_dossier_items`: los elementos de
-- una sección van **seguidos y justo detrás de su rótulo**, o no se guarda nada.
--
-- Para que ese invariante no se pueda romper por otro camino que el orden:
--
--   · lo que se añade hereda la sección del final del dossier, que es donde cae;
--   · lo que se recupera vuelve al final, con la sección del final — y no al
--     hueco muerto que tenía, que puede haber quedado en medio de otro bloque;
--   · retirar una sección **suelta a sus elementos**, que es lo que ya se veía en
--     pantalla y en el PDF cuando la pertenencia era la posición.
-- ============================================================

alter table public.dossier_items
  -- Nula es «suelta»: no pertenece a ninguna sección. Es un dato y no una falta —
  -- una obra de apertura antes del primer rótulo, o una suelta al final— y por eso
  -- no hay ningún valor centinela.
  add column section_item_id uuid;

comment on column public.dossier_items.section_item_id is
  'La sección a la que pertenece este elemento (RF-1619). Nulo es «suelta», que es un dato: sale en el PDF sin rótulo. Antes se deducía de la posición, y así una sección no se podía mover sin apropiarse de lo que tenía delante.';

-- La clave ajena es COMPUESTA y por eso hace falta esta unicidad, que sobre `id`
-- sola es redundante: es lo que impide que un elemento pertenezca a una sección de
-- OTRO dossier sin necesidad de un trigger para decirlo.
alter table public.dossier_items
  add constraint dossier_items_dossier_id_key unique (dossier_id, id);

alter table public.dossier_items
  add constraint dossier_items_section_fk
    foreign key (dossier_id, section_item_id)
    references public.dossier_items (dossier_id, id),

  -- Una sección no va dentro de otra: no hay subsecciones, y una fila que se
  -- apuntara a sí misma sería un ciclo de uno.
  add constraint dossier_items_section_not_nested check (
    kind <> 'SECTION' or section_item_id is null
  ),
  add constraint dossier_items_section_not_self check (
    section_item_id is null or section_item_id <> id
  );

create index dossier_items_section_idx on public.dossier_items (section_item_id);


-- Que la fila apuntada sea una SECCIÓN no lo puede decir la clave ajena —apunta a
-- la tabla entera— ni un `check`, que no ve otras filas.
create function public.tg_dossier_item_section_is_section()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.section_item_id is not null
     and not exists (
       select 1 from public.dossier_items s
        where s.id = new.section_item_id
          and s.kind = 'SECTION'
     ) then
    raise exception 'Ese elemento no es una sección'
      using hint = 'Solo un rótulo de sección puede agrupar obras.';
  end if;
  return new;
end $$;

comment on function public.tg_dossier_item_section_is_section is
  'La fila a la que pertenece un elemento tiene que ser una SECCIÓN (RF-1619): apuntar a una obra sería un bloque con dos títulos.';

revoke all on function public.tg_dossier_item_section_is_section() from public;

create trigger dossier_item_section_is_section
  before insert or update of section_item_id on public.dossier_items
  for each row execute function public.tg_dossier_item_section_is_section();


-- ── Retirar una sección suelta a sus elementos ──────────────
--
-- Es lo que ya pasaba cuando la pertenencia era la posición: un rótulo retirado no
-- se imprime, así que dejaba de agrupar. Ahora hay que escribirlo, y además hace
-- falta para el invariante: una pertenencia a una sección retirada no aparecería en
-- ningún orden —el orden son los activos— y dejaría el dossier sin poder reordenarse.
create function public.tg_dossier_section_release()
returns trigger language plpgsql
set search_path = public as $$
begin
  if old.kind = 'SECTION' and old.active and not new.active then
    update public.dossier_items
       set section_item_id = null
     where dossier_id = old.dossier_id
       and section_item_id = old.id;
  end if;
  return new;
end $$;

comment on function public.tg_dossier_section_release is
  'Retirar una sección suelta lo que agrupaba (RF-1619): el rótulo no se imprime, así que sus obras dejan de tener sección. Recuperarla no las readopta.';

revoke all on function public.tg_dossier_section_release() from public;

create trigger dossier_section_release
  after update of active on public.dossier_items
  for each row execute function public.tg_dossier_section_release();


-- ── La sección del final del dossier ────────────────────────
--
-- «Lo que se añade cae al final, y por lo tanto entra en el bloque que allí esté.»
-- Si el final es una obra suelta, lo nuevo sale suelto; si es un rótulo vacío, entra
-- en él. Es la regla que hace que añadir obras mientras se llena una sección las
-- meta dentro sin pedir nada.
create function public.dossier_tail_section(p_dossier_id uuid, p_except uuid default null)
returns uuid
language sql
stable
set search_path = public
as $$
  select case when d.kind = 'SECTION' then d.id else d.section_item_id end
    from public.dossier_items d
   where d.dossier_id = p_dossier_id
     and d.active
     and (p_except is null or d.id <> p_except)
   order by d.sort_order desc, d.id desc
   limit 1
$$;

comment on function public.dossier_tail_section is
  'La sección en la que caería un elemento nuevo: la del último elemento activo del dossier, o la propia si ese último es un rótulo. Nulo si el dossier acaba en algo suelto.';

revoke all on function public.dossier_tail_section(uuid, uuid) from public, anon;
grant execute on function public.dossier_tail_section(uuid, uuid) to authenticated;


-- ── Lo que se recupera vuelve al final, y con la sección del final ──
--
-- `add_artwork_to_dossier` ya lo hacía al restaurar una obra retirada, por una
-- razón de interfaz: la obra tiene que aparecer donde se acaba de añadir y no donde
-- estaba hace un mes. Ahora es además lo que sostiene el invariante — el hueco
-- muerto que tenía puede haber quedado en medio de otro bloque—, así que sube al
-- esquema y vale para cualquier camino, también para un `update active = true`
-- suelto desde la pantalla.
create function public.tg_dossier_item_restore()
returns trigger language plpgsql
set search_path = public as $$
begin
  if not old.active and new.active then
    select coalesce(max(d.sort_order), 0) + 1
      into new.sort_order
      from public.dossier_items d
     where d.dossier_id = new.dossier_id
       and d.id <> new.id;

    new.section_item_id := public.dossier_tail_section(new.dossier_id, new.id);
  end if;
  return new;
end $$;

comment on function public.tg_dossier_item_restore is
  'Un elemento recuperado vuelve al FINAL del dossier y con la sección de lo que allí hubiera (RF-1612): aparece donde se acaba de recuperar, y el bloque al que se une es el que tiene delante.';

revoke all on function public.tg_dossier_item_restore() from public;

-- Antes que `dossier_item_row_audit` por el nombre, como el de asignar el orden: da
-- igual hoy —el de auditoría no mira estas dos columnas— y este comentario está
-- para que siga dando igual a propósito.
create trigger dossier_item_bb_restore
  before update of active on public.dossier_items
  for each row execute function public.tg_dossier_item_restore();


-- ── La pertenencia de lo que ya está ────────────────────────
--
-- Se rellena con la regla que estaba en vigor: la última sección activa que quede
-- por encima. Es exactamente lo que la pantalla y el PDF venían enseñando, así que
-- ningún dossier cambia de aspecto al aplicar esto.
update public.dossier_items i
   set section_item_id = (
     select s.id
       from public.dossier_items s
      where s.dossier_id = i.dossier_id
        and s.kind = 'SECTION'
        and s.active
        and s.sort_order < i.sort_order
      order by s.sort_order desc
      limit 1
   )
 where i.kind <> 'SECTION';


-- ── Reordenar: el orden y la pertenencia, juntos o ninguno ──
--
-- Se sustituye la de dos argumentos en vez de añadir una sobrecarga: dos funciones
-- con el mismo nombre dejarían a PostgREST eligiendo, y una llamada por nombre de
-- argumento no sabría a cuál va. La versión nueva acepta las dos llamadas — sin
-- `p_section_ids` la pertenencia no se toca—, así que el frontend anterior sigue
-- funcionando durante el despliegue en dos fases.
drop function public.reorder_dossier_items(uuid, uuid[]);

create function public.reorder_dossier_items(
  p_dossier_id uuid,
  p_line_ids uuid[],
  p_section_ids uuid[] default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_active integer;
  v_given integer := coalesce(array_length(p_line_ids, 1), 0);
  v_sections integer := coalesce(array_length(p_section_ids, 1), 0);
  r record;
  v_prev_id uuid := null;
  v_prev_kind public.dossier_item_kind := null;
  v_prev_section uuid := null;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para reordenar los elementos de un dossier';
  end if;

  -- A repeated identifier would pass the count check below and leave two items
  -- fighting for one position.
  if v_given <> (select count(distinct t.line_id) from unnest(p_line_ids) as t(line_id)) then
    raise exception 'La lista de elementos tiene identificadores repetidos';
  end if;

  -- The list must be EXACTLY the dossier's active items. A stale client —
  -- somebody else added or withdrew an artwork meanwhile — would otherwise leave
  -- items out of the order or drag in another dossier's.
  select count(*) into v_active
    from public.dossier_items
   where dossier_id = p_dossier_id and active;

  if v_active <> v_given then
    raise exception 'La lista de elementos no coincide con la del dossier';
  end if;

  -- La pertenencia viaja en paralelo al orden, elemento por elemento. Una lista más
  -- corta desplazaría las secciones una posición y nadie lo vería hasta abrir el PDF.
  if p_section_ids is not null and v_sections <> v_given then
    raise exception 'La lista de secciones no coincide con la de elementos';
  end if;

  -- The alias is `line_id` and not `id`, which is not a matter of taste: inside a
  -- subquery over `dossier_items`, an unqualified `id` resolves to the table's
  -- own column and the comparison would be a tautology that lets another
  -- dossier's items through.
  if exists (
    select 1 from unnest(p_line_ids) as t(line_id)
    where not exists (
      select 1 from public.dossier_items
       where dossier_items.id = t.line_id
         and dossier_items.dossier_id = p_dossier_id
         and dossier_items.active
    )
  ) then
    raise exception 'Algún elemento no pertenece a este dossier';
  end if;

  -- Los bloques van seguidos: un elemento con sección va justo detrás de su rótulo
  -- o detrás de otro elemento de la misma sección. Se comprueba sobre el orden que
  -- se pide, con la pertenencia que se pide, porque las dos cosas solo son
  -- verificables juntas.
  for r in
    select t.ordinality as pos,
           d.id,
           d.kind,
           case when p_section_ids is null then d.section_item_id
                else p_section_ids[t.ordinality] end as section_id
      from unnest(p_line_ids) with ordinality as t(line_id, ordinality)
      join public.dossier_items d on d.id = t.line_id
     order by t.ordinality
  loop
    if r.kind = 'SECTION' then
      if r.section_id is not null then
        raise exception 'Una sección no puede ir dentro de otra';
      end if;
    elsif r.section_id is not null then
      if not exists (
        select 1 from public.dossier_items s
         where s.id = r.section_id
           and s.dossier_id = p_dossier_id
           and s.kind = 'SECTION'
           and s.active
      ) then
        raise exception 'Alguna sección de la lista no está en este dossier';
      end if;

      -- `coalesce` y no la comparación desnuda: con `v_prev_section` nula la
      -- expresión sale NULL, un `if` con NULL no entra, y la comprobación no
      -- comprobaría nada justo en el caso que importa —una obra con sección detrás
      -- de algo suelto—.
      if not coalesce((v_prev_kind = 'SECTION' and v_prev_id = r.section_id)
                      or v_prev_section = r.section_id, false) then
        raise exception 'Los elementos de una sección tienen que ir seguidos, detrás de su rótulo'
          using hint = 'Mueve la sección entera, o saca el elemento de la sección.';
      end if;
    end if;

    v_prev_id := r.id;
    v_prev_kind := r.kind;
    v_prev_section := r.section_id;
  end loop;

  update public.dossier_items d
     set sort_order = p.position,
         section_item_id = case when p_section_ids is null
                                then d.section_item_id
                                else p_section_ids[p.position] end
    from (
      select line_id, ordinality as position
        from unnest(p_line_ids) with ordinality as t(line_id, ordinality)
    ) p
   where d.id = p.line_id
     and (d.sort_order is distinct from p.position
          or (p_section_ids is not null
              and d.section_item_id is distinct from p_section_ids[p.position]));
end $$;

comment on function public.reorder_dossier_items is
  'Reordena los elementos activos de un dossier, y si se le pasan las secciones también las asigna: la lista entera o ninguna (RF-1603, RF-1619). Comprueba que los elementos de cada sección van seguidos detrás de su rótulo.';

revoke all on function public.reorder_dossier_items(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.reorder_dossier_items(uuid, uuid[], uuid[]) to authenticated;


-- ── Lo que se añade hereda la sección del final ─────────────

create or replace function public.add_artwork_to_dossier(
  p_dossier_id uuid,
  p_catalog_id text,
  p_note text default '',
  p_price numeric default null,
  p_image_id text default null
)
returns public.dossier_items
language plpgsql
set search_path = public
as $$
declare
  v_row public.dossier_items;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir obras a un dossier';
  end if;

  insert into public.dossier_items
    (dossier_id, catalog_id, note, price, image_id, section_item_id)
  values
    (p_dossier_id, p_catalog_id, coalesce(p_note, ''), p_price, p_image_id,
     public.dossier_tail_section(p_dossier_id))
  on conflict (dossier_id, catalog_id) do update
     -- El orden y la sección de la línea recuperada los pone
     -- `tg_dossier_item_restore`: vuelve al final y al bloque que haya allí. Aquí
     -- solo se enciende, y por eso ya no se calcula `sort_order`.
     set active = true,
         -- What is not sent is not deleted: adding an artwork that was already
         -- there cannot empty the note or the price somebody wrote, because the
         -- «Añadir» form comes in blank. Emptying them is editing the item,
         -- which is another operation.
         note = case when btrim(excluded.note) <> ''
                     then excluded.note
                     else dossier_items.note end,
         price = coalesce(excluded.price, dossier_items.price),
         image_id = coalesce(excluded.image_id, dossier_items.image_id)
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.add_text_to_dossier(
  p_dossier_id uuid,
  p_heading text default '',
  p_body text default ''
)
returns public.dossier_items
language plpgsql
set search_path = public
as $$
declare
  v_row public.dossier_items;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir textos a un dossier';
  end if;

  -- Said before the constraint says it: `dossier_items_text_shape` would reject
  -- this with the name of a constraint, and what the user reads has to be a
  -- sentence.
  if btrim(coalesce(p_heading, '')) = '' and btrim(coalesce(p_body, '')) = '' then
    raise exception 'Un texto sin rótulo ni párrafo no dice nada'
      using hint = 'Escribe al menos una de las dos cosas.';
  end if;

  insert into public.dossier_items (dossier_id, kind, heading, body, section_item_id)
  values (p_dossier_id, 'TEXT', coalesce(p_heading, ''), coalesce(p_body, ''),
          public.dossier_tail_section(p_dossier_id))
  returning * into v_row;

  return v_row;
end $$;

-- La firma es la de 20260811120000 y no una parecida: quitarle `p_heading` no la
-- reemplazaría, crearía una segunda función con el mismo nombre y PostgREST se
-- quedaría sin poder elegir. Medido — «function is not unique» —, no temido.
create or replace function public.add_biography_to_dossier(
  p_dossier_id uuid,
  p_artist_fund public.artist_fund,
  p_heading text default '',
  p_with_cv boolean default true
)
returns public.dossier_items
language plpgsql
set search_path = public
as $$
declare
  v_row public.dossier_items;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir una biografía a un dossier';
  end if;

  if exists (
    select 1 from public.dossier_items
     where dossier_id = p_dossier_id
       and kind = 'BIOGRAPHY'
       and artist_fund = p_artist_fund
       and active
  ) then
    raise exception 'Este dossier ya lleva la biografía de ese fondo'
      using hint = 'Muévela de sitio o cámbiala, en vez de añadirla otra vez.';
  end if;

  insert into public.dossier_items
    (dossier_id, kind, artist_fund, heading, with_cv, section_item_id)
  values
    (p_dossier_id, 'BIOGRAPHY', p_artist_fund, coalesce(p_heading, ''),
     coalesce(p_with_cv, true), public.dossier_tail_section(p_dossier_id))
  returning * into v_row;

  return v_row;
end $$;


-- ── Medido dentro de esta transacción ───────────────────────

do $$
declare
  v_dossier uuid;
  v_section uuid;
  v_a uuid;
  v_b uuid;
  v_failed boolean;
begin
  insert into public.dossiers (title) values ('Comprobación de la migración')
  returning id into v_dossier;

  insert into public.dossier_items (dossier_id, kind, heading, divider_page)
  values (v_dossier, 'SECTION', 'Óleos', false)
  returning id into v_section;

  -- Lo que se añade detrás de un rótulo entra en él.
  insert into public.dossier_items (dossier_id, kind, heading, body, section_item_id)
  values (v_dossier, 'TEXT', '', 'Dentro', public.dossier_tail_section(v_dossier))
  returning id into v_a;

  if (select section_item_id from public.dossier_items where id = v_a) is distinct from v_section then
    raise exception 'FAIL: lo añadido al final tenía que heredar la sección del final';
  end if;

  -- Y una vez fuera, lo siguiente también sale fuera.
  update public.dossier_items set section_item_id = null where id = v_a;
  insert into public.dossier_items (dossier_id, kind, heading, body, section_item_id)
  values (v_dossier, 'TEXT', '', 'Suelto', public.dossier_tail_section(v_dossier))
  returning id into v_b;

  if (select section_item_id from public.dossier_items where id = v_b) is not null then
    raise exception 'FAIL: detrás de algo suelto se añade algo suelto';
  end if;

  -- Un elemento no puede pertenecer a algo que no es una sección.
  v_failed := false;
  begin
    update public.dossier_items set section_item_id = v_b where id = v_a;
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL: un elemento ha podido pertenecer a algo que no es una sección';
  end if;

  -- Retirar la sección suelta lo que agrupaba.
  update public.dossier_items set section_item_id = v_section where id = v_a;
  update public.dossier_items set active = false where id = v_section;
  if (select section_item_id from public.dossier_items where id = v_a) is not null then
    raise exception 'FAIL: retirar una sección tenía que soltar sus elementos';
  end if;

  -- Los elementos primero: `dossier_id` es `on delete restrict` a propósito, porque
  -- de aquí no se borra nada por la aplicación.
  delete from public.dossier_items where dossier_id = v_dossier;
  delete from public.dossiers where id = v_dossier;

  raise notice 'OK: la pertenencia a una sección es una columna, y se hereda del final';
end $$;
