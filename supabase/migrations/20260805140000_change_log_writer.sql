-- ============================================================
-- The change log's writer (RF-1502, RF-1503, RF-1509 to RF-1512).
--
-- 20260805120000 created the log's table and its three padlocks, and said in its
-- first line that «the trigger that fills it arrives in the next migration».
-- THE NEXT MIGRATION DID NOT BRING IT: 20260805130000 is the documentary
-- visibility, and between one and the other the writer was left unwritten. Measured before
-- touching anything: `change_log` has 0 rows, in `public` the two
-- padlock functions exist and NO write function, and neither `artworks` (8
-- triggers) nor `images` (5 triggers) have a trigger pointing at the log.
--
-- So today the log is inviolable and empty, which is the useless half of
-- the pair: the 24 illegitimate write attempts fail —the 12 of the four
-- roles with `permission denied` and the 12 of the owner and of `postgres` with
-- the padlocks— and the base's 22 artworks and 39 photographs have not left a single
-- line of history. An audit log that logs nothing is no more
-- secure than having no log: it is the appearance of having one.
--
-- This migration brings the writer. It does NOT rewrite 20260805120000, which is
-- applied: the table, its privileges and its padlocks are not touched by a single line, and
-- that is exactly what that migration bought by splitting in two.
--
-- ── WHY A TRIGGER AND NOT THE APPLICATION ───────────────────
--
-- Because the log has to capture ALL the write paths, and the
-- application is only one of them. A trigger over the table fires wherever the
-- change comes from: from the PWA, from a `curl` with the anonymous key, from the panel's
-- SQL editor, from a `security definer` function that bypasses the RLS, or from ANOTHER
-- TRIGGER. This last case is not hypothetical and it goes with a test: `sync_photographed`
-- calls `recalculate_photographed()`, which updates `artworks.photographed`
-- when a photograph is uploaded or withdrawn. That change to the artwork is written by
-- nobody from the form and it has to be logged all the same, because for
-- whoever reads the history five years from now it is a change to the record.
--
-- If the log were written by the client, the history's first column would be
-- «what the client wanted to tell», and there would be no way of distinguishing it
-- from the truth. With the trigger, whoever wants to falsify the log has to
-- falsify the datum: it is the same argument by which RF-708 required imposing the
-- lock in the base and not in the browser.
--
-- ── AFTER AND NOT BEFORE, AND IT IS COMPULSORY ──────────────
--
-- The trigger is AFTER INSERT OR UPDATE. It is not a style preference: in a
-- BEFORE INSERT the log would have nothing to note. `assign_catalog_id` assigns
-- `catalog_id` in a BEFORE INSERT and `assign_image_id` does the same with
-- `image_id`, so a writer that ran before would see the key at null and
-- would write an audit line without saying which record it speaks of —or it would clash
-- against `row_key`'s `not null` and would break the creation of any artwork.
--
-- And in the UPDATE, AFTER is what guarantees that what is noted is the value that WAS
-- stored and not the one that arrived: `artwork_audit_trail` stamps `basic_updated_at`,
-- `tg_artwork_research_status_coherent` can correct a research
-- state, and `tg_image_deactivation` touches the withdrawal. A log that noted
-- what the client sent instead of what the base accepted would lie in precisely
-- the cases in which the base corrects the client, which are the ones worth auditing.
--
-- ── WHAT IS NOT NOTED, AND WHY IT IS NOT AN OMISSION ────────
--
-- 1. THE TRACE STAMPS. `updated_at` and `updated_by` change on EVERY save,
--    by definition (RF-801, RF-803): noting them would turn every correction of
--    a typo into three lines, two of them with no information —«the update
--    date went from 12:04 to 12:05»—, and the history of a record
--    with two hundred changes would have four hundred lines of noise in front of the
--    two hundred somebody wants to read. Likewise `created_at`, `created_by`,
--    `basic_updated_at` (RF-802) and the four of the wastebasket —`deactivated_at`,
--    `deactivated_by`, `restored_at`, `restored_by`—, which the trace trigger stamps
--    from the change to `active` and which no person decides.
--
--    MIND WHAT IS NOTED: `active` is NOT on that list. Withdrawing and restoring
--    are a record's most consequential changes and are the ones that give their names to two
--    of the enumerated type's four verbs. What is discarded is the redundant
--    stamp that accompanies the change, not the change.
--
-- 2. THE DERIVED COLUMNS. `artworks.execution_date` is
--    `generated always as ... stored`: it is a function of `date_note`,
--    `start_year`, `end_year`, `approximate_date` and `unconfirmed_date`, which are
--    noted. Noting it as well would be telling the same change twice and, worse,
--    counting as a user's change something the user cannot write.
--    20260805120000 had already decided it when it wrote that the log «by design
--    does not store the derived columns».
--
-- The list of discards goes as a constant in the function and not as a query to the
-- catalogue per row, because it is paid for on every save. The price of that decision
-- is that a typo in a name would not fail: it would discard too few and the log
-- would fill with noise in silence, which is the worst possible failure mode here.
-- That is why the migration measures itself further below against `pg_attribute`, in both
-- directions: that every name on the list really exists in one of the two
-- audited tables, and that every generated column of the two is on the list.
--
-- ── AN UPDATE THAT CHANGES NOTHING WRITES NOTHING ───────────
--
-- RF-1510. An `update` that sends the same values —the normal case of a
-- form saved without anything having been touched, and of a PostgREST `PATCH`
-- with the whole object— changes `updated_at` and `updated_by` and no other
-- column. As both are discarded, not one field is left to note and the
-- `insert` writes ZERO rows. No `if` is needed: it comes out of the query's own
-- shape, which is better than a condition somebody can remove.
--
-- And no «empty» operation line with no fields is written either: it could not be,
-- because 20260805120000's `change_log_create_has_no_column` constraint requires
-- that the only row with no column be the creation's. The table's design already prevented
-- the log filling with empty changes; this is what makes the writer not
-- have to try.
--
-- ── NO FILLING IN THE PAST ──────────────────────────────────
--
-- RF-1511. There is no backfill. The 22 artworks and the 39 photographs that already exist do not
-- receive a retroactive creation line, and not out of laziness: the only thing that
-- could be written with truth is `changed_by` null and `changed_at` of today, that is,
-- a line asserting that somebody created the record AR-0001 on 4 August 2026,
-- which is false. Inventing audit lines so that the history does not start
-- empty is exactly the class of falsification this table exists to
-- prevent, and it makes no difference that a migration writes it in good faith. The history of
-- a record earlier than today starts where the log starts; the row's own `created_at` and
-- `created_by` go on telling the little that is known from before.
--
-- ── WHAT GOES ON NOT BEING REVERSIBLE ───────────────────────
--
-- RF-1505, and this is where care had to be taken, because a writer that knows how to
-- reconstruct the previous values is 90 % of an «undo». The other half is not built:
-- no function reads `change_log`, no view projects it,
-- no RPC accepts a `change_id`, and the writer returns nothing and stores no
-- transaction identifier. Checked against the base: 0 functions in `public`
-- naming `change_log` and writing in `artworks` or in `images`, and 0 views
-- over the table. The test checks it again and will go red the day
-- the shortcut appears.
-- ============================================================


