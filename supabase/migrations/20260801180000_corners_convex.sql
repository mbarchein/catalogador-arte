-- The corners' quadrilateral has to be CONVEX, not merely have an area.
--
-- The previous migration checked the sign of the signed area and its comment
-- claimed that that rejects a quadrilateral that crosses itself. **It does not
-- do so.** A self-intersecting polygon keeps a positive area as long as its
-- larger lobe wins, so the constraint accepted crossed quadrilaterals: tested
-- against this very base with the corners (0.95 0.16) (0.7 0.15) (0.85 0.9)
-- (0.15 0.9), which cross two sides and score 0.332 of area.
--
-- Rectifying one of those gives an image folded over itself, which is exactly the damage
-- the constraint existed to prevent.
--
-- It goes in a new migration and not by correcting the previous one because that one is already
-- applied: in this local base, and that is enough — rewriting a file whose migration
-- already ran leaves the base with the old rule and the repository saying something else,
-- which is worse than one file too many.
--
-- **Convexity is not just a stricter rule: it is the correct rule.** The
-- projective image of a rectangle is convex, always. So a non-convex
-- quadrilateral is not the photograph of a painting seen at an angle, whatever it is.

alter table public.images drop constraint images_corners_simple_quadrilateral;

-- The sign of the cross product at each vertex: the four equal is convex, and
-- with this walk —NW, NE, SE, SW, with Y downwards— the four positive.
-- Checked with the unit square, where the four are worth 1.
--
-- The area stays alongside with a job of its own, which convexity does not cover:
-- discarding the technically convex quadrilateral that is too small to be anything.
alter table public.images
  add constraint images_corners_convex
  check (
    corner_nw_x is null or (
      (
        (corner_nw_x * corner_ne_y - corner_ne_x * corner_nw_y) +
        (corner_ne_x * corner_se_y - corner_se_x * corner_ne_y) +
        (corner_se_x * corner_sw_y - corner_sw_x * corner_se_y) +
        (corner_sw_x * corner_nw_y - corner_nw_x * corner_sw_y)
      ) > 0.01
      and (corner_ne_x - corner_nw_x) * (corner_se_y - corner_ne_y)
        - (corner_ne_y - corner_nw_y) * (corner_se_x - corner_ne_x) > 0
      and (corner_se_x - corner_ne_x) * (corner_sw_y - corner_se_y)
        - (corner_se_y - corner_ne_y) * (corner_sw_x - corner_se_x) > 0
      and (corner_sw_x - corner_se_x) * (corner_nw_y - corner_sw_y)
        - (corner_sw_y - corner_se_y) * (corner_nw_x - corner_sw_x) > 0
      and (corner_nw_x - corner_sw_x) * (corner_ne_y - corner_nw_y)
        - (corner_nw_y - corner_sw_y) * (corner_ne_x - corner_nw_x) > 0
    )
  );

comment on column public.images.corner_nw_x is
  'Esquina superior izquierda de la obra, en fracciones (0..1) de la imagen YA GIRADA. Las ocho columnas de esquina van juntas o ninguna, forman un cuadrilátero convexo recorrido NW→NE→SE→SW, y tienen precedencia sobre crop_*.';
