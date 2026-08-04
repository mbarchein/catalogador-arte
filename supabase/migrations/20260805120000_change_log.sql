-- ============================================================
-- El registro de cambios de obras y fotografías (RF-1501 a RF-1508).
--
-- Hoy una ficha dice CUÁNDO se tocó por última vez y QUIÉN la tocó
-- (`updated_at`, `updated_by`), y nada más. No dice qué cambió, ni desde qué
-- valor, ni cuántas veces. Con dos personas catalogando dos mil obras a lo largo
-- de años, «¿esta obra siempre midió 45 cm o alguien la corrigió?» es una
-- pregunta que hoy no tiene respuesta y que dentro de cinco años la va a tener
-- alguien que no estaba. Eso es lo que este registro contesta.
--
-- Esta migración crea LA TABLA Y SUS CANDADOS. No escribe nadie en ella
-- todavía: el trigger que la rellena llega en la migración siguiente. Se parte
-- así a propósito, y no por comodidad — la tabla existe cerrada y probada
-- durante un despliegue entero antes de recibir su primera fila, de modo que si
-- el escritor hubiera que retirarlo, la tabla, sus privilegios y sus
-- protecciones no se tocan. Al revés no funciona: un escritor sobre una tabla
-- cuyos permisos todavía no están decididos escribe en una tabla abierta.
--
-- ── LO QUE DECIDE SI ESTO VALE ALGO O NADA: LOS PERMISOS ─────
--
-- Un registro de auditoría que el auditado puede editar no es un registro de
-- auditoría, es una nota. Así que la regla entera de esta tabla cabe en una
-- frase: SOLO INSERCIÓN, Y SOLO POR TRIGGER. Ni el Catalogador, ni el Lector, ni
-- el Superusuario, ni la clave de servicio tienen `insert`, `update` o `delete`
-- aquí. La escritura la hace una función `security definer` que solo se dispara
-- al cambiar una fila auditada.
--
-- Y no basta con un candado, porque en esta plataforma cada candado tiene su
-- agujero conocido:
--
--   1. EL PRIVILEGIO. `revoke` de anon, authenticated y service_role. Sin el
--      privilegio, PostgREST contesta 403 a un POST, un PATCH o un DELETE ANTES
--      de mirar ninguna política. Es lo que pide RF-113: dos cerraduras en
--      serie y no una.
--   2. LA POLÍTICA. Solo existe la de SELECT. La ausencia de política de
--      `insert`, `update` y `delete` ES la denegación (RF-111).
--      -> Agujero: la RLS no se aplica al propietario de la tabla, ni a
--         `service_role` ni a `postgres`, que llevan `bypassrls`.
--   3. LOS TRIGGERS. Uno rechaza `update`, `delete` y `truncate` para todo el
--      mundo, propietario incluido; otro rechaza cualquier `insert` que no venga
--      de dentro de otro trigger. Los triggers sí se aplican al propietario.
--
-- Hasta dónde llega esto, dicho en voz alta: un superusuario puede desactivar un
-- trigger o ponerse `session_replication_role = replica` con una sentencia
-- deliberada. Nada dentro de una base de datos es inviolable contra quien la
-- administra. Lo que estas tres capas hacen es subir el listón de «un PATCH con
-- la clave de servicio» a «una sentencia DDL deliberada», y volver IMPOSIBLE el
-- destrozo accidental, que es el modo de fallo realista con dos personas y un
-- panel de Supabase abierto.
--
-- ── AVISO QUE NO SE PUEDE PERDER: NADA DE `force row level security` ─
--
-- Esta tabla NO lleva `force row level security`, y no es un descuido. Es
-- justamente la línea que alguien añade en una revisión de seguridad pensando
-- que endurece. Aquí anularía la exención del propietario, abortaría el `insert`
-- del trigger escritor y, con él, EL GUARDADO DEL USUARIO: se rompería el
-- catálogo entero, no el registro. Si en una auditoría futura aparece la
-- sugerencia, la respuesta está escrita aquí.
--
-- ── NO ES REVERSIBLE, Y ESO ES UN REQUISITO (RF-1505) ───────
--
-- El registro es INFORMATIVO. No se construye ninguna función de deshacer, ni
-- pantalla, ni botón, ni RPC, ni nada que sea el sustrato cómodo de una. Ni
-- siquiera se guarda en una forma que lo invite: no hay instantáneas de fila ni
-- valores en `jsonb` con la fila entera, sino dos columnas de texto por campo
-- suelto. El registro es un testimonio; la copia de seguridad es el volcado
-- periódico (RNF-113). Confiarle una restauración dejaría la fila a medias,
-- porque por diseño no guarda las columnas derivadas ni los ficheros del
-- almacén. Si algún día aparece un camino de vuelta, es un error y no una
-- mejora.
--
-- ── LO QUE ESTA MIGRACIÓN NO HACE, Y CONSTA ─────────────────
--
--  * No publica en `supabase_realtime`. Un canal que emite cada campo cambiado
--    a todos los clientes abiertos no lo ha pedido nadie y multiplica el tráfico
--    por el número de columnas de cada guardado.
--  * No crea ninguna vista de lectura. Una vista es propiedad de quien la crea y
--    se salta la RLS salvo que lleve `security_invoker = true`: sería superficie
--    de seguridad nueva para ahorrarle al frontend un `join` con una tabla de
--    tres filas. La interfaz lee la tabla y resuelve los nombres contra
--    `profiles`, que ya carga.
--  * No crea ninguna función que lea el registro y escriba en `artworks` o en
--    `images` (RF-1505).
--  * No audita `profiles`. Un cambio de rol es probablemente el cambio más
--    sensible del sistema y hoy no deja rastro. Queda FUERA DE ALCANCE a
--    propósito: exige relajar `catalog_id`, tiene otra regla de visibilidad y es
--    una decisión del propietario, no un efecto colateral de esta migración.
--  * No audita `parties`, `provenance_events` ni el resto del catálogo razonado
--    documental, por lo mismo: `catalog_id not null` los deja fuera, y así la
--    decisión sobre el historial de `contact` —dato personal de un tercero que
--    el Lector ve por RF-105— se toma con esa columna delante y en su propia
--    migración, en vez de heredarse hoy por descuido. Tampoco `external_links`:
--    un enlace podrá colgar de una exposición y entonces no tiene `catalog_id`.
--  * No purga ni caduca nada (RF-1507). Si algún día pasara de unos dos millones
--    de filas, la respuesta prevista NO es borrar: es trasladar lo más antiguo a
--    una tabla de archivo con exactamente los mismos privilegios, la misma
--    política y los mismos candados. Y no hay ningún interruptor para silenciar
--    el registro, ni siquiera durante una migración: un registro de auditoría
--    con botón de apagado no es un registro de auditoría.
--  * No renombra `tg_artwork_audit_trail`. El nombre miente —sella marcas de
--    tiempo, no es un rastro de auditoría— pero renombrarlo obliga a recrear su
--    trigger a cambio de nada. Para quien lea esto dentro de un año:
--    `tg_artwork_audit_trail` y `tg_row_audit` (RF-804) sellan quién y cuándo EN
--    LA PROPIA FILA; el registro de cambios es esto otro, y es una tabla aparte.
-- ============================================================


