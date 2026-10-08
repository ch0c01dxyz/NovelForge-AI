// Windows scratch-only worker isolation drill. Supply NF048_DATABASE_URL privately.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { setTimeout, clearTimeout } from 'node:timers';
import { once } from 'node:events';
import process from 'node:process';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import console from 'node:console';

const require = createRequire(new URL('../apps/worker/package.json', import.meta.url));
const Redis = require('ioredis');
const { Queue, QueueEvents } = require('bullmq');
assert.equal(process.platform, 'win32', 'This receipt uses Windows PID/socket attribution');
const databaseUrl = new URL(process.env.NF048_DATABASE_URL);
assert.match(databaseUrl.pathname, /^\/nf048_[a-z0-9_]+$/);
assert.equal(databaseUrl.hostname, 'localhost');
assert.equal(databaseUrl.port, '5433');
const run = `nf048_${randomUUID()}`;
const redisUrl = `redis://127.0.0.1:6379/14?connectionName=${run}`;
const admin = new Redis(redisUrl.split('?')[0], { connectionName: `${run}_admin`, maxRetriesPerRequest: 1 });
const lease = `${run}:lease`;
const queues = ['worker-heartbeat', 'workflow-runs', 'memory-rebuild', 'publication', 'notifications'];
const dir = resolve(tmpdir(), run);
mkdirSync(dir);
const clients = async () => (await admin.client('LIST')).trim().split('\n').filter(Boolean)
  .map(line => Object.fromEntries(line.split(' ').map(pair => {
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  })));
let worker;
let leased = false;
let queue;
let events;
let connection;
let output = '';
let workerIds = [];
const receipt = { run, source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), redisDatabase: 14 };
try {
  await admin.ping();
  assert.equal(await admin.dbsize(), 0, 'DB14 is occupied');
  const initial = await clients();
  assert.equal(initial.filter(c => c.db === '14' && c.name !== `${run}_admin`).length, 0, 'DB14 has other clients');
  assert.equal(await admin.set(lease, run, 'NX'), 'OK');
  leased = true;
  receipt.factoryInputs = {};
  for (const [file, count] of Object.entries({ 'worker.ts': 2, 'workflow-jobs.ts': 2,
    'memory-jobs.ts': 1, 'publication-jobs.ts': 1, 'notification-fanout-jobs.ts': 1 })) {
    const source = readFileSync(resolve('apps/worker/src', file), 'utf8');
    assert.equal((source.match(/d\.createConnection\(env\.REDIS_URL\)/g) ?? []).length, count, file);
    receipt.factoryInputs[file] = count;
  }
  worker = spawn(process.execPath, ['--experimental-transform-types', 'src/index.ts'], {
    cwd: resolve('apps/worker'), windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl.href, REDIS_URL: redisUrl,
      S3_ENDPOINT: 'http://127.0.0.1:9000', S3_REGION: 'us-east-1', S3_BUCKET: 'test',
      S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test',
      OMNIROUTE_BASE_URL: 'http://127.0.0.1:20128', OMNIROUTE_API_KEY: 'test',
      APP_ENCRYPTION_KEY: 'unit-test-encryption-key' },
  });
  worker.on('error', error => { output += `spawn error: ${error.code}\n`; });
  worker.stdout.on('data', chunk => { output += chunk; });
  worker.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (!output.includes('"msg":"worker started"') && Date.now() < deadline) {
    assert.equal(worker.exitCode, null, 'Worker exited before startup');
    await delay(200);
  }
  const started = output.split('\n').find(line => line.includes('"msg":"worker started"'));
  assert.ok(started, 'Worker startup timeout');
  const status = JSON.parse(started);
  for (const flag of ['workflowsStarted', 'memoryStarted', 'publicationStarted', 'notificationsStarted']) assert.equal(status[flag], true, flag);
  const after = await clients();
  const initialIds = new Set(initial.map(c => c.id));
  const attributed = after.filter(c => !initialIds.has(c.id));
  receipt.workerClients = attributed.map(({ id, name, db }) => ({ id, name, db }));
  assert.ok(attributed.length >= 12, 'Expected all five factories and blocking clients');
  for (const c of attributed) {
    assert.equal(c.db, '14');
    assert.ok(c.name === run || queues.some(q => c.name === `bull:${Buffer.from(q).toString('base64')}`), 'Unexpected client name');
  }
  const sockets = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `@(Get-NetTCPConnection -OwningProcess ${worker.pid} -State Established | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,OwningProcess) | ConvertTo-Json -Compress`],
  { encoding: 'utf8', windowsHide: true }));
  const redisSockets = sockets.filter(s => s.RemotePort === 6379);
  assert.equal(redisSockets.length, attributed.length, 'PID Redis socket/client count differs');
  assert.ok(redisSockets.every(s => ['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(s.RemoteAddress)));
  workerIds = attributed.map(c => c.id);
  receipt.workerPid = worker.pid;
  receipt.workerClients = attributed.map(({ id, name, db }) => ({ id, name, db }));
  receipt.pidRedisSockets = redisSockets;
  connection = new Redis(redisUrl.split('?')[0], { connectionName: `${run}_probe`, maxRetriesPerRequest: null });
  queue = new Queue('worker-heartbeat', { connection });
  events = new QueueEvents('worker-heartbeat', { connection });
  await events.waitUntilReady();
  const job = await queue.add('heartbeat', { run }, { jobId: run });
  const result = await job.waitUntilFinished(events, 30000);
  assert.equal(result.ok, true);
  assert.equal(await job.getState(), 'completed');
  receipt.job = { id: job.id, state: 'completed', resultOk: true };
} finally {
  const failures = [];
  const cleanupStep = async (name, action) => {
    let timer;
    try {
      await Promise.race([action(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} timeout`)), 5000);
      })]);
    } catch { failures.push(name); }
    finally { clearTimeout(timer); }
  };
  // Each failed step still permits later termination and finalization attempts.
  if (events) await cleanupStep('probe events close', () => events.close());
  if (queue) await cleanupStep('probe queue close', () => queue.close());
  if (connection) connection.disconnect();
  await cleanupStep('owned worker stop', async () => {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      worker.kill(); // Windows process termination, not proof of graceful draining.
      await exited;
      receipt.termination = 'Windows child.kill process termination; no graceful-drain claim';
    }
  });
  try { if (leased) {
    assert.equal(failures.length, 0, 'Teardown failed; retain keys for investigation');
    assert.equal(await admin.get(lease), run, 'Lease ownership lost; no cleanup');
    const remaining = await clients();
    assert.ok(workerIds.every(id => !remaining.some(c => c.id === id)), 'Worker clients remain');
    assert.equal(remaining.filter(c => c.db === '14' && c.name !== `${run}_admin`).length, 0, 'Foreign/remaining DB14 clients; no cleanup');
    const keys = await admin.keys('*');
    assert.ok(keys.every(k => k === lease || queues.some(q => k.startsWith(`bull:${q}:`))), 'Unattributed keys; no cleanup');
    receipt.removedKeys = keys.length;
    if (keys.length) await admin.del(...keys);
    assert.equal(await admin.dbsize(), 0);
    receipt.cleanup = 'Only attributed DB14 keys removed; no FLUSHDB/FLUSHALL';
  } } finally {
    admin.disconnect();
    receipt.teardownFailures = failures;
    writeFileSync(resolve(dir, 'worker.log'), output);
    writeFileSync(resolve(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
  }
}
console.log(JSON.stringify({ verified: true, receipt: resolve(dir, 'receipt.json'), job: receipt.job, workerClients: workerIds.length }));
