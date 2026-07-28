-- ============================================================
-- Title and authorship cannot contradict each other (RF-209, RF-307).
--
-- The five states split by whether a title is written:
--   blank title  → UNREVIEWED (pending investigation, the initial state)
--                  or NOT_APPLICABLE (investigated: the artwork has no title)
--   written title → NO (authentic, by the artist), YES (convenience name by
--                  third parties) or UNCONFIRMED (authorship not verified)
-- ============================================================

-- Existing rows: with a written title, both UNREVIEWED and a stray
-- NOT_APPLICABLE (the old form allowed the contradiction) mean the same
-- thing — the title is there and nobody confirmed its authorship.
update public.artworks
   set attributed_title = 'UNCONFIRMED'
 where attributed_title in ('UNREVIEWED', 'NOT_APPLICABLE') and btrim(title) <> '';

-- Defensive normalization before the constraint: an authorship claim about a
-- title that is not written goes back to pending.
update public.artworks
   set attributed_title = 'UNREVIEWED'
 where attributed_title in ('NO', 'YES', 'UNCONFIRMED') and btrim(title) = '';

alter table public.artworks add constraint artworks_attributed_title_matches_title
  check ((attributed_title in ('UNREVIEWED', 'NOT_APPLICABLE')) = (btrim(title) = ''));
