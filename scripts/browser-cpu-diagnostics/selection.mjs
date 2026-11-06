import { createHash } from 'node:crypto';
const need = ok => { if (!ok) throw new Error('Diagnostic source/selection contract differs'); };
const sha = text => createHash('sha256').update(text).digest('hex');
const canonical = row => ({ id: row.id, file: row.file, titles: row.titles, project: row.project, timeout: row.timeout, expectedStatus: row.expectedStatus });
export const collectionHash = rows => sha(JSON.stringify(rows.map(canonical).sort((a, b) => a.id.localeCompare(b.id))));
export function selectCases(rows, manifest, auditHash) {
  need(manifest.version === 1 && manifest.fullCaseCount === 592 && manifest.targets.length === 14 && manifest.workers === 2 && manifest.retries === 0 && manifest.targetDeadlineMs === 30000 && auditHash === manifest.auditSha256);
  need(rows.length === 592 && new Set(rows.map(r => r.id)).size === 592 && collectionHash(rows) === manifest.fullCollectionSha256);
  const byId = new Map(rows.map(r => [r.id, r]));
  need(new Set(manifest.targets.map(r => r.id)).size === 14);
  for (const target of manifest.targets) need(target.timeout === 30000 && target.expectedStatus === 'passed' && target.project === 'chromium' && JSON.stringify(canonical(byId.get(target.id) ?? {})) === JSON.stringify(canonical(target)));
  return manifest.targets.map(target => byId.get(target.id));
}
export function verifyOverlayCollection(before, after) { need(before.length === after.length && collectionHash(before) === collectionHash(after)); return true; }
export function rewriteImport(source, originalHash) {
  need(sha(source) === originalHash);
  const matches = [...source.matchAll(/(['"])@playwright\/test\1/gu)];
  need(matches.length === 1 && /\bfrom\s*$/u.test(source.slice(0, matches[0].index)));
  return source.slice(0, matches[0].index) + matches[0][1] + '../scripts/browser-cpu-diagnostics/fixture' + matches[0][1] + source.slice(matches[0].index + matches[0][0].length);
}
export function diagnosticOutcome(original, diagnostic) { return { qualification: 'NONQUALIFYING_DIAGNOSTIC', originalQualification: original, diagnostic, originalFailureSuperseded: false }; }
