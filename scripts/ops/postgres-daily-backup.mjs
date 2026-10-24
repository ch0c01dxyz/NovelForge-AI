import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';

const OWNED_DUMP = /^novelforge-daily-\d{4}-\d{2}-\d{2}\.dump$/;
const CLIENT_ONLY = new Set(['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'statement_cache_size']);

/** libpq does not reliably expand a URI supplied only through PGDATABASE. */
export function connectionService(databaseUrl) {
  let url;
  try { url = new URL(databaseUrl); } catch { throw new Error('Invalid DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) throw new Error('Unsupported DATABASE_URL');
  let entries;
  try {
    entries = new Map([
      ['host', decodeURIComponent(url.hostname.replace(/^\[|\]$/g, ''))],
      ['port', url.port], ['user', decodeURIComponent(url.username)],
      ['password', decodeURIComponent(url.password)], ['dbname', decodeURIComponent(url.pathname.slice(1))],
    ].filter(([, value]) => value !== ''));
  } catch { throw new Error('Invalid DATABASE_URL encoding'); }
  try {
    for (const pair of url.search.slice(1).split('&').filter(Boolean)) {
      const split = pair.indexOf('=');
      if (split < 0) throw new Error();
      // libpq URI query syntax preserves literal '+', unlike URLSearchParams.
      const key = decodeURIComponent(pair.slice(0, split)), value = decodeURIComponent(pair.slice(split + 1));
      // Prisma-only pool/search-schema settings do not restrict a whole-database dump.
      if (!CLIENT_ONLY.has(key)) entries.set(key === 'ssl' && value === 'true' ? 'sslmode' : key, key === 'ssl' && value === 'true' ? 'require' : value);
    }
  } catch { throw new Error('Invalid DATABASE_URL query encoding'); }
  if (!entries.get('dbname')) throw new Error('DATABASE_URL must name a database');
  const password = entries.get('password'); entries.delete('password');
  if (password?.includes('\0')) throw new Error('Unsupported database password encoding');
  const lines = [];
  for (const [key, value] of entries) {
    // Service files trim line endings, have no quoting, and forbid nested services.
    if (!/^[a-z_]+$/.test(key) || key === 'service' || /[\r\n\0]/.test(value) || /\s$/.test(value) || Buffer.byteLength(`${key}=${value}`) > 1000) {
      throw new Error('Unsupported database connection parameter encoding');
    }
    lines.push(`${key}=${value}`);
  }
  return { service: `[novelforge_daily]\n${lines.join('\n')}\n`, password };
}

function runPostgres(command, args, env) {
  const result = spawnSync(command, args, {
    env, shell: false, stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 25 * 60_000, maxBuffer: 64 * 1024, windowsHide: true,
  });
  // PostgreSQL diagnostics can echo a connection parameter; never forward them.
  if (result.error || result.status !== 0) throw new Error(`${command} failed; check client installation, connectivity, permissions and server logs`);
}

async function checkPrivate(path, directory = false) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error('Backup path is not a regular owned path');
  if (process.platform !== 'win32' && (info.uid !== process.getuid() || (info.mode & 0o077) !== 0)) throw new Error('Backup path must be owner-private');
  return info;
}

/** Dependency injection is used only by the native self-check; CLI paths are fixed. */
export async function dailyBackup({ databaseUrl, directory = '/var/backups/novelforge', now = new Date(), run = runPostgres, environment = process.env } = {}) {
  const config = connectionService(databaseUrl);
  if (!isAbsolute(directory)) throw new Error('Backup directory must be absolute');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await checkPrivate(directory, true);
  const lock = join(directory, '.novelforge-daily.lock');
  // A stale lock fails closed; inspect the previous job before manually removing it.
  await mkdir(lock, { mode: 0o700 });
  const date = now.toISOString().slice(0, 10), name = `novelforge-daily-${date}.dump`;
  const final = join(directory, name), temporary = join(directory, `.${name}.${randomUUID()}.partial`);
  const serviceFile = join(lock, 'pg_service.conf');
  let published = false, phase = 'prepare-private-files';
  try {
    await writeFile(serviceFile, config.service, { flag: 'wx', mode: 0o600 });
    const env = Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith('PG') && key !== 'DATABASE_URL'));
    env.PGSERVICE = 'novelforge_daily'; env.PGSERVICEFILE = serviceFile;
    if (config.password !== undefined) env.PGPASSWORD = config.password;
    const file = await open(temporary, 'wx', 0o600); await file.close();
    phase = 'pg-dump';
    await run('pg_dump', ['--format=custom', '--no-password', '--file', temporary], env);
    phase = 'archive-validation';
    const info = await checkPrivate(temporary);
    if (info.size < 6) throw new Error('Backup archive is empty');
    const archive = await open(temporary, 'r+');
    try {
      const signature = Buffer.alloc(5); await archive.read(signature, 0, 5, 0);
      if (signature.toString('ascii') !== 'PGDMP') throw new Error('Backup is not a PostgreSQL custom archive');
      await archive.sync();
    } finally { await archive.close(); }
    await run('pg_restore', ['--list', temporary], env);
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(temporary)) digest.update(chunk);
    try { await checkPrivate(final); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    phase = 'publish-archive';
    await rename(temporary, final); published = true;
    await chmod(final, 0o600);
    if (process.platform !== 'win32') {
      const folder = await open(directory, 'r'); try { await folder.sync(); } finally { await folder.close(); }
    }
    phase = 'retention';
    const dumps = (await readdir(directory)).filter(value => OWNED_DUMP.test(value)).sort().reverse();
    if (!dumps.slice(0, 7).includes(name)) throw new Error('Clock moved backwards; retention refused');
    // Validate every deletion target before deleting any; never follow symlinks.
    for (const old of dumps.slice(7)) await checkPrivate(join(directory, old));
    for (const old of dumps.slice(7)) await unlink(join(directory, old));
    return { file: final, bytes: info.size, sha256: digest.digest('hex'), archiveListValidated: true, restoreDrillPerformed: false, retainedDaily: Math.min(7, dumps.length) };
  } catch (error) {
    error.backupPhase = phase;
    throw error;
  } finally {
    if (!published) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await unlink(serviceFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(lock);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  try {
    if (process.platform === 'win32' || process.getuid() !== 0) throw new Error('Run the installed backup service as root on Linux');
    console.log(JSON.stringify(await dailyBackup({ databaseUrl: process.env.DATABASE_URL })));
  } catch (error) {
    // No native exception text: parsers and child tools may include secrets.
    const phase = ['prepare-private-files', 'pg-dump', 'archive-validation', 'publish-archive', 'retention'].includes(error.backupPhase) ? error.backupPhase : 'configuration-or-lock';
    console.error(`NovelForge daily backup FAILED at ${phase}. No restore verification is claimed. Check the private environment/directory/lock, PostgreSQL client compatibility, connectivity and server logs.`);
    process.exitCode = 1;
  }
}
