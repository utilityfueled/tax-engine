import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { confirmedPayrollSetup, pdfPrivateIdentifiers } from '../apps/web/tests/helpers/rrta-paper-review-fixture';

const pdfInputs = [
  { width: 390, sha: '888e4fabe9017b20f148c40db9fb47ffc82e3e9c5c3c03da326c28be5be94a30',
    output: 'f238ab10af3ebafabcaf3f13b7056c1260e8d48e41071541d67976f5e4f12564' },
  { width: 1280, sha: '32b4bdead91d9ec9d47c87a6e63667fbe791a5e18d130cac4e249c426b4c396c',
    output: '01f0388f5d71a21fc90dd94ffc58965b33d79fbe8eb88df047d8f59e6d532616' },
] as const;
const helper = 'apps/web/tests/helpers/rrta-paper-review-privacy.py';
const timeout = 4_000;
const maxBuffer = 65_536;
const blocks = 12;
const blockOrder = [0, 1, 1, 0] as const;
const interpreters = ['3.13.18', '3.14.10'] as const;
const environment = Object.fromEntries(
  ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP'].flatMap(key =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]]),
);

function hash(data: Buffer) {
  return createHash('sha256').update(data).digest('hex');
}

function need(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function findPDF(root: string, width: number) {
  const candidates = readdirSync(root, { recursive: true }).filter(subpath =>
    subpath.startsWith('test-results/rate-window-1795523755024-3237/batch-8-artifacts/') &&
    subpath.endsWith(`/actual-rrta-paper-${width}.pdf`),
  );
  need(candidates.length === 1, 'Expected one retained PDF per viewport');
  return join(root, candidates[0]);
}

function verifyPython(executable: string, version: string) {
  const help = [
    'import platform,sys,sysconfig,pypdf',
    'p=platform',
    'jit=getattr(getattr(sys,"_jit",None),"is_enabled",lambda:False)()',
    'print(p.python_version(),p.python_implementation(),p.system(),p.machine(),int(jit),',
    'int(bool(sysconfig.get_config_var("Py_GIL_DISABLED"))),int(sys.flags.optimize),pypdf.__version__)',
  ].join('\n');
  const child = spawnSync(executable, ['-I', '-B', '-c', help], { timeout, maxBuffer, env: environment });
  const expected = `${version} CPython Linux x86_64 0 0 0 6.10.0\n`;
  need(child.status === 0 && child.stderr?.length === 0 && child.stdout?.toString() === expected,
    'Unexpected interpreter identity, architecture, execution mode or dependency');
}

export interface Attempt {
  interpreter: number;
  block: number;
  elapsedUs: number;
  accepted: boolean;
}

export function pairedImprovement(attempts: readonly Attempt[]) {
  if (attempts.length !== (blocks + 1) * 4 ||
      attempts.some(row => !row.accepted || !Number.isSafeInteger(row.elapsedUs) || row.elapsedUs <= 0)) return null;
  const percentages: number[] = [];
  for (let block = 0; block <= blocks; block++) {
    const group = attempts.slice(block * 4, block * 4 + 4);
    if (group.some((row, index) => row.block !== block || row.interpreter !== blockOrder[index])) return null;
    if (block === 0) continue;
    const [first, second, third, fourth] = group;
    percentages.push(100 * (first.elapsedUs - second.elapsedUs) / first.elapsedUs,
      100 * (fourth.elapsedUs - third.elapsedUs) / fourth.elapsedUs);
  }
  percentages.sort((a, b) => a - b);
  const mid = percentages.length / 2;
  return (percentages[mid - 1] + percentages[mid]) / 2;
}

function attempt(executable: string, file: string, markers: Buffer, expected: string, interpreter: number, block: number) {
  const started = process.hrtime.bigint();
  const child = spawnSync(executable, ['-I', '-B', helper, file, '--phase-fd3'], {
    input: markers, timeout, maxBuffer, env: environment, stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  });
  const elapsedUs = Number((process.hrtime.bigint() - started) / 1_000n);
  const outputSha256 = child.stdout?.length ? hash(child.stdout) : null;
  const stderrBytes = child.stderr?.length ?? 0;
  const phaseBytes = child.output?.[3]?.length ?? 0;
  return { interpreter, block, elapsedUs, exit: child.status, signal: child.signal,
    timedOut: (child.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT', outputSha256, stderrBytes, phaseBytes,
    accepted: !child.error && child.status === 0 && stderrBytes === 0 && phaseBytes > 0 && outputSha256 === expected };
}

function main(args: string[]) {
  need(args.length === 4, 'Expected artifact directory, two interpreter paths and report path');
  const [root, baseline, candidate, reportPath] = args;
  const python = [baseline, candidate];
  const markers = Buffer.from(JSON.stringify(pdfPrivateIdentifiers(confirmedPayrollSetup())));
  need(hash(markers) === 'ab4a6271bed5b96931420316ef5cfafab0ff9d66d5df4ab9ce2316fa4237a907', 'Synthetic marker fixture changed');
  const helperSha256 = hash(readFileSync(helper));
  need(helperSha256 === 'c5c723994d7336d22c341e25e531a33b713bd9227891d4b6aa4553a2adec32f3', 'Inspector source changed');
  const requirementsSha256 = hash(readFileSync('requirements-test.txt'));
  need(requirementsSha256 === 'dbb811ae6d9075eda79092433769e009d33968d4cd9c9817de5a4a10c28d0036', 'Dependency lock changed');
  const files = pdfInputs.map(({ width, sha, output }) => {
    const file = findPDF(root, width);
    const bytes = readFileSync(file);
    need(bytes.length === 509_346 && hash(bytes) === sha, 'Unexpected retained PDF digest');
    return { width, sha, output, file };
  });
  python.forEach((executable, index) => verifyPython(executable, interpreters[index]));
  const reports = files.map(({ width, sha, output, file }) => {
    const attempts = Array.from({ length: blocks + 1 }, (_, block) =>
      blockOrder.map(index => attempt(python[index], file, markers, output, index, block)),
    ).flat();
    return { width, inputSha256: sha, expectedOutputSha256: output, attempts, pairedImprovementPercent: pairedImprovement(attempts) };
  });
  const complete = reports.every(row => row.pairedImprovementPercent !== null);
  const thresholdMet = reports.every(row => row.pairedImprovementPercent !== null && row.pairedImprovementPercent >= 10);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({ schemaVersion: 1, scope: 'NONQUALIFYING_DIAGNOSTIC',
    sourceArtifact: 14923508728, sourceSha: process.env.GITHUB_SHA, helperSha256, requirementsSha256,
    interpreters, timeout, maxBuffer, telemetry: 'phase-fd3',
    status: complete ? 'COMPARABLE' : 'HOLD', performanceThresholdMet: thresholdMet, reports }, null, 2) + '\n');
  console.log('RRTA Linux runtime comparison', complete ? 'COMPARABLE' : 'HOLD',
    reports.map(row => ({ width: row.width, passes: row.attempts.filter(attempt => attempt.accepted).length,
      timeouts: row.attempts.filter(attempt => attempt.timedOut).length, improvement: row.pairedImprovementPercent })));
  if (!complete) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