-- ── Los dos enumerados ──────────────────────────────────────
--
-- El criterio de siempre para separar un enumerado de una tabla maestra en este
-- esquema es quién es dueño de las entradas y si el código mira el valor. Aquí
-- los dos son del esquema y los dos los mira el código.

-- Qué clase de ficha cambió. Se GUARDA y no se deduce del formato del
-- identificador: `AR-0001` frente a `AR-0001_v3` es un patrón, y deducir de un
-- patrón es adivinar donde se puede afirmar. Además la interfaz redacta distinto
-- la línea de una obra («Marta creó la ficha») y la de una fotografía («Marta
-- subió la fotografía 3»), así que el valor lo necesita el código.
create type public.audited_entity as enum ('ARTWORK', 'IMAGE');

comment on type public.audited_entity is
  'Qué clase de ficha cambió: una obra o una fotografía. Se guarda y no se deduce del formato del identificador.';

-- El verbo de la línea. Es redundante con la propia fila de campo de `active`
-- —retirar es poner `active` a falso— y se guarda igual: el verbo lo necesitan
-- tres pantallas, y recalcularlo en tres sitios son tres sitios donde
-- equivocarse.
create type public.change_operation as enum ('CREATE', 'UPDATE', 'DEACTIVATE', 'RESTORE');

