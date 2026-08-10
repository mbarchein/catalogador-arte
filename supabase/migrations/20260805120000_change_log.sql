-- ============================================================
-- The change log of artworks and photographs (RF-1501 to RF-1508).
--
-- Today a record says WHEN it was last touched and WHO touched it
-- (`updated_at`, `updated_by`), and nothing else. It does not say what changed, nor from which
-- value, nor how many times. With two people cataloguing two thousand artworks over
-- years, «did this artwork always measure 45 cm or did somebody correct it?» is a
-- question that today has no answer and that five years from now will be asked by
-- somebody who was not there. That is what this log answers.
--
-- This migration creates THE TABLE AND ITS PADLOCKS. Nobody writes in it
-- yet: the trigger that fills it arrives in the next migration. It is split
-- this way on purpose, and not out of convenience — the table exists closed and tested
-- for a whole deployment before receiving its first row, so that if
-- the writer had to be withdrawn, the table, its privileges and its
-- protections are not touched. The other way round does not work: a writer over a table
-- whose permissions are not yet decided writes in an open table.
--
-- ── WHAT DECIDES WHETHER THIS IS WORTH ANYTHING OR NOTHING: THE PERMISSIONS ─
--
-- An audit log the audited can edit is not an audit
-- log, it is a note. So this table's whole rule fits in one
-- sentence: INSERT ONLY, AND ONLY BY TRIGGER. Neither the Cataloguer, nor the Reader, nor
-- the Superuser, nor the service key have `insert`, `update` or `delete`
-- here. The writing is done by a `security definer` function that only fires
-- on a change to an audited row.
--
-- And one padlock is not enough, because on this platform every padlock has its
-- known hole:
--
--   1. THE PRIVILEGE. `revoke` from anon, authenticated and service_role. Without the
--      privilege, PostgREST answers 403 to a POST, a PATCH or a DELETE BEFORE
--      looking at any policy. It is what RF-113 asks for: two locks in
--      series and not one.
--   2. THE POLICY. Only the SELECT one exists. The absence of an
--      `insert`, `update` and `delete` policy IS the denial (RF-111).
--      -> Hole: RLS does not apply to the table's owner, nor to
--         `service_role` nor to `postgres`, which carry `bypassrls`.
--   3. THE TRIGGERS. One rejects `update`, `delete` and `truncate` for everybody,
--      the owner included; another rejects any `insert` that does not come
--      from inside another trigger. Triggers do apply to the owner.
--
-- How far this reaches, said out loud: a superuser can disable a
-- trigger or set themselves `session_replication_role = replica` with a
-- deliberate statement. Nothing inside a database is inviolable against whoever
-- administers it. What these three layers do is raise the bar from «a PATCH with
-- the service key» to «a deliberate DDL statement», and make accidental
-- destruction IMPOSSIBLE, which is the realistic failure mode with two people and a
-- Supabase panel open.
--
-- ── A WARNING THAT CANNOT BE LOST: NO `force row level security` ─
--
-- This table does NOT carry `force row level security`, and it is not an oversight. It is
-- precisely the line somebody adds in a security review thinking
-- it hardens things. Here it would annul the owner's exemption, would abort the trigger
-- writer's `insert` and, with it, THE USER'S SAVE: the whole
-- catalogue would break, not the log. If in a future audit the
-- suggestion appears, the answer is written here.
--
-- ── IT IS NOT REVERSIBLE, AND THAT IS A REQUIREMENT (RF-1505) ───
--
-- The log is INFORMATIVE. No undo function is built, nor a
-- screen, nor a button, nor an RPC, nor anything that is the comfortable substrate of one. It is not
-- even stored in a form that invites it: there are no row snapshots nor
-- values in `jsonb` with the whole row, but two text columns per loose
-- field. The log is a testimony; the backup is the periodic
-- dump (RNF-113). Entrusting a restoration to it would leave the row half done,
-- because by design it does not store the derived columns nor the store's
-- files. If one day a way back appears, it is a mistake and not an
-- improvement.
--
-- ── WHAT THIS MIGRATION DOES NOT DO, AND IT IS ON RECORD ────
--
--  * It does not publish in `supabase_realtime`. A channel emitting every changed field
--    to all open clients has been asked for by nobody and multiplies the traffic
--    by the number of columns of each save.
--  * It creates no read view. A view is the property of whoever creates it and
--    bypasses RLS unless it carries `security_invoker = true`: it would be new security
--    surface in order to save the frontend a `join` with a table of
--    three rows. The interface reads the table and resolves the names against
--    `profiles`, which it already loads.
--  * It creates no function that reads the log and writes in `artworks` or in
--    `images` (RF-1505).
--  * It does not audit `profiles`. A role change is probably the most
--    sensitive change in the system and today it leaves no trace. It is deliberately OUT OF
--    SCOPE: it requires relaxing `catalog_id`, it has another visibility rule and it is
--    a decision of the owner, not a side effect of this migration.
--  * It does not audit `parties`, `provenance_events` nor the rest of the documentary
--    catalogue raisonné, for the same reason: `catalog_id not null` leaves them out, and this way the
--    decision about the history of `contact` —a third party's personal datum that
--    the Reader sees by RF-105— is taken with that column in front and in its own
--    migration, instead of being inherited today out of carelessness. Nor `external_links`:
--    a link will be able to hang from an exhibition and then it has no `catalog_id`.
--  * It purges nothing and expires nothing (RF-1507). If one day it went past about two million
--    rows, the foreseen answer is NOT to delete: it is to move the oldest to
--    an archive table with exactly the same privileges, the same
--    policy and the same padlocks. And there is no switch to silence
--    the log, not even during a migration: an audit log
--    with an off button is not an audit log.
--  * It does not rename `tg_artwork_audit_trail`. The name lies —it stamps
--    timestamps, it is not an audit trail— but renaming it forces recreating its
--    trigger in exchange for nothing. For whoever reads this a year from now:
--    `tg_artwork_audit_trail` and `tg_row_audit` (RF-804) stamp who and when IN
--    THE ROW ITSELF; the change log is this other thing, and it is a separate table.
-- ============================================================


