import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { normalizeCandidateImage, admitPreviousSchemaInput, assertPreviousRowsPreserved, materializeHistoricalSchemaSource, rehearsePreviousSchema } from '../../scripts/rehearse-self-host-previous-schema.mjs';
const revision = 'd32cb8cf3d607c643c4c7f7e1b845fcace61563f';
const candidateRevision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const candidateImage = 'sha256:'+'a'.repeat(64);
const database = 'postgresql://ai_test@127.0.0.1:54321/postgres';
describe('pinned previous-schema rehearsal', () => {
  it('admits only the existing loopback disposable database and immutable revision', () => {
    expect(admitPreviousSchemaInput(revision, database).port).toBe('54321');
    for (const value of ['postgresql://ai_test@external.invalid:54321/postgres', 'postgresql://ai_test:secret@127.0.0.1:54321/postgres', database+'?options=foreign', 'postgresql://other@127.0.0.1:54321/postgres', 'postgresql://ai_test@127.0.0.1/postgres', database.replace('/postgres','/unowned')]) expect(() => admitPreviousSchemaInput(revision, value)).toThrow();
    for (const value of ['main', revision+'\n', '../unowned']) expect(() => admitPreviousSchemaInput(value, database)).toThrow();
  });
  it('rejects malformed authentication without publishing its bytes or contacting PostgreSQL', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'previous-auth-test-'));
    const secret = 'PRIVATE-REHEARSAL-SENTINEL';
    const file = path.join(directory, 'pgpass');
    try {
      await writeFile(file, '127.0.0.1:54321:postgres:ai_test:'+secret+'\n', {mode:0o600});
      let message = '';
      try { await rehearsePreviousSchema({previousRevision:revision,candidateRevision,candidateImage,databaseUrl:database,pgPassFile:file}); }
      catch (error) { message=String(error); }
      expect(message).toContain('Expected generated private rehearsal authentication');
      expect(message).not.toContain(secret);
    } finally { await rm(directory,{recursive:true,force:true}); }
  });
  it('normalizes Docker and Podman immutable image identities and rejects mutable references', () => {
    expect(normalizeCandidateImage('a'.repeat(64))).toBe(candidateImage);
    expect(normalizeCandidateImage(candidateImage)).toBe(candidateImage);
    for (const image of ['latest','a'.repeat(63),'sha256:'+'A'.repeat(64),candidateImage+'\n']) expect(() => normalizeCandidateImage(image)).toThrow();
  });
  it('rejects a candidate revision different from the checkout before opening authentication', async () => {
    await expect(rehearsePreviousSchema({previousRevision:revision,candidateRevision:'0'.repeat(40),candidateImage,databaseUrl:database,pgPassFile:'/not-read'})).rejects.toThrow('Candidate image revision must match this checkout');
  });
  it('rejects row loss, amount changes, owner exchange and added rows', () => {
    const before = { ledger: ['{"owner":"a","cents":"1.00"}', '{"owner":"b","cents":"2.00"}'] };
    expect(() => assertPreviousRowsPreserved(before, structuredClone(before))).not.toThrow();
    for (const after of [{ ledger: before.ledger.slice(0,1) }, { ledger: [before.ledger[0].replace('1.00','1.01'),before.ledger[1]] }, { ledger: [before.ledger[0].replace('"a"','"b"'),before.ledger[1]] }, { ledger: [...before.ledger, before.ledger[0]] }]) expect(() => assertPreviousRowsPreserved(before, after)).toThrow();
  });
  it('materializes exact old source and resolves contracts inside that old tree', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'previous-schema-test-'));
    try {
      const result = await materializeHistoricalSchemaSource(revision, directory);
      expect(Object.keys(result.files)).toHaveLength(4);
      for (const [file, record] of Object.entries(result.files)) {
        const original = execFileSync('git',['show',revision+':'+file]);
        expect(await readFile(path.join(directory,file))).toEqual(original);
        expect(record).toEqual({bytes:original.length,sha256:createHash('sha256').update(original).digest('hex')});
      }
      const config = JSON.parse(await readFile(result.config,'utf8'));
      expect(config.compilerOptions.paths['@tax-engine/contracts']).toEqual([path.join(directory,'packages/contracts/src/index.ts')]);
      await expect(materializeHistoricalSchemaSource(revision,directory)).rejects.toThrow();
    } finally { await rm(directory,{recursive:true,force:true}); }
  });
});
