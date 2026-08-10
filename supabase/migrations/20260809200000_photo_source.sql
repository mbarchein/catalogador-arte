-- Whose the photograph is, and where it came from if it is not our own (RF-417).
--
-- `images.provenance` already says whether the shot is our own, taken from another catalogue or
-- received from a third party. What was missing is what has to be noted down in each case,
-- and **it is not the same datum**:
--
--   · on an **own** photograph, who took it. It is a credit, and it goes with the
--     photograph when the record is printed or handed over;
--   · on one **taken from another catalogue or received from a third party**, where it came from:
--     the catalogue, the page's address, who sent it and when. It is the
--     traceability of an image that cannot be made again, and it is what has
--     to be shown the day somebody asks where it came from.
--
-- That is why they are two columns and not one with the label changing: the same stored
-- text cannot mean «Juan Pérez lo fotografió» one day and «sacado de la
-- web del MACVA» the next just because the provenance has been touched.
--
-- ── WHAT IS NOT DONE, AND WHY ───────────────────────────────
--
-- **There is no cross constraint** requiring the column to be empty when the provenance
-- is the other one. The temptation is obvious and the price is not: changing the provenance of
-- a photograph that already has a credit would fail with a schema error in the middle
-- of a capture screen, over a datum that is not in the way. What is stored is
-- stored; **what is shown is decided by the provenance**, and `photoSource.ts` answers for that
-- with its tests, so that a dormant value cannot slip into
-- a printed record.
--
-- Both are born empty, which is what today's 39 rows are: nobody has noted down
-- either a credit or a detailed provenance yet.

alter table public.images
  add column photo_credit      text not null default '',
  add column provenance_source text not null default '';

comment on column public.images.photo_credit is
  'Quién hizo la fotografía. Solo se ofrece en las propias (provenance = OWN) y es opcional: en 35 de las 39 tomas actuales la hizo quien cataloga, y obligar a repetirlo sería teclear lo mismo treinta y cinco veces.';

comment on column public.images.provenance_source is
  'De dónde salió una fotografía que no es propia: el catálogo, la dirección de la página, quién la envió. Solo se ofrece cuando provenance no es OWN. Es texto libre y no una dirección validada a propósito — «me la pasó la familia en 2019» es una procedencia legítima y no cabe en una URL.';

-- With no new policies: they are two columns of `images`, which already has RLS and whose
-- policies are per table, not per column. Whoever can correct a photograph
-- can correct this, and whoever cannot, cannot.