comment on type public.change_operation is
  'Qué se hizo: crear, cambiar, retirar o restaurar. Retirar y restaurar son cambios del campo «activa» y se anotan también como tales; este valor es el verbo con el que se lee la línea.';

revoke all on type public.audited_entity   from public;
revoke all on type public.change_operation from public;
grant usage on type public.audited_entity   to authenticated;
grant usage on type public.change_operation to authenticated;


-- ── La tabla ────────────────────────────────────────────────
--
-- Granularidad POR CAMPO (RF-1502): una fila por cada columna que cambia, con su
-- valor anterior y su valor nuevo. No una instantánea de la fila, que sería a la
-- vez más cara y una invitación a restaurarla.
create table public.change_log (
  -- Clave monótona y no `uuid`: el registro es de solo añadir y se lee en orden
  -- temporal, así que la clave primaria hace de paso el desempate de dos cambios
  -- con la misma marca de tiempo — que es el caso NORMAL, porque `now()` es la
  -- hora de la transacción y una sola acción escribe varias filas.
  -- `generated always` y no `by default`: nadie debe poder elegir el número.
  id          bigint generated always as identity primary key,

  -- Identifica la fila-operación: todos los campos que cambiaron de una vez en
  -- una misma fila auditada. Lo genera el trigger escritor. Sin valor por
  -- omisión a propósito: una fila sin operación a la que pertenecer no la
  -- escribe nadie legítimo.
  change_id   uuid   not null,

  entity      public.audited_entity   not null,
  row_key     text   not null,
  catalog_id  text   not null,
  operation   public.change_operation not null,

  column_name text,
  old_value   text,
  new_value   text,

  -- Hora de la TRANSACCIÓN y no `clock_timestamp()`. Todas las filas de un mismo
  -- guardado comparten valor, y eso es lo correcto: un guardado es un momento.
  -- Es además lo que permite a la interfaz agrupar la acción del usuario sin
  -- guardar ningún identificador de transacción — y por eso NO SE GUARDA
  -- NINGUNO: un identificador de transacción es justo la clave por la que se
  -- indexaría un «deshacer esta acción» (RF-1505).
  changed_at  timestamptz not null default now(),
  changed_by  uuid,

  -- Para una obra, la fila que cambió ES la obra: dos columnas que dijeran cosas
  -- distintas serían una incoherencia silenciosa.
  constraint change_log_artwork_key_is_catalog_id
    check (entity <> 'ARTWORK' or row_key = catalog_id),

  -- La equivalencia, en los dos sentidos: el alta es la única fila sin columna,
  -- y ninguna fila con columna es un alta.
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


-- ── Un índice, y no tres ────────────────────────────────────
--
-- La cuenta, delante, porque un índice de auditoría se paga en cada escritura de
-- la tabla auditada: con el dimensionado de RNF-108 (1.000 obras, 5.000 tomas) y
-- la granularidad por campo que este diseño elige, el registro completo del
-- proyecto son del orden de 360.000 filas y ~61 MB de montón. Tres índices
-- sumaban otros ~66 MB, más que el propio montón.
--
-- Este es el historial de la ficha, que es la única consulta con volumen. Sirve
-- también para el historial de una fotografía suelta
-- (`where catalog_id = … and entity = 'IMAGE' and row_key = …`), porque una obra
-- tiene decenas de filas de registro y no millones: por eso NO hay un segundo
-- índice por `(entity, row_key)`.
--
-- Tampoco hay un único parcial por `(change_id, column_name)`: su invariante
-- —no hay dos filas para el mismo campo en la misma operación— la garantiza el
-- recorrido de claves del escritor, que no repite ninguna, y se afirma con un
-- test en vez de con ~24 MB de índice. Ni índice por `changed_by`: esa pantalla
-- no existe, y un índice cuya consulta no existe es una decisión tomada antes de
-- tiempo.
create index change_log_by_artwork_idx
  on public.change_log (catalog_id, changed_at desc, id desc);


-- ── RLS, privilegios y la única política ────────────────────

alter table public.change_log enable row level security;

-- IMPORTANTE, y la línea que no estaba en el primer diseño: se revoca también de
-- `service_role`, y no solo de `anon` y `authenticated`. Las ACL por omisión de
-- esta plataforma conceden INSERT, UPDATE, DELETE y TRUNCATE sobre toda tabla
-- nueva a los tres, y `service_role` tiene además `bypassrls`. Sin esta línea,
-- cualquiera con la clave de servicio podría insertar filas FALSAS en el
-- registro de auditoría, que es peor que no tener registro.
--
-- `postgres` conserva las suyas y no se le revocan: es el rol con el que se
-- repone el volcado (RNF-113), y quitárselas rompería la restauración de la base
-- para no cerrar nada — lleva `bypassrls`, así que lo que lo detiene no es el
-- privilegio sino los dos triggers de más abajo. Va con test: se ataca la tabla
-- como `postgres` y se comprueba que lo para el candado.
revoke all on public.change_log from anon, authenticated, service_role;

-- `select` y NADA MÁS. Sin insert, sin update, sin delete, sin truncate y sin
-- references. Y no se concede `usage` sobre la secuencia de identidad: con
-- `generated always as identity` la secuencia pertenece a la columna, y quien
-- pudiera hacerle `setval` hacia atrás dejaría el catálogo entero sin poder
-- guardar, porque cada cambio de una obra chocaría contra la clave primaria del
-- registro.
grant select on public.change_log to authenticated;

revoke all on sequence public.change_log_id_seq from anon, authenticated, service_role;

-- Una sola política, y solo de lectura (RF-1506).
--
-- LA CONDICIÓN MERECE EL COMENTARIO: cada subconsulta se evalúa BAJO LA POLÍTICA
-- DE SU PROPIA TABLA. De ahí sale gratis el comportamiento correcto — el
-- Catalogador ve la historia de todo, papelera incluida, porque sus políticas se
-- la enseñan; el Lector ve la de las obras activas y las fotografías activas, y
-- ni siquiera sabe que existe la historia de una ficha retirada (RF-609) ni la
-- de una fotografía retirada, que la política de `images` le esconde. No es una
-- copia de la regla de visibilidad: es la regla misma, así que si mañana cambia
-- en `artworks` o en `images`, la del historial la sigue sola.
--
-- `can_read()` delante es cinturón y documenta la intención: una sesión sin
-- perfil no lee nada.
--
-- Y NO HAY POLÍTICA DE INSERT, UPDATE NI DELETE. Esa ausencia es la denegación
-- (RF-111). El escritor no la necesita: es `security definer` y su propietario
-- está exento de la RLS de esta tabla — por eso, y se repite aquí porque es
-- donde se mira, esta tabla no lleva `force row level security`.
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


-- ── Los dos candados que la RLS no da ───────────────────────
--
-- La RLS no se aplica al propietario de la tabla, ni a `service_role`, ni a
-- `postgres`. Los triggers sí. Esto no es redundante con las políticas: es la
-- otra mitad.

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

-- El candado que faltaba: sin él, el propietario y `service_role` podrían
-- INSERTAR filas falsas, porque el de arriba solo cubre update, delete y
-- truncate — y una auditoría a la que se le pueden añadir líneas inventadas está
-- tan rota como una a la que se le pueden quitar las verdaderas.
--
-- `pg_trigger_depth()` vale 1 en un insert directo (estamos dentro de este mismo
-- trigger y de ninguno más) y 2 o más cuando el insert lo hace el escritor desde
-- dentro del trigger de la tabla auditada. NO se usa un ajuste de sesión
-- `app.*`, como sí hace el congelado de la comprobación de enlaces: allí el
-- ajuste protege de un descuido del formulario, y aquí hay que protegerse de
-- alguien que quiere escribir — y el mismo actor al que se quiere frenar podría
-- ponerse el ajuste.
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

-- CONSECUENCIA QUE HAY QUE ESCRIBIR: para cambiar una fila ya escrita del
-- registro —por ejemplo, para rellenar una columna nueva en una migración
-- futura— hay que desactivar `change_log_append_only` dentro de esa migración y
-- volver a activarlo. Es incómodo a propósito: así es una decisión visible en un
-- diff que alguien lee, y no un `update` que pasa desapercibido.
