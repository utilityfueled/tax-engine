import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { test as base } from '@playwright/test';
export * from '@playwright/test';
import {registerOriginalEntryMetrics} from '../../../../scripts/browser-cpu-diagnostics/phase-hook.mjs';
import { LIMITS, ORIGIN, unavailable, withProfile } from '../../../../scripts/browser-cpu-diagnostics/profile.mjs';

// Default-off is the exact base object, not an automatic fixture that requests a page.
export const test = process.env.TAX_BROWSER_CPU_DIAGNOSTICS === '1' ? base.extend<{ _sampledJavaScript: void }>({
  _sampledJavaScript: [async ({ page, baseURL }, use, info) => {
    const directory = process.env.TAX_BROWSER_CPU_OUTPUT;
    const inventoryPath = process.env.TAX_BROWSER_CPU_INVENTORY;
    if (!directory || !inventoryPath || baseURL !== ORIGIN) { await use(); return; }
    const manifest = JSON.parse(await readFile(new URL('../../../../scripts/browser-cpu-diagnostics/cases.json', import.meta.url), 'utf8')) as { targets: { id: string }[] };
    if (!manifest.targets.some(c => c.id === info.testId)) { await use(); return; }
    let inventory = {};
    try { inventory = JSON.parse(await readFile(inventoryPath, 'utf8')); } catch { /* The collector reports fixed invalid-inventory without changing the body. */ }
    let unregister = () => {};
    if (process.env.TAX_BROWSER_PHASE_DIAGNOSTICS === '1' && process.env.TAX_BROWSER_PHASE_BINDING) {
      try {
        const bytes = await readFile(process.env.TAX_BROWSER_PHASE_BINDING);
        if (bytes.length > 4096) throw Error('invalid-binding');
        const binding = JSON.parse(bytes.toString('utf8'));
        unregister = registerOriginalEntryMetrics(page, {enabled: true, origin: baseURL, binding,
          createSession: () => page.context().newCDPSession(page),
          save: async (record: unknown) => writeFile(path.join(directory, `${info.testId}.phase.json`), JSON.stringify(record) + '\n', {flag: 'wx', mode: 0o600}),
        });
      } catch { /* Missing phase file is unavailable at enclosing runner recovery. */ }
    }
    try { await withProfile({ enabled: true, origin: baseURL, inventory, createSession: () => page.context().newCDPSession(page), use,
      save: async (record: unknown) => {
        let bytes = JSON.stringify(record);
        if (Buffer.byteLength(bytes) > LIMITS.bytes) bytes = JSON.stringify(unavailable('profile-limit'));
        await writeFile(path.join(directory, `${info.testId}.json`), bytes + '\n', { flag: 'wx', mode: 0o600 });
      },
    }); } finally { unregister(); }
  }, { auto: true }],
}) : base;
