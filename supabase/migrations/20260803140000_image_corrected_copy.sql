-- ============================================================
-- The corrected copy at full resolution: a photograph's fourth file
-- level (RF-420, and RF-411 as its reason for being; ADR-002).
--
-- RF-409 fixed three levels per shot: a thumbnail for the mosaic, a consultation
-- derivative for the record, and an archive master with the whole original. A
-- fourth is added: a copy at full resolution with **all** the corrections already
-- applied, which is generated and uploaded at the moment the correction is applied.
--
-- This does NOT touch the master and cannot touch it: the master is uploaded once with the
-- file's original bytes and is never written again (ADR-002). This
-- migration adds columns for a NEW file at a NEW path. If somebody
-- reads these columns as permission to rewrite a master, they are reading the
-- opposite of what they say.
-- ============================================================


-- ── Why it exists ───────────────────────────────────────────
--
-- RF-411 is the whole use case: the record offers downloading the original by a signed
-- URL, to the Reader too, because sending it to a printer or to a curator is
-- exactly what it is stored for. And there two true things cross that without
-- this fourth level contradict each other:
--
--   · the master is intact, and it must be: it is the archive document, and what
--     makes it a document is that nobody has touched it;
--   · for that very reason, the master **is the uncorrected photograph**: it carries the
--     yellow cast of the store's bulb, the crooked perspective of
--     having shot from one side and the framing with the wall's edge
--     inside.
--
-- That is: until today, «Descargar máster» handed the printer precisely the
-- version the cataloguer had spent half an hour fixing, and the fix
-- stayed in the 400 px thumbnail and in the 2000 px derivative, which are the two
-- that are of no use for printing. The work was done and it did not reach its
-- recipient.
--
-- The corrected copy is what is sent. The master is what is kept. Both
-- files exist at once and neither replaces the other, because they do not answer the
-- same question: one answers «what the photograph was like as it came out of the
-- camera» and the other «what the artwork is like».


-- ── Why it carries ALL the corrections and not only the colour ──
--
-- Rotation, crop, perspective and colour, all four, in the canonical order
-- geometry → colour that the colour's migration fixed.
--
-- A copy with the colour fixed and the perspective crooked is of no use to anybody:
-- the curator who opens it sees a trapezoidal painting of a correct colour, and in
-- a printed reproduction the deformation shows more than the cast, because a
-- frame that is not rectangular is given away by any page edge. Half a
-- correction is not half an improvement, it is a file that has to be corrected again by
-- hand at the printer's, and then what has been sent is homework.
--
-- Hence it being ONE path column and not one per correction. There is no «copy with
-- the colour applied» and «straightened copy»: there is the copy, with everything the record
-- says has to be applied at the moment it was applied. The parameters of how
-- it was arrived at go on living in their columns (`rotation`, `crop_*`,
-- `corner_*`, `color_*`), absolute over the master and reversible; this path is
-- only where the result ended up.


-- ── This path is NEVER the master's ─────────────────────────
--
-- A rule, not a recommendation. The master is never rewritten, and the realistic way
-- of breaking it is not a malicious `update`: it is deriving the copy's path from the
-- master's —changing its extension, adding a suffix, reusing the base— and
-- having them coincide one day. That is why:
--
--   · the `images_corrected_not_master` constraint forbids the two columns
--     from having the same value, and **there is a test that checks it** in both
--     directions (moving the copy onto the master and moving the master onto the
--     copy), in `supabase/tests/image_corrected_copy.test.sql`;
--   · the store's paths are already immutable for another reason that holds here
--     too: the service worker caches by path with `CacheFirst`, so
--     overwriting a path would serve the old bytes from the phone for
--     ever. Re-editing writes a new path and the previous copy stays in the
--     store with nothing deleting it, which is the discipline of «never a real
--     delete» applied to the files.
--
-- The constraint does not compare with `thumbnail_path` nor with `derivative_path`, and it is not
-- an oversight: those two live in Supabase Storage's bucket and the corrected copy
-- goes to Backblaze B2 with the master, because of size (RNF-110). A collision with them is not
-- possible because of the store, and one with the master is because they share a
-- store, a naming scheme and an upload signature. The constraint is where the
-- risk is.
--
-- And like the master: **this path enters no view**. The
-- `representative_image` view goes on publishing thumbnail and derivative and nothing else. A
-- full-resolution file is delivered by a signed URL from the Edge function or
-- it is not delivered (RF-411).


