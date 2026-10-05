#!/usr/bin/env bash
# NF-WF-012 backfill migration test.
#
# Simulates a database that existed BEFORE NF-WF-012: applies every
# migration except the 012 publications one, inserts a pre-012 PUBLISHED
# chapter (the 007 novel page published chapters directly via PATCH),
# then applies the 012 migration and asserts the backfill pinned it.
#
# Usage: ./test-backfill-012.sh   (needs DATABASE_URL to a superuser-capable DB)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/packages/database/prisma/migrations"
SKIP="20261006_nf_wf_012_publications"
DB="novelforge_test_012_backfill"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$ROOT/.env" ]; then
    set -a; source "$ROOT/.env"; set +a
  else
    echo "DATABASE_URL not set and no .env" >&2; exit 1
  fi
fi

BASE="$DATABASE_URL"
ADMIN_URL="$(echo "$BASE" | sed -E 's#(postgres(ql)?://[^/]*)/.*#\1/postgres#')"
TEST_URL="$(echo "$BASE" | sed -E 's#(postgres(ql)?://[^/]*)/.*#\1/'"$DB"'#')"

pass=0; fail=0
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1";
  else fail=$((fail+1)); echo "FAIL $1: expected [$2] got [$3]"; fi
}

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = '$DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$DB";
CREATE DATABASE "$DB";
SQL

# Apply every migration except 012.
for d in $(ls "$MIG" | sort); do
  [ -d "$MIG/$d" ] || continue
  [ "$d" = "$SKIP" ] && continue
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$MIG/$d/migration.sql" >/dev/null
done
echo "applied all migrations except $SKIP"

# --- Pre-012 world: a novel with one PUBLISHED and one DRAFT chapter ---
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO users (id, email, password_hash, display_name, updated_at)
VALUES ('11111111-1111-1111-1111-111111111111','backfill@example.com','x','b', now());
INSERT INTO workspaces (id, name, slug, owner_id, updated_at)
VALUES ('22222222-2222-2222-2222-222222222222','ws','ws-backfill','11111111-1111-1111-1111-111111111111', now());
INSERT INTO memberships (id, workspace_id, user_id, role, updated_at)
VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','OWNER', now());
INSERT INTO novels (id, workspace_id, title, slug, status, created_by_id, updated_at)
VALUES ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','N','n-backfill','ACTIVE','11111111-1111-1111-1111-111111111111', now());
INSERT INTO novel_branches (id, workspace_id, novel_id, name, updated_at)
VALUES ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444','main', now());
INSERT INTO revisions (id, workspace_id, novel_id, branch_id, number, origin, created_by_id)
VALUES ('66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555',1,'BASELINE','11111111-1111-1111-1111-111111111111');
UPDATE novel_branches SET head_revision_id = '66666666-6666-6666-6666-666666666666'
 WHERE id = '55555555-5555-5555-5555-555555555555';
INSERT INTO chapters (id, novel_id, number, title, status, created_by_id, updated_at)
VALUES
 ('77777777-7777-7777-7777-777777777777','44444444-4444-4444-4444-444444444444',1,'Pub','PUBLISHED','11111111-1111-1111-1111-111111111111', now()),
 ('88888888-8888-8888-8888-888888888888','44444444-4444-4444-4444-444444444444',2,'Draft','DRAFT','11111111-1111-1111-1111-111111111111', now());
INSERT INTO chapter_versions (id, chapter_id, number, content, word_count, author_id)
VALUES
 ('99999999-9999-9999-9999-999999999999','77777777-7777-7777-7777-777777777777',1,'Once.',1,'11111111-1111-1111-1111-111111111111'),
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','88888888-8888-8888-8888-888888888888',1,'Draft.',1,'11111111-1111-1111-1111-111111111111');
UPDATE chapters SET current_version_id = '99999999-9999-9999-9999-999999999999'
 WHERE id = '77777777-7777-7777-7777-777777777777';
UPDATE chapters SET current_version_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 WHERE id = '88888888-8888-8888-8888-888888888888';
SQL
echo "seeded pre-012 world (1 PUBLISHED + 1 DRAFT chapter)"

# --- Apply the 012 migration (first time) ---
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$MIG/$SKIP/migration.sql" >/dev/null
echo "applied $SKIP"

# --- Assertions ---
row="$(psql "$TEST_URL" -tA -c \
  "SELECT count(*) FROM publications WHERE chapter_id='77777777-7777-7777-7777-777777777777'")"
check "PUBLISHED chapter got exactly one publication row" "1" "$row"

status="$(psql "$TEST_URL" -tA -c \
  "SELECT status FROM publications WHERE chapter_id='77777777-7777-7777-7777-777777777777'")"
check "backfilled row status is PUBLISHED" "PUBLISHED" "$status"

pin="$(psql "$TEST_URL" -tA -c \
  "SELECT chapter_version_id FROM publications WHERE chapter_id='77777777-7777-7777-7777-777777777777'")"
check "backfilled row pins current_version_id" "99999999-9999-9999-9999-999999999999" "$pin"

rev="$(psql "$TEST_URL" -tA -c \
  "SELECT revision_id FROM publications WHERE chapter_id='77777777-7777-7777-7777-777777777777'")"
check "backfilled row pins the branch head revision" "66666666-6666-6666-6666-666666666666" "$rev"

pub_at="$(psql "$TEST_URL" -tA -c \
  "SELECT published_at IS NOT NULL FROM publications WHERE chapter_id='77777777-7777-7777-7777-777777777777'")"
check "backfilled row has published_at" "t" "$pub_at"

sched="$(psql "$TEST_URL" -tA -c \
  "SELECT scheduled_for IS NULL FROM publications WHERE chapter_id='77777777-7777-7777-7777-777777777777'")"
check "backfilled row has no scheduled_for" "t" "$sched"

draft_rows="$(psql "$TEST_URL" -tA -c \
  "SELECT count(*) FROM publications WHERE chapter_id='88888888-8888-8888-8888-888888888888'")"
check "DRAFT chapter got no publication row" "0" "$draft_rows"

# --- Idempotence: apply the 012 migration a second time ---
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$MIG/$SKIP/migration.sql" >/dev/null
total="$(psql "$TEST_URL" -tA -c "SELECT count(*) FROM publications")"
check "second apply of 012 migration adds no rows (idempotent)" "1" "$total"

echo
echo "pass=$pass fail=$fail"
psql "$ADMIN_URL" -q -c "DROP DATABASE \"$DB\"" >/dev/null
[ "$fail" -eq 0 ]
