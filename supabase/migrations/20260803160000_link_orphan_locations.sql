-- La obra que se quedó fuera del árbol de lugares.
--
-- El traslado de `physical_location` al árbol lo hizo
-- `20260801150000_artwork_physical_place.sql`, y su test comprueba sobre una base
-- cargada con el volcado que no quedara ninguna ubicación en texto sin nodo. Ese
-- test estaba en rojo por **AR-0002**: lleva **exactamente el mismo texto** de
-- ubicación que AR-0001 y RC-0005 —«museo de arte contemporaneo vicente aguilera
-- cerni macva»—, esas dos apuntan al árbol y la suya se quedó a null. La
-- consecuencia para la usuaria no es cosmética: AR-0002 **no aparece al abrir
-- MACVA** en el árbol, aunque su ficha diga que está ahí.
--
-- La aplicación **ya no escribe** `physical_location` (solo la nombran comentarios
-- en `types.ts`, `artworksCache.ts` y `usePhysicalPlaces.ts`), así que no van a
-- aparecer huérfanas nuevas por esa vía: esto cierra un hueco, no un grifo.
--
-- **Por qué NO se re-ejecuta el recorrido del traslado**, que es lo primero que
-- uno intenta y está mal: aquel código reparte el texto por comas y busca cada
-- nivel *bajo el nivel anterior*, empezando por la raíz. Pero el árbol ha vivido
-- desde entonces, que es justamente para lo que existe (ADR-006): el nodo de MACVA
-- se renombró con sus mayúsculas y **se movió bajo «Villafamés (Catellón)»**. Un
-- recorrido que busca «museo de arte…» en la raíz ya no lo encuentra ahí, así que
-- crearía un **segundo** nodo con el mismo nombre a nivel raíz y dejaría el
-- catálogo con MACVA duplicado y las obras repartidas entre los dos. Comprobado en
-- local: creaba el duplicado.
--
-- **La regla que sí se sostiene:** una obra huérfana cuyo `physical_location` es
-- idéntico al de una obra que **ya** apunta al árbol hereda su mismo nodo. No
-- inventa estructura, no adivina niveles, no depende de cómo se llame hoy el nodo
-- ni de dónde esté colgado, y sobrevive a los renombrados y a los traslados que el
-- árbol está pensado para permitir. Se exige además que el destino sea **único**:
-- si dos obras con el mismo texto apuntaran a nodos distintos, no hay una respuesta
-- correcta y la fila se queda como está en vez de elegir por sorteo.
--
-- Lo que esta migración deliberadamente **no** hace: no toca las obras que ya
-- apuntan a un nodo, no crea ni un lugar nuevo, no retira `physical_location` —eso
-- es la segunda fase del despliegue que la migración del traslado ya explicó— y no
-- resuelve la huérfana de `zzzz`, que era un valor de prueba y no un sitio y sigue
-- sin ubicación a propósito (ADR-006).

-- La auditoría se desactiva por lo mismo que en el traslado original: esto no es
-- que nadie haya editado la obra ni la haya tenido delante (RF-801), así que
-- firmarla con un `auth.uid()` nulo sería mentir sobre quién la tocó.
alter table public.artworks disable trigger artwork_audit_trail;

do $$
declare
  v_artwork record;
  v_node uuid;
  v_matches int;
  v_linked int := 0;
  v_left int := 0;
begin
  for v_artwork in
    select catalog_id, physical_location
      from public.artworks
     where btrim(coalesce(physical_location, '')) <> ''
       and public.place_key(physical_location) <> 'zzzz'
       and physical_place_id is null
     order by catalog_id
  loop
    -- El nodo al que apuntan las obras que llevan este mismo texto, y cuántos
    -- distintos son: con más de uno no hay respuesta correcta.
    -- `array_agg(distinct …)` y no `min(…)`: en PostgreSQL no hay `min(uuid)`, y
    -- ordenar uuids no significaría nada de todos modos. El elemento se usa solo
    -- cuando el recuento de distintos es exactamente uno.
    select count(distinct physical_place_id), (array_agg(distinct physical_place_id))[1]
      into v_matches, v_node
      from public.artworks
     where physical_place_id is not null
       and public.place_key(coalesce(physical_location, ''))
           = public.place_key(v_artwork.physical_location);

    if v_matches = 1 then
      update public.artworks set physical_place_id = v_node
       where catalog_id = v_artwork.catalog_id;
      v_linked := v_linked + 1;
    else
      -- Sin gemela enlazada, o con varias que discrepan, la fila se queda como
      -- está y se dice en voz alta. Callarlo dejaría el test en rojo sin explicar
      -- por qué, y adivinar el nodo es peor que no tocarlo.
      v_left := v_left + 1;
      raise notice
        'La obra % no se ha podido enlazar: % destinos posibles para «%».',
        v_artwork.catalog_id, v_matches, v_artwork.physical_location;
    end if;
  end loop;

  raise notice 'Obras huérfanas enlazadas: %. Sin resolver: %.', v_linked, v_left;
end $$;

-- La auditoría vuelve antes de que nadie más pueda escribir, y su reactivación la
-- comprueba `artwork_physical_place.test.sql`: si alguna vez se olvidara, el
-- catálogo perdería la traza sin que nada fallara.
alter table public.artworks enable trigger artwork_audit_trail;
