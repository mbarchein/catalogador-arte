-- ============================================================
-- Colour adjustment of a photograph, stored as a DATUM, plus the date the
-- file carries, the original's size and the provenance
-- (RF-414, RF-416, RF-417, RF-418, ADR-002).
--
-- A store's light tints the artworks: under an incandescent bulb a canvas
-- comes out yellowish, and that yellow is not the painting's, it is the bulb's.
-- Taking it off is cataloguing and not retouching, because what the photograph has to
-- document is the artwork and not the light there was that day.
--
-- The adjustment lives here and not baked into the pixels, for the same reason as the rotation and the
-- crop: the master is never touched (ADR-002), the derivatives are regenerated from
-- it, and the printed catalogue's future Python pipeline needs these columns
-- in order to print the same colour that is seen on the web —the divergence the
-- representative_image view exists to avoid—. An adjustment that is a datum can be read,
-- eased off, corrected and undone a year from now.
--
-- What is NOT stored because it is not implemented (RF-415, a negative requirement):
-- saturation, vibrance, global contrast, shadows and highlights separately,
-- sharpness, dehaze and reflection removal. A varnish that has
-- yellowed and a colour that has lost intensity are the artwork's state, and they are
-- exactly what has to be testified: brightening them would be cataloguing an artwork that does not
-- exist. There is no column for them and their absence is deliberate; if one day
-- one appears, it is a mistake and not an improvement.
-- ============================================================


-- ── Scalars with a `check`, and not a `jsonb` ───────────────
--
-- The argument is already written in the crop's migration and it goes on being the
-- decisive one: the base is the last line that says no, and it can only say it about
-- what it knows how to read. `color_gamma between 0.60 and 1.60` is checkable over a
-- column. Over a `jsonb` it becomes an expression over keys that may
-- not exist, of types nobody guarantees: a `{"gamma": "bastante"}` would go in
-- without a complaint and would come out as NaN in the browser's lookup table, that
-- is, as a blank channel in an artwork's thumbnail. Sixteen columns
-- are more to write once and much less to fix afterwards.


-- ── Null is identity, not unknown ──────────────────────────
--
-- Except in `color_source`, null here means «this parameter does nothing»:
-- temperature and tint 0, exposure 0 EV, blacks 0, whites 255, gamma 1.00,
-- shoulder 0. Every absent parameter has an identity value, and out of that come two
-- consequences worth leaving written down:
--
--  1. **Every colour column is independent.** There is no «all or
--     none» rule like the one the crop and the eight corners do have, and there is not one
--     because none would be needed: a row with only the temperature corrected and
--     the rest null is a perfectly applicable adjustment, whereas half a
--     rectangle is a rectangle nobody can draw. Only in pairs go the
--     two columns that together are a point —the grey touched with the
--     eyedropper— and the two that together are a size.
--  2. **The deployment is single-phase.** The 39 active rows stay
--     null and are read as neutral, and the old frontend —which does not know these
--     columns— serves those same rows without noticing during the seconds the
--     deployment has both versions in the air.
--
-- And no row is rewritten backwards. There is no server to recompute 39
-- colour adjustments, and even if there were: a photograph's colour is decided with
-- the artwork in front and that light in your face, not with statistics over the file.


-- ── The canonical rendering order ───────────────────────────
--
-- **geometry → reduction to the level → colour.** Spelled out: rotate the master,
-- rectify the perspective and crop (the crop's migration already fixed «rotate
-- first, crop afterwards», and the corners' one that the corners rule over the
-- crop); then reduce to the size of the level that is going to be written —400 px
-- the thumbnail, 2000 px the consultation copy—; and only then apply the colour
-- table to the result, code by code.
--
-- The order is normative because it changes the result: **reduce-then-table is not
-- the same as table-then-reduce.** The reduction averages pixels and the colour
-- curve is not linear, so the mean of two transformed values is not the
-- transformation of their mean. The difference is not seen on a flat surface and
-- appears exactly on the high-frequency edges: a frame's edge, a
-- thin signature, a canvas's weave. That is, where one looks most.
--
-- Reducing first was chosen because it is the only order that fits on the phone, which is
-- the main device: the table is applied over 2000×1500 instead of over
-- 4000×3000 —a quarter of the pixels— and over an `ImageData` the
-- path already has in hand. That is also why the table is not folded inside the
-- rectification's bilinear loop, although there it would come for free: it would put the colour before
-- reducing in the photos with corrected perspective and afterwards in the rest, and two
-- derivatives of the same artwork would stop matching because of the path they took.
--
-- The two ends —the browser and the Python pipeline— apply this order, or
-- the printed catalogue and the web show different colours of the same artwork.


