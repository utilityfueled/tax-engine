// Spec: spec/ops/sqlite-gpg-tofu-runtime.yaml
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { readFile, writeFile, mkdtemp, mkdir, rm, realpath, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
async function clean(root) {
    for (const n of ['gpg-fixture-code', 'gpg-provider'])
        await chmod(join(root, 'private', n), 0o700).catch(() => {
        });
    await rm(root, { recursive: true, force: true });
}
const u = new URL('../../scripts/lib/sqlite-gpg-tofu-evidence.mjs', import.meta.url);
const F = 'A'.repeat(40), EMAIL = 'sqlite-fixture@example.invalid';
const good = `[GNUPG:] NEWSIG\n[GNUPG:] GOODSIG AAAAAAAAAAAAAAAA SQLite Runtime Fixture <${EMAIL}>\n[GNUPG:] VALIDSIG ${F} 2026-11-17 1794873600 0 4 0 22 8 00 ${F}\n[GNUPG:] TOFU_USER ${F} ${EMAIL}\n[GNUPG:] TOFU_STATS 2 1 0 auto 1 1 0 0 2 1 0\n`;
const listing = n => `pub:-:255:22:AAAAAAAAAAAAAAAA:1:::-:::scSC:::::ed25519:::0:\nfpr:::::::::${F}:\nuid:-::::1::X::SQLite Runtime Fixture <${EMAIL}>::::::::::0:\ntfs:1:2:${n}:0:auto:1:1:0:0:\n`;
test('bounded verification status refuses false positives', async () => {
    const { parseVerification } = await import(u);
    assert.deepEqual(parseVerification(good, 0, F), { validSignature: true, tofuObserved: true, tamperRejected: false });
    for (const raw of [good.replace(F, 'B'.repeat(40)), good + good, good.replace('VALIDSIG', 'BADSIG'), good.replace('TOFU_STATS 2 1', 'TOFU_STATS nonsense 1'), good.replace('GOODSIG AAAAAAAAAAAAAAAA SQLite Runtime Fixture', 'GOODSIG BBBBBBBBBBBBBBBB SQLite Runtime Fixture'), good + '[GNUPG:] UNRECOGNIZED private-data\n', 'x'.repeat(65537), good + '\0'])
        assert.throws(() => parseVerification(raw, 0, F));
    assert.throws(() => parseVerification(good, 2, F));
    assert.deepEqual(parseVerification('[GNUPG:] NEWSIG\n[GNUPG:] BADSIG AAAAAAAAAAAAAAAA Fixture\n', 1, F, true), { validSignature: false, tofuObserved: false, tamperRejected: true });
    assert.throws(() => parseVerification(good, 1, F, true));
});
test('TFS and fingerprint parsing preserve count and identity semantics', async () => {
    const { parseTfs, parseFingerprint } = await import(u);
    assert.equal(parseFingerprint(listing(1)), F);
    assert.deepEqual(parseTfs(listing(2), F, 2), { signatureCount: 2, encryptionCount: 0, policyAuto: true });
    for (const raw of [listing(2).replace('tfs:1', 'tfs:2'), listing(3), listing(2).replace(':0:auto', ':1:auto'), listing(2).replace('auto', 'good'), listing(2) + listing(2), listing(2).replace(F, 'B'.repeat(40))])
        assert.throws(() => parseTfs(raw, F, 2));
    assert.throws(() => parseFingerprint(listing(1).replace(EMAIL, 'real@example.com')));
});
test('actual verifier loader proof rejects fallback and unrelated process', async () => {
    const { parseLoaderProof } = await import(u);
    const path = '/candidate/libsqlite3.so.0';
    const raw = `  321: find library=libsqlite3.so.0 [0]; searching\n  321: calling init: ${path}\n  321: calling fini: ${path} [0]\n`;
    assert.deepEqual(parseLoaderProof(raw, 321, path), { providerInitialized: true, selectedProviderMatch: true });
    for (const value of [raw.replaceAll('321:', '322:'), raw.replaceAll('/candidate/', '/usr/lib/x86_64-linux-gnu/'), raw + raw, 'libsqlite3.so.0 => ' + path, 'gpg (GnuPG) 2.2.40', 'x'.repeat(1048577)])
        assert.throws(() => parseLoaderProof(value, 321, path));
});
async function pairFixture(root) {
    const { hash } = await import(u);
    const source = 'a'.repeat(40), runId = '123456';
    const status = {};
    for (const k of ['recipeExit', 'baselinePackageBuildExit', 'candidatePackageBuildExit', 'baselineFullTestExit', 'candidateFullTestExit', 'candidateRegressionExit', 'candidateSanitizerRegressionExit'])
        status[k] = 0;
    Object.assign(status, { candidateRegressionCasesPassed: 5, candidateSanitizerRegressionCasesPassed: 5, baselineRegressionReproduced: true, genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false });
    const result = { source, runId, attempt: '1', sourceCandidate: 'sqlite', passed: true, failure: false, deadlineExceeded: false, cleanupErrors: [], checks: [{ step: 'original-check', exit: 0 }], genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false };
    const packageChecks = { actualChecksPassed: true, architecture: 'amd64', genericAbiApproval: false, candidateReleaseQualified: false, riskAccepted: false };
    const bytes = Buffer.from('synthetic-package-control'), provider = Buffer.from('\x7fELFsynthetic-inert-provider');
    const data = { result: JSON.stringify(result), status: JSON.stringify(status), packageChecks: JSON.stringify(packageChecks) };
    const leaf = 'candidate/libsqlite3-0_3.40.1-2+deb12u2+vivalatax1_amd64.deb';
    const ledger = `${hash(Buffer.from(data.status))}  ./status.json\n${hash(bytes)}  ./${leaf}\n`;
    const binding = { originalArtifactLedgerVerified: true, noAliases: true, files: { 'status.json': { sha256: hash(data.status), bytes: Buffer.byteLength(data.status) }, [leaf]: { sha256: hash(bytes), bytes: bytes.length }, 'ARTIFACTS.sha256': { sha256: hash(ledger), bytes: Buffer.byteLength(ledger) } } };
    data.exportBinding = JSON.stringify(binding);
    await mkdir(join(root, 'artifacts/candidate'), { recursive: true });
    for (const [k, name] of Object.entries({ result: 'result.json', status: 'actual-status.json', packageChecks: 'package-checks.json', exportBinding: 'artifacts/export-binding.json' }))
        await writeFile(join(root, name), data[k]);
    await writeFile(join(root, 'artifacts/status.json'), data.status);
    await writeFile(join(root, 'artifacts/ARTIFACTS.sha256'), ledger);
    await writeFile(join(root, 'artifacts', leaf), bytes);
    const expected = { source, runId, package: hash(bytes), provider: hash(provider) };
    for (const k of Object.keys(data))
        expected[k] = hash(data[k]);
    return { expected, status, result, packageChecks, provider };
}
test('qualified pair refuses absent failed or substituted receipts', async () => {
    const m = await import(u), directory = await realpath(await mkdtemp(join(tmpdir(), 'tofu-pair-controls-')));
    try {
        const f = await pairFixture(directory);
        assert.throws(() => m.validatePairReceipt({}));
        for (const key of ['recipeExit', 'baselineFullTestExit', 'candidateFullTestExit', 'candidateRegressionExit', 'candidateSanitizerRegressionExit']) {
            const status = { ...f.status, [key]: 1 };
            assert.throws(() => m.validatePairReceipt({ ...f, status, source: f.expected.source, runId: f.expected.runId }));
        }
        const token = await m.admitQualifiedPair(directory, f.expected);
        assert.equal(m.qualifiedPairData(token).providerSha256, f.expected.provider);
        assert.throws(() => m.qualifiedPairData({ ...token }));
        await assert.rejects(() => m.admitQualifiedPair(directory, { ...f.expected, status: '0'.repeat(64) }));
        await writeFile(join(directory, 'artifacts/candidate/libsqlite3-0_3.40.1-2+deb12u2+vivalatax1_amd64.deb'), 'substitution');
        await assert.rejects(() => m.admitQualifiedPair(directory, f.expected));
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
});
async function bundle(provider) {
    const { BASE_FILES, exportNames } = await import(new URL('../../scripts/sqlite-gpg-tofu-runtime.mjs', import.meta.url));
    const files = {};
    for (const n of exportNames())
        files[n] = '';
    for (const n of ['identity-before.out', 'identity-after.out'])
        files[n] = Object.entries({ ...BASE_FILES, '/candidate/libsqlite3.so.0': provider }).map(([p, h]) => `${h}  ${p}\n`).join('');
    files['version.out'] = 'gpg (GnuPG) 2.2.40\n';
    files['loader-version.out'] = 'ld.so (Debian GLIBC 2.36-9+deb12u14) stable release version 2.36.\n';
    files['fingerprint.out'] = listing(1).replace(/^tfs:.*\n/m, '');
    files['closure.out'] = 'owned-agent-closure=3\n';
    for (const p of ['baseline', 'candidate']) {
        for (const [i, c] of ['a1', 'a2', 'b', 'tamper'].entries()) {
            const k = `${p}-verify-${c}`;
            files[k + '.status'] = c === 'tamper' ? '[GNUPG:] NEWSIG\n[GNUPG:] BADSIG AAAAAAAAAAAAAAAA Fixture\n' : good;
            files[k + '.exit'] = c === 'tamper' ? '1\n' : '0\n';
            files[k + '.pid'] = '321\n';
            files[k + '.loader'] = ` 321: calling init: ${p === 'baseline' ? '/usr/lib/x86_64-linux-gnu' : '/candidate'}/libsqlite3.so.0\n`;
            const key = `${p}-list-${c}`;
            files[key + '.out'] = listing([1, 1, 2, 2][i]);
            files[key + '.exit'] = '0\n';
        }
        files[p + '.dbheader'] = ' 53 51 4c 69 74 65 20 66 6f 72 6d 61 74 20 33 00\n';
    }
    return files;
}
test('fixed bundle rejects missing DB provider drift and private extra files', async () => {
    const { assessBundle } = await import(new URL('../../scripts/sqlite-gpg-tofu-runtime.mjs', import.meta.url));
    const sha = 'b'.repeat(64), files = await bundle(sha);
    const result = assessBundle(files, sha);
    assert.equal(result.phases.candidate.actualProcessProviderBindings, 4);
    assert.equal(result.runtimeCompatibilityQualified, false);
    assert.ok(!JSON.stringify(result).includes(EMAIL));
    for (const change of [v => delete v['baseline.dbheader'], v => v['candidate.dbheader'] = '', v => v['identity-after.out'] = v['identity-after.out'].replace(sha, 'c'.repeat(64)), v => v['candidate-list-tamper.out'] = listing(3), v => v['private-keys-v1.d'] = 'forbidden']) {
        const copy = { ...files };
        change(copy);
        assert.throws(() => assessBundle(copy, sha));
    }
});
async function inertProtocol(failStep) {
    const { SqliteGpgTofuRuntime, BASE } = await import(new URL('../../scripts/sqlite-gpg-tofu-runtime.mjs', import.meta.url));
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tofu-inert-controller-')));
    const input = join(root, 'pair');
    await mkdir(input);
    const pair = await pairFixture(input);
    const probe = new SqliteGpgTofuRuntime(root, { directory: input, expected: pair.expected }, {});
    probe.private = join(root, 'private');
    probe.evidence = join(root, 'evidence');
    await mkdir(probe.private);
    await mkdir(probe.evidence);
    const calls = [], image = 'sha256:' + 'b'.repeat(64);
    let running = false;
    const fixture = join(probe.private, 'gpg-fixture-code'), candidate = join(probe.private, 'gpg-provider');
    let created;
    const state = () => ({ Image: image, Config: { Env: ['PATH=/usr/bin:/bin','HOME=/work','LC_ALL=C'], Labels: { 'io.vivalatax.qualification.operation': probe.operation }, User: '65534:65534', Entrypoint: ['/bin/sh'], Cmd: created.slice(-2) }, State: { Running: running, OOMKilled: false, Error: '', ExitCode: 0 }, HostConfig: { Init: true, NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, CapAdd: null, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], Tmpfs: { '/work': 'rw,nosuid,nodev,noexec,size=16m,mode=1777' } }, Mounts: [{ Type: 'bind', Destination: '/fixture', Source: fixture, RW: false }, { Type: 'bind', Destination: '/candidate', Source: candidate, RW: false }, { Type: 'tmpfs', Destination: '/work' }, { Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }] });
    probe.inspect = async () => ({ Id: image, RepoDigests: [BASE],Config:{Env:['PATH=/usr/bin:/bin']} });
    probe.command = async (step, exe, args) => {
        assert.equal(step, 'gpg-provider-extract');
        assert.equal(exe, 'python3');
        await writeFile(args.at(-2), pair.provider);
        return JSON.stringify({ providerSha256: pair.expected.provider, packageSha256: pair.expected.package });
    };
    probe.docker = async (step, args) => {
        calls.push({ step, args });
        if (args[0] === 'create')
            created = args;
        if (args[0] === 'start')
            running = true;
        if (args[0] === 'stop')
            running = false;
        if (args[0] === 'inspect')
            return JSON.stringify([state()]);
        if (args[0] === 'exec' && args.at(-1) === failStep)
            throw new Error('synthetic-fixed-failure');
        if (args[0] === 'cp') {
            const files = await bundle(pair.expected.provider);
            await mkdir(args.at(-1));
            for (const [n, v] of Object.entries(files))
                await writeFile(join(args.at(-1), n), v);
        }
        return '';
    };
    return { root, probe, calls, pair };
}
test('inert controller runs only bounded fixed owned protocol', async () => {
    const f = await inertProtocol();
    try {
        await f.probe.build();
        assert.ok(f.probe.fixtureCommands <= 48);
        assert.equal(f.probe.fixtureAgentClosureConfirmed, true);
        const exec = f.calls.filter(c => c.args[0] === 'exec');
        assert.equal(exec.filter(c => c.args.at(-1).includes('-verify-')).length, 8);
        assert.ok(exec.every(c => c.args.slice(1, 6).join('|').endsWith('/bin/sh|/fixture/command.sh')));
        assert.ok(!f.calls.some(c => c.args.includes('--privileged') || c.args.includes('--force')));
        const copy = f.calls.find(c => c.args[0] === 'cp');
        assert.ok(copy.args[1].endsWith(':/work/export'));
        assert.ok(!copy.args[1].includes('/work/signer'));
        assert.equal(f.calls.findIndex(c => c.args.at(-1) === 'close') < f.calls.findIndex(c => c.args[0] === 'stop'), true);
        const summary = JSON.parse(await readFile(join(f.probe.evidence, 'gpg-tofu-summary.json'), 'utf8'));
        assert.equal(summary.consumerFixturePassed, true);
        assert.equal(summary.genericAbiApproval, false);
        assert.ok(!JSON.stringify(summary).includes(EMAIL));
    }
    finally {
        await clean(f.root);
    }
});
test('first protocol failure remains identified after normal closure and export', async () => {
    const f = await inertProtocol('generate');
    try {
        await assert.rejects(() => f.probe.build());
        assert.equal(f.probe.stage, 'fixture-generate');
        assert.equal(f.probe.fixtureAgentClosureConfirmed, true);
        assert.ok(f.calls.some(c => c.args[0] === 'stop'));
    }
    finally {
        await clean(f.root);
    }
});
test('unsafe container mutations and exhausted fixture budget hold execution', async () => {
    const { validateFixtureContainer, SqliteGpgTofuRuntime } = await import(new URL('../../scripts/sqlite-gpg-tofu-runtime.mjs', import.meta.url));
    const f = await inertProtocol();
    try {
        await f.probe.build();
        const create = f.calls.find(c => c.args[0] === 'create').args;
        const cfg = { image: 'sha256:' + 'b'.repeat(64), operation: f.probe.operation, fixture: join(f.probe.private, 'gpg-fixture-code'), candidate: join(f.probe.private, 'gpg-provider'), running: true,env: ['PATH=/usr/bin:/bin','HOME=/work','LC_ALL=C'] };
        const goodState = { Image: cfg.image, Config: { Env: ['PATH=/usr/bin:/bin','HOME=/work','LC_ALL=C'], Labels: { 'io.vivalatax.qualification.operation': cfg.operation }, User: '65534:65534', Entrypoint: ['/bin/sh'], Cmd: create.slice(-2) }, State: { Running: true, OOMKilled: false, Error: '' }, HostConfig: { Init: true, NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, CapAdd: null, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], Tmpfs: { '/work': 'rw,nosuid,nodev,noexec,size=16m,mode=1777' } }, Mounts: [{ Type: 'bind', Destination: '/fixture', Source: cfg.fixture, RW: false }, { Type: 'bind', Destination: '/candidate', Source: cfg.candidate, RW: false }, { Type: 'tmpfs', Destination: '/work' }, { Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }] };
        assert.equal(validateFixtureContainer(goodState, cfg), true);
        for (const change of [v=>v.Config.Env.push('UNEXPECTED=synthetic'), v => v.HostConfig.NetworkMode = 'bridge', v => v.Config.User = '0', v => v.Mounts[0].RW = true, v => v.Mounts.push({ Destination: '/foreign' }), v => v.HostConfig.Tmpfs['/work'] = 'size=1g']) {
            const copy = globalThis.structuredClone(goodState);
            change(copy);
            assert.throws(() => validateFixtureContainer(copy, cfg));
        }
        const p = new SqliteGpgTofuRuntime('/synthetic', {}, {});
        p.fixtureCommands = 48;
        p.docker = () => assert.fail('daemon must not run');
        await assert.rejects(() => p.fixtureDocker('overflow', []));
        p.fixtureStarted = true;
        await p.cleanup();
        assert.deepEqual(p.cleanupErrors, ['owned-gpg-agent-closure-unverified']);
    }
    finally {
        await clean(f.root);
    }
});
test('bounded package extraction rejects oversized traversal aliases and substitution', () => {
    const helper = fileURLToPath(new URL('../../infra/sqlite-gpg-tofu-runtime/extract-provider.py', import.meta.url));
    const program = String.raw `import importlib.util,pathlib,tempfile,tarfile,io,lzma,hashlib,struct,os
s=importlib.util.spec_from_file_location('probe',${JSON.stringify(helper)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def elf():
 b=bytearray(512);ident=b'\x7fELF'+bytes([2,1,1])+bytes(9);struct.pack_into('<16sHHIQQQIHHHHHH',b,0,ident,3,62,1,0,64,0,0,64,56,2,0,0,0)
 struct.pack_into('<IIQQQQQQ',b,64,1,4,0,4096,4096,512,512,1);struct.pack_into('<IIQQQQQQ',b,120,2,4,192,4288,4288,96,96,1)
 names=b'\0libm.so.6\0libc.so.6\0libsqlite3.so.0\0';b[384:384+len(names)]=names
 for i,(tag,v) in enumerate([(5,4480),(10,len(names)),(1,1),(1,names.index(b'libc')),(14,names.index(b'libsqlite')),(0,0)]):struct.pack_into('<qQ',b,192+i*16,tag,v)
 return bytes(b)
def ar(rows):
 out=b'!<arch>\n'
 for name,data in rows:
  out+=(name+'/').ljust(16).encode()+b'0'.ljust(12)+b'0'.ljust(6)+b'0'.ljust(6)+b'100644'.ljust(8)+str(len(data)).ljust(10).encode()+bytes([96,10])+data+(b'\n'if len(data)%2 else b'')
 return out
def package(rows):
 out=io.BytesIO()
 with tarfile.open(fileobj=out,mode='w')as t:
  for name,data,kind in rows:
   i=tarfile.TarInfo(name);i.type=kind
   if kind==tarfile.REGTYPE:i.size=len(data);t.addfile(i,io.BytesIO(data))
   else:i.linkname='elsewhere';t.addfile(i)
 return ar([('debian-binary',b'2.0\n'),('control.tar.xz',b'control'),('data.tar.xz',lzma.compress(out.getvalue()))])
with tempfile.TemporaryDirectory()as d:
 p=pathlib.Path(d);raw=elf();sha=hashlib.sha256(raw).hexdigest();good=package([(m.PROVIDER,raw,tarfile.REGTYPE)])
 (p/'good').write_bytes(good);r=m.extract(p/'good',p/'out',sha);assert r['providerSha256']==sha and r['dynamic']['soname']=='libsqlite3.so.0';assert(p/'out').read_bytes()==raw
 bads=[good[:-1],good+b'x',b'x'*(m.MAX_PACKAGE+1),package([('../outside',raw,tarfile.REGTYPE),(m.PROVIDER,raw,tarfile.REGTYPE)]),package([(m.PROVIDER,raw,tarfile.LNKTYPE)]),package([(m.PROVIDER,raw,tarfile.REGTYPE),(m.PROVIDER,raw,tarfile.REGTYPE)]),ar([('debian-binary',b'2.0\n'),('data.tar.xz',lzma.compress(b'x'*(m.MAX_DATA+1)))])]
 for n,data in enumerate(bads):
  (p/'bad').write_bytes(data)
  try:m.extract(p/'bad',p/('rejected'+str(n)),sha)
  except(AssertionError,ValueError,tarfile.TarError,lzma.LZMAError):pass
  else:raise AssertionError('unsafe package admitted')
 try:m.extract(p/'good',p/'wrongsha','0'*64)
 except AssertionError:pass
 else:raise AssertionError('hash substitution admitted')
 wrong=bytearray(raw);struct.pack_into('<H',wrong,18,183);(p/'wrongarch').write_bytes(package([(m.PROVIDER,bytes(wrong),tarfile.REGTYPE)]))
 try:m.extract(p/'wrongarch',p/'wrongarchout',hashlib.sha256(wrong).hexdigest())
 except AssertionError:pass
 else:raise AssertionError('non-AMD64 provider admitted')
 invalid=good.replace(b'2.0\n',b'1.0\n',1);(p/'wrongformat').write_bytes(invalid)
 try:m.extract(p/'wrongformat',p/'wrongformatout',sha)
 except AssertionError:pass
 else:raise AssertionError('invalid Debian format admitted')
 os.symlink(p/'good',p/'alias')
 try:m.extract(p/'alias',p/'aliasout',sha)
 except OSError:pass
 else:raise AssertionError('package symlink admitted')
print('provider controls passed')`;
    const r = spawnSync('python3', ['-I', '-B', '-c', program], { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'provider controls passed');
});
