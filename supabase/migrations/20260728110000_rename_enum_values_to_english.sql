-- ============================================================
-- Rename enum VALUES to English.
--
-- ⚠️  DEPLOYMENT WARNING — this WIDENS the incompatibility window of the
-- schema-rename migration (see 20260728100000 and the comment in
-- .github/workflows/desplegar.yml). While the old frontend runs against the
-- new schema:
--   * its role check compares the old literals ('CATALOGADOR',
--     'SUPERUSUARIO'), so every session looks read-only and label lookups
--     (role, conservation, shot type...) render as undefined;
--   * any write sending an old literal is rejected by the enum type.
-- Seconds-long and tolerable for this team size, but deploy at a quiet time.
--
-- ALTER TYPE ... RENAME VALUE relabels the value in pg_enum: stored rows,
-- column defaults and typed constants inside policies follow automatically
-- (they reference the value by oid). What does NOT follow automatically is
-- every literal comparison in function bodies and clients — synchronized in
-- this migration and in the same branch (sign-file, app, seed, tests).
--
-- NOT renamed, on purpose:
--   * artist_fund: 'ROTILI' and 'RUIZ_CAMPINS' are surnames and 'TEST' is
--     already English. The AR/RC/TS label prefixes are physical data.
-- ============================================================

-- ── user_role ────────────────────────────────────────────────

alter type user_role rename value 'SUPERUSUARIO' to 'SUPERUSER';
alter type user_role rename value 'CATALOGADOR' to 'CATALOGER';
alter type user_role rename value 'LECTOR' to 'READER';

-- ── tri_state ────────────────────────────────────────────────
-- 'NO' is the same word in both languages.

alter type tri_state rename value 'SI' to 'YES';
alter type tri_state rename value 'SIN_REVISAR' to 'UNREVIEWED';

-- ── attributed_title_value ───────────────────────────────────

alter type attributed_title_value rename value 'NO_APLICA' to 'NOT_APPLICABLE';
alter type attributed_title_value rename value 'SI' to 'YES';
alter type attributed_title_value rename value 'SIN_REVISAR' to 'UNREVIEWED';

-- ── conservation_status_value ────────────────────────────────

alter type conservation_status_value rename value 'BUENO' to 'GOOD';
alter type conservation_status_value rename value 'REGULAR' to 'FAIR';
alter type conservation_status_value rename value 'REQUIERE_RESTAURACION' to 'NEEDS_RESTORATION';
alter type conservation_status_value rename value 'REQUIERE_RESTAURACION_URGENTE' to 'NEEDS_URGENT_RESTORATION';
alter type conservation_status_value rename value 'SIN_REVISAR' to 'UNREVIEWED';

-- ── existence_status_value ───────────────────────────────────

alter type existence_status_value rename value 'CONSERVADA' to 'PRESERVED';
alter type existence_status_value rename value 'DESTRUIDA' to 'DESTROYED';
alter type existence_status_value rename value 'PERDIDA' to 'LOST';
alter type existence_status_value rename value 'DESCONOCIDO' to 'UNKNOWN';
alter type existence_status_value rename value 'SIN_REVISAR' to 'UNREVIEWED';

-- ── shot_type_value ──────────────────────────────────────────
-- 'GENERAL' is the same word in both languages.

alter type shot_type_value rename value 'DETALLE_FIRMA' to 'SIGNATURE_DETAIL';
alter type shot_type_value rename value 'REVERSO' to 'BACK';
alter type shot_type_value rename value 'DETALLE_DANO' to 'DAMAGE_DETAIL';
alter type shot_type_value rename value 'MARCO' to 'FRAME';
alter type shot_type_value rename value 'OTRO' to 'OTHER';

-- ── Function bodies comparing the renamed literals ───────────
-- These are stored as text, so the rename does not reach them: re-created
-- with the English literals. User-facing error messages stay in Spanish.

create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('CATALOGER', 'SUPERUSER') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.tg_role_superuser_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    -- With no authenticated user the request does not come from an application
    -- session: it is direct administrative access (SQL editor, service_role
    -- key, development seed). That path already has full power by definition,
    -- so blocking it would add no security and would prevent administering the
    -- catalog — including promoting the first superuser, which by necessity
    -- happens outside the app.
    if auth.uid() is null or current_user = 'service_role' then
      return new;
    end if;

    if not exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'SUPERUSER'
    ) then
      raise exception 'Solo el superusuario puede cambiar el rol de un usuario (RF-108)';
    end if;
  end if;
  return new;
end $$;
