-- ============================================================
-- La fotografía de una obra retirada no se ve (RF-609, RF-905, RF-906, RF-105,
-- RF-106, RF-110, RF-111).
--
-- ── EL ÚLTIMO HUECO DE LA CASCADA, MEDIDO ───────────────────
--
-- 20260805130000 cerró la cascada de visibilidad de las seis tablas documentales
-- y dejó escrito, en voz alta, el que faltaba: con una obra dada de baja lógica,
-- un Lector autenticado veía
--
--   artworks (la obra de baja) ....... 0 filas   ← correcto
--   images (su fotografía) ........... 1 fila    ← FUGA
--
-- y con la fila, sus tres rutas del almacén privado: `thumbnail_path`,
-- `derivative_path` y `master_path`. La ficha estaba escondida y la fotografía
-- de esa ficha escondida no.
--
-- Que la ruta no sea por sí sola una descarga —hace falta una URL firmada
-- (RF-110, RNF-111)— es lo que hizo que esto no fuera la urgencia que sí era el
-- contacto del coleccionista, y es también lo que no lo convierte en aceptable:
-- la ruta lleva el `catalog_id` en el nombre, así que enumerar `images` le dice a
-- quien pregunte QUÉ obras hay en la papelera y cuántas tomas tiene cada una.
-- Eso es exactamente lo que RF-609 no quiere que se pueda saber.
--
-- ── POR QUÉ AHORA ───────────────────────────────────────────
--
-- Porque el hueco estaba fijado con un aserto AL REVÉS en
-- `documentary_visibility.test.sql` §8: un bloque que afirmaba que la fuga
-- seguía ahí y que se pondría rojo el día que se cerrara. Un rojo tiene que
-- significar siempre «algo se ha roto»; si puede significar «alguien ha arreglado
-- algo», el color deja de informar. Así que el aserto se da la vuelta y para eso
-- hay que cerrar el hueco, que además es la forma de cerrarlo que el propio
-- comentario pedía.
--
-- ── CÓMO ────────────────────────────────────────────────────
--
-- Igual que las seis de 20260805130000, y a propósito: un solo criterio escrito
-- de una sola manera. La visibilidad se hereda del ancla con un `exists` sobre
-- `artworks`, que pasa por la política de `artworks` —`(active and can_read()) or
-- can_edit()`— y por tanto
--
--   * al Lector le esconde la fila cuando la obra está en la papelera, y
--   * al Catalogador se la devuelve siempre, porque `can_edit()` es verdadero:
--     restaurar una obra tiene que devolverla con sus fotografías dentro
--     (RF-905), y la papelera tiene que poder enseñar lo retirado (RF-906).
--
-- No hace falta clave ajena nueva ni índice nuevo: `images.catalog_id` ya
-- referencia `artworks` y ya está indexada.
--
-- SOLO SE TOCA EL SELECT. `insert` y `update` siguen siendo `can_edit()` a
-- secas: quien escribe ve todas las obras, así que heredar allí no cambiaría una
-- sola decisión y dejaría el mismo criterio en tres sitios.
--
-- ── LO QUE ARRASTRA, Y ES LO QUE SE QUIERE ──────────────────
--
-- Dos políticas ya escritas consultan `images` por su propia política, así que
-- heredan este cierre sin tocarlas:
--
--   * `external_links` (20260805100000) para los enlaces que cuelgan de una
--     FOTOGRAFÍA — «de dónde salió esta reproducción»—, y
--   * `change_log` (20260805120000) para las líneas de historia cuya fila es una
--     fotografía.
--
-- Las dos dejan de enseñarle al Lector lo que cuelga de la fotografía de una obra
-- retirada, que es la misma regla de RF-609 llegando hasta el final de la cadena.
-- Y la vista `representative_image` lleva `security_invoker = true`, así que
-- también hereda: era el otro camino por el que se llegaba a la misma fila.
--
-- CONTRA QUÉ SE COMPRUEBA. `documentary_visibility.test.sql` §8, ya del derecho:
-- el Lector no ve la fila, el Catalogador sí, y lo que cuelga de ella tampoco se
-- ve. Autenticándose de verdad como cada papel, que es lo único que verifica una
-- política.
-- ============================================================

drop policy images_select on public.images;

create policy images_select on public.images
  for select using (
    ((active and public.can_read()) or public.can_edit())
    and exists (
      select 1 from public.artworks a
       where a.catalog_id = images.catalog_id
    )
  );


-- Y que la tabla siga con exactamente sus tres políticas: reescribir el select no
-- ha añadido una cuarta ni se ha dejado una por el camino (RF-111, RF-901).
do $$
declare v_cmds text[];
begin
  select coalesce(array_agg(cmd::text order by cmd::text), '{}')
    into v_cmds
    from pg_policies
   where schemaname = 'public' and tablename = 'images';

  if v_cmds <> array['INSERT', 'SELECT', 'UPDATE'] then
    raise exception
      'FAIL: public.images debería seguir con exactamente SELECT, INSERT y UPDATE, tiene [%]',
      array_to_string(v_cmds, ', ');
  end if;

  -- Y que el select mire de verdad su columna de anclaje: sin `catalog_id` en la
  -- expresión no hereda nada, y el bloque de arriba pasaría igual.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'images' and cmd = 'SELECT'
       and qual like '%catalog_id%'
  ) then
    raise exception
      'FAIL: la política de select de public.images no mira su columna catalog_id, así que no hereda la visibilidad de la obra';
  end if;

  raise notice 'OK: public.images hereda la visibilidad de su obra y sigue con tres políticas';
end $$;