-- ── Where the adjustment came from ──────────────────────────
--
-- Traced from `crop_source`, which solved this same problem for the framing:
-- without the column it is impossible to distinguish the adjustment she decided from the one she
-- accepted from a suggestion, and every future measurement of the automatic one would drag that
-- doubt.
--
-- `REVIEWED_UNCHANGED` exists because **«sin revisar» is not «no»**, which is
-- a project criterion and not a detail: without that value, a row with all the
-- colour null does not distinguish «it was looked at with the artwork in front, the light was good and it
-- was left as it was» from «it was never looked at». The first is work done and the second
-- is work pending, and the difference between the two is what says how much is left.
--
-- The 39 existing rows stay null —«not known»— and **never at
-- 'MANUAL'** nor at 'REVIEWED_UNCHANGED', which would be inventing the datum in precisely
-- the column that exists so as not to invent it.
create type public.color_source as enum (
  'MANUAL',
  'NEUTRAL_PICKED',
  'AUTO',
  'AUTO_ADJUSTED',
  'PRESET',
  'REVIEWED_UNCHANGED'
);

comment on type public.color_source is
  'De dónde salió el ajuste de color: a mano, tomando un gris de la foto, del ajuste automático, del automático y después retocado, de un preset de tipo de luz, o revisado y dejado como estaba. Nulo es «no se sabe», que es lo que llevan las filas anteriores a esta columna: nadie miró todavía el color de esa fotografía.';


-- ── Where the neutral reference came from (RF-418) ──────────
--
-- A plain grey is indistinguishable from a grey wall, so what is detected is not
-- «a grey» but a staircase of uniform and achromatic patches, contiguous and
-- aligned, whose tones keep the white / mid / black relation. That recognises
-- the bought three-patch card and the sheet printed at home alike, and does not
-- confuse either of the two with a wall, which has no steps. No
-- particular product is encoded.
--
-- The three states are stored because **they are not believed equally**, and that is the whole
-- reason it is an enumerated type and not a boolean «there was a witness»:
--
--   TARGET_CARD   its grey is reliable
--   TARGET_PRINT  its grey is NOT reliable: a home printer's ink is not
--                 neutral —it has its own cast and it changes with the paper and with
--                 the cartridge—, so the staircase serves to recognise the
--                 pattern and to place the black and white points, which depend
--                 only on which is the lightest patch and which the darkest,
--                 but not as a cast reference. Distinguishing it from the card
--                 is the only thing that avoids correcting an artwork's colour with
--                 a printer's colour error
--   SCENE         reasonable: a wall, plain cardboard or cloth taken with the eyedropper
--   NONE          corrected by eye, and it is on record that it was by eye
--
-- The detection never applies anything on its own: it points out the candidate over the photo and
-- offers it. A year later, this column is what answers «where did this
-- white come from?» without having to believe the result blindly.
create type public.color_reference as enum (
  'TARGET_CARD',
  'TARGET_PRINT',
  'SCENE',
  'NONE'
);

comment on type public.color_reference is
  'De dónde salió la referencia neutra del ajuste: carta de grises comprada, hoja de parches impresa en casa (su gris no es fiable, la tinta doméstica no es neutra: vale para los puntos negro y blanco, no para la dominante), una zona neutra de la propia escena, o nada, corregido a ojo.';


