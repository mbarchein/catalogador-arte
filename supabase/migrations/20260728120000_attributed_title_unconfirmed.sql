-- ============================================================
-- Title authorship: UNCONFIRMED separates from UNREVIEWED (RF-209, RF-307).
--
-- UNREVIEWED used to cover two different situations: "nobody has investigated
-- the title yet" (blank field) and "there is a title but its authorship is not
-- verified". The catalog needs them apart — «Sin revisar» no es «no» — so the
-- second one becomes UNCONFIRMED.
--
-- Only the enum value here: a value added by ALTER TYPE cannot be used in the
-- same transaction, and db push wraps each migration in one. The data split
-- and the coherence rule live in the next migration.
-- ============================================================

alter type attributed_title_value add value 'UNCONFIRMED' before 'UNREVIEWED';
