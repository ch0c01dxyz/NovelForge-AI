import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { URL } from 'node:url';
import process from 'node:process';
import { connectionService, dailyBackup } from './postgres-daily-backup.mjs';

const url = 'postgresql://author:secret%40value@127.0.0.1:5432/novelforge?sslmode=verify-full&sslrootcert=%2Fetc%2Fdb%2Fca.pem&connect_timeout=15&schema=public';
const now = new Date('2026-10-24T02:30:00Z');
test('root service executes only separately installed code and a dedicated root environment', async () => {
  const unit = await readFile(new URL('./novelforge-backup.service', import.meta.url), 'utf8');
  assert.match(unit, /^User=root$/m);
  assert.match(unit, /^WorkingDirectory=\/usr\/local\/lib\/novelforge-ops$/m);
  assert.match(unit, /^EnvironmentFile=\/etc\/novelforge\/backup\.env$/m);
  assert.match(unit, /^ExecStart=\/usr\/local\/bin\/node \/usr\/local\/lib\/novelforge-ops\/postgres-daily-backup\.mjs$/m);
  assert.match(unit, /^Environment=PATH=\/usr\/local\/bin:\/usr\/bin:\/bin$/m);
  assert.doesNotMatch(unit, /\/opt\/novelforge/);
});
async function scratch(work) {
  const folder = await mkdtemp(join(tmpdir(), 'novelforge-backup-selfcheck-'));
  try { await work(folder); }
  finally {
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep + 'novelforge-backup-selfcheck-'));
    await rm(folder, { recursive: true, force: true });
  }
}
function fakePostgres(calls) {
  return (command, args, env) => {
    calls.push({ command, args });
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(env.PGDATABASE, undefined);
    assert.equal(env.PGPASSWORD, 'secret@value');
    assert.equal(env.PGSERVICE, 'novelforge_daily');
    assert.ok(!args.some(value => value.includes('secret') || value.includes('postgresql:')));
    const program = command === 'pg_dump'
      ? `import{writeFileSync,readFileSync}from'node:fs';const service=readFileSync(process.env.PGSERVICEFILE,'utf8');if(!service.includes('sslmode=verify-full'))process.exit(3);writeFileSync(process.argv[process.argv.indexOf('--file')+1],'PGDMPfixture');`
      : `import{readFileSync}from'node:fs';if(!readFileSync(process.argv.at(-1),'utf8').startsWith('PGDMP'))process.exit(4);`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program, '--', ...args], { env, windowsHide: true, stdio: 'pipe' });
    assert.equal(result.status, 0, 'fake PostgreSQL subprocess succeeded');
  };
}

test('preserves URI credentials and SSL/query semantics without a credential-bearing command', () => {
  const config = connectionService(url);
  assert.equal(config.password, 'secret@value');
  assert.equal(config.service, '[novelforge_daily]\nhost=127.0.0.1\nport=5432\nuser=author\ndbname=novelforge\nsslmode=verify-full\nsslrootcert=/etc/db/ca.pem\nconnect_timeout=15\n');
  assert.equal(connectionService('postgresql://u:p@[::1]:5432/db?options=-c%20statement_timeout%3D0').service.includes('host=::1\n'), true);
  assert.equal(connectionService('postgresql://u:p@localhost/db?sslmode=require&sslmode=verify-full').service.includes('sslmode=verify-full'), true);
  assert.equal(connectionService('postgresql://u:p@localhost/db?password=one+two').password, 'one+two');
  assert.equal(connectionService('postgresql://u:p@localhost/db?sslrootcert=%2Fetc%2Fca+root.pem').service.includes('sslrootcert=/etc/ca+root.pem'), true);
  assert.throws(() => connectionService('postgresql://u:p@localhost/db?sslmode=verify-full%0Adbname%3Dother'));
  assert.throws(() => connectionService('postgresql://u:p@localhost/db?service=unexpected'));
  assert.throws(() => connectionService('postgresql://u:p@localhost/db?options=value%20'));
});