-- ── The writer ──────────────────────────────────────────────
--
-- `security definer` AND IT CANNOT NOT BE: the `authenticated` role does not have
-- `insert` over `change_log` —that is what the previous migration is about— so a
-- writer running with the privileges of whoever saves would fail with
-- «permission denied for table change_log» and, being inside the trigger,
-- would knock down the artwork's save. Running as its owner, which is `change_log`'s,
-- it comes in through the owner's exemption from RLS: that is where
-- 20260805120000's warning about `force row level security` lands, which
-- would annul that exemption and break the whole catalogue.
--
-- A single function for both tables, resolved by `tg_table_name` and by
-- `to_jsonb`, and not one per table. With two copies, the day a column is added
-- to `images` one would have to remember the other; and the field-by-field comparison is
-- identical in both, because it looks at no catalogue column name.
create function public.tg_change_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The discards. They go ordered as explained above: first the trace
  -- stamps (RF-801 to RF-804), then the four of the wastebasket (RF-902), and at
  -- the end the derived ones. `active` is NOT here, on purpose.
  c_ignored constant text[] := array[
    'created_at', 'created_by', 'updated_at', 'updated_by', 'basic_updated_at',
    'deactivated_at', 'deactivated_by', 'restored_at', 'restored_by',
    'execution_date'
  ];

  v_entity     public.audited_entity;
  v_row_key    text;
  v_catalog_id text;
  v_operation  public.change_operation;
  v_change_id  uuid := gen_random_uuid();
  v_who        uuid := auth.uid();
  v_new        jsonb := to_jsonb(new);
  v_old        jsonb;
