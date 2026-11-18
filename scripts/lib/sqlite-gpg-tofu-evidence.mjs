import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { assertSqliteChecksPassed } from '../build-postgres-sqlite-backport.mjs';
export const EMAIL = 'sqlite-fixture@example.invalid';
export const UID = `SQLite Runtime Fixture <${EMAIL}>`;
const SHA = /^[a-f0-9]{64}$/u, FPR = /^[A-F0-9]{40}$/u;
export const hash = data => createHash('sha256').update(data).digest('hex');
const admitted = new WeakMap();
function text(raw, max = 65536) {
    assert.equal(typeof raw, 'string');
    assert.ok(Buffer.byteLength(raw) <= max && !raw.includes('\0'));
    const lines = raw.trimEnd().split('\n');
    assert.ok(lines.length <= 4096 && lines.every(l => l.length <= 4096 && !l.includes('\r')));
    return lines;
}
const integer = (value, max = 2147483647) => {
    assert.match(value, /^(?:0|[1-9][0-9]*)$/u);
    const n = Number(value);
    assert.ok(Number.isSafeInteger(n) && n <= max);
    return n;
};
export function parseFingerprint(raw) {
    const rows = text(raw).map(l => l.split(':'));
    assert.ok(rows.every(r => ['tru', 'pub', 'fpr', 'uid', 'tfs'].includes(r[0])));
    assert.equal(rows.filter(r => r[0] === 'pub').length, 1);
    const ids = rows.filter(r => r[0] === 'uid');
    assert.equal(ids.length, 1);
    assert.equal(ids[0][9], UID);
    const f = rows.filter(r => r[0] === 'fpr');
    assert.equal(f.length, 1);
    assert.match(f[0][9], FPR);
    return f[0][9];
}
export function parseTfs(raw, fingerprint, count) {
    assert.match(fingerprint, FPR);
    assert.equal(parseFingerprint(raw), fingerprint);
    const rows = text(raw).map(l => l.split(':')).filter(r => r[0] === 'tfs');
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.ok(r.length >= 10 && r.slice(10).every(x => x === ''));
    assert.equal(r[1], '1');
    assert.ok(integer(r[2], 4) > 0);
    assert.equal(integer(r[3]), count);
    assert.equal(integer(r[4]), 0);
    assert.equal(r[5], 'auto');
    for (const v of r.slice(6, 10))
        integer(v, 253402300799);
    return { signatureCount: count, encryptionCount: 0, policyAuto: true };
}
export function parseVerification(raw, exit, fingerprint, tamper = false) {
    assert.match(fingerprint, FPR);
    assert.ok(Number.isInteger(exit) && exit >= 0 && exit <= 255);
    const rows = text(raw).filter(Boolean).map(line => {
        assert.ok(line.startsWith('[GNUPG:] '));
        return line.slice(9).split(' ');
    });
    const names = rows.map(r => r[0]);
    const allowed = new Set(['NEWSIG', 'KEY_CONSIDERED', 'SIG_ID', 'GOODSIG', 'VALIDSIG', 'TRUST_UNDEFINED', 'TRUST_MARGINAL', 'TRUST_FULLY', 'TOFU_USER', 'TOFU_STATS', 'TOFU_STATS_LONG', 'BADSIG', 'FAILURE']);
    assert.ok(names.every(n => allowed.has(n)));
    const valid = rows.filter(r => r[0] === 'VALIDSIG'), good = rows.filter(r => r[0] === 'GOODSIG');
    if (tamper) {
        assert.notEqual(exit, 0);
        assert.equal(valid.length, 0);
        assert.equal(good.length, 0);
        assert.equal(names.filter(n => n === 'BADSIG').length, 1);
        return { validSignature: false, tofuObserved: false, tamperRejected: true };
    }
    assert.equal(exit, 0);
    assert.ok(!names.includes('BADSIG') && !names.includes('FAILURE'));
    assert.equal(valid.length, 1);
    assert.ok(valid[0].length >= 10);
    assert.equal(valid[0][1], fingerprint);
    assert.equal(valid[0].at(-1), fingerprint);
    assert.equal(good.length, 1);
    assert.equal(good[0][1],fingerprint.slice(-16));
    assert.equal(good[0].slice(2).join(' '),UID);
    const statistics=rows.filter(r=>r[0]==='TOFU_STATS');
    assert.equal(statistics.length,1);
    const stat=statistics[0];
    assert.equal(stat.length,12);
    assert.ok(integer(stat[1],4)>0&&integer(stat[2])>0);
    assert.equal(integer(stat[3]),0);
    assert.equal(stat[4],'auto');
    for(const value of stat.slice(5,9))integer(value,253402300799);
    assert.ok(integer(stat[9],4)>0&&integer(stat[10])>0);
    assert.equal(integer(stat[11]),0);
    assert.equal(rows.filter(r => r[0] === 'TOFU_USER' && r[1] === fingerprint && r[2] === EMAIL && r.length === 3).length, 1);
    assert.equal(names.filter(n => n === 'TOFU_STATS').length, 1);
    return { validSignature: true, tofuObserved: true, tamperRejected: false };
}
export function parseLoaderProof(raw, pid, expected) {
    assert.ok(Number.isSafeInteger(pid) && pid > 1 && pid <= 2147483647);
    assert.ok(['/candidate/libsqlite3.so.0', '/usr/lib/x86_64-linux-gnu/libsqlite3.so.0'].includes(expected));
    const initialized = [];
    for (const line of text(raw, 1048576)) {
        if (!line.trim())
            continue;
        const match = /^\s*([0-9]+):\s*(.*)$/u.exec(line);
        assert.ok(match);
        assert.equal(integer(match[1]), pid);
        const init = /^calling init: (\/[A-Za-z0-9_./-]+)$/u.exec(match[2]);
        if (init && /\/libsqlite3\.so\.0(?:\.8\.6)?$/u.test(init[1]))
            initialized.push(init[1]);
    }
    assert.deepEqual(initialized, [expected]);
    return { providerInitialized: true, selectedProviderMatch: true };
}
export function validatePairReceipt({ status, result, packageChecks, source, runId } = {}) {
    assert.match(source ?? '', /^[a-f0-9]{40}$/u);
    assert.match(runId ?? '', /^[1-9][0-9]{0,19}$/u);
    assertSqliteChecksPassed(status ?? {});
    assert.equal(result.source, source);
    assert.equal(result.runId, runId);
    assert.equal(result.attempt, '1');
    assert.equal(result.sourceCandidate, 'sqlite');
    assert.equal(result.passed, true);
    assert.equal(result.failure, false);
    assert.equal(result.deadlineExceeded, false);
    assert.deepEqual(result.cleanupErrors, []);
    assert.ok(Array.isArray(result.checks) && result.checks.length > 0 && result.checks.every(c => c.exit === 0));
    assert.equal(packageChecks.actualChecksPassed, true);
    assert.equal(packageChecks.architecture, 'amd64');
    for (const record of [status, result, packageChecks])
        for (const k of ['genericAbiApproval', 'candidateReleaseQualified', 'riskAccepted'])
            assert.equal(record[k], false);
    return true;
}
export async function regularBytes(path, max) {
    const st = await lstat(path);
    assert.ok(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.size > 0 && st.size <= max);
    const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const now = await fd.stat();
        assert.equal(now.dev, st.dev);
        assert.equal(now.ino, st.ino);
        const b = await fd.readFile();
        assert.equal(b.length, st.size);
        return b;
    }
    finally {
        await fd.close();
    }
}
export async function admitQualifiedPair(directory, expected) {
    assert.ok(expected && Object.getPrototypeOf(expected) === Object.prototype);
    for (const key of ['result', 'status', 'packageChecks', 'exportBinding', 'package', 'provider'])
        assert.match(expected[key] ?? '', SHA);
    const files = { result: 'result.json', status: 'actual-status.json', packageChecks: 'package-checks.json', exportBinding: 'artifacts/export-binding.json' };
    const records = {};
    for (const [key, path] of Object.entries(files)) {
        const bytes = await regularBytes(join(directory, path), 1048576);
        assert.equal(hash(bytes), expected[key]);
        records[key] = JSON.parse(bytes);
    }
    validatePairReceipt({ ...records, source: expected.source, runId: expected.runId });
    const binding = records.exportBinding;
    assert.equal(binding.originalArtifactLedgerVerified, true);
    assert.equal(binding.noAliases, true);
    assert.ok(binding.files && Object.keys(binding.files).length <= 100000);
    assert.equal(binding.files['status.json'].sha256, expected.status);
    const leaf = 'candidate/libsqlite3-0_3.40.1-2+deb12u2+vivalatax1_amd64.deb';
    const pin = binding.files[leaf];
    assert.equal(pin.sha256, expected.package);
    assert.ok(Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= 16 * 1024 ** 2);
    const ledger = await regularBytes(join(directory, 'artifacts/ARTIFACTS.sha256'), 16 * 1024 ** 2);
    assert.equal(hash(ledger), binding.files['ARTIFACTS.sha256'].sha256);
    const rows = new Map();
    for (const line of ledger.toString('utf8').trimEnd().split('\n')) {
        const m = /^([a-f0-9]{64}) {2}\.\/(.+)$/u.exec(line);
        assert.ok(m && !rows.has(m[2]) && !m[2].split('/').some(x => ['', '.', '..'].includes(x)));
        rows.set(m[2], m[1]);
    }
    assert.deepEqual([...rows.keys()].sort(), Object.keys(binding.files).filter(x => x !== 'ARTIFACTS.sha256').sort());
    for (const [name, sha] of rows)
        assert.equal(binding.files[name].sha256, sha);
    const packagePath = join(directory, 'artifacts', leaf), bytes = await regularBytes(packagePath, 16 * 1024 ** 2);
    assert.equal(bytes.length, pin.bytes);
    assert.equal(hash(bytes), expected.package);
    const token = Object.freeze({});
    admitted.set(token, { packagePath, providerSha256: expected.provider, packageSha256: expected.package, pairSource: expected.source, pairRunId: expected.runId, receiptHashes: Object.fromEntries(Object.keys(files).map(k => [k, expected[k]])) });
    return token;
}
export function qualifiedPairData(token) {
    assert.ok(admitted.has(token), 'A qualified original package-pair receipt is required.');
    return admitted.get(token);
}