test('publishes only a listed custom archive, keeps seven daily files and preserves unrelated backups', async () => scratch(async directory => {
  for (let day = 16; day <= 23; day++) await writeFile(join(directory, `novelforge-daily-2026-10-${day}.dump`), 'old', { mode: 0o600 });
  await writeFile(join(directory, 'novelforge-weekly-2026-10-16.dump'), 'weekly', { mode: 0o600 });
  await writeFile(join(directory, 'manual-backup.dump'), 'manual', { mode: 0o600 });
  const calls = [], result = await dailyBackup({ databaseUrl: url, directory, now, run: fakePostgres(calls), environment: { ...process.env, PGDATABASE: 'unexpected', DATABASE_URL: url } });
  assert.equal(calls[0].command, 'pg_dump'); assert.equal(calls[1].command, 'pg_restore');
  assert.equal(calls[1].args[0], '--list');
  assert.equal(result.bytes, 12); assert.equal(result.archiveListValidated, true); assert.equal(result.restoreDrillPerformed, false);
  assert.equal(result.sha256.length, 64); assert.equal(result.retainedDaily, 7);
  const files = (await readdir(directory)).sort();
  assert.equal(files.filter(name => name.startsWith('novelforge-daily-')).length, 7);
  assert.ok(files.includes('novelforge-daily-2026-10-18.dump')); assert.ok(!files.includes('novelforge-daily-2026-10-17.dump'));
  assert.ok(files.includes('manual-backup.dump')); assert.ok(files.includes('novelforge-weekly-2026-10-16.dump'));
  assert.ok(!files.some(name => name.startsWith('.')));
  if (process.platform !== 'win32') assert.equal((await stat(result.file)).mode & 0o777, 0o600);
}));

test('failed archive listing retains the previous same-day backup and does not prune', async () => scratch(async directory => {
  const final = join(directory, 'novelforge-daily-2026-10-24.dump');
  await writeFile(final, 'previous-valid-backup', { mode: 0o600 });
  const dump = fakePostgres([]);
  await assert.rejects(dailyBackup({ databaseUrl: url, directory, now, run: (command, args, env) => {
    if (command === 'pg_restore') throw new Error('simulated invalid archive');
    dump(command, args, env);
  } }), /invalid archive/);
  assert.equal(await readFile(final, 'utf8'), 'previous-valid-backup');
  assert.deepEqual(await readdir(directory), ['novelforge-daily-2026-10-24.dump']);
}));

test('a dump failure leaves no published file or temporary credential file', async () => scratch(async directory => {
  await assert.rejects(dailyBackup({ databaseUrl: url, directory, now, run: () => { throw new Error('simulated dump failure'); } }), /dump failure/);
  assert.deepEqual(await readdir(directory), []);
}));

test('an existing lock refuses concurrent execution without deleting another job lock', async () => scratch(async directory => {
  await mkdir(join(directory, '.novelforge-daily.lock'), { mode: 0o700 });
  await assert.rejects(dailyBackup({ databaseUrl: url, directory, now, run: () => assert.fail('must not run') }), { code: 'EEXIST' });
  assert.deepEqual(await readdir(directory), ['.novelforge-daily.lock']);
}));

test('retention refuses a matching symlink and preserves its target', { skip: process.platform === 'win32' }, async () => scratch(async directory => {
  const target = join(directory, 'manual.dump'); await writeFile(target, 'keep', { mode: 0o600 });
  await symlink(target, join(directory, 'novelforge-daily-2026-10-01.dump'));
  for (let day = 18; day <= 23; day++) await writeFile(join(directory, `novelforge-daily-2026-10-${day}.dump`), 'old', { mode: 0o600 });
  await assert.rejects(dailyBackup({ databaseUrl: url, directory, now, run: fakePostgres([]) }), /regular owned path/);
  assert.equal(await readFile(target, 'utf8'), 'keep');
}));
