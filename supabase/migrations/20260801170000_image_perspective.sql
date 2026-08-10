-- The artwork's four corners in the photograph, in order to correct the perspective.
--
-- A painting photographed at an angle is not a rectangle in the photo: it is a
-- trapezium, and cropping it with a rectangle leaves wall on two sides and eats artwork
-- on the other two. Eight of the catalogue's fourteen artworks have more than 1° of
-- convergence and two reach 11.69°, so it is not a rare case.
--
-- What is stored are **the four corners and not the deformed image**: the
-- master stays intact (ADR-002), the corners can be dragged again and the
-- rectification is recomputed. It is the same invariant that already holds up the crop —what is
-- stored is absolute over the master, so re-editing replaces and does not compose— and
-- it is the reason this is a datum and not a new file.
--
-- **Eight `numeric` columns and not the homography's eight coefficients nor a
-- `jsonb`**, by the same argument that wrote the crop's migration: a
-- corner can be bounded with a `check` and verified at a glance, whereas an
-- `h21` means nothing that can be verified. The homography is computed from
-- the corners where it is needed; storing the matrix would be storing the result
-- of a computation instead of its data.

alter table public.images
  add column corner_nw_x numeric,
  add column corner_nw_y numeric,
  add column corner_ne_x numeric,
  add column corner_ne_y numeric,
  add column corner_se_x numeric,
  add column corner_se_y numeric,
  add column corner_sw_x numeric,
  add column corner_sw_y numeric;

comment on column public.images.corner_nw_x is
  'Esquina superior izquierda de la obra, en fracciones (0..1) de la imagen YA GIRADA. Las ocho columnas de esquina van juntas o ninguna, y tienen precedencia sobre crop_*.';

-- The eight or none, for the same reason as the crop: half a perspective is not «a
-- little corrected», it is a quadrilateral nobody can draw, and it would reach the
-- printed catalogue's Python pipeline like that.
alter table public.images
  add constraint images_corners_all_or_nothing
  check (
    num_nonnulls(
      corner_nw_x, corner_nw_y, corner_ne_x, corner_ne_y,
      corner_se_x, corner_se_y, corner_sw_x, corner_sw_y
    ) in (0, 8)
  );

-- Each corner, inside the photograph or stuck to its edge.
--
-- The margin of a quarter of the image outwards is deliberate and is decided:
-- in five photographs of the batch the artwork's sides are not inside the
-- frame, and dragging a corner outside the edge is the only way of
-- rectifying those. What goes outside the photograph is filled in, and the interface warns
-- that that area is not in the shot. With no margin at all, the correction would be
-- impossible in precisely the photos that need it most; with no limit, a slipped finger
-- would ask to rectify to a plane that does not fit in memory.
alter table public.images
  add constraint images_corners_within_reach
  check (
    corner_nw_x is null or (
      corner_nw_x between -0.25 and 1.25 and corner_nw_y between -0.25 and 1.25 and
      corner_ne_x between -0.25 and 1.25 and corner_ne_y between -0.25 and 1.25 and
      corner_se_x between -0.25 and 1.25 and corner_se_y between -0.25 and 1.25 and
      corner_sw_x between -0.25 and 1.25 and corner_sw_y between -0.25 and 1.25
    )
  );

-- And that it be a quadrilateral walked in order, not a loop.
--
-- Any four points admit two ways of joining them that cross
-- themselves, and one of them is what comes out of dragging a corner past its
-- neighbour. Rectifying a loop produces an image folded over itself, which is one of
-- those things that are only discovered on opening the record. It is checked with the sign of
-- the signed area (the shoelace formula), whose absolute value is besides
-- what prevents a degenerate quadrilateral.
--
-- About the sign, which is easy to deduce the wrong way round —it was—: with Y downwards, which
-- is how an image's rows are numbered, walking NW → NE → SE → SW goes in the
-- CLOCKWISE direction ON SCREEN and gives a POSITIVE area. Checked with the
-- unit square, which gives 2. The `check` catches it first time if it is inverted.
alter table public.images
  add constraint images_corners_simple_quadrilateral
  check (
    corner_nw_x is null or (
      (corner_nw_x * corner_ne_y - corner_ne_x * corner_nw_y) +
      (corner_ne_x * corner_se_y - corner_se_x * corner_ne_y) +
      (corner_se_x * corner_sw_y - corner_sw_x * corner_se_y) +
      (corner_sw_x * corner_nw_y - corner_nw_x * corner_sw_y)
    ) > 0.01
  );

-- ── Precedence, and why the deployment is still one-phase ───
--
-- If there are corners, they rule; if not, the crop rules. Both coexist on
-- purpose and with nothing migrated: the twenty-eight rows that already have a crop
-- keep it and go on being read the same, and the old frontend —which knows nothing of
-- corners— goes on working during the seconds the deployment lasts,
-- because the new columns are born null.
--
-- What is NOT done is a re-rendering campaign over those twenty-eight rows: there is
-- no server to process them, and the stored framing is the cataloguer's
-- judgement, not geometry that can be recomputed better.

-- ── Where the framing came from ─────────────────────────────
--
-- Today it is impossible to distinguish the crop she drew from the one she accepted from a
-- suggestion, and that is why measuring the detector forced INFERRING that distinction from a
-- residue of two ten-thousandths in four numbers: a very strong inference, but
-- not a proof. Without this column, every future measurement drags the same doubt.
--
-- The rows that already exist stay null —«not known»— and **never at
-- 'MANUAL'**, which would be inventing the datum. It is an enumerated type and not text for the same reason
-- as the rest of the schema: the values are code.

create type public.crop_source as enum ('MANUAL', 'SUGGESTED', 'SUGGESTED_ADJUSTED');

comment on type public.crop_source is
  'De dónde salió el encuadre de una fotografía: dibujado a mano, aceptado tal cual de la sugerencia, o sugerido y después ajustado. Nulo es «no se sabe», que es lo que llevan las filas anteriores a esta columna.';

alter table public.images add column crop_source public.crop_source;

comment on column public.images.crop_source is
  'Procedencia del encuadre. Nulo en las filas creadas antes de que existiera esta columna: no se sabe, y suponer «a mano» sería inventarlo.';

-- With no grants and no policies, as in the crop's migration and for the same reason: they are
-- columns of a table that already has both, and the images_update policy
-- covers them — whoever can edit the photo can edit its framing, and a Reader cannot.
revoke all on type public.crop_source from public;
grant usage on type public.crop_source to authenticated;
