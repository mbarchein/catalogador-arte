-- ============================================================
-- RF-405: choosing which of the already uploaded images represents the artwork.
--
-- It is done with a function and not with two UPDATEs from the client because there is a
-- partial unique index that prevents two active index images on the same artwork
-- (RF-402). Unmarking and marking in two separate requests leaves a window in
-- which, if the second does not arrive —the network drops, the phone is closed—, the artwork is left
-- with no main image at all. A single UPDATE resolves it in one go.
-- ============================================================

create function public.marcar_imagen_principal(p_id_imagen text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_obra text;
  v_activa boolean;
begin
  -- With no SECURITY DEFINER: the RLS policies remain in force, so a Reader cannot
  -- write here. The explicit check exists only to return a legible
  -- error instead of a «nothing has been modified» that nobody understands.
  if not public.puede_editar() then
    raise exception 'No tienes permiso para cambiar la imagen principal';
  end if;

  select id_catalogacion, activo into v_obra, v_activa
    from public.imagenes
   where id_imagen = p_id_imagen;

  if v_obra is null then
    raise exception 'No existe la imagen %', p_id_imagen;
  end if;

  -- A withdrawn image cannot represent the artwork: the visual index
  -- would show a photo that does not appear in the record.
  if not v_activa then
    raise exception 'La imagen % está dada de baja y no puede ser la principal', p_id_imagen;
  end if;

  -- A single UPDATE: it marks the chosen one and unmarks the rest at once. The unique
  -- index is checked on finishing the statement, not row by row, so there is no
  -- invalid intermediate state.
  update public.imagenes
     set imagen_indice = (id_imagen = p_id_imagen)
   where id_catalogacion = v_obra
     and activo
     and imagen_indice is distinct from (id_imagen = p_id_imagen);

  return p_id_imagen;
end $$;

comment on function public.marcar_imagen_principal is
  'Marca una imagen como la representativa de su obra y desmarca las demás, en una sola sentencia (RF-405).';

grant execute on function public.marcar_imagen_principal(text) to authenticated;
