import { createClient } from '@supabase/supabase-js'

// La clave anónima es pública por diseño: identifica el proyecto, no autoriza
// nada. Lo que protege los datos son las políticas RLS (RF-111).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
