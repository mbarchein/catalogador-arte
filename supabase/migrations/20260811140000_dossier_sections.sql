-- ============================================================
-- La sección, segunda mitad: su forma y cómo se añade (RF-1619 a RF-1621,
-- ADR-011).
--
-- El valor `SECTION` lo añadió 20260811130000 y no podía usarse allí; el motivo
-- está en su cabecera y en la de 20260811110000.
--
-- ── QUÉ LLEVA UNA SECCIÓN ───────────────────────────────────
--
--   · un **rótulo**, obligatorio: una sección sin título no es una sección, es un
--     salto en blanco;
--   · un **párrafo** opcional, que es la entradilla del bloque;
--   · **`divider_page`**, que decide si el rótulo se lleva una página para él.
--
-- `divider_page` y no «empezar en página nueva», y la diferencia importa: con la
-- maqueta elegida —una obra por página— **toda obra empieza ya en página nueva**,
-- así que ese interruptor no habría significado nada. Lo que sí es una decisión es
-- si la sección gasta una hoja entera en anunciarse: elegante en un dossier formal
-- de tres bloques, y un desperdicio en uno de diez.
-- ============================================================

alter table public.dossier_items
  -- Nula en cualquier otro tipo, como `with_cv`: un booleano que no significa nada
  -- en una obra es un dato que un día se lee.
  add column divider_page boolean;

comment on column public.dossier_items.divider_page is
  'Si el rótulo de esta sección se lleva una página para él en el PDF (RF-1621). Nulo en cualquier otro tipo de elemento.';

-- La forma del cuarto tipo. Las restricciones ya aplicadas no se reescriben y no
-- estorban: una fila SECTION no es ARTWORK, ni TEXT, ni BIOGRAPHY, así que las tres
-- la dejan pasar.
alter table public.dossier_items
  add constraint dossier_items_section_shape check (
    kind <> 'SECTION' or (
      btrim(heading) <> ''
      and divider_page is not null
      and catalog_id is null and image_id is null
      and price is null
      and artist_fund is null and with_cv is null
    )
  ),

  -- La otra dirección, para que la columna nueva no sea adorno en los otros tres
  -- tipos.
  add constraint dossier_items_divider_only_on_section check (
    kind = 'SECTION' or divider_page is null
  );


-- ── Añadir una ──────────────────────────────────────────────
--
-- Misma forma que sus tres hermanas: el permiso se comprueba aquí para que lo que
-- lea la usuaria sea una frase y no el silencio de un insert que no afectó a
-- ninguna fila.
--
-- Va al final, como todo lo que se añade. Agrupar —crear los rótulos y colocarlos—
-- es otra operación, y la hace la pantalla llamando a esto y después a
-- `reorder_dossier_items`, que es todo-o-nada.
create function public.add_section_to_dossier(
  p_dossier_id uuid,
  p_heading text,
  p_body text default '',
  p_divider_page boolean default false
)
returns public.dossier_items
language plpgsql
set search_path = public
as $$
declare
  v_row public.dossier_items;
begin
  if not public.can_edit() then
    raise exception 'No tienes permiso para añadir secciones a un dossier';
  end if;

  -- Dicho antes de que lo diga la restricción, que lo diría con el nombre de una
  -- restricción.
  if btrim(coalesce(p_heading, '')) = '' then
    raise exception 'Una sección necesita un rótulo'
      using hint = 'Es el título del bloque: «Óleos, 1962-1968».';
  end if;

  insert into public.dossier_items
    (dossier_id, kind, heading, body, divider_page)
  values
    (p_dossier_id, 'SECTION', btrim(p_heading), coalesce(p_body, ''),
     coalesce(p_divider_page, false))
  returning * into v_row;

  return v_row;
end $$;

comment on function public.add_section_to_dossier is
  'Añade una sección al final del dossier: su rótulo, su entradilla y si se lleva una página propia (RF-1619, RF-1621).';

revoke all on function public.add_section_to_dossier(uuid, text, text, boolean)
  from public, anon;
grant execute on function public.add_section_to_dossier(uuid, text, text, boolean)
  to authenticated;


-- ── Medido dentro de esta transacción ───────────────────────

do $$
declare v_values text[];
begin
  select array_agg(e.enumlabel::text order by e.enumsortorder)
    into v_values
    from pg_enum e
   where e.enumtypid = 'public.dossier_item_kind'::regtype;

  if v_values <> array['ARTWORK', 'TEXT', 'BIOGRAPHY', 'SECTION'] then
    raise exception 'FAIL: dossier_item_kind debería tener los cuatro tipos, tiene [%]',
      array_to_string(v_values, ', ');
  end if;

  if exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'dossier_items'
                and grantee = 'anon') then
    raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre dossier_items';
  end if;

  if exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'dossiers'
                and grantee = 'anon') then
    raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre dossiers';
  end if;

  raise notice 'OK: la sección es el cuarto tipo de elemento y nadie anónimo la alcanza';
end $$;
