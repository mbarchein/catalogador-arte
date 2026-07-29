-- ============================================================
-- Rotation and crop of a photo, stored as DATA (RF-409, RF-410, ADR-002).
--
-- The cataloger photographs with the artwork in front of them, in a storage
-- room: the shot comes out sideways or with half a wall in it. Straightening
-- and trimming it is part of cataloging, not retouching.
--
-- The master is NEVER modified. It is the archive document, the original as it
-- left the camera (ADR-002), and it lives in the external S3. Rotating and
-- cropping only affect the derivatives the application serves — the 400 px
-- thumbnail and the 2000 px consultation copy.
--
-- Why the edit is stored here and not only baked into the pixels:
--
--  1. The printed-catalog pipeline will be Python and rebuilds the derivatives
--     from the master. Without these columns it could not reproduce the same
--     framing, and the printed catalog would show a different photo from the
--     web — the very divergence the representative_image view exists to avoid.
--  2. An edit that is data is reviewable and reversible: it can be read,
--     corrected, and undone by going back to the master.
--
-- Why the crop is NORMALIZED (0..1) and not in pixels: it is applied at
-- whatever level rebuilds it — thumbnail, 2000 px derivative or full master —
-- and the same four numbers work for all three. A crop in pixels would only be
-- valid for the size it was measured on, and would silently mean something else
-- on any other level.
--
-- Why four numeric columns and not a jsonb: a check constraint can verify them.
-- `crop_x + crop_width <= 1` is checkable in SQL over columns; over a jsonb it
-- becomes an expression on keys that may not exist, of types nobody guarantees.
-- The database is the last line that says no, and it can only say it about what
-- it can read.
--
-- Rotation is measured CLOCKWISE, and the order of the transformation is fixed:
-- first rotate the master, then crop the rotated image. Both ends — the browser
-- and the Python pipeline — must apply it in that order or the framing moves.
-- ============================================================

alter table public.images
  add column rotation smallint not null default 0,
  add column crop_x numeric,
  add column crop_y numeric,
  add column crop_width numeric,
  add column crop_height numeric;

comment on column public.images.rotation is
  'Clockwise rotation to apply to the master before cropping: 0, 90, 180 or 270 degrees.';
comment on column public.images.crop_x is
  'Left edge of the crop, as a fraction (0..1) of the width of the ALREADY ROTATED image.';
comment on column public.images.crop_y is
  'Top edge of the crop, as a fraction (0..1) of the height of the already rotated image.';
comment on column public.images.crop_width is
  'Width of the crop as a fraction (0..1) of the already rotated image. Null means no crop.';
comment on column public.images.crop_height is
  'Height of the crop as a fraction (0..1) of the already rotated image. Null means no crop.';

-- Only quarter turns. A free angle would need resampling and a fill for the
-- corners, and neither belongs in a photograph that documents an artwork.
alter table public.images
  add constraint images_rotation_quarter_turn
  check (rotation in (0, 90, 180, 270));

-- All four or none. A half-written crop is not "a bit cropped": it is a
-- rectangle nobody can draw, and it would reach the Python pipeline as such.
alter table public.images
  add constraint images_crop_all_or_nothing
  check (num_nonnulls(crop_x, crop_y, crop_width, crop_height) in (0, 4));

-- Inside the image and not degenerate. A rectangle sticking out of the image
-- has no pixels to give, and one of zero width produces an empty file that
-- would only be noticed when opening the record.
alter table public.images
  add constraint images_crop_inside_image
  check (
    crop_x is null or (
      crop_x >= 0
      and crop_y >= 0
      and crop_width > 0
      and crop_height > 0
      and crop_x + crop_width <= 1
      and crop_y + crop_height <= 1
    )
  );

-- No grants and no policies here on purpose: these are columns of a table that
-- already has both, and the images_update policy covers them — whoever can edit
-- the photo can edit its framing, and a reader cannot. Nothing to open.
