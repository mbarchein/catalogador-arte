import { createClient } from '@supabase/supabase-js'

// The anonymous key is public by design: it identifies the project, it does
// not authorize anything. What protects the data are the RLS policies (RF-111).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
