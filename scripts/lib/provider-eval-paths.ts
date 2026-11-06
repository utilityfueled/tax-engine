import { lstat, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";

async function identity(file: string, followed = 0): Promise<{ name: string; inode: string | null }> {
  if (followed > 40) throw new Error("Evaluation artifact path has too many links.");
  const requested = path.resolve(file); let ancestor = requested; const suffix: string[] = [];
  let canonical: string;
  for (;;) {
    try { canonical = path.join(await realpath(ancestor), ...suffix); break; }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      // Follow dangling final links too, before either target can be created.
      const entry = await lstat(ancestor).catch(() => null);
      if (entry?.isSymbolicLink()) {
        const target = path.resolve(path.dirname(ancestor), await readlink(ancestor), ...suffix);
        return identity(target, followed + 1);
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error("Evaluation artifact path cannot be resolved.", { cause: error });
      suffix.unshift(path.basename(ancestor)); ancestor = parent;
    }
  }
  const info = await stat(requested).catch(error => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  // Conservative on every supported filesystem: case-only and Unicode-normalized
  // aliases are rejected even on a volume that could store both separately.
  return { name: canonical.normalize("NFD").toLowerCase(), inode: info ? `${info.dev}:${info.ino}` : null };
}

export async function requireDistinctProviderEvalPaths(files: readonly string[], journal?: string): Promise<void> {
  const names = new Set<string>(); const inodes = new Set<string>();
  for (const file of [...files, ...(journal ? [`${journal}.lock`] : [])]) {
    const item = await identity(file);
    if (names.has(item.name) || (item.inode !== null && inodes.has(item.inode))) throw new Error("Evaluation input, output, journal and lock paths must be distinct, including aliases.");
    names.add(item.name); if (item.inode !== null) inodes.add(item.inode);
  }
}