-- ── Type of light (RF-414) ──────────────────────────────────
--
-- A list of options and **not a deduction**: each value is a starting point
-- for the temperature and the tint that can be touched afterwards, and the interface
-- labels it as a starting point and never as a measurement. Which one was chosen is stored
-- because it is the answer to «why this number and not another» when the number is no longer
-- remembered; null means none was used, not that it is not known what light
-- there was.
create type public.light_preset as enum (
  'DAYLIGHT',
  'OVERCAST',
  'FLUORESCENT_COOL',
  'FLUORESCENT_WARM',
  'LED_NEUTRAL',
  'INCANDESCENT',
  'MIXED_WINDOW_CEILING',
  'FLASH'
);

comment on type public.light_preset is
  'Tipo de luz elegido como punto de partida del ajuste: luz de ventana, día nublado, fluorescente frío, fluorescente cálido, LED neutro, bombilla incandescente, mezcla de ventana y techo, o flash del móvil. Es un punto de partida ajustable, nunca una medición de la luz que había.';


-- ── The photograph's provenance (RF-417) ────────────────────
--
-- Four photographs of the catalogue are reproductions taken from other catalogues
-- online: 1080×2400 and with no camera data. They are not a cataloguing error, they are
-- the only thing there is of those artworks.
--
-- On those that are not our own **the colour adjustment is not offered**, and the reason is a
-- matter of principle and not technical: one would be correcting the development another person did,
-- over an artwork whoever corrects has never seen with that light. What came out
-- of there would not be a better photograph, it would be an invention with the look of a
-- document.
create type public.photo_provenance as enum (
  'OWN',
  'OTHER_CATALOG',
  'THIRD_PARTY'
);

comment on type public.photo_provenance is
  'Procedencia de la fotografía: hecha para el catálogo, tomada de otro catálogo, o recibida de un tercero. En las que no son propias no se ofrece el ajuste de color: sería retocar el revelado de otra persona sobre una obra que no se ha visto con esa luz.';


-- ── The columns ─────────────────────────────────────────────
--
-- The types and the ranges are those of the specification, literally, because the
-- client's code is written against them: each parameter's scale is the
-- same in the interface's control, in the lookup table and in this column, and
-- a single one of the three out of line gives a different colour depending on which way it comes in.
--
-- Two warnings about the types, both checked against this base:
--
--   · the `numeric(4,2)` of the two clipping percentages reaches up to 99.99 and **a
--     100.00 does not fit**: Postgres rejects it with «numeric field overflow», which is not
--     a message the user should ever see. An adjustment that flattens the whole
--     photo is reachable —a high black point over a dark shot— so whoever
--     writes saturates the value at 99.99. And it saturates without losing anything: between «99.99 %
--     flattened» and «100 %» there is no different decision to take.
--   · the `numeric(3,2)` of the exposure stores two decimals and the control's step is
--     1/6 of an EV, which does not fit exactly in two. What is stored is the rounded
--     value, and **that is the reference value**: the lookup table is
--     rebuilt from what is stored and not from the number of steps, so that opening
--     a photograph, looking at it and applying again gives the same result and does not
--     rewrite files over a ten-thousandth.
alter table public.images
  add column color_temperature  smallint,
  add column color_tint         smallint,
  add column color_exposure     numeric(3,2),
  add column color_black        smallint,
  add column color_white        smallint,
  add column color_gamma        numeric(3,2),
  add column color_shoulder     smallint,
  add column color_gray         boolean not null default false,
  add column color_neutral_x    numeric(6,5),
  add column color_neutral_y    numeric(6,5),
  add column color_clipped_low  numeric(4,2),
  add column color_clipped_high numeric(4,2),
  add column color_source       public.color_source,
  add column color_reference    public.color_reference,
  add column color_light        public.light_preset,
  add column color_inherited    boolean not null default false,
  add column file_photo_date       date,
  add column file_photo_date_exact boolean,
  add column original_width  integer,
  add column original_height integer,
  add column provenance public.photo_provenance not null default 'OWN';

comment on column public.images.color_temperature is
  'Balance de blancos, eje cálido-frío: −60 (más frío) a +60 (más cálido). Nulo o 0 es no tocar nada. Se aplica en luz lineal y con las ganancias normalizadas, así que corregir la dominante solo puede oscurecer y nunca quema por sí solo las altas luces.';
