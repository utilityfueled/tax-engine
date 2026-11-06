import { describe, expect, it } from 'vitest';
import { createCipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { assertEncryptedRecoveryOriginals } from '../../../apps/web/tests/helpers/encrypted-recovery-review';
import { exportWorkspaceRecovery, importWorkspaceRecovery } from '../../../apps/web/src/lib/workspace-recovery';
import { WORKSPACE_STORAGE_KEY } from '../../../apps/web/src/lib/workspace-storage';
import { getGuidedFlowStorageKey, initialFlowState } from '../../../apps/web/src/lib/guided-interview-flow';

const password = 'synthetic-lifecycle-backup-password';
const source = Buffer.from('%PDF-fictional original source bytes');
const workspace = { id: 'fictional', documents: [{ id: 'source-1', name: 'fictional.pdf', size: source.length, uploadedAt: '2025-01-01T00:00:00.000Z', kind: 'pdf' }], seededReturn: {}, returnSummary: {}, auditTrail: [], structuredFacts: [], checklist: [], summary: {}, privateExtension: { firstName: 'A', exactZero: '0.00', unknown: null } };
const guidedFlowRaw = JSON.stringify({ ...initialFlowState, sectionData: { 'personal-info': { firstName: 'A', ssn: '900-70-0311' } } });
const expected = { workspace, guidedFlowRaw, guidedMode: null, files: [{ documentId: 'source-1', fileName: 'fictional.pdf', type: 'application/pdf', lastModified: 123456, bytes: source }] };
const payload = () => ({ schemaVersion: 1, createdAt: '2026-11-06T00:00:00.000Z', workspace, guidedFlowRaw, guidedMode: null, files: [{ documentId: 'source-1', name: 'fictional.pdf', type: 'application/pdf', lastModified: 123456, size: source.length, sha256: createHash('sha256').update(source).digest('hex'), base64: source.toString('base64') }] });
function encrypt(clear: unknown = payload(), aad = 'tax-engine-encrypted-recovery:1') {
  const salt = Buffer.alloc(16, 17), iv = Buffer.alloc(12, 33);
  const cipher = createCipheriv('aes-256-gcm', pbkdf2Sync(password, salt, 600000, 32, 'sha256'), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(clear)), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ format: 'tax-engine-encrypted-recovery', version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: 600000, salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: encrypted.toString('base64') });
}
function rejected(archive: string, candidatePassword = password, originals = expected) {
  let message = '';
  try { assertEncryptedRecoveryOriginals(archive, candidatePassword, originals); } catch (error) { message = error instanceof Error ? error.message : 'unexpected error'; }
  expect(message).toBe('Encrypted recovery evidence validation failed');
}

describe('spec encrypted-recovery-browser-evidence', () => {
  it('accepts authenticated ciphertext with a deterministic short-marker coincidence', () => {
    const archive = encrypt();
    expect(JSON.parse(archive).ciphertext.includes(workspace.privateExtension.firstName)).toBe(true);
    expect(assertEncryptedRecoveryOriginals(archive, password, expected)).toEqual({ status: 'PASS_AUTHENTICATED_RECOVERY_ORIGINALS', format: 'tax-engine-encrypted-recovery', files: 1 });
  });
  it('rejects extra or disguised plaintext and noncanonical encryption parameters', () => {
    const a = JSON.parse(encrypt());
    for (const bad of [
      { ...a, plaintext: 'Avery' }, { ...a, metadata: { name: 'Avery' } }, { ...a, format: 'Avery' },
      { ...a, version: true }, { ...a, cipher: 'AES-128-GCM' }, { ...a, kdf: 'PBKDF2-SHA1' }, { ...a, iterations: 1 },
      { ...a, salt: Buffer.alloc(15).toString('base64') }, { ...a, iv: Buffer.alloc(13).toString('base64') },
      { ...a, ciphertext: 'Avery' }, { ...a, ciphertext: a.ciphertext + '\n' },
    ]) rejected(JSON.stringify(bad));
    rejected(` {"format":"Avery",${encrypt().slice(1)}`);
    rejected(encrypt().replace('"format":', '"\\u0066ormat":'));
    rejected(encrypt() + ' ');
    rejected(encrypt().replace('"version":1', '"version":1,"version":1'));
  });
  it('rejects validly encrypted changed originals and missing or duplicate files', () => {
    const base = payload();
    for (const bad of [
      { ...base, workspace: { ...workspace, privateExtension: { ...workspace.privateExtension, unknown: '0' } } },
      { ...base, guidedFlowRaw: guidedFlowRaw + ' ' }, { ...base, guidedMode: 'false' },
      { ...base, files: [] }, { ...base, files: [...base.files, ...base.files] },
      ...['documentId', 'name', 'type', 'lastModified', 'size', 'sha256', 'base64'].map(key => ({ ...base, files: base.files.map(file => ({ ...file, [key]: typeof file[key as keyof typeof file] === 'number' ? 0 : 'changed' })) })),
      { ...base, plaintext: 'Avery' }, { ...base, files: base.files.map(file => ({ ...file, extra: 'Avery' })) },
    ]) rejected(encrypt(bad));
    rejected(encrypt(), password, { ...expected, files: [...expected.files, ...expected.files] });
  });
  it('rejects authentication and payload failures without returning private material', () => {
    const a = JSON.parse(encrypt());
    rejected(encrypt(), 'wrong-synthetic-lifecycle-password');
    for (const key of ['ciphertext', 'salt', 'iv']) {
      const bytes = Buffer.from(a[key], 'base64'); bytes[0] ^= 1;
      rejected(JSON.stringify({ ...a, [key]: bytes.toString('base64') }));
    }
    rejected(encrypt(payload(), 'wrong AAD'));
    for (const bad of [null, [], 'private payload', { ...payload(), schemaVersion: 2 }, { ...payload(), createdAt: 'Avery' }]) rejected(encrypt(bad));
  });
  it('checks actual production export and import preserve the complete source packet', async () => {
    const data = new Map<string, string>([[WORKSPACE_STORAGE_KEY, JSON.stringify({ workspaces: { fictional: workspace } })], [getGuidedFlowStorageKey('fictional'), guidedFlowRaw]]);
    const local = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear(), key: (index: number) => [...data.keys()][index] ?? null, get length() { return data.size; } };
    const file = new File([source], 'fictional.pdf', { type: 'application/pdf', lastModified: 123456 });
    let restored: File | undefined;
    const documents = { read: async () => file, write: async (_id: string, uploads: Array<{ file: File }>) => { restored = uploads[0]?.file; }, remove: async () => {} };
    const archive = await exportWorkspaceRecovery(local, 'fictional', password, { documents });
    expect(assertEncryptedRecoveryOriginals(await archive.text(), password, expected).files).toBe(1);
    const imported = await importWorkspaceRecovery(local, archive, password, { documents });
    expect(local.getItem(getGuidedFlowStorageKey(imported.workspaceId))).toBe(guidedFlowRaw);
    if (!restored) throw new Error('Actual import did not restore original file');
    expect(Buffer.from(await restored.arrayBuffer())).toEqual(source);
    expect(restored?.type).toBe('application/pdf'); expect(restored?.lastModified).toBe(123456);
  });
});
