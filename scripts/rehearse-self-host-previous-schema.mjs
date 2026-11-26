import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { URL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const HISTORICAL_FILES = ['apps/web/src/lib/hosted-server-db.ts', 'apps/web/src/lib/deployment-mode.ts', 'packages/contracts/src/index.ts', 'package.json'];
const CANDIDATE_FILES = [...HISTORICAL_FILES, ...['hosted-ai-credit-issuance-schema', 'hosted-ai-ledger-schema', 'hosted-ai-storage-mode', 'hosted-billing-event-schema'].map(name => `apps/web/src/lib/${name}.ts`)];
const identifier = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/u); return `"${value}"`; };

export function normalizeCandidateImage(value) {
  assert.ok(typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/u.test(value), 'Expected immutable candidate image identity');
  return `sha256:${value.replace(/^sha256:/u, '')}`;
}

export function admitPreviousSchemaInput(revision, rawUrl) {
  assert.match(revision, /^[a-f0-9]{40}$/u);
  const url = new URL(rawUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname)
    && url.port && url.username === 'ai_test' && !url.password && !url.search && !url.hash && url.pathname === '/postgres', 'Expected the existing disposable rehearsal database');
  return url;
}

/** The old projection is intentional: newly added columns are checked separately. */
export function assertPreviousRowsPreserved(before, after) {
  assert.deepEqual(after, before, 'Previous schema rows changed during migration');
}

export async function materializeHistoricalSchemaSource(revision, directory, candidate = false) {
  assert.match(revision, /^[a-f0-9]{40}$/u);
  const files = {};
  for (const name of candidate ? CANDIDATE_FILES : HISTORICAL_FILES) {
    const { stdout } = await exec('git', ['show', `${revision}:${name}`], { cwd: root, encoding: 'buffer', timeout: 10_000, maxBuffer: 1024 * 1024 });
    const file = path.join(directory, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, stdout, { mode: 0o600, flag: 'wx' });
    files[name] = { sha256: hash(stdout), bytes: stdout.length };
  }
  // Only installed third-party packages are shared. The old application source
  // and contracts resolve inside the independently materialized historical tree.
  await symlink(path.join(root, 'apps/web/node_modules'), path.join(directory, 'node_modules'), 'dir');
  const config = path.join(directory, 'schema-tsconfig.json');
  await writeFile(config, JSON.stringify({ compilerOptions: { baseUrl: directory, paths: { '@tax-engine/contracts': [path.join(directory, 'packages/contracts/src/index.ts')] } } }), { mode: 0o600, flag: 'wx' });
  return { files, config, module: path.join(directory, HISTORICAL_FILES[0]) };
}

