// Authenticated passing original package pair is prerequisite; public adapter is separate.
import assert from 'node:assert/strict';
import { mkdir, writeFile, chmod, copyFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, URL } from 'node:url';
import { SourceCandidateController } from './qualify-postgres-source-candidates-amd64.mjs';
import { admitQualifiedPair, qualifiedPairData, regularBytes, parseFingerprint, parseTfs, parseVerification, parseLoaderProof, hash } from './lib/sqlite-gpg-tofu-evidence.mjs';
const ROOT = fileURLToPath(new URL('../', import.meta.url)), LABEL = 'io.vivalatax.qualification.operation';
export const BASE = 'docker.io/library/postgres@sha256:f45d631d050c2fe068f384ed6c4faac506e9cd7f4da605ce703648e4b0985848';
export const LIMITS = Object.freeze({ jobMinutes: 15, controllerMinutes: 12, cleanupMinutes: 3, fixtureCommands: 48, tmpfsBytes: 16777216, exportBytes: 8388608 });
export const BASE_FILES = Object.freeze({
    '/usr/bin/gpg': 'f3a8498aa43e3a45f265d14211bba2653cacf2b9631f373db97b30f2cb96c738',
    '/usr/bin/gpg-agent': '376889550a0155d984b24341f6e8fe5474aeb87619150e691773d93e1d013941',
    '/usr/bin/gpgconf': '14870b448ea181864c78c382b9b5b379ef939e8500c8eb1498134869d4a9d02d',
    '/usr/bin/gpg-connect-agent': '3b8670221ad6d82a58a295b7cbf15405a981359c34f3d4e8fb8d8290938e3536',
    '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2': '02bcda52c1a5dfc236f94d9e5255b4a0e26347d8a372a5223b650e31f291ce3c',
    '/usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6': '2e6eef9a727f081f0d453b4e5e6cbd8b9ef8b6f86cbf7681cbad444d3b0b55c8',
});
const IDLE = 'trap "exit 0" TERM INT; while :; do sleep 1 & wait "$!"; done';
const variants = ['baseline', 'candidate'], cases = ['a1', 'a2', 'b', 'tamper'];
export function exportNames() {
    const out = ['identity-before.out', 'identity-after.out', 'version.out', 'loader-version.out', 'fingerprint.out', 'closure.out'];
    for (const p of variants) {
        for (const c of cases) {
            for (const s of ['status', 'pid', 'exit', 'loader'])
                out.push(`${p}-verify-${c}.${s}`);
            for (const s of ['out', 'exit'])
                out.push(`${p}-list-${c}.${s}`);
        }
        out.push(p + '.dbheader');
    }
    return out;
}
export function validateFixtureContainer(v, { image, operation, fixture, candidate, running, env }) {
    assert.equal(v.Image, image);
    assert.equal(v.Config.Labels[LABEL], operation);
    assert.equal(v.Config.User, '65534:65534');
    assert.ok(Array.isArray(env)&&Array.isArray(v.Config.Env));
    assert.deepEqual([...v.Config.Env].sort(),[...env].sort());
    assert.deepEqual(v.Config.Entrypoint, ['/bin/sh']);
    assert.deepEqual(v.Config.Cmd, ['-c', IDLE]);
    assert.equal(v.State.Running, running);
    assert.equal(v.State.OOMKilled, false);
    assert.equal(v.State.Error, '');
    if (!running)
        assert.equal(v.State.ExitCode, 0);
    const h = v.HostConfig;
    assert.equal(h.Init, true);
    assert.equal(h.NetworkMode, 'none');
    assert.equal(h.ReadonlyRootfs, true);
    assert.equal(h.Privileged, false);
    assert.equal(h.CapAdd, null);
    assert.deepEqual(h.CapDrop, ['ALL']);
    assert.deepEqual(h.SecurityOpt, ['no-new-privileges']);
    assert.deepEqual(h.Tmpfs, { '/work': 'rw,nosuid,nodev,noexec,size=16m,mode=1777' });
    assert.equal(v.Mounts.length, 4);
    const mounts = new Map(v.Mounts.map(m => [m.Destination, m]));
    assert.equal(mounts.size, 4);
    for (const [target, path] of [['/fixture', fixture], ['/candidate', candidate]]) {
        const m = mounts.get(target);
        assert.equal(m.Type, 'bind');
        assert.equal(m.Source, path);
        assert.equal(m.RW, false);
    }
    for (const path of ['/work', '/var/lib/postgresql/data'])
        assert.equal(mounts.get(path).Type, 'tmpfs');
    return true;
}
function identity(raw, provider) {
    const rows = raw.trimEnd().split('\n');
    const expected = { ...BASE_FILES, '/candidate/libsqlite3.so.0': provider };
    assert.equal(rows.length, Object.keys(expected).length);
    const seen = new Set();
    for (const line of rows) {
        const m = /^([a-f0-9]{64}) {2}(\/[a-zA-Z0-9_./-]+)$/u.exec(line);
        assert.ok(m && !seen.has(m[2]));
        seen.add(m[2]);
        assert.equal(m[1], expected[m[2]]);
    }
    return true;
}
export function assessBundle(files, providerSha256) {
    assert.match(providerSha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(files).sort(), exportNames().sort());
    identity(files['identity-before.out'], providerSha256);
    identity(files['identity-after.out'], providerSha256);
    assert.match(files['version.out'], /^gpg \(GnuPG\) 2\.2\.40\n/u);
    assert.ok(files['loader-version.out'].includes('(Debian GLIBC 2.36-9+deb12u14)') && files['loader-version.out'].includes('stable release version 2.36.'));
    assert.equal(files['closure.out'], 'owned-agent-closure=3\n');
    const fpr = parseFingerprint(files['fingerprint.out']);
    const phases = {};
    for (const phase of variants) {
        const counts = [];
        for (const [i, c] of cases.entries()) {
            const key = `${phase}-verify-${c}`;
            assert.match(files[key + '.exit'], /^[0-9]{1,3}\n$/u);
            const exit = Number(files[key + '.exit']);
            parseVerification(files[key + '.status'], exit, fpr, c === 'tamper');
            assert.match(files[key + '.pid'], /^[1-9][0-9]{0,9}\n$/u);
            parseLoaderProof(files[key + '.loader'], Number(files[key + '.pid']), phase === 'baseline' ? '/usr/lib/x86_64-linux-gnu/libsqlite3.so.0' : '/candidate/libsqlite3.so.0');
            const list = `${phase}-list-${c}`;
            assert.equal(files[list + '.exit'], '0\n');
            const count = [1, 1, 2, 2][i];
            parseTfs(files[list + '.out'], fpr, count);
            counts.push(count);
        }
        assert.equal(files[phase + '.dbheader'].trim().replace(/\s+/gu, ' '), '53 51 4c 69 74 65 20 66 6f 72 6d 61 74 20 33 00');
        phases[phase] = { signatureCounts: counts, validSignatures: 3, tamperRejected: true, actualProcessProviderBindings: 4, sqliteHeaderVerified: true };
    }
    return { consumerFixturePassed: true, phases, fingerprintSha256: hash(fpr), rawKeyMaterialExported: false, rawMachineEvidencePrivate: true, genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false, allRuntimeUsesDiscovered: false, runtimeCompatibilityQualified: false };
}
export class SqliteGpgTofuRuntime extends SourceCandidateController {
    constructor(output, options = {}, env = process.env) {
        super('sqlite', output, env);
        this.fixtureOptions = options;
        this.sourceCandidate = 'sqlite-gpg-tofu-runtime';
        this.limit = { minutes: 15, controllerMinutes: 12, cleanupMinutes: 3 };
        this.deadline = performance.now() + 12 * 60000;
        this.cleanupReserve = 3 * 60000;
        this.fixtureCommands = 0;
        this.fixtureStarted = false;
        this.fixtureAgentClosureConfirmed = false;
    }
    async fixtureDocker(step, args, seconds = 20) {
        assert.ok(this.fixtureCommands++ < LIMITS.fixtureCommands);
        return this.docker('gpg-' + step, args, seconds);
    }
    async admitPair() {
        return admitQualifiedPair(this.fixtureOptions.directory, this.fixtureOptions.expected);
    }
    async build() {
        this.stage = 'qualified-original-package-pair';
        const token = await this.admitPair(), pair = qualifiedPairData(token);
        const fixture = join(this.private, 'gpg-fixture-code'), candidate = join(this.private, 'gpg-provider');
        await mkdir(fixture, { mode: 0o700 });
        await mkdir(candidate, { mode: 0o700 });
        const shell = join(ROOT, 'infra/sqlite-gpg-tofu-runtime/command.sh');
        await copyFile(shell, join(fixture, 'command.sh'));
        await chmod(join(fixture, 'command.sh'), 0o444);
        await chmod(fixture, 0o555);
        this.stage = 'hash-bound-provider-extraction';
        const provider = join(candidate, 'libsqlite3.so.0');
        const extracted = JSON.parse(await this.command('gpg-provider-extract', 'python3', ['-I', '-B', join(ROOT, 'infra/sqlite-gpg-tofu-runtime/extract-provider.py'), pair.packagePath, provider, pair.providerSha256], 20000));
        assert.equal(extracted.providerSha256, pair.providerSha256);
        assert.equal(extracted.packageSha256, pair.packageSha256);
        assert.equal(hash(await regularBytes(provider, 4 * 1024 ** 2)), pair.providerSha256);
        await chmod(candidate, 0o555);
        this.stage = 'immutable-fixture-container';
        await this.fixtureDocker('base-pull', ['pull', '--platform', 'linux/amd64', BASE], 60);
        const image = await this.inspect('gpg-base-native', BASE);
        assert.match(image.Id,/^sha256:[a-f0-9]{64}$/u);
        assert.ok(Array.isArray(image.Config.Env)&&image.Config.Env.length<=64);
        const environment=new Map();
        for(const row of image.Config.Env){assert.equal(typeof row,'string');assert.ok(row.length<=4096);const at=row.indexOf('=');assert.ok(at>0&&!environment.has(row.slice(0,at)));environment.set(row.slice(0,at),row.slice(at+1));}
        environment.set('HOME','/work');environment.set('LC_ALL','C');
        const env=[...environment].map(([key,value])=>key+'='+value);
        assert.ok(image.RepoDigests.some(s => s.endsWith('@' + BASE.split('@')[1])));
        const name = 'tax-source-' + this.operation + '-gpg-tofu';
        this.fixtureName = name;
        await this.fixtureDocker('create', ['create', '--name', name, '--label', LABEL + '=' + this.operation, '--network', 'none', '--read-only', '--init', '--user', '65534:65534', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--env', 'HOME=/work', '--env', 'LC_ALL=C', '--tmpfs', '/work:rw,nosuid,nodev,noexec,size=16m,mode=1777', '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data', '--mount', `type=bind,source=${fixture},destination=/fixture,readonly`, '--mount', `type=bind,source=${candidate},destination=/candidate,readonly`, '--entrypoint', '/bin/sh', image.Id, '-c', IDLE]);
        const inspect = async (running) => {
            const [v] = JSON.parse(await this.fixtureDocker('inspect-' + this.fixtureCommands, ['inspect', name]));
            validateFixtureContainer(v, { image: image.Id, operation: this.operation, fixture, candidate, running, env });
        };
        await inspect(false);
        await this.fixtureDocker('start', ['start', name]);
        this.fixtureStarted = true;
        await inspect(true);
        const run = async (step, seconds = 20) => {
            this.stage = 'fixture-' + step;
            assert.equal(await this.fixtureDocker(step, ['exec', '--user', '65534:65534', name, '/bin/sh', '/fixture/command.sh', step], seconds), '');
        };
        let completed = false, firstFailureStage = null;
        try {
            for (const step of ['init', 'identity-before', 'version', 'agent-signer', 'agent-baseline', 'agent-candidate'])
                await run(step);
            await run('generate', 60);
            for (const step of ['public', 'sign-a', 'sign-b', 'fingerprint'])
                await run(step);
            for (const phase of variants) {
                await run(phase + '-import');
                for (const c of cases) {
                    await run(`${phase}-verify-${c}`);
                    await run(`${phase}-list-${c}`);
                }
            }
            await run('identity-after');
            completed = true;
        }
        catch (error) {
            firstFailureStage = this.stage;
            throw error;
        }
        finally {
            try {
                if (!this.unconfirmedChild) {
                    await run('close', 60);
                    this.fixtureAgentClosureConfirmed = true;
                    await run('export');
                    const raw = join(this.private, 'gpg-fixed-evidence');
                    await this.fixtureDocker('copy-fixed-evidence', ['cp', name + ':/work/export', raw]);
                    const names = await readdir(raw);
                    assert.ok(names.length <= exportNames().length && names.every(n => exportNames().includes(n)));
                    let total = 0;
                    const records = {};
                    for (const n of names) {
                        const path = join(raw, n), st = await lstat(path);
                        total += st.size;
                        assert.ok(total <= LIMITS.exportBytes);
                        records[n] = (await regularBytes(path, n.endsWith('.loader') ? 1048576 : 65536)).toString('utf8');
                    }
                    if (completed) {
                        this.stage = 'fixed-fixture-assessment';
                        const summary = assessBundle(records, pair.providerSha256);
                        await writeFile(join(this.evidence, 'gpg-tofu-summary.json'), JSON.stringify({ ...summary, originalQualificationPassed: true, pairSource: pair.pairSource, pairRunId: pair.pairRunId, receiptHashes: pair.receiptHashes, providerSha256: pair.providerSha256, packageSha256: pair.packageSha256, fixtureCodeSha256: hash(await regularBytes(shell, 65536)), fixtureCommands: this.fixtureCommands }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
                    }
                    await inspect(true);
                    await this.normalStop('gpg-normal-stop', name);
                }
            }
            finally {
                if (firstFailureStage)
                    this.stage = firstFailureStage;
            }
        }
    }
    async cleanup() {
        if (this.fixtureStarted && !this.fixtureAgentClosureConfirmed) {
            this.cleanupErrors.push('owned-gpg-agent-closure-unverified');
            return;
        }
        await super.cleanup();
    }
}