comment on column public.images.color_tint is
  'Balance de blancos, eje verde-magenta: −40 a +40. Nulo o 0 es no tocar nada.';
comment on column public.images.color_exposure is
  'Exposición en pasos (EV): −2,00 a +2,00. Nulo o 0 es no tocar nada. El ajuste automático se limita a ±1,00, la mitad: sugerir de más es peor que no sugerir.';
comment on column public.images.color_black is
  'Punto negro, 0 a 64: el código de entrada que pasa a ser negro. Nulo o 0 es no tocar nada.';
comment on column public.images.color_white is
  'Punto blanco, 192 a 255: el código de entrada que pasa a ser blanco. Nulo o 255 es no tocar nada.';
comment on column public.images.color_gamma is
  'Medios tonos, 0,60 a 1,60. Aclara u oscurece la zona media sin mover el negro ni el blanco. Nulo o 1,00 es no tocar nada.';
comment on column public.images.color_shoulder is
  'Suavizado de las altas luces, 0 a 100: comprime la zona más clara en vez de recortarla en plano. Nulo o 0 es no tocar nada.';
comment on column public.images.color_gray is
  'Pasar la fotografía a blanco y negro (luminancia Rec. 709 en luz lineal). Solo se ofrece en las tomas de reverso y de detalle de firma, donde el color no es el dato; en un detalle de daño o de marco sí lo es.';
comment on column public.images.color_neutral_x is
  'Punto que se tocó con el cuentagotas para fijar el gris, coordenada horizontal en fracciones (0..1) de la imagen YA GIRADA: el mismo sistema de coordenadas normalizado que crop_* y corner_*, para que la tabla tenga uno y no tres. Va en pareja con color_neutral_y.';
comment on column public.images.color_neutral_y is
  'Coordenada vertical del punto tomado con el cuentagotas, en fracciones (0..1) de la imagen ya girada. Va en pareja con color_neutral_x.';
comment on column public.images.color_clipped_low is
  'Porcentaje de píxeles que quedaron empastados en negro al aplicar este ajuste (0,00 a 99,99). Es la consecuencia y no la decisión: dice cuánto detalle de sombra se perdió, y se escribe cuando se aplica, con el encuadre y el nivel de ese momento. Recalcularlo después desde el máster no es lo mismo que constar.';
comment on column public.images.color_clipped_high is
  'Porcentaje de píxeles que quedaron quemados en blanco al aplicar este ajuste (0,00 a 99,99). Igual que color_clipped_low: se anota al aplicar, para que un informe de conservación pueda auditar qué detalle se sacrificó y no tenga que fiarse de una cuenta hecha años después.';
comment on column public.images.color_source is
  'De dónde salió el ajuste de color de esta fotografía. Nulo es «no se sabe»: nadie ha mirado todavía su color. Ojo: eso no es lo mismo que REVIEWED_UNCHANGED, que es haberlo mirado y haberlo dejado igual.';
comment on column public.images.color_reference is
  'De dónde salió la referencia neutra del ajuste (RF-418). Nulo cuando no hay ajuste, o cuando el ajuste no necesitó ninguna referencia.';
comment on column public.images.color_light is
  'Tipo de luz elegido como punto de partida, si se eligió alguno. Nulo significa que no se usó ninguno, no que se ignore qué luz había.';
comment on column public.images.color_inherited is
  'El ajuste no se decidió para esta toma: se heredó de la toma general de la obra. La pantalla lo indica, se puede cambiar toma por toma y se puede restablecer a lo heredado. Es un hecho sobre cómo llegó el ajuste, no sobre sus números: comparar los valores con los de la toma general diría «heredado» también cuando coinciden por casualidad.';
comment on column public.images.file_photo_date is
  'Fecha de la toma leída del fichero de la fotografía. NO sustituye a photo_date, que es la fecha de la ficha: las dos pueden diferir legítimamente y se conservan las dos.';