begin
  -- What class of record, STORED and not deduced from the key's format, which is what
  -- the enumerated type's comment asked for. The row's key is taken from the
  -- jsonb representation and not from `new.image_id`, so that the function does not name a
  -- column that does not exist in the other table.
  if tg_table_name = 'artworks' then
    v_entity  := 'ARTWORK';
    v_row_key := v_new->>'catalog_id';
  else
    v_entity  := 'IMAGE';
    v_row_key := v_new->>'image_id';
  end if;

  v_catalog_id := v_new->>'catalog_id';

  -- The creation: ONE line and with no field. The record's initial values are not
  -- enumerated, and the two constraints `change_log_create_has_no_column` and
  -- `change_log_create_has_no_values` would not allow doing it any other way. It is
  -- coherent with the rest: the history tells the changes, and the initial state
  -- is in the record itself.
  if tg_op = 'INSERT' then
    insert into public.change_log
      (change_id, entity, row_key, catalog_id, operation, changed_by)
    values (v_change_id, v_entity, v_row_key, v_catalog_id, 'CREATE', v_who);
    return null;
  end if;

  v_old := to_jsonb(old);

  -- The verb. Withdrawing and restoring ARE changes to the `active` field and are noted
  -- as such too —the field row is written just the same, further below—; this is
  -- only the verb with which the interface reads the line, which is what
  -- the enumerated type's comment in 20260805120000 says.
  if (v_old->>'active')::boolean and not (v_new->>'active')::boolean then
    v_operation := 'DEACTIVATE';
  elsif not (v_old->>'active')::boolean and (v_new->>'active')::boolean then
    v_operation := 'RESTORE';
  else
    v_operation := 'UPDATE';
  end if;

  -- One row per changed field (RF-1502), in a single `insert`.
  --
  -- THE COMPARISON IS MADE OVER THE TEXT THAT IS GOING TO BE STORED, with `->>` and not
  -- with `->`. It is deliberate and it is the correct thing for this table: what the log
  -- stores is two texts, so what decides whether there was a change is whether those two
  -- texts differ. By comparing the jsonb one could write a line whose previous
  -- value and new value were the same string, which is an empty change with
  -- another disguise.
  --
  -- `is distinct from` and not `<>`: a field that goes from null to a value, or the
  -- other way round, is this catalogue's most common change —«sin revisar» is not «no»— and
  -- with `<>` neither of the two would be noted.
  --
  -- The walk repeats no key, and out of that comes without a unique index the
  -- invariant of «one row per field and operation» that 20260805120000 said would be
  -- asserted with a test instead of with ~24 MB of index.
  insert into public.change_log
    (change_id, entity, row_key, catalog_id, operation, column_name,
     old_value, new_value, changed_by)
  select v_change_id, v_entity, v_row_key, v_catalog_id, v_operation, n.key,
         o.value, n.value, v_who
    from jsonb_each_text(v_new) n
    join jsonb_each_text(v_old) o on o.key = n.key
   where n.key <> all (c_ignored)
     and n.value is distinct from o.value
   -- A stable order, so that two identical saves leave the same sequence of
   -- lines and a difference in a dump is a real difference.
   order by n.key;

  return null;
end $$;

comment on function public.tg_change_log is
  'Escribe el registro de cambios de una obra o una fotografía: una fila por campo cambiado (RF-1502). AFTER, porque antes del INSERT la clave de la ficha todavía no está asignada y porque el valor que se anota es el que quedó guardado. Descarta las marcas de traza y las columnas derivadas, así que un guardado que no cambia nada no escribe ninguna línea. Es security definer porque ningún rol de la aplicación tiene insert sobre el registro.';

-- Neither the anonymous nor the authenticated role invokes it: a trigger fires without anybody
-- having EXECUTE over its function, and that is how function_privileges checks it.
revoke all on function public.tg_change_log() from public;


-- ── The two triggers ────────────────────────────────────────
--
-- With no `update of <columns>`: the list would have to be maintained on adding a
-- column, and forgetting it would leave a field unaudited in silence. With no `when`, for
-- the same reason — the «nothing has changed» filter is inside and there it can be
-- explained.
--
-- There is no DELETE trigger, and it is not an oversight: real deletion does not exist
-- (RF-901), neither `artworks` nor `images` have a `delete` policy —measured: only
-- insert, select and update in both— and the `change_operation` enumerated type has no
-- value to note it with. A `delete` can only be done by whoever bypasses the RLS,
-- and for that case the honest answer is that it must not happen, not a log
-- line that normalises it.
create trigger artwork_change_log
  after insert or update on public.artworks
  for each row execute function public.tg_change_log();

create trigger image_change_log
  after insert or update on public.images
  for each row execute function public.tg_change_log();


-- ── The migration measures itself ───────────────────────────
--
-- What a correct `create` does not guarantee and what a silent failure
-- would break with no warning is checked. NO functional test is done here, and it deserves
-- saying why: the only way of checking that the writer writes is to
-- change a record, and that would leave in the log a line of a test
-- artwork that afterwards CANNOT BE DELETED, because that is what the table is about. The functional
-- test goes in the test, inside a transaction that is rolled back.
do $$
declare
  c_ignored constant text[] := array[
    'created_at', 'created_by', 'updated_at', 'updated_by', 'basic_updated_at',
    'deactivated_at', 'deactivated_by', 'restored_at', 'restored_by',
    'execution_date'
  ];
  v_faltan  text[];
  v_sobran  text[];
  v_n       integer;
