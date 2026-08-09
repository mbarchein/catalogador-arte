-- De quién es la fotografía, y de dónde salió si no es propia (RF-417).
--
-- `images.provenance` ya dice si la toma es propia, tomada de otro catálogo o
-- recibida de un tercero. Lo que faltaba es lo que hay que apuntar en cada caso,
-- y **no es el mismo dato**:
--
--   · en una fotografía **propia**, quién la hizo. Es un crédito, y va con la
--     fotografía cuando la ficha se imprime o se cede;
--   · en una **tomada de otro catálogo o recibida de un tercero**, de dónde salió:
--     el catálogo, la dirección de la página, quién la mandó y cuándo. Es la
--     trazabilidad de una imagen que no se puede volver a hacer, y es lo que hay
--     que enseñar el día que alguien pregunte de dónde ha salido.
--
-- Por eso son dos columnas y no una con la etiqueta cambiando: el mismo texto
-- guardado no puede significar «Juan Pérez lo fotografió» un día y «sacado de la
-- web del MACVA» al siguiente solo porque se haya tocado la procedencia.
--
-- ── LO QUE NO SE HACE, Y POR QUÉ ────────────────────────────
--
-- **No hay restricción cruzada** que exija la columna vacía cuando la procedencia
-- es la otra. La tentación es evidente y el precio no: cambiar la procedencia de
-- una fotografía que ya tiene crédito fallaría con un error del esquema en mitad
-- de una pantalla de captura, por un dato que no estorba. Lo que se guarda se
-- guarda; **lo que se enseña lo decide la procedencia**, y de eso responde
-- `photoSource.ts` con sus tests, para que un valor dormido no pueda colarse en
-- una ficha impresa.
--
-- Los dos nacen vacíos, que es lo que son las 39 filas de hoy: nadie ha apuntado
-- todavía ni un crédito ni una procedencia detallada.

alter table public.images
  add column photo_credit      text not null default '',
  add column provenance_source text not null default '';

comment on column public.images.photo_credit is
  'Quién hizo la fotografía. Solo se ofrece en las propias (provenance = OWN) y es opcional: en 35 de las 39 tomas actuales la hizo quien cataloga, y obligar a repetirlo sería teclear lo mismo treinta y cinco veces.';

comment on column public.images.provenance_source is
  'De dónde salió una fotografía que no es propia: el catálogo, la dirección de la página, quién la envió. Solo se ofrece cuando provenance no es OWN. Es texto libre y no una dirección validada a propósito — «me la pasó la familia en 2019» es una procedencia legítima y no cabe en una URL.';

-- Sin políticas nuevas: son dos columnas de `images`, que ya tiene RLS y cuyas
-- políticas son de tabla, no de columna. Quien puede corregir una fotografía
-- puede corregir esto, y quien no, no.