/** Uses only the existing Compose database and its already-created pgpass file. */
export async function rehearsePreviousSchema({ previousRevision, candidateRevision, candidateImage, databaseUrl, pgPassFile }) {
  const url = admitPreviousSchemaInput(previousRevision, databaseUrl);
  assert.match(candidateRevision, /^[a-f0-9]{40}$/u);
  candidateImage = normalizeCandidateImage(candidateImage);
  const { stdout: checkout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: root, timeout: 10_000, maxBuffer: 1024 });
  assert.equal(checkout.trim(), candidateRevision, 'Candidate image revision must match this checkout');
  const schema = `previous_schema_${randomUUID().replaceAll('-', '')}`;
  const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
  const { Pool } = require('pg');
  // No inherited provider, database, Node-loader or TLS configuration is forwarded.
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot'].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
  Object.assign(env, { PGPASSFILE: pgPassFile, PGSSLMODE: 'disable' });
  let password;
  try {
    const passStat = await stat(pgPassFile);
    if (!passStat.isFile() || passStat.size > 512 || (passStat.mode & 0o077) !== 0) throw Error();
    const authentication = (await readFile(pgPassFile, 'utf8')).split('\n');
    const fields = authentication[0].split(':');
    if (authentication.length !== 2 || authentication[1] !== '' || fields.length !== 5
      || fields[0] !== url.hostname || fields[1] !== url.port || fields[2] !== 'postgres' || fields[3] !== 'ai_test'
      || !/^[a-f0-9]{64}$/u.test(fields[4])) throw Error();
    password = fields[4];
  } catch { throw new Error('Expected generated private rehearsal authentication'); }
  const admin = new Pool({ connectionString: databaseUrl, password, ssl: false, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 10_000, query_timeout: 15_000 });
  const work = await mkdtemp(path.join(tmpdir(), 'tax-previous-schema-'));
  let created = false;
  let receipt;
  let failure;
  const deadline = Date.now() + 120_000;
  async function command(executable, args, commandEnv = env) {
    const remaining = deadline - Date.now();
    assert.ok(remaining > 0, 'Previous-schema verification deadline exceeded');
    try { return (await exec(executable, args, { cwd: root, env: commandEnv, encoding: 'utf8', timeout: Math.min(30_000, remaining), maxBuffer: 1024 * 1024 })).stdout.trim(); }
    catch { throw new Error('Bounded previous-schema command failed; private output omitted'); }
  }
  async function columns() {
    const result = await admin.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position', [schema]);
    const resultColumns = {};
    for (const row of result.rows) (resultColumns[row.table_name] ??= []).push(row.column_name);
    return resultColumns;
  }
  async function snapshot(projection) {
    const values = {};
    for (const [table, names] of Object.entries(projection)) {
      const selected = names.map(identifier).join(',');
      const result = await admin.query(`SELECT to_jsonb(x)::text AS payload FROM (SELECT ${selected} FROM ${identifier(schema)}.${identifier(table)}) x ORDER BY payload`);
      values[table] = result.rows.map(row => row.payload);
    }
    return values;
  }
  try {
    const historical = await materializeHistoricalSchemaSource(previousRevision, path.join(work, 'historical'));
    const candidate = await materializeHistoricalSchemaSource(candidateRevision, path.join(work, 'candidate'), true);
    for (const name of CANDIDATE_FILES) {
      assert.equal(hash(await readFile(path.join(root, name))), candidate.files[name].sha256, 'Candidate schema source differs from its image revision');
    }
    const entry = path.join(work, 'initialize.mts');
    await writeFile(entry, `import {pathToFileURL} from 'node:url';try {const m=await import(pathToFileURL(process.env.PRIVATE_SCHEMA_MODULE).href);const e={TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'test',DATABASE_URL:process.env.PRIVATE_SCHEMA_URL};await m.ensureHostedAppSchema(e);const r=await m.getHostedServerDatabase(e);await r.db.destroy();if(!r.pool.ending&&!r.pool.ended)await r.pool.end();if(!r.pool.ended)throw Error();console.log('INITIALIZED');}catch{console.error('Previous-schema initializer unavailable.');process.exitCode=1;}`, { mode: 0o600, flag: 'wx' });
    const scoped = new URL(url); scoped.searchParams.set('options', `-csearch_path=${schema}`);
    async function initialize(old) {
      const initialized = await command(process.execPath, ['--import', 'tsx', entry], { ...env, TSX_TSCONFIG_PATH: old ? historical.config : candidate.config, PRIVATE_SCHEMA_URL: scoped.toString(), PRIVATE_SCHEMA_MODULE: old ? historical.module : candidate.module });
      assert.equal(initialized, 'INITIALIZED');
    }
    await admin.query(`CREATE SCHEMA ${identifier(schema)}`); created = true;
    await initialize(true);
    const oldColumns = await columns();
    assert.equal(Object.keys(oldColumns).length, 7, 'Historical initializer schema changed; review the finite fixture');
    assert.ok(!oldColumns.hosted_workspace_shells.includes('revision'));
    await admin.query(`INSERT INTO ${identifier(schema)}.hosted_workspace_shells(owner_id,workspace_id,created_at,updated_at,workspace) VALUES ($1,$3,$4,$4,$5::jsonb),($2,$3,$4,$4,$5::jsonb)`, ['synthetic-owner-a', 'synthetic-owner-b', 'same-return', '2026-10-25T00:00:00Z', JSON.stringify({ id: 'same-return', storageMode: 'local-browser' })]);
    await admin.query(`INSERT INTO ${identifier(schema)}.hosted_ai_usage_ledger(request_id,owner_id,cycle_key,task,provider,estimated_cost_cents,included_charge_cents) VALUES ('synthetic-legacy','synthetic-owner-a','2026-10','summary','synthetic',1,1)`);
    const before = await snapshot(oldColumns);
    await initialize(false);
    assertPreviousRowsPreserved(before, await snapshot(oldColumns));
    assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${identifier(schema)}.hosted_workspace_shells WHERE revision IS NOT NULL`)).rows[0].count, 2);
    const migratedColumns = await columns();
    const migrated = await snapshot(migratedColumns);
    // Separate processes prevent the global promise cache from faking idempotence.
    await initialize(false);
    assert.deepEqual(await columns(), migratedColumns, 'Column inventory changed on rerun');
    assertPreviousRowsPreserved(migrated, await snapshot(migratedColumns));
    const dump = path.join(work, 'migrated.dump');
    const bin = process.env.TAX_ENGINE_TEST_POSTGRES_BIN ?? '';
    await command(path.join(bin, 'pg_dump'), ['--dbname', databaseUrl, '--schema', schema, '--format=custom', '--no-owner', '--no-privileges', '--file', dump]);
    await admin.query(`DROP SCHEMA ${identifier(schema)} CASCADE`);
    await command(path.join(bin, 'pg_restore'), ['--dbname', databaseUrl, '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction', dump]);
    assert.deepEqual(await columns(), migratedColumns, 'Column inventory changed on restore');
    assertPreviousRowsPreserved(migrated, await snapshot(migratedColumns));
    receipt = { kind: 'pinned-previous-schema-migration', previousRevision, candidateRevision, candidateImage, candidateSourceFiles: candidate.files, columnInventoryExact: true, historicalFiles: historical.files, previousTables: 7, seededRows: 3, previousRowsExact: true, workspaceRevisionsAdded: 2, freshProcessIdempotence: true, dumpRestoreExact: true, migratedSha256: hash(JSON.stringify(migrated)) };
  } catch { failure = new Error('Pinned previous-schema migration verification failed; private output omitted'); }
  finally {
    for (const cleanup of [
      async () => {
        if (!created) return;
        await admin.query(`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`);
        assert.equal((await admin.query('SELECT count(*)::int AS count FROM information_schema.schemata WHERE schema_name=$1', [schema])).rows[0].count, 0);
      },
      async () => { await admin.end(); },
      async () => { await rm(work, { recursive: true, force: true }); },
    ]) {
      try { await cleanup(); } catch { failure ??= new Error('Pinned previous-schema cleanup failed'); }
    }
  }
  if (failure) throw failure;
  return { ...receipt, schemaRemovalObserved: true, temporaryFilesRemoved: true };
}
