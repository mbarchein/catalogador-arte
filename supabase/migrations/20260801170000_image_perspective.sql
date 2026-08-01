-- Las cuatro esquinas de la obra en la fotografía, para corregir la perspectiva.
--
-- Un cuadro fotografiado en ángulo no es un rectángulo en la foto: es un
-- trapecio, y recortarlo con un rectángulo deja pared por dos lados y come obra
-- por los otros dos. Ocho de las catorce obras del catálogo tienen más de 1° de
-- convergencia y dos llegan a 11,69°, así que no es un caso raro.
--
-- Lo que se guarda son **las cuatro esquinas y no la imagen deformada**: el
-- máster sigue intacto (ADR-002), las esquinas se pueden volver a arrastrar y el
-- rectificado se recalcula. Es la misma invariante que ya sostiene el recorte —lo
-- guardado es absoluto sobre el máster, así que reeditar sustituye y no compone— y
-- es la razón de que esto sea un dato y no un fichero nuevo.
--
-- **Ocho columnas `numeric` y no los ocho coeficientes de la homografía ni un
-- `jsonb`**, por el mismo argumento que escribió la migración del recorte: una
-- esquina se puede acotar con un `check` y comprobar de un vistazo, mientras que un
-- `h21` no significa nada que se pueda verificar. La homografía se calcula a partir
-- de las esquinas donde se necesita; guardar la matriz sería guardar el resultado
-- de una cuenta en vez de sus datos.

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

-- Las ocho o ninguna, por lo mismo que el recorte: media perspectiva no es «un
-- poco corregida», es un cuadrilátero que nadie puede dibujar, y llegaría así al
-- pipeline de Python del catálogo impreso.
alter table public.images
  add constraint images_corners_all_or_nothing
  check (
    num_nonnulls(
      corner_nw_x, corner_nw_y, corner_ne_x, corner_ne_y,
      corner_se_x, corner_se_y, corner_sw_x, corner_sw_y
    ) in (0, 8)
  );

-- Cada esquina, dentro de la fotografía o pegada a su borde.
--
-- El margen de un cuarto de la imagen hacia fuera es deliberado y está decidido:
-- en cinco fotografías del lote los lados de la obra no están dentro del
-- encuadre, y arrastrar una esquina fuera del borde es la única forma de
-- rectificar esas. Lo que sale de la fotografía se rellena, y la interfaz avisa
-- de que esa zona no está en la toma. Sin margen ninguno, la corrección sería
-- imposible justo en las fotos que más la necesitan; sin límite, un dedo resbalado
-- pediría rectificar a un plano que no cabe en memoria.
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

-- Y que sea un cuadrilátero recorrido en orden, no un lazo.
--
-- Cuatro puntos cualesquiera admiten dos formas de unirlos que se cruzan a sí
-- mismas, y una de ellas es lo que sale de arrastrar una esquina por encima de su
-- vecina. Rectificar un lazo produce una imagen doblada sobre sí misma, que es de
-- las cosas que solo se descubren al abrir la ficha. Se comprueba con el signo del
-- área con signo (la fórmula del cordón de zapato), cuyo valor absoluto es además
-- lo que impide un cuadrilátero degenerado.
--
-- Sobre el signo, que es fácil deducir al revés —lo fue—: con la Y hacia abajo, que
-- es como se numeran las filas de una imagen, recorrer NW → NE → SE → SW va en el
-- sentido de las agujas del reloj EN PANTALLA y da área POSITIVA. Comprobado con el
-- cuadrado unidad, que da 2. El `check` lo caza a la primera si se invierte.
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

-- ── Precedencia, y por qué el despliegue sigue siendo de una fase ──
--
-- Si hay esquinas, mandan; si no, manda el recorte. Las dos cosas conviven a
-- propósito y sin migrar nada: las veintiocho filas que ya tienen recorte lo
-- conservan y siguen leyéndose igual, y el frontend viejo —que no sabe de
-- esquinas— sigue funcionando durante los segundos que dura el despliegue,
-- porque las columnas nuevas nacen nulas.
--
-- Lo que NO se hace es una campaña de re-renderizado de esas veintiocho filas: no
-- hay servidor que las procese, y el encuadre guardado es criterio de la
-- catalogadora, no geometría que se pueda recalcular mejor.

-- ── De dónde salió el encuadre ──────────────────────────────
--
-- Hoy es imposible distinguir el recorte que ella dibujó del que aceptó de una
-- sugerencia, y por eso medir el detector obligó a INFERIR esa distinción de un
-- residuo de dos diezmilésimas en cuatro números: una inferencia muy fuerte, pero
-- no una prueba. Sin esta columna, toda medición futura arrastra la misma duda.
--
-- Las filas que ya existen se quedan en nulo —«no se sabe»— y **nunca en
-- 'MANUAL'**, que sería inventar el dato. Es un enumerado y no texto por lo mismo
-- que el resto del esquema: los valores son código.

create type public.crop_source as enum ('MANUAL', 'SUGGESTED', 'SUGGESTED_ADJUSTED');

comment on type public.crop_source is
  'De dónde salió el encuadre de una fotografía: dibujado a mano, aceptado tal cual de la sugerencia, o sugerido y después ajustado. Nulo es «no se sabe», que es lo que llevan las filas anteriores a esta columna.';

alter table public.images add column crop_source public.crop_source;

comment on column public.images.crop_source is
  'Procedencia del encuadre. Nulo en las filas creadas antes de que existiera esta columna: no se sabe, y suponer «a mano» sería inventarlo.';

-- Sin grants ni políticas, como en la migración del recorte y por lo mismo: son
-- columnas de una tabla que ya tiene las dos, y la política images_update las
-- cubre — quien puede editar la foto puede editar su encuadre, y un Lector no.
revoke all on type public.crop_source from public;
grant usage on type public.crop_source to authenticated;
