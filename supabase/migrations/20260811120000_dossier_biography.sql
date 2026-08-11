-- ============================================================
-- The biography as a third kind of item (RF-1616, ADR-011).
--
-- ADR-011 left it written that the list of items had room for a third kind
-- «without guessing what a row with everything null meant». This is that third
-- kind, and it arrives for the reason predicted: a dossier that goes to a gallery
-- opens with who the artist is.
--
-- It is an ITEM and not a switch on the dossier, and that is the whole point of
-- having one list: **the position is the decision**. A biography goes first in a
-- gallery dossier and at the end in a catalogue-shaped one, and neither placement
-- needs a column to say so — it needs a place in the order, which the item
-- already has.
--
-- WHAT IT CARRIES AND WHAT IT DOES NOT. It carries **which fund's** biography it
-- is, and nothing else: the text lives in `artist_funds` and is read live, so
-- correcting a date corrects every dossier issued afterwards (RF-1608). Copying
-- the prose into the item would be a second biography, wrong from the first time
-- the two stopped matching.
--
-- The escape hatch was already there and costs nothing: a dossier that needs its
-- own shortened biography writes it as a TEXT item and does not add this one.
--
-- The enum value `BIOGRAPHY` was added by 20260811110000 and could not be used
-- there — see that file's header for why the split is not tidiness.
-- ============================================================

alter table public.dossier_items
  -- The join key of the whole schema, and a real foreign key because
  -- `artist_funds.code` is unique: a biography of a fund that does not exist
  -- cannot be saved.
  add column artist_fund public.artist_fund references public.artist_funds (code),

  -- Whether this item also prints the CV after the biography. A dossier to a
  -- gallery wants both; a short one wants only the prose. Null on every other
  -- kind, which is what the constraint below says: a boolean that means nothing
  -- on an artwork row is a datum that one day gets read.
  add column with_cv boolean;

comment on column public.dossier_items.artist_fund is
  'De qué fondo es la biografía de este elemento. El texto vive en artist_funds y se lee al emitir, no se copia aquí (RF-1616).';
comment on column public.dossier_items.with_cv is
  'Si el elemento imprime también el currículum detrás de la biografía. Nulo en cualquier otro tipo de elemento.';

create index dossier_items_fund_idx on public.dossier_items (artist_fund);

-- The third kind's shape. The two constraints already applied stay untouched —an
-- applied migration is not rewritten— and they do not get in the way: a
-- BIOGRAPHY row is neither ARTWORK nor TEXT, so both of them pass it through.
--
-- `heading` IS allowed: it is the section's title («Alberto Rotili, 1928-2009»),
-- and empty means the interface writes the fund's name. `body` is not: the prose
-- is not here.
alter table public.dossier_items
  add constraint dossier_items_biography_shape check (
    kind <> 'BIOGRAPHY' or (
      artist_fund is not null
      and with_cv is not null
      and catalog_id is null and image_id is null
      and price is null
      and body = ''
    )
  ),

  -- The other direction, and it is the one that keeps the two new columns from
  -- becoming decoration on the rows that are not biographies.
  add constraint dossier_items_fund_only_on_biography check (
    kind = 'BIOGRAPHY' or (artist_fund is null and with_cv is null)
  );


-- ── Adding one ──────────────────────────────────────────────
--
-- Same shape as its two siblings: the permission is checked here so that what the
-- user reads is a sentence and not the silence of an insert that affected no row.
--
-- It goes LAST, like everything else. A gallery dossier wants it first, and that
-- is a move —add and then reorder— and not a second rule inside the base: «lo
-- añadido va al final» has to mean the same thing for the three kinds, or the
-- order stops being predictable.
--
-- Only ONE biography per fund and per dossier: two would print the same text
-- twice, which is nobody's intention. It is not a unique index because
-- `dossier_items_unique` already occupies (dossier_id, catalog_id) and a partial
-- index over a withdrawn-covering pair would collide with the restore-on-re-add
-- rule; here the check is enough, because there is no «restore» to speak of — a
-- withdrawn biography is added again as a new one and nothing is lost, since the
-- text was never in the row.
create function public.add_biography_to_dossier(
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
    (dossier_id, kind, artist_fund, heading, with_cv)
  values
    (p_dossier_id, 'BIOGRAPHY', p_artist_fund, coalesce(p_heading, ''),
     coalesce(p_with_cv, true))
  returning * into v_row;

  return v_row;
end $$;

comment on function public.add_biography_to_dossier is
  'Añade al final del dossier la biografía de un fondo, con su currículum o sin él (RF-1616). Una sola por fondo y dossier.';

revoke all on function public.add_biography_to_dossier(uuid, public.artist_fund, text, boolean)
  from public, anon;
grant execute on function public.add_biography_to_dossier(uuid, public.artist_fund, text, boolean)
  to authenticated;


-- ── Measured inside this transaction ────────────────────────
--
-- The two new columns cannot arrive with a privilege for the anonymous role —a
-- table-level grant covers columns added later, and `revoke`s do too, but this is
-- not taken for granted, it is measured— and the third kind has to be in the enum
-- before anything above could have used it.

do $$
declare v_values text[];
begin
  select array_agg(e.enumlabel::text order by e.enumsortorder)
    into v_values
    from pg_enum e
   where e.enumtypid = 'public.dossier_item_kind'::regtype;

  if v_values <> array['ARTWORK', 'TEXT', 'BIOGRAPHY'] then
    raise exception 'FAIL: dossier_item_kind debería tener ARTWORK, TEXT y BIOGRAPHY, tiene [%]',
      array_to_string(v_values, ', ');
  end if;

  if exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'dossier_items'
                and grantee = 'anon') then
    raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre dossier_items';
  end if;

  if exists (select 1 from information_schema.column_privileges
              where table_schema = 'public' and table_name = 'artist_funds'
                and grantee = 'anon') then
    raise exception 'FAIL: el rol anónimo tiene algún privilegio sobre artist_funds';
  end if;

  raise notice 'OK: la biografía es el tercer tipo de elemento y nadie anónimo la alcanza';
end $$;
