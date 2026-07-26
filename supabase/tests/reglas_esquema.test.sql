-- Reglas del esquema que la interfaz no puede garantizar por sí sola.
-- RF-204 (clave inmutable), RF-802 (fecha de actualización básica),
-- RF-108 (el rol solo lo cambia el superusuario), RF-902 (sellado de la baja).
\set ON_ERROR_STOP on
begin;

-- ── RF-204: la clave primaria no es editable ────────────────
-- Se comprueba contra la base, no contra el formulario: el requisito dice que no
-- es editable «ni en modo edición», y en este stack la interfaz no es el único
-- camino hasta la tabla.
do $$
begin
  update public.obras set id_catalogacion = 'AR-7777' where id_catalogacion = 'AR-0001';
  raise exception 'FAIL: se pudo cambiar id_catalogacion';
exception
  when raise_exception then
    raise notice 'OK: id_catalogacion es inmutable';
end $$;

do $$
begin
  update public.obras set artista = 'RUIZ_CAMPINS' where id_catalogacion = 'AR-0001';
  raise exception 'FAIL: se pudo cambiar el fondo, dejando el prefijo mintiendo';
exception
  when raise_exception then
    raise notice 'OK: el fondo es inmutable';
end $$;

-- ── RF-802: fecha_actualizacion_basica solo con cambios de fase 1 ──
do $$
declare
  v_basica_antes   timestamptz;
  v_basica_despues timestamptz;
  v_general_antes  timestamptz;
  v_general_despues timestamptz;
begin
  -- Un cambio de fase 2 (nota de proceso) mueve la fecha general pero no la básica.
  select fecha_actualizacion, fecha_actualizacion_basica
    into v_general_antes, v_basica_antes
    from public.obras where id_catalogacion = 'AR-0001';

  perform pg_sleep(0.01);
  update public.obras
     set notas_proceso_inventario = 'pendiente contactar con la familia'
   where id_catalogacion = 'AR-0001';

  select fecha_actualizacion, fecha_actualizacion_basica
    into v_general_despues, v_basica_despues
    from public.obras where id_catalogacion = 'AR-0001';

  if v_general_despues <= v_general_antes then
    raise exception 'FAIL: fecha_actualizacion no se movió con un cambio cualquiera';
  end if;
  if v_basica_despues is distinct from v_basica_antes then
    raise exception 'FAIL: un cambio de fase 2 movió fecha_actualizacion_basica';
  end if;
  raise notice 'OK: un cambio de fase 2 no mueve la fecha de actualización básica';

  -- Un cambio de fase 1 (medida) sí la mueve.
  perform pg_sleep(0.01);
  update public.obras set alto_cm = 74 where id_catalogacion = 'AR-0001';

  select fecha_actualizacion_basica into v_basica_despues
    from public.obras where id_catalogacion = 'AR-0001';

  if v_basica_despues is null or v_basica_despues = v_basica_antes then
    raise exception 'FAIL: un cambio de medida no movió fecha_actualizacion_basica';
  end if;
  raise notice 'OK: un cambio de fase 1 sí la mueve';
end $$;

-- ── RF-902: la baja se sella sola ───────────────────────────
-- La fecha y el autor de la baja los pone la base, no el cliente: si dependieran
-- de lo que manda la interfaz, la traza de la papelera sería tan fiable como el
-- reloj del móvil que la envió.
do $$
declare
  v_fecha_baja timestamptz;
begin
  insert into public.obras (id_catalogacion, artista, titulo)
  values ('AR-8700', 'ROTILI', 'Para dar de baja');

  update public.obras set activo = false where id_catalogacion = 'AR-8700';

  select fecha_baja into v_fecha_baja from public.obras where id_catalogacion = 'AR-8700';
  if v_fecha_baja is null then
    raise exception 'FAIL: dar de baja no rellenó fecha_baja';
  end if;

  -- Y la fila sigue ahí: RF-901.
  if not exists (select 1 from public.obras where id_catalogacion = 'AR-8700') then
    raise exception 'FAIL: la fila desapareció al darla de baja';
  end if;

  update public.obras set activo = true where id_catalogacion = 'AR-8700';
  if (select fecha_restauracion from public.obras where id_catalogacion = 'AR-8700') is null then
    raise exception 'FAIL: la restauración no rellenó fecha_restauracion';
  end if;
  -- RF-902: la restauración no borra la traza de la baja anterior.
  if (select fecha_baja from public.obras where id_catalogacion = 'AR-8700') is null then
    raise exception 'FAIL: restaurar borró la traza de la baja';
  end if;

  raise notice 'OK: la baja y la restauración se sellan y conservan la traza';
end $$;

-- ── RF-108: el rol solo lo cambia el superusuario ───────────

-- El fixture va FUERA del bloque que provoca el error a propósito: cuando
-- PL/pgSQL captura una excepción revierte hasta un savepoint implícito, y se
-- llevaría por delante cualquier fila insertada dentro del mismo bloque.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000e1', 'sube-rol@test.local');

do $$
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
  set local role authenticated;

  update public.perfiles set rol = 'SUPERUSUARIO' where id = auth.uid();
  raise exception 'FAIL: un usuario se promovió a sí mismo a superusuario';
exception
  when raise_exception or insufficient_privilege then
    raise notice 'OK: nadie puede promoverse a sí mismo';
end $$;

reset role;

-- El acceso administrativo directo sí puede cambiar el rol: sin él no habría
-- forma de promover al primer superusuario, que por fuerza se hace desde fuera
-- de la aplicación. Este caso lo rompió el propio guion de semilla la primera
-- vez que se ejecutó, y por eso está aquí.
do $$
begin
  update public.perfiles
     set rol = 'CATALOGADOR'
   where id = '00000000-0000-0000-0000-0000000000e1';
  if (select rol from public.perfiles where id = '00000000-0000-0000-0000-0000000000e1')
     is distinct from 'CATALOGADOR' then
    raise exception 'FAIL: el acceso administrativo no pudo asignar el rol';
  end if;
  raise notice 'OK: el acceso administrativo directo sí puede asignar rol';
end $$;

-- ── RF-208: una medida negativa es un error de teclado ──────
do $$
begin
  insert into public.obras (id_catalogacion, artista, titulo, alto_cm)
  values ('AR-8800', 'ROTILI', 'Medida imposible', -10);
  raise exception 'FAIL: se admitió una altura negativa';
exception
  when check_violation then
    raise notice 'OK: las medidas negativas se rechazan';
end $$;

rollback;
