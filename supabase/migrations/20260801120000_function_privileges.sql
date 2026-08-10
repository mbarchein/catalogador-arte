-- The functions' privileges and search_path: what Supabase's linter
-- points out, and which is the same class of failure this schema already knew in the
-- tables — with a nuance that made it go unnoticed.
--
-- The initial migration closed the tables with:
--
--   revoke all on all functions in schema public from anon, authenticated;
--   alter default privileges in schema public revoke all on functions from anon, authenticated;
--
-- and those two lines close NOTHING, because whoever has the privilege is not
-- `anon` nor `authenticated`: it is **PUBLIC**. PostgreSQL grants EXECUTE to PUBLIC
-- on every function that gets created, and anon and authenticated inherit it for being
-- members of PUBLIC. Revoking from a role does not take away what PUBLIC grants. In the
-- tables the same sentence was enough, because there there is no grant by default: hence
-- the mistake surviving a review that was looking.
--
-- None of this exposed data: the trigger functions return `trigger` and
-- cannot be usefully invoked through the API, and can_read/can_edit/my_role
-- answer about the caller. The exception, and the reason this does not wait,
-- is `recalculate_photographed(text)`: a write invocable with no session.

-- ── 1. Fixed search_path in the seven that were missing it ───
-- All the SECURITY DEFINER ones already carried it; these are trigger ones and `invoker`,
-- so the risk is smaller, but a function that resolves its names against
-- a search_path controlled by whoever invokes it is a function you do not know what
-- it runs.

alter function public.tg_artwork_authorship() set search_path = public;
alter function public.tg_artwork_audit_trail() set search_path = public;
alter function public.tg_artwork_type_authorship() set search_path = public;
alter function public.tg_catalog_id_immutable() set search_path = public;
alter function public.tg_image_authorship() set search_path = public;
alter function public.tg_image_deactivation() set search_path = public;
alter function public.tg_series_authorship() set search_path = public;

-- ── 2. No function belongs to PUBLIC ─────────────────────────

revoke all on all functions in schema public from public;

-- And nor do those created from now on. It is the line that was missing in the
-- initial migration, and the one that prevents this from repeating with the next function.
alter default privileges in schema public revoke all on functions from public;

-- ── 3. Giving the EXECUTE back, one by one ───────────────────

-- The three that evaluate the POLICIES. They go with the privilege of whoever queries and
-- not with that of whoever wrote them, so without EXECUTE a legitimate user's
-- queries would fail with «permission denied» instead of applying the
-- policy.
--
-- They are not granted to `anon`, and it is not needed: it has no privilege over
-- any table, so none of its policies ever gets evaluated.
grant execute on function public.can_read() to authenticated;
grant execute on function public.can_edit() to authenticated;
grant execute on function public.my_role() to authenticated;

-- Those the application calls by RPC, only with a session.
grant execute on function public.next_catalog_id(public.artist_fund) to authenticated;
grant execute on function public.platform_info() to authenticated;
grant execute on function public.recalculate_photographed(text) to authenticated;
grant execute on function public.reorder_images(text, text[]) to authenticated;
grant execute on function public.set_main_image(text) to authenticated;

-- The trigger ones are not granted to anybody: PostgreSQL does not check EXECUTE on
-- firing them, only on invoking them. function_privileges.test.sql verifies it,
-- inserting an artwork and checking that the identifier and the trace have been
-- assigned just the same.
