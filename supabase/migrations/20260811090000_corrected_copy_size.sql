-- ============================================================
-- The size in pixels of the corrected copy (RF-411, RF-420).
--
-- The record now says how big each of the two downloadable files is, next to what it
-- weighs: a print shop asks for pixels, and «1,5 MB» does not say whether a
-- reproduction can go full page. The original's size was already there —
-- `original_width`/`original_height`, from the colour migration — and the copy's was
-- nowhere.
--
-- ── WHY IT IS STORED AND NOT COMPUTED ───────────────────────
--
-- It can be computed: the copy is the master with the geometry applied, and
-- `editedSize` in `app/src/lib/imageEdits.ts` is the very function that decided the
-- canvas when the file was written. The application uses it, and it is exact.
--
-- But it needs the master's size to start from, and **no photograph in the catalogue
-- has it**: `original_width` arrived with 20260803120000 and nothing was filled in
-- backwards (ADR-010), so today all 39 active rows carry it null. Computed only, the
-- button would say nothing about precisely the copies that already exist — which are
-- the ones somebody is going to send to a print shop this month.
--
-- Measured at the moment of writing the file, the row says the size of every copy
-- there is from the first one onwards, and it says the size THE FILE HAS rather than
-- the size it should have. Those two only differ when something has gone wrong, and
-- that is exactly when a caption must not be reassuring.
--
-- The arithmetic stays as the fallback for the copies written before these columns:
-- it is right, it costs nothing, and it disappears on its own as those rows get
-- re-corrected.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────
--
--  * It does not fill in a single row, neither these columns nor
--    `original_width`/`original_height`. Doing so would mean downloading 44 masters
--    from B2 and decoding them, there is no server that can, and a number invented in
--    SQL on the one door out of the application is worse than no number. What fills
--    them in is the browser the next time it decodes the master, and the local tool
--    that empties the pending queue — both already have the bitmap in hand.
--  * It adds no index. Nobody searches by the size of a file.
--  * It does not touch `corrected_bytes`, `corrected_path` or `corrected_pending`:
--    this is one more fact about the same file, not a change to its state machine.
-- ============================================================

alter table public.images
  add column corrected_width  integer,
  add column corrected_height integer;

comment on column public.images.corrected_width is
  'Ancho en píxeles de la copia corregida, medido al escribir el fichero. Nulo mientras no haya copia o si se generó antes de que existiera esta columna: entonces la aplicación lo deduce de la geometría. Va en pareja con corrected_height.';

comment on column public.images.corrected_height is
  'Alto en píxeles de la copia corregida, medido al escribir el fichero. Va en pareja con corrected_width.';

-- ── The rules, one per constraint and with a name of its own ──
--
-- Same shape and same names as the original's size, which is the sister pair of
-- columns: what Postgres says on rejecting is the constraint's name, so a rejection
-- explains which rule was broken without having to deduce it.

-- Both sides or neither. Half a size is not a size, and whoever read it would have to
-- guess the other half — the same rule as `images_original_size_pair`.
alter table public.images
  add constraint images_corrected_size_pair
  check (num_nonnulls(corrected_width, corrected_height) in (0, 2));

-- A zero would be a copy with no pixels and a negative one a badly done computation.
-- Neither is a size, and both would reach the button as a promise about a file that
-- cannot be what it says.
alter table public.images
  add constraint images_corrected_size_positive
  check (
    corrected_width is null or (corrected_width > 0 and corrected_height > 0)
  );

-- A size with no copy describes nothing: these columns measure the file that
-- `corrected_path` names, so without the path there is nothing to measure. The other
-- direction is deliberately allowed — a copy with no size is every copy written before
-- this migration, and rejecting those would refuse the rows the fallback exists for.
alter table public.images
  add constraint images_corrected_size_needs_copy
  check (corrected_width is null or corrected_path is not null);

-- ── Privileges: checked, not assumed ────────────────────────
--
-- Nothing to grant, and it is measured rather than taken as known. `authenticated` has
-- `select`, `insert` and `update` **over the table** and not over a list of columns, so
-- a column added afterwards inherits those three; `anon` has no privilege over
-- `public.images` at all. The sister migrations 20260803120000 and 20260803140000
-- measured the same thing against `information_schema` and wrote down the numbers.
--
-- There are no new types, so there is no `grant usage` to do: two `integer`s.
--
-- Who may write them is decided by the `images_update` policy with `can_edit()`, like
-- the rest of the row, and who may READ them matters just as much because of RF-411's
-- deliberate asymmetry: the Reader downloads the corrected copy, so the Reader has to
-- be able to read its size — denying the read would give no error, it would leave the
-- button with nothing to say. That is verified by authenticating for real in
-- `supabase/tests/image_corrected_copy.test.sql`, not by reading this migration.
