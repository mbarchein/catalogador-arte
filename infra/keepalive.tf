# pg_cron job that calls the «keep-alive» Edge Function once a day (RNF-116).
#
# The free tier pauses a project after about a week with no activity, and a paused project
# does not wake up by itself. The pattern is the one in ensayadero (`infra/cron.tf`
# there), which has never been paused: a job INSIDE the database that makes an HTTP call
# through pg_net to an Edge Function, which reads through the API. The traffic enters by
# the same door real traffic does.
#
# ── WHY THIS IS TERRAFORM AND NOT A MIGRATION ───────────────
#
# The job's command carries the project's URL, and that is different in every deployment.
# In a migration it would be written into the schema: the local stack and CI would be
# pinging production, and a second deployment of this catalogue would be keeping the first
# one awake instead of itself. The function the job calls IS code and lives with the rest
# (`supabase/functions/keep-alive/`); what it is called on, and how often, is platform.
#
# The key in the header is the ANONYMOUS one, which is public by design and already
# travels in every build of the frontend. The service key is used inside the function,
# which the platform hands it to; it does not leave Terraform (see supabase.tf) and it is
# not written into `cron.job`, which is where ensayadero does put it.
#
# ── HOW IT IS APPLIED ───────────────────────────────────────
#
# The Supabase provider cannot run SQL, so the job is created with a dockerized psql over
# the project's connection pooler, exactly as in ensayadero: docker is the only local
# requirement, and the local stack already needs it.
#
# Drift: an external data source re-reads the live `cron.job` row on every plan; if the job
# is missing or its schedule or command differ, the plan shows
# terraform_data.keepalive_cron being replaced and the apply re-creates it
# (`cron.schedule` upserts by job name). That matters more here than anywhere: a job that
# somebody deleted from the panel does not fail — the project simply gets paused a week
# later.

data "supabase_pooler" "principal" {
  project_ref = supabase_project.principal.id
}

locals {
  # Session-mode pooler URI. The API returns it with a [YOUR-PASSWORD] placeholder; it is
  # replaced, and psql is ALSO handed PGPASSWORD so the connection works either way. The
  # password is alphanumeric (`special = false` in supabase.tf), so it needs no encoding.
  pooler_url = replace(
    try(data.supabase_pooler.principal.url["session"], values(data.supabase_pooler.principal.url)[0]),
    "[YOUR-PASSWORD]",
    local.db_password,
  )

  # Once a day is enough with a week of margin, and a minute that is not :00 keeps the job
  # out of the rush every other scheduled task in the region shares.
  keepalive_cron_schedule = "23 4 * * *"

  # Stored verbatim in cron.job.command: the drift check hashes exactly this text, so any
  # edit here re-creates the job on the next apply.
  keepalive_cron_command = trimspace(<<-SQL
    select net.http_post(
      url := 'https://${supabase_project.principal.id}.supabase.co/functions/v1/keep-alive',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || '${data.supabase_apikeys.principal.anon_key}',
        'apikey', '${data.supabase_apikeys.principal.anon_key}',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  SQL
  )

  # The two extensions are created here and not by a migration: nothing in the schema uses
  # them, and keeping them out of it keeps the local stack and CI from depending on them.
  # Built with join() because a `$` right before `${}` would be read as a Terraform escape.
  keepalive_cron_sql = join("", [
    "create extension if not exists pg_cron;\n",
    "create extension if not exists pg_net;\n",
    "select cron.schedule('keep-alive', '",
    local.keepalive_cron_schedule,
    "', $cron$",
    local.keepalive_cron_command,
    "$cron$);\n",
  ])

  # Must hash the exact string the status script reads back from cron.job: schedule,
  # newline, command.
  keepalive_cron_sha = sha256("${local.keepalive_cron_schedule}\n${local.keepalive_cron_command}")
}

data "external" "keepalive_cron" {
  program = ["bash", "${path.module}/scripts/keepalive-cron-status.sh"]
  query = {
    db_url       = local.pooler_url
    db_password  = local.db_password
    expected_sha = local.keepalive_cron_sha
  }
}

resource "terraform_data" "keepalive_cron" {
  triggers_replace = [
    supabase_project.principal.id,
    local.keepalive_cron_sha,
    # Drift: timestamp() never equals the value stored in state, so a job that is out of
    # sync (or missing) always forces a replace, and with it the provisioner.
    data.external.keepalive_cron.result.in_sync == "true" ? "in-sync" : timestamp(),
  ]

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    # SQL and credentials travel in environment variables and never as arguments, so the
    # database password does not show up in `ps` nor in Terraform's output.
    command = <<-EOT
      docker run --rm -i -e DATABASE_URL -e PGPASSWORD postgres:16-alpine \
        sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -' <<<"$CRON_SQL"
    EOT
    environment = {
      DATABASE_URL = local.pooler_url
      PGPASSWORD   = local.db_password
      CRON_SQL     = local.keepalive_cron_sql
    }
  }
}
