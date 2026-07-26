-- Semilla de desarrollo local. No se ejecuta en producción.
-- En producción, la promoción del superusuario se hace una vez a mano:
--   update perfiles set rol = 'SUPERUSUARIO' where email = 'tu@correo.es';

-- Promueve al administrador local (idempotente; el perfil lo crea el trigger
-- al darse de alta la cuenta con make seed-users).
update public.perfiles
set rol = 'SUPERUSUARIO'
where email = 'admin@local.test';

update public.perfiles set rol = 'CATALOGADOR' where email = 'catalogador@local.test';
update public.perfiles set rol = 'LECTOR' where email = 'lector@local.test';

-- Un par de obras de ejemplo, para que el listado no arranque vacío y se pueda
-- comprobar la ordenación cronológica con fechas de formato distinto.
-- Los identificadores se indican explícitamente para que la semilla sea
-- idempotente; en la aplicación los asigna el trigger.
insert into public.obras (
  id_catalogacion, artista, titulo, titulo_atribuido, tipo_obra,
  fecha_ejecucion, fecha_orden, tecnica, soporte,
  alto_cm, ancho_cm, firmada, firma_descripcion,
  estado_conservacion, ubicacion_fisica, estado_existencia,
  medidas_verificadas, fase_inventario_completada
) values
  (
    'AR-0001', 'ROTILI', 'Paisaje de invierno', 'NO', 'Pintura',
    '1975-1978', 1975, 'Óleo sobre lienzo', 'Lienzo',
    73, 60, 'SI', 'ángulo inferior derecho',
    'BUENO', 'edificio a, habitacion amarilla, bloque 3', 'CONSERVADA',
    true, true
  ),
  (
    'AR-0002', 'ROTILI', '', 'NO_APLICA', 'Dibujo',
    'c. 1980', 1980, 'Carboncillo sobre papel', 'Papel',
    42, 29.7, 'NO', '',
    'REGULAR', 'edificio b, habitacion 4, estanteria 3, balda 2, carpeta 1', 'CONSERVADA',
    false, false
  ),
  (
    'RC-0001', 'RUIZ_CAMPINS', 'El jarrón azul', 'SI', 'Pintura',
    '1968', 1968, 'Acrílico sobre tabla', 'Tabla',
    50, 40, 'SIN_REVISAR', '',
    'SIN_REVISAR', '', 'SIN_REVISAR',
    false, false
  )
on conflict (id_catalogacion) do nothing;