-- ── The two enumerated types ────────────────────────────────
--
-- The usual criterion for separating an enumerated type from a master table in this
-- schema is who owns the entries and whether the code looks at the value. Here
-- both belong to the schema and the code looks at both.

-- What class of record changed. It is STORED and not deduced from the identifier's
-- format: `AR-0001` as against `AR-0001_v3` is a pattern, and deducing from a
-- pattern is guessing where one can assert. Besides, the interface words
-- an artwork's line («Marta creó la ficha») differently from a photograph's («Marta
-- subió la fotografía 3»), so the code needs the value.
create type public.audited_entity as enum ('ARTWORK', 'IMAGE');

comment on type public.audited_entity is
  'Qué clase de ficha cambió: una obra o una fotografía. Se guarda y no se deduce del formato del identificador.';

-- The line's verb. It is redundant with `active`'s own field row
-- —withdrawing is setting `active` to false— and it is stored all the same: three screens
-- need the verb, and recomputing it in three places is three places to
-- get it wrong.
create type public.change_operation as enum ('CREATE', 'UPDATE', 'DEACTIVATE', 'RESTORE');

comment on type public.change_operation is
  'Qué se hizo: crear, cambiar, retirar o restaurar. Retirar y restaurar son cambios del campo «activa» y se anotan también como tales; este valor es el verbo con el que se lee la línea.';

revoke all on type public.audited_entity   from public;
revoke all on type public.change_operation from public;
grant usage on type public.audited_entity   to authenticated;
grant usage on type public.change_operation to authenticated;


-- ── The table ───────────────────────────────────────────────
--
-- PER-FIELD granularity (RF-1502): one row for each column that changes, with its
-- previous value and its new value. Not a snapshot of the row, which would be at
-- once more expensive and an invitation to restore it.
create table public.change_log (
  -- A monotonic key and not a `uuid`: the log is append-only and is read in temporal
  -- order, so the primary key incidentally acts as the tiebreaker of two changes
  -- with the same timestamp — which is the NORMAL case, because `now()` is the
  -- transaction's time and a single action writes several rows.
  -- `generated always` and not `by default`: nobody should be able to choose the number.
  id          bigint generated always as identity primary key,

  -- It identifies the row-operation: all the fields that changed at once in
  -- the same audited row. The writer trigger generates it. With no default
  -- value on purpose: a row with no operation to belong to is written by
  -- nobody legitimate.
  change_id   uuid   not null,

  entity      public.audited_entity   not null,
  row_key     text   not null,
  catalog_id  text   not null,
  operation   public.change_operation not null,

  column_name text,
  old_value   text,
  new_value   text,

  -- The TRANSACTION's time and not `clock_timestamp()`. All the rows of the same
  -- save share a value, and that is the correct thing: a save is one moment.
  -- It is besides what allows the interface to group the user's action without
  -- storing any transaction identifier — and that is why NONE IS
  -- STORED: a transaction identifier is exactly the key by which
  -- an «undo this action» would be indexed (RF-1505).
  changed_at  timestamptz not null default now(),
  changed_by  uuid,

  -- For an artwork, the row that changed IS the artwork: two columns saying different
  -- things would be a silent incoherence.
  constraint change_log_artwork_key_is_catalog_id
    check (entity <> 'ARTWORK' or row_key = catalog_id),

  -- The equivalence, in both directions: the creation is the only row with no column,
  -- and no row with a column is a creation.
  constraint change_log_create_has_no_column
    check ((column_name is null) = (operation = 'CREATE')),

  constraint change_log_create_has_no_values
    check (operation <> 'CREATE' or (old_value is null and new_value is null)),

  constraint change_log_column_name_not_blank
    check (column_name is null or btrim(column_name) <> '')
);