-- ── Why `corrected_pending` is a column ─────────────────────
--
-- And not the mere absence of `corrected_path`. Without it, these two rows would be the
-- same row:
--
--   1. «no copy is needed, because this photograph has no
--      correction applied»: nothing to generate, nothing to upload, and the master already is
--      the correct answer to RF-411;
--   2. «one is needed, it was attempted and this device has not been able to generate it».
--
-- Both would be read as «there is no copy», and the first —which is the majority—
-- would cover the second up to the point of making it invisible. Nobody would try again because
-- nothing would say it was left pending, and the record would deliver the uncorrected master
-- believing that was what had to be delivered.
--
-- The failure we are talking about is real and it is silent, which is the worst of the two
-- things: a `canvas`'s maximum area is limited by the device (on old
-- WebKit, of the order of 16.7 million pixels, and a 4000×3000 master with
-- rectified perspective gets close), and **on exceeding it the canvas comes out blank
-- without throwing any error**. There is no exception to catch. If nobody checks the
-- capacity before and probes a pixel afterwards, what is uploaded is a white JPEG of the
-- correct size, with its plausible `corrected_bytes`, and the printer receives a
-- blank sheet of an artwork.
--
-- So the row has to be able to say that the copy is missing. It is the discipline of
-- «sin revisar» is not «no», which is a project criterion: the pending datum is not
-- written the same as the datum that is not needed. With the column there are three
-- distinguishable states and all three mean something:
--
--   corrected_path not null                    the copy is there, and it is complete
--   all null, corrected_pending false          not needed: there are no corrections
--   corrected_pending true                     needed and missing: pending
--
-- The third is the one the interface states with its reason, and the one that allows generating it
-- afterwards from a computer with more memory. The first two are mutually exclusive with
-- the third by constraint: if the copy is there, it is not pending.


-- ── The cost that is accepted, with the numbers in front ────
--
-- It is on record here because it is an owner's decision and not a side effect, and
-- because the place where it is going to show is the store's bill:
--
--   · **storage on B2 doubles** with respect to RNF-108's sizing.
--     That assumption projects of the order of 5000 shots and 10-40 GB of masters (with the
--     measured correction: the real masters go from 0.2 to 19 MB, not from 2 to 8). One
--     corrected copy per corrected shot is, at the limit, as much again:
--     20-80 GB instead of 10-40;
--   · **every «Aplicar» uploads a file the size of the master** —up to 19 MB— through
--     the offline queue, from a store with bad coverage. It is not one more upload
--     among the three that were already there: it is the biggest of all, and it is repeated every time
--     a parameter is eased off and applied again.
--
-- It is accepted in exchange for RF-411 delivering the corrected photograph instead of the
-- photograph with the bulb's light. It is taken with these numbers in sight and
-- **it is not reopened**; what is done is leaving it written here, in RNF-108 and in
-- `docs/decisiones/`, so that a year from now B2's consumption has an
-- explanation and not a surprise.


-- ── The columns ─────────────────────────────────────────────
--
-- Three, and of the same type as their sisters: `text` for the path, like
-- `master_path`, and `integer` for the size, like `master_bytes`. An `integer`
-- reaches 2 GB and a photograph's real ceiling is 19 MB.
alter table public.images
  add column corrected_path    text,
  add column corrected_bytes   integer,
  add column corrected_pending boolean not null default false;

comment on column public.images.corrected_path is
  'Ruta en Backblaze B2 de la copia a resolución completa con TODAS las correcciones aplicadas (giro, recorte, perspectiva y color). Es lo que se entrega al descargar la fotografía para una imprenta o un comisario (RF-411); el máster se conserva intacto y sin corregir. Nunca es la ruta del máster: son ficheros distintos y hay una restricción que lo impide. Nulo significa que no hay copia, y hay dos motivos posibles: que no haga falta ninguna porque la fotografía no tiene correcciones, o que quedara pendiente, que es lo que dice corrected_pending.';
comment on column public.images.corrected_bytes is
  'Tamaño en bytes de la copia corregida. Va en pareja con corrected_path: una ruta sin tamaño obligaría a pedirle el tamaño al almacén para poder anunciar la descarga, y un tamaño sin ruta no describe ningún fichero.';
comment on column public.images.corrected_pending is
  'La copia corregida hace falta y no está: este dispositivo no ha podido generarla. Existe como columna propia porque sin ella «no ha podido» y «no hace falta» serían la misma fila, y la segunda —que es la mayoría— taparía la primera: el área máxima de un lienzo la limita el dispositivo y al superarla sale en blanco sin lanzar ningún error, así que el fallo hay que poder anotarlo. La interfaz lo dice con su razón y la copia se puede generar después desde un ordenador. Cierto y corrected_path no nulo son estados excluyentes.';


-- ── The constraints, one per rule and with a name of its own ──
--
-- Just as in the colour's migration: the only thing Postgres says on rejecting is
-- the constraint's name, so each rule carries its own and a rejection
-- explains which rule was broken without having to deduce it.

