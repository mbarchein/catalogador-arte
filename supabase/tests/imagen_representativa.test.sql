-- Vista `imagen_representativa`: la regla de repliegue de RF-403, y que la vista
-- NO se salta las políticas RLS.
\set ON_ERROR_STOP on
begin;

insert into public.obras (id_catalogacion, artista, titulo) values
  ('AR-9700', 'ROTILI', 'Con una marcada a mano'),
  ('AR-9701', 'ROTILI', 'Sin marcar, con generales'),
  ('AR-9702', 'ROTILI', 'Sin marcar y sin ninguna general'),
  ('AR-9703', 'ROTILI', 'Sin fotos');

-- ── 1. La marcada a mano manda siempre ──────────────────────
insert into public.imagenes
  (id_catalogacion, ruta_miniatura, ruta_derivada, tipo_toma, imagen_indice, fecha_fotografia)
values
  ('AR-9700', 'm/a1', 'd/a1', 'GENERAL', false, '2026-07-01'),
  ('AR-9700', 'm/a2', 'd/a2', 'REVERSO', true, '2020-01-01'),
  ('AR-9700', 'm/a3', 'd/a3', 'GENERAL', false, '2026-07-20');

do $$
declare v_elegida text; v_mano boolean;
begin
  select id_imagen, elegida_a_mano into v_elegida, v_mano
    from public.imagen_representativa where id_catalogacion = 'AR-9700';
  -- Es un reverso y la más antigua, pero alguien la eligió: eso pesa más que
  -- cualquier heurística.
  if v_elegida <> 'AR-9700_v2' then
    raise exception 'FAIL: se ignoró la marcada a mano, eligió %', v_elegida;
  end if;
  if not v_mano then
    raise exception 'FAIL: elegida_a_mano debería ser cierto';
  end if;
  raise notice 'OK: la imagen marcada a mano manda sobre la regla';
end $$;

-- ── 2. Sin marcar: la general más reciente ──────────────────
insert into public.imagenes
  (id_catalogacion, ruta_miniatura, ruta_derivada, tipo_toma, fecha_fotografia)
values
  ('AR-9701', 'm/b1', 'd/b1', 'GENERAL', '2026-01-01'),
  ('AR-9701', 'm/b2', 'd/b2', 'DETALLE_FIRMA', '2026-12-01'),
  ('AR-9701', 'm/b3', 'd/b3', 'GENERAL', '2026-06-01');

do $$
declare v_elegida text; v_mano boolean;
begin
  select id_imagen, elegida_a_mano into v_elegida, v_mano
    from public.imagen_representativa where id_catalogacion = 'AR-9701';
  -- El detalle de firma es más reciente, pero un detalle no representa la obra.
  if v_elegida <> 'AR-9701_v3' then
    raise exception 'FAIL: debía elegir la general más reciente, eligió %', v_elegida;
  end if;
  if v_mano then
    raise exception 'FAIL: elegida_a_mano debería ser falso, la eligió la regla';
  end if;
  raise notice 'OK: sin marcar, la general más reciente, y se sabe que fue la regla';
end $$;

-- ── 3. Sin ninguna general: la más reciente de cualquier tipo ──
-- El esquema no contempla este caso. Mostrar un hueco porque solo hay reversos
-- contradiría el criterio de no dejar blancos sin explicación.
insert into public.imagenes
  (id_catalogacion, ruta_miniatura, ruta_derivada, tipo_toma, fecha_fotografia)
values
  ('AR-9702', 'm/c1', 'd/c1', 'REVERSO', '2026-01-01'),
  ('AR-9702', 'm/c2', 'd/c2', 'DETALLE_DANO', '2026-05-01');

do $$
declare v_elegida text;
begin
  select id_imagen into v_elegida
    from public.imagen_representativa where id_catalogacion = 'AR-9702';
  if v_elegida <> 'AR-9702_v2' then
    raise exception 'FAIL: sin generales debía elegir la más reciente, eligió %', v_elegida;
  end if;
  raise notice 'OK: sin ninguna general, la más reciente de cualquier tipo';
end $$;

-- ── 4. Una obra sin fotos no aparece en la vista ─────────────
do $$
begin
  if exists (select 1 from public.imagen_representativa where id_catalogacion = 'AR-9703') then
    raise exception 'FAIL: una obra sin fotos aparece en la vista';
  end if;
  raise notice 'OK: una obra sin fotos no tiene fila (el listado pondrá el marcador)';
end $$;

-- ── 5. Exactamente una fila por obra ────────────────────────
do $$
declare v_max integer;
begin
  select max(n) into v_max from (
    select count(*) as n from public.imagen_representativa group by id_catalogacion
  ) t;
  if v_max <> 1 then
    raise exception 'FAIL: hay obras con % filas en la vista', v_max;
  end if;
  raise notice 'OK: una sola fila por obra';
end $$;

-- ── 6. Las imágenes retiradas no se eligen ──────────────────
do $$
declare v_elegida text;
begin
  update public.imagenes set activo = false where id_imagen = 'AR-9701_v3';
  select id_imagen into v_elegida
    from public.imagen_representativa where id_catalogacion = 'AR-9701';
  if v_elegida = 'AR-9701_v3' then
    raise exception 'FAIL: eligió una imagen dada de baja';
  end if;
  -- Con la v3 fuera, la siguiente general es la v1.
  if v_elegida <> 'AR-9701_v1' then
    raise exception 'FAIL: tras la baja debía elegir AR-9701_v1, eligió %', v_elegida;
  end if;
  raise notice 'OK: retirar la elegida hace que la regla escoja la siguiente';
end $$;

-- ── 7. LO MÁS IMPORTANTE: la vista no se salta RLS ──────────
--
-- Una vista sin `security_invoker` se ejecuta con los privilegios de su
-- propietario y pasa por encima de las políticas de la tabla que consulta. Sería
-- una puerta trasera a las rutas de todas las imágenes para cualquiera con
-- sesión, en un proyecto donde las políticas son el único perímetro.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000b001', 'sin-perfil@test.local');
-- Se le quita el perfil: un usuario autenticado que no es del equipo.
delete from public.perfiles where id = '00000000-0000-0000-0000-00000000b001';

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b001","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.imagen_representativa;
  if v_n <> 0 then
    raise exception
      'FAIL: la vista devuelve % filas a un usuario sin perfil: se está saltando RLS', v_n;
  end if;
  raise notice 'OK: la vista respeta RLS (security_invoker), no devuelve nada sin perfil';
end $$;

reset role;

-- Y a un lector legítimo sí le responde.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-00000000b002', 'lector-vista@test.local');
update public.perfiles set rol = 'LECTOR' where id = '00000000-0000-0000-0000-00000000b002';

do $$
declare v_n integer;
begin
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000b002","role":"authenticated"}';
  set local role authenticated;
  select count(*) into v_n from public.imagen_representativa;
  if v_n = 0 then
    raise exception 'FAIL: un lector del equipo no ve ninguna fila';
  end if;
  raise notice 'OK: un lector del equipo sí ve la vista (% filas)', v_n;
end $$;

reset role;
rollback;