comment on table public.change_log is
  'Registro de cambios de las obras y sus fotografías, para auditoría (RF-1501). Una fila por campo cambiado. Lo escribe un trigger y nadie más: ni la aplicación ni ningún rol tienen privilegio de insertar, modificar ni borrar aquí. No es un mecanismo de deshacer ni una copia de seguridad (RF-1505): la copia de seguridad es el volcado (RNF-113).';

comment on column public.change_log.change_id is
  'Agrupa todas las filas escritas de una vez sobre la misma ficha, para que la interfaz reconstruya la acción del usuario (RF-1502).';

comment on column public.change_log.row_key is
  'Clave primaria de la fila que cambió, en texto. Texto porque las dos claves de hoy lo son y porque un uuid futuro se representa en texto sin pérdida; no dos columnas nulables con un check, que trasladaría a cada consulta la decisión de cuál mirar.';

comment on column public.change_log.catalog_id is
  'La obra a la que pertenece el cambio; para una obra coincide con row_key. Desnormalizado a propósito: es lo que convierte «el historial de esta ficha, fotografías incluidas» en una consulta indexada en vez de un join contra images. Sin clave ajena, por lo mismo que changed_by: una fila de auditoría no depende de que sobreviva lo que audita.';

comment on column public.change_log.column_name is
  'Nombre de la columna que cambió, tal cual está en el esquema. Nulo SOLO en la fila de alta. Traducirlo a español es tarea de la interfaz (RF-1508).';

comment on column public.change_log.old_value is
  'La representación ALMACENADA del valor anterior, en texto: el código del enumerado y no su etiqueta. Sin truncar — un valor anterior recortado es una mentira en el único sitio que no puede permitírsela. Nulo significa que la columna valía nulo, que es un dato y no una ausencia de dato.';

comment on column public.change_log.new_value is
  'La representación almacenada del valor nuevo, con el mismo criterio que old_value.';

comment on column public.change_log.changed_by is
  'Quién lo cambió. SIN clave ajena a profiles, y es la única ruptura del patrón del esquema: profiles.id cae en cascada desde auth.users, y borrar una cuenta desde el panel de Supabase es un clic (RF-1105). Con clave ajena ese clic o falla —y el registro tiene secuestrado a un usuario que se fue— o alguien lo resuelve borrando filas del registro de auditoría, que es justo el desenlace que este diseño existe para impedir. Nulo cuando no hay sesión: una migración o un acceso administrativo. Nulo es la verdad.';


-- ── One index, and not three ────────────────────────────────
--
-- The arithmetic first, because an audit index is paid for on every write of
-- the audited table: with RNF-108's sizing (1,000 artworks, 5,000 shots) and
-- the per-field granularity this design chooses, the project's complete log
-- is of the order of 360,000 rows and ~61 MB of heap. Three indexes
-- added another ~66 MB, more than the heap itself.
--
-- This is the record's history, which is the only query with volume. It serves
-- for a single photograph's history too
-- (`where catalog_id = … and entity = 'IMAGE' and row_key = …`), because an artwork
-- has dozens of log rows and not millions: that is why there is NO second
-- index by `(entity, row_key)`.
--
-- Nor is there a single partial one by `(change_id, column_name)`: its invariant
-- —there are no two rows for the same field in the same operation— is guaranteed by the
-- writer's walk over the keys, which repeats none, and it is asserted with a
-- test instead of with ~24 MB of index. Nor an index by `changed_by`: that screen
-- does not exist, and an index whose query does not exist is a decision taken before
-- time.
create index change_log_by_artwork_idx
  on public.change_log (catalog_id, changed_at desc, id desc);


-- ── RLS, privileges and the only policy ─────────────────────

alter table public.change_log enable row level security;

-- IMPORTANT, and the line that was not in the first design: it is revoked from
-- `service_role` too, and not only from `anon` and `authenticated`. This platform's default
-- ACLs grant INSERT, UPDATE, DELETE and TRUNCATE over every new
-- table to all three, and `service_role` besides has `bypassrls`. Without this line,
-- anybody with the service key could insert FALSE rows in the
-- audit log, which is worse than having no log.
--
-- `postgres` keeps its own and they are not revoked from it: it is the role with which
-- the dump is restored (RNF-113), and taking them away would break the base's restoration
-- in order to close nothing — it carries `bypassrls`, so what stops it is not the
-- privilege but the two triggers further below. It goes with a test: the table is attacked
-- as `postgres` and it is checked that the padlock stops it.
revoke all on public.change_log from anon, authenticated, service_role;

