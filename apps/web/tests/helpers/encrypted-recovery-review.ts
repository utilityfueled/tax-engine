import { createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

/** Actual source snapshots, collected before backup; never decoded expected outputs. */
export interface RecoveryOriginals {
  workspace: unknown;
  guidedFlowRaw: string | null;
  guidedMode: string | null;
  files: ReadonlyArray<{ documentId: string; fileName: string; type: string; lastModified: number; bytes: Buffer }>;
}
const format = 'tax-engine-encrypted-recovery';
function need(value: unknown): asserts value { if (!value) throw new Error('Invalid recovery evidence'); }
function record(value: unknown): Record<string, unknown> {
  need(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  need(isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort()));
}
function binary(value: unknown): Buffer {
  need(typeof value === 'string' && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(value));
  const bytes = Buffer.from(value, 'base64');
  need(bytes.toString('base64') === value);
  return bytes;
}

/** Test-only independent authenticated evidence check. No decoded originals escape. */
export function assertEncryptedRecoveryOriginals(text: string, password: string, expected: RecoveryOriginals) {
  try {
    need(typeof text === 'string' && Buffer.byteLength(text) <= 96 * 1024 * 1024);
    need(typeof password === 'string' && password.length >= 12 && password.length <= 1024);
    const envelope = record(JSON.parse(text));
    keys(envelope, ['format', 'version', 'cipher', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext']);
    // Canonical JSON excludes duplicate/escaped keys and non-schema whitespace surfaces.
    need(JSON.stringify(envelope) === text);
    need(envelope.format === format && envelope.version === 1 && envelope.cipher === 'AES-256-GCM'
      && envelope.kdf === 'PBKDF2-SHA256' && envelope.iterations === 600000);
    // These three fields are typed binary encodings, not arbitrary plaintext strings.
    const salt = binary(envelope.salt), iv = binary(envelope.iv), ciphertext = binary(envelope.ciphertext);
    need(salt.length === 16 && iv.length === 12 && ciphertext.length >= 16 && ciphertext.length <= 64 * 1024 * 1024 + 16);
    const decipher = createDecipheriv('aes-256-gcm', pbkdf2Sync(password, salt, 600000, 32, 'sha256'), iv);
    decipher.setAAD(Buffer.from(`${format}:1`));
    decipher.setAuthTag(ciphertext.subarray(-16));
    const clear = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
    need(clear.length <= 64 * 1024 * 1024);
    const plain = new TextDecoder('utf-8', { fatal: true }).decode(clear);
    const payload = record(JSON.parse(plain));
    keys(payload, ['schemaVersion', 'createdAt', 'workspace', 'guidedFlowRaw', 'guidedMode', 'files']);
    need(JSON.stringify(payload) === plain && payload.schemaVersion === 1);
    need(typeof payload.createdAt === 'string' && new Date(payload.createdAt).toISOString() === payload.createdAt);
    need(isDeepStrictEqual(payload.workspace, expected.workspace));
    need((expected.guidedFlowRaw === null || typeof expected.guidedFlowRaw === 'string') && payload.guidedFlowRaw === expected.guidedFlowRaw);
    need([null, 'true', 'false'].includes(expected.guidedMode) && payload.guidedMode === expected.guidedMode);
    need(Array.isArray(payload.files) && payload.files.length === expected.files.length && expected.files.length <= 500);
    const originals = new Map(expected.files.map(file => [file.documentId, file]));
    need(originals.size === expected.files.length);
    const workspace = record(expected.workspace);
    need(Array.isArray(workspace.documents));
    const documents = workspace.documents.map(record).filter(document => typeof document.id === 'string' && !document.id.startsWith('guided:'));
    need(documents.length === expected.files.length && new Set(documents.map(document => document.id)).size === documents.length);
    let total = 0;
    for (const value of payload.files) {
      const file = record(value);
      keys(file, ['documentId', 'name', 'type', 'lastModified', 'size', 'sha256', 'base64']);
      need(typeof file.documentId === 'string');
      const original = originals.get(file.documentId);
      need(original && Buffer.isBuffer(original.bytes));
      const document = documents.find(document => document.id === original.documentId);
      need(document && document.size === original.bytes.length);
      need(file.name === original.fileName && file.type === original.type && file.lastModified === original.lastModified
        && Number.isSafeInteger(original.lastModified) && original.lastModified >= 0 && file.size === original.bytes.length);
      const bytes = binary(file.base64);
      need(bytes.equals(original.bytes) && file.sha256 === createHash('sha256').update(bytes).digest('hex'));
      total += bytes.length; need(total <= 64 * 1024 * 1024);
      originals.delete(file.documentId);
    }
    need(originals.size === 0);
    return { status: 'PASS_AUTHENTICATED_RECOVERY_ORIGINALS' as const, format, files: expected.files.length };
  } catch {
    // Never forward assertion diffs, decrypted originals, ciphertext or crypto errors.
    throw new Error('Encrypted recovery evidence validation failed');
  }
}
