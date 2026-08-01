-- El cuadrilátero de las esquinas tiene que ser CONVEXO, no solo tener área.
--
-- La migración anterior comprobaba el signo del área con signo y su comentario
-- afirmaba que eso rechaza un cuadrilátero que se cruza consigo mismo. **No lo
-- hace.** Un polígono que se autointersecta conserva área positiva siempre que gane
-- su lóbulo mayor, así que la restricción aceptaba cuadriláteros cruzados: probado
-- contra esta misma base con las esquinas (0,95 0,16) (0,7 0,15) (0,85 0,9)
-- (0,15 0,9), que cruzan dos lados y puntúan 0,332 de área.
--
-- Rectificar uno de esos da una imagen doblada sobre sí misma, que es justo el daño
-- que la restricción existía para impedir.
--
-- Va en una migración nueva y no corrigiendo la anterior porque aquella ya está
-- aplicada: en esta base local, y eso basta — reescribir un fichero cuya migración
-- ya corrió deja la base con la regla vieja y el repositorio diciendo otra cosa,
-- que es peor que un fichero de más.
--
-- **La convexidad no es solo una regla más estricta: es la regla correcta.** La
-- imagen proyectiva de un rectángulo es convexa, siempre. Así que un cuadrilátero no
-- convexo no es la fotografía de un cuadro visto en ángulo, sea lo que sea.

alter table public.images drop constraint images_corners_simple_quadrilateral;

-- El signo del producto vectorial en cada vértice: los cuatro iguales es convexo, y
-- con este recorrido —NW, NE, SE, SW, con la Y hacia abajo— los cuatro positivos.
-- Comprobado con el cuadrado unidad, donde los cuatro valen 1.
--
-- El área se queda al lado con un trabajo propio, que la convexidad no cubre:
-- descartar el cuadrilátero técnicamente convexo y demasiado pequeño para ser nada.
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
