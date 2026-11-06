// Runs only inside the explicitly admitted job-owned image, or over offline test fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export function inventoryPublicChunks(root) {
  const result = {}, stack = [{ dir: root, prefix: '', depth: 0 }];
  let entries = 0, bytes = 0;
  if (fs.lstatSync(root).isSymbolicLink()) throw Error('public-inventory-unavailable');
  while (stack.length) {
    const { dir, prefix, depth } = stack.pop();
    if (depth > 16) throw Error('public-inventory-unavailable');
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++entries > 10000 || entry.isSymbolicLink()) throw Error('public-inventory-unavailable');
      const relative = prefix + entry.name;
      if (entry.isDirectory()) { stack.push({ dir: path.join(dir, entry.name), prefix: relative + '/', depth: depth + 1 }); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      if (!/^[A-Za-z0-9_@.()[\]/-]+\.js$/u.test(relative) || relative.split('/').some(p => p === '.' || p === '..')) throw Error('public-inventory-unavailable');
      const file = path.join(dir, entry.name), size = fs.statSync(file).size;
      if (size < 1 || size > 32 * 1024 * 1024 || (bytes += size) > 128 * 1024 * 1024 || Object.keys(result).length >= 4096) throw Error('public-inventory-unavailable');
      const urlPath = '/_next/static/' + encodeURI(relative);
      if (urlPath.length > 512) throw Error('public-inventory-unavailable');
      const content = fs.readFileSync(file);
      if (content.length !== size) throw Error('public-inventory-unavailable');
      result[urlPath] = { sha256: createHash('sha256').update(content).digest('hex'), bytes: size };
    }
  }
  if (Object.keys(result).length === 0) throw Error('public-inventory-unavailable');
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
if (process.argv[1] === '--image-public-chunks') {
  try { process.stdout.write(JSON.stringify(inventoryPublicChunks('/app/apps/web/.next/static'))); }
  catch { process.stdout.write('{"status":"public-inventory-unavailable"}'); process.exitCode = 1; }
}