begin
  -- 1. The function is `security definer`. Without this it does not write a single line and,
  --    worse, it knocks down the save of any artwork with «permission denied».
  if not (select prosecdef from pg_proc where oid = 'public.tg_change_log()'::regprocedure) then
    raise exception 'FALLO: tg_change_log no es security definer; no podrá insertar en el registro y romperá el guardado';
  end if;

  -- 2. The two triggers, and AFTER. `tgtype` bit 1 (value 2) is BEFORE: if
  --    it were set, the creation of an artwork would write a line with the key at
  --    null. Bit 0 (value 1) is FOR EACH ROW, and without it there would be no `new`.
  select count(*) into v_n
    from pg_trigger
   where tgrelid in ('public.artworks'::regclass, 'public.images'::regclass)
     and tgfoid = 'public.tg_change_log()'::regprocedure
     and not tgisinternal
     and (tgtype & 1) = 1    -- for each row
     and (tgtype & 2) = 0    -- after, no before
     and (tgtype & 4) <> 0   -- insert
     and (tgtype & 16) <> 0; -- update
  if v_n <> 2 then
    raise exception 'FALLO: deberían existir dos triggers AFTER INSERT OR UPDATE FOR EACH ROW del escritor, hay %', v_n;
  end if;

  -- 3. THE DISCARDS, AGAINST THE CATALOGUE AND IN BOTH DIRECTIONS. This is the
  --    block that catches this delivery's real mistake, because a typo in a
  --    name does not fail: it discards too few and fills the log with noise without
  --    anybody finding out.
  --
  --    Direction 1: every name on the list exists in `artworks` or in `images`.
  select coalesce(array_agg(i order by i), '{}') into v_faltan
    from unnest(c_ignored) i
   where not exists (
     select 1 from pg_attribute
      where attrelid in ('public.artworks'::regclass, 'public.images'::regclass)
        and attname = i and attnum > 0 and not attisdropped
   );
  if array_length(v_faltan, 1) > 0 then
    raise exception 'FALLO: el escritor descarta columnas que no existen en ninguna tabla auditada: [%]. Una errata aquí no falla: descarta de menos y el registro se llena de ruido',
      array_to_string(v_faltan, ', ');
  end if;

  --    Direction 2: every GENERATED column of the two tables is on the list. Without
  --    this, adding a derived column tomorrow would note it as if a person had
  --    written it, and would count twice the change it derives from.
  select coalesce(array_agg(attrelid::regclass || '.' || attname order by attname), '{}')
    into v_sobran
    from pg_attribute
   where attrelid in ('public.artworks'::regclass, 'public.images'::regclass)
     and attgenerated <> '' and attnum > 0 and not attisdropped
     and attname <> all (c_ignored);
  if array_length(v_sobran, 1) > 0 then
    raise exception 'FALLO: hay columnas generadas que el escritor anotaría como cambios del usuario: [%]',
      array_to_string(v_sobran, ', ');
  end if;

  -- 4. `active` is NOT discarded. It is the previous block's assertion the other way round:
  --    with `active` on the list, withdrawing an artwork would leave no trail and two of the
  --    enumerated type's four verbs would never get written.
  if 'active' = any (c_ignored) then
    raise exception 'FALLO: el escritor descarta `active`; retirar o restaurar una ficha no dejaría rastro';
  end if;

  -- 5. The log does not audit itself. A trigger over `change_log` that
  --    wrote in `change_log` would be a recursion that eats the disk on the
  --    first save.
  if exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.change_log'::regclass
       and not t.tgisinternal
       and t.tgfoid = 'public.tg_change_log()'::regprocedure
  ) then
    raise exception 'FALLO: el escritor del registro está enganchado al propio registro: se auditaría a sí mismo en cascada';
  end if;

  -- 6. And 20260805120000's padlocks are still standing and active. This migration
  --    does not touch them, but it is the one that opens the first legitimate write: if
  --    somebody had left one disabled, this is the moment to know it.
  select count(*) into v_n
    from pg_trigger
   where tgrelid = 'public.change_log'::regclass
     and not tgisinternal
     and tgname in ('change_log_append_only', 'change_log_no_truncate', 'change_log_insert_guard')
     and tgenabled = 'O';
  if v_n <> 3 then
    raise exception 'FALLO: los tres candados del registro deberían estar activos, hay % (¿alguien dejó uno desactivado?)', v_n;
  end if;

  raise notice 'OK: el escritor es security definer, cuelga AFTER de las dos tablas auditadas, descarta exactamente las marcas de traza y las derivadas, no se audita a sí mismo, y los tres candados siguen activos';
end $$;
