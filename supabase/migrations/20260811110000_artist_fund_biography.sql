-- ============================================================
-- The artist's biography and CV, which belong to the fund and not to the dossier
-- (RF-1616, ADR-011).
--
-- A dossier that goes to a gallery opens with who the artist is. That text is the
-- same in every dossier, so it is written ONCE per fund and read live: correcting
-- a date in the biography corrects every dossier issued from tomorrow on, which
-- is the same rule the artworks already follow. Copying it into each dossier is
-- how two versions of a biography start diverging, and the one that goes out is
-- always the one nobody corrected.
--
-- Two texts and not one, for the reason the bibliography's `pages` and `note` are
-- two: they are typeset differently and they are used separately. The biography
-- is prose —three paragraphs about the work—; the CV is a list of lines with a
-- year in front («1985 · Galería tal, Madrid (individual)»), and it gets read by
-- jumping, not by reading.
--
-- ── WHY THE CV IS NOT DERIVED FROM THE CATALOGUE ────────────
--
-- The catalogue already knows exhibitions (`exhibitions`, `artwork_exhibitions`),
-- and generating the CV from them is tempting and wrong for now, for two reasons
-- that are not going to be fixed by trying harder:
--
--   * it only knows the shows where a CATALOGUED artwork appeared, so as long as
--     the catalogue is being made the derived CV has holes — and a CV with holes
--     is worse than one typed by hand, because it looks complete;
--   * it does not record whether a show was individual or collective, which is
--     the first thing anybody reads in a CV.
--
-- What the exhibition history IS good for is **suggesting** lines while the CV is
-- written. That is a screen's job, not a column's, and until that screen exists
-- the CV is a text the cataloguer writes.
--
-- ── AND THE ENUM VALUE, ON ITS OWN AND ON PURPOSE ───────────
--
-- This migration also adds `BIOGRAPHY` to `dossier_item_kind` and **does not use
-- it**: the constraint and the function that name that value live in the next
-- migration, 20260811120000.
--
-- It is not tidiness, it is the only shape that works. `alter type ... add value`
-- is allowed inside a transaction, but the new value **cannot be used in that
-- same transaction** — «unsafe use of new value of enum type» — and the CLI
-- applies each migration file in its own transaction. A single file would fail in
-- production and pass here, because a `psql -f` with no explicit transaction
-- commits statement by statement. That is exactly the class of difference that
-- makes a local green worthless, so the split is the fix.
-- ============================================================

alter table public.artist_funds
  add column biography text not null default '',
  add column cv text not null default '';

comment on column public.artist_funds.biography is
  'Biografía del artista, en prosa. Se escribe una vez y la lee cada dossier que la lleve: corregirla aquí corrige todos los que se emitan después (RF-1616).';
comment on column public.artist_funds.cv is
  'Currículum, una línea por entrada («1985 · Galería tal, Madrid (individual)»). Aparte de la biografía porque se maqueta y se lee distinto.';

-- No `grant` and no policy: `artist_funds` has had `select` and `update` for the
-- session and its two policies since 20260808120000, and a table-level grant
-- covers columns added afterwards. What nobody gains is `insert`: a fund is
-- created by migration, because the prefix stuck to every painting depends on it.

alter type public.dossier_item_kind add value 'BIOGRAPHY';