-- `select` and NOTHING ELSE. No insert, no update, no delete, no truncate and no
-- references. And `usage` over the identity sequence is not granted: with
-- `generated always as identity` the sequence belongs to the column, and whoever
-- could `setval` it backwards would leave the whole catalogue unable to
-- save, because every change to an artwork would clash against the log's primary
-- key.
grant select on public.change_log to authenticated;

revoke all on sequence public.change_log_id_seq from anon, authenticated, service_role;

-- A single policy, and read-only (RF-1506).
--
-- THE CONDITION DESERVES THE COMMENT: each subquery is evaluated UNDER ITS OWN
-- TABLE'S POLICY. Out of that comes the correct behaviour for free — the
-- Cataloguer sees the history of everything, wastebasket included, because their policies
-- show it to them; the Reader sees that of the active artworks and the active photographs, and
-- does not even know that the history of a withdrawn record exists (RF-609) nor that
-- of a withdrawn photograph, which `images`' policy hides from them. It is not a
-- copy of the visibility rule: it is the rule itself, so if tomorrow it changes
-- in `artworks` or in `images`, the history's follows it on its own.
--
-- `can_read()` in front is a belt and documents the intention: a session with no
-- profile reads nothing.
--
-- And THERE IS NO INSERT, UPDATE OR DELETE POLICY. That absence is the denial
-- (RF-111). The writer does not need it: it is `security definer` and its owner
-- is exempt from this table's RLS — that is why, and it is repeated here because it is
-- where one looks, this table does not carry `force row level security`.
create policy change_log_select on public.change_log
  for select using (
    public.can_read()
    and (
      (entity = 'ARTWORK'
        and exists (select 1 from public.artworks a where a.catalog_id = change_log.row_key))
      or
      (entity = 'IMAGE'
        and exists (select 1 from public.images i where i.image_id = change_log.row_key))
    )
  );


-- ── The two padlocks the RLS does not give ──────────────────
--
-- RLS does not apply to the table's owner, nor to `service_role`, nor to
-- `postgres`. Triggers do. This is not redundant with the policies: it is the
-- other half.

create function public.tg_change_log_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'El registro de cambios no se modifica ni se borra: es un registro de auditoría'
    using hint = 'Si un dato del catálogo está mal, corrígelo en la ficha; el registro anotará también esa corrección.';
end $$;

comment on function public.tg_change_log_append_only is
  'Rechaza update, delete y truncate sobre el registro de cambios, también para el propietario de la tabla, que es la única vía que la RLS no cierra (RF-1504).';

create trigger change_log_append_only
  before update or delete on public.change_log
  for each statement execute function public.tg_change_log_append_only();

create trigger change_log_no_truncate
  before truncate on public.change_log
  for each statement execute function public.tg_change_log_append_only();

-- The padlock that was missing: without it, the owner and `service_role` could
-- INSERT false rows, because the one above only covers update, delete and
-- truncate — and an audit to which invented lines can be added is
-- as broken as one from which the true ones can be removed.
--
-- `pg_trigger_depth()` is worth 1 in a direct insert (we are inside this very
-- trigger and no other) and 2 or more when the insert is done by the writer from
-- inside the audited table's trigger. An `app.*` session setting is NOT
-- used, as the freezing of the link check does: there the
-- setting protects from a form's slip, and here one has to be protected from
-- somebody who wants to write — and the same actor one wants to stop could
-- set the setting.
create function public.tg_change_log_insert_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'En el registro de cambios solo escribe el trigger de auditoría'
      using hint = 'Las filas del registro las escribe la base al cambiar una obra o una fotografía; no se insertan a mano.';
  end if;
  return new;
end $$;

comment on function public.tg_change_log_insert_guard is
  'Rechaza cualquier inserción en el registro de cambios que no venga de dentro de otro trigger (RF-1504). Es lo que impide que la clave de servicio o el propietario añadan líneas inventadas.';

create trigger change_log_insert_guard
  before insert on public.change_log
  for each row execute function public.tg_change_log_insert_guard();

revoke all on function public.tg_change_log_append_only()  from public;
revoke all on function public.tg_change_log_insert_guard() from public;

-- A CONSEQUENCE THAT HAS TO BE WRITTEN: to change a row already written in the
-- log —for example, to fill in a new column in a future
-- migration— `change_log_append_only` has to be disabled inside that migration and
-- enabled again. It is deliberately uncomfortable: this way it is a decision visible in a
-- diff somebody reads, and not an `update` that goes unnoticed.
