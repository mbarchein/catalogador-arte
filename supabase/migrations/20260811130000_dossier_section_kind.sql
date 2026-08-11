-- ============================================================
-- La sección, primera mitad: el valor del enumerado y el índice del dossier
-- (RF-1619 a RF-1622, ADR-011).
--
-- Un dossier largo se lee por bloques —«Óleos», «Obra sobre papel»— y hasta ahora
-- eso se conseguía con un texto libre que llevara rótulo: funcionaba en el PDF y
-- no existía como cosa, así que nada sabía qué obras pertenecían a cada bloque, la
-- pantalla no podía dibujarlo agrupado y mover una sección era mover sus obras una
-- a una.
--
-- ── POR QUÉ UN TIPO PROPIO Y NO SEGUIR CON EL TEXTO ─────────
--
-- Dos motivos, y cualquiera de los dos bastaba:
--
--   · **la ambigüedad.** «Un texto con rótulo abre sección» convierte cualquier
--     párrafo con título en un cambio de bloque sin que nadie lo haya decidido, y
--     al revés: quien quiere un rótulo que NO abra sección no tiene forma de
--     pedirlo;
--   · **las opciones.** Una sección lleva decisiones propias —si se le da una
--     portadilla— y colgarlas de un texto sería poner columnas que no significan
--     nada en la mayoría de las filas de ese tipo.
--
-- ── LA PERTENENCIA ES IMPLÍCITA, Y ESO ES DELIBERADO ────────
--
-- Una sección son su rótulo y **todo lo que viene detrás hasta el siguiente
-- rótulo**. No hay ninguna columna que diga «esta obra es de esta sección», y no
-- por ahorrar: la alternativa mete un árbol dentro de una lista ordenada, con dos
-- órdenes que mantener coherentes y una función de reordenar todo-o-nada que se
-- vuelve mucho más difícil de creer. Un PDF es lineal, así que la posición ya dice
-- todo lo que hay que decir, y mover un rótulo por encima de una obra cambia de
-- sección exactamente esa obra sin escribir nada más.
--
-- ── Y EL ÍNDICE, QUE ES DEL DOSSIER Y NO DE LA SECCIÓN ──────
--
-- `show_index` va en `dossiers` y no como un interruptor por sección, a propósito:
-- un índice que se salta secciones es un índice que miente, y «esta sección no sale
-- en el índice» es justo la clase de interruptor que un día contradice al
-- documento. O hay índice y están todas, o no hay.
--
-- El valor `SECTION` **no se usa en este fichero**, por lo mismo que `BIOGRAPHY`:
-- `alter type ... add value` se admite dentro de una transacción pero el valor
-- nuevo no se puede usar en esa misma transacción, y la CLI aplica cada fichero en
-- la suya. Está medido y explicado en la cabecera de 20260811110000.
-- ============================================================

alter table public.dossiers
  add column show_index boolean not null default false;

comment on column public.dossiers.show_index is
  'Si el PDF lleva un índice de secciones detrás de la portada (RF-1622). Todas las secciones salen o no hay índice: uno que se salta secciones miente.';

alter type public.dossier_item_kind add value 'SECTION';
