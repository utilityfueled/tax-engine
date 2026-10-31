import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Sends `input` through a real file. A piped child can wait forever for EOF, and a
 * synchronous call blocks Vitest's own deadline, so a hung reader stalls the whole run. */
export const execFileSync = ((file: string, args: readonly string[], options: { input?: string | NodeJS.ArrayBufferView; timeout?: number; stdio?: unknown } = {}) => {
  const { input, ...rest } = options;
  if (input === undefined) return nodeExecFileSync(file, args, rest as never);
  const directory = mkdtempSync(join(tmpdir(), 'file-stdin-')), path = join(directory, 'stdin');
  writeFileSync(path, input);
  const descriptor = openSync(path, 'r');
  try {
    const stdio = Array.isArray(rest.stdio) ? rest.stdio : [];
    return nodeExecFileSync(file, args, { ...rest, timeout: rest.timeout ?? 30_000, stdio: [descriptor, stdio[1] ?? 'pipe', stdio[2] ?? 'pipe'] } as never);
  } finally { closeSync(descriptor); rmSync(directory, { recursive: true, force: true }); }
}) as typeof nodeExecFileSync;