comment on column public.images.file_photo_date_exact is
  'Cierto si la fecha del fichero es la de la toma (DateTimeOriginal); falso si es aproximada (DateTime del IFD0, que por especificación es la fecha de modificación del fichero). Nulo solo si no hay fecha del fichero.';
comment on column public.images.original_width is
  'Ancho en píxeles del máster tal como lo entrega el decodificador, con la orientación EXIF ya aplicada. No es PixelXDimension del EXIF, que en 16 de los 44 másteres viene sin girar y no coincide con lo que se ve.';
comment on column public.images.original_height is
  'Alto en píxeles del máster tal como lo entrega el decodificador, con la orientación EXIF ya aplicada. Va en pareja con original_width.';
comment on column public.images.provenance is
  'Procedencia de la fotografía (RF-417). Por omisión propia, que es lo que son 35 de las 39; las cuatro reproducciones tomadas de otros catálogos se marcan a mano. En las que no son propias no se ofrece el ajuste de color.';


-- ── The ranges, one per column and with a name of its own ───
--
-- One constraint per parameter, and not a big `check` with everything inside, because
-- what Postgres says on rejecting is the constraint's name: with a single one,
-- a rejected adjustment would not say which control went out of range. They are also the ranges
-- of the interface's controls, and having them here is what makes it impossible for a client with
-- a scale error to write an adjustment nobody will be able to open again.
alter table public.images
  add constraint images_color_temperature_range
  check (color_temperature between -60 and 60);

alter table public.images
  add constraint images_color_tint_range
  check (color_tint between -40 and 40);

alter table public.images
  add constraint images_color_exposure_range
  check (color_exposure between -2.00 and 2.00);

alter table public.images
  add constraint images_color_black_range
  check (color_black between 0 and 64);

alter table public.images
  add constraint images_color_white_range
  check (color_white between 192 and 255);

alter table public.images
  add constraint images_color_gamma_range
  check (color_gamma between 0.60 and 1.60);

alter table public.images
  add constraint images_color_shoulder_range
  check (color_shoulder between 0 and 100);

-- The eyedropper's point is inside the photograph, and it does not admit the margin of
-- a quarter that the corners do admit: a corner outside the frame is a
-- real case —the artwork goes outside the shot in five photographs of the batch—, but a
-- grey outside the frame does not exist, there are no pixels there to read it from.
alter table public.images
  add constraint images_color_neutral_inside_image
  check (
    color_neutral_x is null or (
      color_neutral_x between 0 and 1 and color_neutral_y between 0 and 1
    )
  );

-- Both or neither: half a coordinate is not half a point, it is no point, and whoever
-- read it would have to guess the other half. It is the only set rule there
-- is among the colour columns, and it is here because these two are not two
-- parameters: they are a place.
alter table public.images
  add constraint images_color_neutral_pair
  check (num_nonnulls(color_neutral_x, color_neutral_y) in (0, 2));

-- The curve cannot be inverted nor collapsed: between the black point and the white
-- point at least 128 codes out of the 256 have to be left, half the
-- scale. The `coalesce`s are what make the rule hold too when only
-- one of the two has been touched, because null here is identity (0 and 255).
--
-- And yes, today this already follows from the two previous constraints: with the black
-- at 64 at most and the white at 192 at least, the difference never falls below
-- 128. It is written all the same because **the property that matters is this one**, not the
-- arithmetic coincidence of two caps that were chosen separately: if one day
-- one of the two ranges is widened, the rule that prevents a black photograph
-- is still written in the place where it can be read, instead of having
-- disappeared with nobody noticing.
alter table public.images
  add constraint images_color_range_usable
  check (coalesce(color_white, 255) - coalesce(color_black, 0) >= 128);

-- The original's size: both sides or neither, and both positive. A width
-- with no height is not a size, and a zero would mean a photograph with no pixels,
-- which is a datum that can only come from a badly done computation.
alter table public.images
  add constraint images_original_size_pair
  check (num_nonnulls(original_width, original_height) in (0, 2));

alter table public.images
  add constraint images_original_size_positive
  check (
    original_width is null or (original_width > 0 and original_height > 0)
  );

