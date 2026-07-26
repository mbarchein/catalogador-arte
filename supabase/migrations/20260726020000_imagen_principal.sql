-- ============================================================
-- RF-405: elegir cuál de las imágenes ya subidas representa a la obra.
--
-- Se hace con una función y no con dos UPDATE desde el cliente porque hay un
-- índice único parcial que impide dos imágenes de índice activas en la misma obra
-- (RF-402). Desmarcar y marcar en dos peticiones separadas deja una ventana en la
-- que, si la segunda no llega —se corta la red, se cierra el móvil—, la obra queda
-- sin ninguna imagen principal. Un solo UPDATE lo resuelve de una vez.
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
  -- Sin SECURITY DEFINER: las políticas RLS siguen en vigor, así que un Lector no
  -- puede escribir aquí. La comprobación explícita existe solo para devolver un
  -- error legible en vez de un «no se ha modificado nada» que nadie entiende.
  if not public.puede_editar() then
    raise exception 'No tienes permiso para cambiar la imagen principal';
  end if;

  select id_catalogacion, activo into v_obra, v_activa
    from public.imagenes
   where id_imagen = p_id_imagen;

  if v_obra is null then
    raise exception 'No existe la imagen %', p_id_imagen;
  end if;

  -- Una imagen retirada no puede representar a la obra: el índice visual
  -- mostraría una foto que en la ficha no aparece.
  if not v_activa then
    raise exception 'La imagen % está dada de baja y no puede ser la principal', p_id_imagen;
  end if;

  -- Un único UPDATE: marca la elegida y desmarca el resto a la vez. El índice
  -- único se comprueba al terminar la sentencia, no fila a fila, así que no hay
  -- estado intermedio inválido.
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
