# Daily PostgreSQL archive

`postgres-daily-backup.mjs` uses Node 24 core modules and installed PostgreSQL
client binaries. It reads `DATABASE_URL` from the systemd service environment,
not command arguments. The root service runs a separately installed root-owned
script and reads only `/etc/novelforge/backup.env`, also root-owned. Never point
either path at application-owned files: the application account must not be able
to replace root-executed code or inject `NODE_OPTIONS`, `PATH` or other environment
variables. No PostgreSQL diagnostics, URL or password is logged. A temporary
private service file carries the connection settings; the password is supplied
only in the child environment. The file is removed on normal success/failure.

The supported connection form is a single-host `postgresql://` or `postgres://`
URL, including IPv6 and libpq query parameters such as `sslmode`, `sslrootcert`,
`connect_timeout` and `options`. Query values override URL fields. Prisma-only
`schema`, `connection_limit`, `pool_timeout`, `pgbouncer` and `statement_cache_size`
parameters are omitted: this is a whole-database backup, not a Prisma client.
Other parameters are passed to libpq and fail if unsupported; TLS is never silently
downgraded. Unsupported parameter encodings fail rather than alter values.
Certificates must be readable within the service sandbox (for example `/etc`);
`ProtectHome=true` deliberately hides home directories.

## Install and verify

Run these commands only on the authorized Linux host, after copying the reviewed
files into `/opt/novelforge/scripts/ops`. Install only copies whose bytes were
independently reviewed; do not automatically synchronize this root executable
from an application-writable checkout. Use a `pg_dump` compatible with the source
PostgreSQL server and a matching `pg_restore`. This script does not install tools.

```sh
sudo install -d -o root -g root -m 0700 /var/backups/novelforge
sudo install -d -o root -g root -m 0755 /usr/local/lib/novelforge-ops
sudo install -d -o root -g root -m 0700 /etc/novelforge
sudo install -o root -g root -m 0755 /opt/novelforge/scripts/ops/postgres-daily-backup.mjs /usr/local/lib/novelforge-ops/postgres-daily-backup.mjs
sudo install -o root -g root -m 0644 /opt/novelforge/scripts/ops/novelforge-backup.service /etc/systemd/system/novelforge-backup.service
sudo install -o root -g root -m 0644 /opt/novelforge/scripts/ops/novelforge-backup.timer /etc/systemd/system/novelforge-backup.timer
sudo systemd-analyze verify /etc/systemd/system/novelforge-backup.service /etc/systemd/system/novelforge-backup.timer
# Before starting, provision /etc/novelforge/backup.env as described below.
sudo systemctl daemon-reload
sudo systemctl start novelforge-backup.service
sudo systemctl status novelforge-backup.service --no-pager
sudo journalctl -u novelforge-backup.service -n 15 --no-pager
# Enable only after the first archive and a real scratch restore are verified.
sudo systemctl enable --now novelforge-backup.timer
sudo systemctl list-timers novelforge-backup.timer --no-pager
```

Before starting the service, the operator must create
`/etc/novelforge/backup.env` with owner/group `root:root`, mode `0600`, containing
exactly one systemd `EnvironmentFile` assignment: `DATABASE_URL`. Parse only that
known key from the application's configuration using a data parser; **never shell
source/evaluate the application `.env` and never copy its other variables**.
Quote/escape the value for systemd's environment-file syntax without changing the
URL. Do not echo the URL or include it in command arguments. The integration owner
performs and verifies this credential provisioning independently; this repository
does not contain a credential file. Credential rotations must update this private
root-owned copy as well. Ensure `/usr/local/bin/node`, PostgreSQL client binaries,
installed units, scripts and all their ancestor directories are not writable by
the application user. The static service PATH refers only to trusted system paths.

The timer runs at 02:30 UTC; `Persistent=true` catches a missed run after downtime.
Archives are root-owned, mode 0600, under a root-private directory. A unique
temporary file is dumped and checked with `pg_restore --list` before atomic rename
to `novelforge-daily-YYYY-MM-DD.dump`. A successful rerun replaces only that UTC
day's archive; failed validation preserves its previous archive. Only the seven
latest files matching that exact daily naming pattern are retained. Weekly/manual
files are untouched. Unexpected symlinks or public permissions refuse deletion.
Concurrent runs fail on an exclusive directory lock. After a killed/timed-out job,
inspect the process and private partial files before manually removing its stale
`.novelforge-daily.lock`; the runner never guesses that another writer is dead.

The JSON success receipt reports bytes, SHA-256 and archive-list validation.
**Listing is not a restore drill or proof of every compressed data block.** The
receipt explicitly says `restoreDrillPerformed: false`. Follow
`docs/11-deployment/BACKUP-RESTORE-RUNBOOK.md` against a fresh isolated database and
record row counts, representative queries and readiness before claiming recovery.
Do not restore over the live database. This scope does not implement the runbook's
additional weekly/offsite copies, WAL/PITR or external failure alert delivery.

## Self-check

```sh
node --test scripts/ops/postgres-daily-backup.test.mjs
```

The native test uses fake PostgreSQL child processes: it checks publication,
retention, failure cleanup, connection settings and concurrency. It does not
connect to a database or substitute for the host's real dump/restore drill.
