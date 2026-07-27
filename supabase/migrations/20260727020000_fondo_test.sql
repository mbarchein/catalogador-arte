-- Fondo TEST (prefijo TS-): fichas de ensayo en producción, con su propia
-- serie de numeración para no ensuciar las series reales AR- y RC-.
--
-- Solo el ALTER TYPE, aislado a propósito: un valor nuevo de enum no puede
-- usarse en la misma transacción que lo crea, y `supabase db push` aplica cada
-- migración en una transacción. Las reglas que usan el valor van en la
-- migración siguiente.
alter type fondo_artista add value 'TEST';