-- Zero bytes is an empty file and a negative one is a badly done computation. Neither one nor
-- the other is a size, and both would reach the record as a download that
-- promises something that is not there. `master_bytes` does not carry this check because it was born
-- before the project had it as a custom; the new column does.
alter table public.images
  add constraint images_corrected_bytes_positive
  check (corrected_bytes is null or corrected_bytes > 0);

-- Both or neither. The path and the size are not two data, they are a file: half a
-- description of a file is the one that forces whoever reads it to go and ask the
-- store, which is exactly the trip the column exists to save.
alter table public.images
  add constraint images_corrected_copy_pair
  check (num_nonnulls(corrected_path, corrected_bytes) in (0, 2));

-- Pending and present are mutually exclusive: if the copy is there, it is not pending.
-- Admitting both things at once would leave a row that says «there is a copy» and «the copy
-- is missing», and whoever read it would have to choose which of the two to believe.
alter table public.images
  add constraint images_corrected_pending_exclusive
  check (not (corrected_pending and corrected_path is not null));

-- ADR-002's rule written where the base can defend it: the corrected copy
-- does not share a path with the master.
--
-- `is distinct from` and not `<>`, and it is worth being exact about the reason, because it is
-- easy to tell it as an avoided failure and it is not: **with the
-- `corrected_path is null` guard in front, both forms admit exactly the same
-- rows** (checked in this base: with `master_path` null, `<>` gives null and a
-- `check` with null passes, just as `is distinct from` giving true). `is
-- distinct from` is chosen because the predicate is total and never evaluates to null: the rule does not
-- depend on a `check` accepting what it does not know, it is read without following three-valued
-- logic, and it goes on saying the same thing the day somebody reorders the
-- expression or removes the guard.
alter table public.images
  add constraint images_corrected_not_master
  check (corrected_path is null or corrected_path is distinct from master_path);


-- ── What the base does NOT forbid, on purpose ───────────────
--
-- There is no constraint requiring `master_path` in order to have `corrected_path`. Today
-- one cannot get there —with no master the colour is forbidden with the same
-- `canRestoreOriginal` switch the perspective already uses—, but the rule is a
-- rendering one and lives in the client; writing it here would prevent the legitimate case of
-- a copy already generated whose master gets reclassified or relocated, and it would prevent it
-- on saving, when there is no longer anything to be done.
--
-- Nor is there a constraint tying `corrected_pending` to corrections existing.
-- Marking a photograph with no correction as pending is
-- harmless —whoever reads it will retry, will generate a file identical to the master and
-- will leave it done— whereas a `check` that enumerated «there is something to apply»
-- would have to repeat the definition of the four corrections here and would end up
-- out of line the first time a fifth was added.
--
-- And no row is rewritten backwards. The 39 active rows are left with
-- the copy null and `corrected_pending` false, which is the truth: there is no copy and
-- none is missing, because no correction has been applied since this level
-- has existed. The first time one is opened and one is applied, it will be generated.


-- ── Privileges: checked, not assumed ────────────────────────
--
-- CLAUDE.md warns that the platform grants by default all the privileges
-- of every new table to `anon` and `authenticated`, `delete` included, and that it is
-- worth checking it instead of believing it. The colour's sister migration already
-- measured it; here it has been measured again over this very base, with these three columns
-- already created, querying `information_schema.column_privileges` and
-- `information_schema.role_table_grants`:
--
--   · `anon` **does not appear even once**: no privilege over `public.images`,
--     not `select` either, and no `usage` over the `public` schema either. The three
--     new columns open nothing to it.
--   · `authenticated` has `select`, `insert` and `update` **over the table**, not
--     over a list of columns, and a table privilege reaches the columns
--     added afterwards: the three new ones already appear with those three
--     privileges, 54 columns × 3, and therefore **there is nothing to grant**.
--     No `delete`, which is the one that had to be watched: `delete` over this table
--     is held only by `postgres`, `service_role` and `supabase_admin`.
--
-- There are no new types, so there is no `grant usage` to do: this
-- migration adds `text`, `integer` and `boolean`.
--
-- Who can write these three columns is decided by the `images_update` policy
-- with `can_edit()`, just as for the rest of the row: a Reader writes
-- none, and that is verified **by authenticating for real** in section 8 of
-- `supabase/tests/image_corrected_copy.test.sql`, not by reading this migration.
--
-- Mind RF-411's deliberate asymmetry, which matters here and which the test
-- checks in both directions: the Reader **downloads** the corrected copy —that is
-- what it is for, and therefore they have to be able to read `corrected_path` and
-- `corrected_bytes`— and **does not write** any of the three. Denying them the read would
-- give no error: it would leave the download button with no path to sign, and the
-- record would deliver the uncorrected master believing there was no copy.