-- A date from the file without saying whether it is exact is of no use: the doubt is
-- exactly the datum. Of the 44 masters, 21 carry DateTimeOriginal and **the 14
-- critical ones from 2022 carry only the IFD0's DateTime**, which by specification is
-- the file's modification date and therefore only approximates the shot's.
-- Storing both things in one column —«2022-10-09, and who knows»— is what
-- the application cannot afford: «sin revisar» is not «no», and approximate
-- is not exact.
alter table public.images
  add constraint images_file_photo_date_precision
  check (file_photo_date is null or file_photo_date_exact is not null);


-- ── The two dates, and why they are two ─────────────────────
--
-- An explicit decision of the owner: `file_photo_date` **does not replace**
-- `photo_date` and never runs over it. The two may differ with every legitimacy
-- —an artwork photographed in 2022 and catalogued in 2026, a repeated shot, a
-- copied file— and they are two different facts: one is what the file says and the
-- other is what whoever catalogues declares. Reducing them to one would be throwing away the one that
-- gets in the way, and which one gets in the way changes with the case.
--
-- Today **the 39 active rows have `photo_date` = upload date**: no
-- record has the shot's real date. And **this migration repairs no row
-- backwards**: filling in `file_photo_date` would require downloading and parsing 39
-- masters, there is no server to do it, and doing it from a cataloguer's
-- browser would be her work paid for with data the application can read
-- on its own the next time it opens each photograph. Null here means «the file has not
-- been read yet», which is the truth.
--
-- The interface shows the difference quietly —«la foto dice 9 de octubre de
-- 2022»— and with no alarm, because today all 39 differ and an alarm that always goes off
-- stops being an alarm.


-- ── What the base does NOT forbid, on purpose ───────────────
--
-- There is no constraint preventing colour on a row with `provenance <> 'OWN'`,
-- even though the adjustment is not offered there. If there were one, reclassifying as somebody else's a
-- photograph that has already been corrected would fail on saving, and the user would be left unable
-- to note the correct provenance in precisely the case where noting it matters
-- most. The rule lives in the interface, which does not offer the adjustment, and in
-- `composeEdits`, which throws; the base stores both facts and does not force a choice.
--
-- Nor is there a constraint tying `color_reference` to `color_source`. An adjustment
-- may start at a preset, go on with the eyedropper over a piece of cardboard and end up
-- retouched by hand: the reasonable combinations are almost all of them, and a `check` that
-- enumerated them would age worse than the enumerated type.


-- ── Privileges: checked, not assumed ────────────────────────
--
-- CLAUDE.md warns that the platform grants by default all the privileges
-- of every new table to `anon` and `authenticated`, and that it is worth checking it instead
-- of believing it. Checked against this base, in `information_schema` and before and
-- after the `alter table` above:
--
--   · `anon` has no privilege at all over public.images —not one, not even
--     `select`—, and nor does it have `usage` over the public schema. The 21 new
--     columns open nothing to it.
--   · `authenticated` has `select`, `insert` and `update` **over the table**, not
--     over a list of columns. A table privilege reaches the columns
--     added afterwards, so the 21 new ones already appear with those three
--     privileges in `information_schema.column_privileges` and **there is nothing to
--     grant**: 51 columns × 3 privileges, and no `delete`, which is the one
--     that had to be watched.
--
-- That is: an `alter table add column` inherits the table's privileges, and
-- here that is exactly what is wanted. Whoever can edit a photograph
-- can edit its colour, and the `images_update` policy (`can_edit()`) is what
-- decides who that is: a Reader writes none of these columns, and that is
-- verified by authenticating for real in `rls_role_matrix.test.sql`, not by reading this
-- migration.
--
-- The four enumerated types do need their grant, because `public` has a new type's
-- `usage` by default. It is closed just as `crop_source` was closed.
revoke all on type public.color_source from public;
revoke all on type public.color_reference from public;
revoke all on type public.light_preset from public;
revoke all on type public.photo_provenance from public;

grant usage on type public.color_source to authenticated;
grant usage on type public.color_reference to authenticated;
grant usage on type public.light_preset to authenticated;
grant usage on type public.photo_provenance to authenticated;
